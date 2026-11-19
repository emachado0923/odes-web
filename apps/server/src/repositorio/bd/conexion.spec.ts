import { describe, expect, it } from 'vitest';
import { ConexionPostgres, traducirAPostgres } from './conexion.js';

describe('traducirAPostgres', () => {
  it('numera los marcadores ? y deja los que van dentro de textos y comentarios', () => {
    expect(
      traducirAPostgres(
        "SELECT id FROM repositorio_documentos WHERE titulo = ? AND nota <> '¿qué?' -- ¿y esto?\n AND orden > ? /* ? */",
        ['a', 3],
      ),
    ).toEqual({
      texto: "SELECT id FROM repositorio_documentos WHERE titulo = $1 AND nota <> '¿qué?' \n AND orden > $2",
      valores: ['a', 3],
      lectura: true,
    });
    expect(traducirAPostgres("SELECT 'it''s ?' AS t, ? AS v", [1]).texto).toBe("SELECT 'it''s ?' AS t, $1 AS v");
  });

  it('expande listas como mysql2: IN (?) y VALUES ? con filas', () => {
    expect(traducirAPostgres('SELECT * FROM t WHERE id IN (?)', [[4, 5, 6]])).toMatchObject({
      texto: 'SELECT * FROM t WHERE id IN ($1, $2, $3)',
      valores: [4, 5, 6],
    });
    expect(traducirAPostgres('SELECT * FROM t WHERE id IN (?)', [[]]).texto).toBe(
      'SELECT * FROM t WHERE id IN (NULL)',
    );
    expect(
      traducirAPostgres('INSERT INTO repositorio_documento_palabras_clave (documento_id, palabra_id, posicion) VALUES ?', [
        [
          ['a', 1, 1],
          ['a', 2, 2],
        ],
      ]),
    ).toEqual({
      texto: 'INSERT INTO repositorio_documento_palabras_clave (documento_id, palabra_id, posicion) VALUES ($1, $2, $3), ($4, $5, $6)',
      valores: ['a', 1, 1, 'a', 2, 2],
      lectura: false,
    });
  });

  it('pasa los booleanos a 1/0 y undefined a null', () => {
    expect(traducirAPostgres('UPDATE t SET a = ?, b = ?, c = ?', [true, false, undefined]).valores).toEqual([1, 0, null]);
  });

  it('agrega RETURNING id a los INSERT de tablas con id autoincremental (para insertId)', () => {
    expect(traducirAPostgres('INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)', ['x', 1]).texto).toBe(
      'INSERT INTO repositorio_categorias (nombre, orden) VALUES ($1, $2) RETURNING id',
    );
    expect(traducirAPostgres('insert into `repositorio_cambios` (accion) values (?)', ['x']).texto).toBe(
      'insert into "repositorio_cambios" (accion) values ($1) RETURNING id',
    );
    // documentos tiene id de texto; la sentencia ya trae RETURNING.
    expect(traducirAPostgres('INSERT INTO repositorio_documentos (id) VALUES (?)', ['x']).texto).toBe(
      'INSERT INTO repositorio_documentos (id) VALUES ($1)',
    );
    expect(
      traducirAPostgres('INSERT INTO repositorio_palabras_clave (clave) VALUES (?) ON CONFLICT (clave) DO UPDATE SET clave = EXCLUDED.clave RETURNING id', [
        'x',
      ]).texto,
    ).toMatch(/RETURNING id$/);
  });

  it('pone entre comillas los alias camelCase (Postgres los pasaría a minúsculas), no los tipos', () => {
    expect(
      traducirAPostgres('SELECT f.pagina_inicio AS paginaInicio, CAST(x AS VARCHAR) AS total FROM f').texto,
    ).toBe('SELECT f.pagina_inicio AS "paginaInicio", CAST(x AS VARCHAR) AS total FROM f');
  });

  it('reconoce las lecturas', () => {
    expect(traducirAPostgres('  (SELECT 1)').lectura).toBe(true);
    expect(traducirAPostgres('WITH x AS (SELECT 1) SELECT * FROM x').lectura).toBe(true);
    expect(traducirAPostgres('DELETE FROM t').lectura).toBe(false);
  });

  it('rechaza lo que solo existe en MySQL y los marcadores que no cuadran', () => {
    expect(() => traducirAPostgres('INSERT IGNORE INTO t VALUES (1)')).toThrow(/solo de MySQL/);
    expect(() => traducirAPostgres('INSERT INTO t VALUES (1) ON DUPLICATE KEY UPDATE id = id')).toThrow(/solo de MySQL/);
    expect(() => traducirAPostgres('SELECT ?', [])).toThrow(/más marcadores/);
    expect(() => traducirAPostgres('SELECT 1', [1])).toThrow(/0 marcadores/);
  });
});

/** Cliente de pg falso: anota las sentencias y responde lo indicado. */
function clienteFalso(responder: (texto: string) => { rows?: unknown[]; rowCount?: number } | Error) {
  const sentencias: string[] = [];
  return {
    sentencias,
    cliente: {
      query: async (texto: string) => {
        sentencias.push(texto);
        const respuesta = responder(texto);
        if (respuesta instanceof Error) throw respuesta;
        return { rows: respuesta.rows ?? [], rowCount: respuesta.rowCount ?? 0, fields: [] };
      },
    },
  };
}

describe('ConexionPostgres', () => {
  it('devuelve las filas o { insertId, affectedRows } como mysql2', async () => {
    const { cliente } = clienteFalso((texto) =>
      texto.startsWith('SELECT') ? { rows: [{ id: 1 }] } : { rows: [{ id: 42 }], rowCount: 1 },
    );
    const conexion = new ConexionPostgres(cliente as never);
    expect((await conexion.query('SELECT id FROM t'))[0]).toEqual([{ id: 1 }]);
    expect((await conexion.query('INSERT INTO repositorio_cambios (accion) VALUES (?)', ['x']))[0]).toEqual({
      insertId: 42,
      affectedRows: 1,
    });
  });

  it('en una transacción, cada escritura va en un SAVEPOINT: un error no la inutiliza', async () => {
    const { cliente, sentencias } = clienteFalso((texto) =>
      texto.startsWith('INSERT INTO repositorio_categorias') ? Object.assign(new Error('duplicado'), { code: '23505' }) : {},
    );
    const conexion = new ConexionPostgres(cliente as never);
    await conexion.beginTransaction();
    await expect(conexion.query('INSERT INTO repositorio_categorias (nombre) VALUES (?)', ['x'])).rejects.toMatchObject({
      code: '23505',
    });
    await conexion.query('UPDATE repositorio_categorias SET orden = ? WHERE id = ?', [1, 2]);
    await conexion.query('SELECT 1');
    await conexion.commit();
    expect(sentencias).toEqual([
      'BEGIN',
      'SAVEPOINT repositorio_sentencia',
      'INSERT INTO repositorio_categorias (nombre) VALUES ($1) RETURNING id',
      'ROLLBACK TO SAVEPOINT repositorio_sentencia',
      'SAVEPOINT repositorio_sentencia',
      'UPDATE repositorio_categorias SET orden = $1 WHERE id = $2',
      'RELEASE SAVEPOINT repositorio_sentencia',
      'SELECT 1',
      'COMMIT',
    ]);
  });

  it('fuera de una transacción no usa SAVEPOINT', async () => {
    const { cliente, sentencias } = clienteFalso(() => ({}));
    await new ConexionPostgres(cliente as never).query('DELETE FROM repositorio_sesiones WHERE id = ?', [1]);
    expect(sentencias).toEqual(['DELETE FROM repositorio_sesiones WHERE id = $1']);
  });
});
