import { describe, expect, it } from 'vitest';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorCli } from '../../repositorio/cli/comun.js';
import {
  AYUDA_CREAR_USUARIO,
  desactivarUsuarioCli,
  exigirDatosDeCreacion,
  guardarUsuarioCli,
  interpretarArgumentosCrearUsuario,
  literalSql,
  type OpcionesCrearUsuario,
  sqlCrearUsuarioPai,
  sqlDesactivarUsuarioPai,
  VARIABLE_CONTRASENA,
} from './crear-usuario-comun.js';

/**
 * Unitarias de la CLI pai:crear-usuario (argumentos, SQL de --solo-sql y
 * escrituras contra una base falsa). El SQL se ejecuta de verdad en Postgres
 * en test/pai-sesion.e2e-spec.ts.
 */

const HASH = 'scrypt$32768$8$1$c2FsLWRlLXBydWViYQ==$aGFzaA==';

function errorCli(funcion: () => unknown): ErrorCli {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorCli) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorCli');
}

describe('interpretarArgumentosCrearUsuario', () => {
  it('--ayuda devuelve null', () => {
    expect(interpretarArgumentosCrearUsuario(['--ayuda'])).toBeNull();
    expect(interpretarArgumentosCrearUsuario(['-h'])).toBeNull();
    expect(AYUDA_CREAR_USUARIO).toContain(VARIABLE_CONTRASENA);
  });

  it('crea con todos los datos normalizados', () => {
    expect(
      interpretarArgumentosCrearUsuario([
        '--usuario',
        ' Planeacion ',
        '--nombre',
        '  Oficina   de Planeación ',
        '--rol',
        'Administrador',
        '--correo',
        'planeacion@sapiencia.gov.co',
        '--cargo',
        'Jefe',
        '--temporal',
      ]),
    ).toEqual({
      usuario: 'planeacion',
      nombre: 'Oficina de Planeación',
      rol: 'administrador',
      correo: 'planeacion@sapiencia.gov.co',
      cargo: 'Jefe',
      temporal: true,
      desactivar: false,
      soloSql: false,
    });
  });

  it('solo --usuario (cambio de contraseña) y --desactivar --solo-sql', () => {
    expect(interpretarArgumentosCrearUsuario(['--usuario', 'ana'])).toEqual({
      usuario: 'ana',
      temporal: false,
      desactivar: false,
      soloSql: false,
    });
    expect(
      interpretarArgumentosCrearUsuario([
        '--usuario',
        'ana',
        '--desactivar',
        '--solo-sql',
      ]),
    ).toMatchObject({ desactivar: true, soloSql: true });
    expect(
      interpretarArgumentosCrearUsuario(['--usuario', 'ana', '--correo', '']),
    ).toMatchObject({ correo: null });
  });

  it.each([
    [[], /--usuario válido/],
    [['--usuario', 'jo'], /--usuario válido/],
    [['--usuario', 'josé'], /--usuario válido/],
    [['--usuario', 'ana', '--rol', 'jefe'], /--rol/],
    [['--usuario', 'ana', '--nombre', '   '], /--nombre/],
    [['--usuario', 'ana', '--nombre', 'n'.repeat(121)], /--nombre/],
    [['--usuario', 'ana', '--correo', 'mal'], /--correo/],
    [['--usuario', 'ana', '--cargo', 'c'.repeat(161)], /--cargo/],
    [
      ['--usuario', 'ana', '--desactivar', '--temporal'],
      /no se combina con --temporal/,
    ],
    [['--usuario', 'ana', '--desactivar', '--rol', 'responsable'], /--rol/],
    [['--usuario', 'ana', '--otra'], /Unknown option|desconocid/i],
    [['--usuario', 'ana', 'suelto'], /positional|posicional/i],
  ])('rechaza %j con código 2', (argumentos, mensaje) => {
    const error = errorCli(() => interpretarArgumentosCrearUsuario(argumentos));
    expect(error.codigoSalida).toBe(2);
    expect(error.message).toMatch(mensaje);
  });

  it('crear exige --nombre y --rol', () => {
    const base: OpcionesCrearUsuario = {
      usuario: 'ana',
      temporal: false,
      desactivar: false,
      soloSql: false,
    };
    expect(errorCli(() => exigirDatosDeCreacion(base)).message).toMatch(
      /indique --nombre y --rol/,
    );
    expect(() =>
      exigirDatosDeCreacion({ ...base, nombre: 'Ana', rol: 'responsable' }),
    ).not.toThrow();
  });
});

describe('SQL de --solo-sql', () => {
  const opciones: OpcionesCrearUsuario = {
    usuario: 'planeacion',
    nombre: "Oficina d'Planeación",
    rol: 'administrador',
    temporal: true,
    desactivar: false,
    soloSql: true,
  };

  it('literalSql dobla las comillas', () => {
    expect(literalSql("o'neil")).toBe("'o''neil'");
    expect(literalSql(null)).toBe('NULL');
  });

  it('con nombre y rol: INSERT … ON CONFLICT con el hash, registro y sesiones', () => {
    const sql = sqlCrearUsuarioPai(opciones, HASH);
    expect(sql.split('\n')[1]).toBe('BEGIN;');
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).toContain(
      `VALUES ('planeacion', 'Oficina d''Planeación', NULL, NULL, 'administrador', '${HASH}', 1, 1)`,
    );
    expect(sql).toContain(
      'ON CONFLICT (usuario) DO UPDATE SET hash_contrasena = EXCLUDED.hash_contrasena, debe_cambiar_contrasena = EXCLUDED.debe_cambiar_contrasena, activo = 1, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;',
    );
    expect(sql).toContain(
      "DELETE FROM pai_sesiones WHERE usuario_id = (SELECT id FROM pai_usuarios WHERE usuario = 'planeacion');",
    );
    expect(sql).toContain(
      "DELETE FROM pai_asignaciones WHERE usuario_id = (SELECT id FROM pai_usuarios WHERE usuario = 'planeacion');",
    );
    expect(sql).toMatch(
      /INSERT INTO pai_registro .*'editar_usuario' ELSE 'crear_usuario' END/,
    );
    // El registro va antes del INSERT del usuario (decide crear/editar).
    expect(sql.indexOf('pai_registro')).toBeLessThan(
      sql.indexOf('INSERT INTO pai_usuarios'),
    );
  });

  it('correo y cargo solo se sobrescriben si se indicaron; un responsable conserva asignaciones', () => {
    const sql = sqlCrearUsuarioPai(
      {
        ...opciones,
        rol: 'responsable',
        correo: 'a@b.co',
        cargo: null,
        temporal: false,
      },
      HASH,
    );
    expect(sql).toContain("'a@b.co', NULL, 'responsable'");
    expect(sql).toContain('correo = EXCLUDED.correo, cargo = EXCLUDED.cargo;');
    expect(sql).not.toContain('pai_asignaciones');
    expect(sql).toContain(`'${HASH}', 0, 1)`);
  });

  it('sin nombre ni rol: solo UPDATE de un usuario existente', () => {
    const sql = sqlCrearUsuarioPai(
      { usuario: 'ana', temporal: false, desactivar: false, soloSql: true },
      HASH,
    );
    expect(sql).not.toContain('INSERT INTO pai_usuarios');
    expect(sql).toContain(
      `UPDATE pai_usuarios SET hash_contrasena = '${HASH}', debe_cambiar_contrasena = 0, activo = 1 WHERE usuario = 'ana';`,
    );
    expect(sql).toMatch(
      /INSERT INTO pai_registro .* SELECT now\(\), 'editar_usuario', .* WHERE EXISTS \(SELECT 1 FROM pai_usuarios WHERE usuario = 'ana'\);/,
    );
  });

  it('desactivar', () => {
    const sql = sqlDesactivarUsuarioPai('ana');
    expect(sql).toContain(
      "UPDATE pai_usuarios SET activo = 0 WHERE usuario = 'ana';",
    );
    expect(sql).toContain('DELETE FROM pai_sesiones');
    expect(sql).not.toContain('scrypt');
  });

  it('el registro nunca lleva el hash', () => {
    for (const sql of [
      sqlCrearUsuarioPai(opciones, HASH),
      sqlCrearUsuarioPai(
        { usuario: 'ana', temporal: true, desactivar: false, soloSql: true },
        HASH,
      ),
    ]) {
      const registro =
        sql.split('\n').find((linea) => linea.includes('pai_registro')) ?? '';
      expect(registro).not.toContain('scrypt');
    }
  });
});

/** Base falsa para las escrituras de la CLI. */
function bdFalsa(existente: { id: number; rol: string } | null) {
  const sentencias: { sql: string; valores: unknown[] }[] = [];
  const bd = {
    transaccion: async <T>(
      accion: (conexion: Conexion) => Promise<T>,
    ): Promise<T> =>
      accion({
        dialecto: 'mysql',
        query: async (sql: string, valores: unknown[] = []) => {
          sentencias.push({ sql, valores });
          if (sql.startsWith('SELECT id, rol FROM pai_usuarios')) {
            return [existente ? [existente] : [], undefined];
          }
          if (sql.startsWith('INSERT INTO pai_usuarios')) {
            return [{ insertId: 42, affectedRows: 1 }, undefined];
          }
          return [{ insertId: 0, affectedRows: 1 }, undefined];
        },
      } as unknown as Conexion),
  } as unknown as Pick<BaseDatosRepositorio, 'transaccion'>;
  return { bd, sentencias };
}

describe('guardarUsuarioCli y desactivarUsuarioCli', () => {
  const crear: OpcionesCrearUsuario = {
    usuario: 'planeacion',
    nombre: 'Planeación',
    rol: 'administrador',
    temporal: false,
    desactivar: false,
    soloSql: false,
  };

  it('crea el usuario con el hash y lo registra sin el hash', async () => {
    const { bd, sentencias } = bdFalsa(null);
    await expect(guardarUsuarioCli(bd, crear, HASH)).resolves.toEqual({
      id: 42,
      creado: true,
    });
    const insercion = sentencias.find((s) =>
      s.sql.startsWith('INSERT INTO pai_usuarios'),
    );
    expect(insercion?.valores).toEqual([
      'planeacion',
      'Planeación',
      null,
      null,
      'administrador',
      HASH,
      0,
    ]);
    const registro = sentencias.find((s) =>
      s.sql.startsWith('INSERT INTO pai_registro'),
    );
    expect(registro?.valores[3]).toBe('crear_usuario');
    expect(String(registro?.valores[7])).not.toContain('scrypt');
    expect(JSON.parse(String(registro?.valores[7]))).toMatchObject({
      id: 42,
      usuario: 'planeacion',
      origen: 'pai:crear-usuario',
    });
  });

  it('sin nombre o rol no crea', async () => {
    const { bd } = bdFalsa(null);
    await expect(
      guardarUsuarioCli(bd, { ...crear, nombre: undefined }, HASH),
    ).rejects.toThrow(/indique --nombre y --rol/);
  });

  it('existente: cambia la contraseña, lo reactiva, cierra sesiones y (al pasar a administrador) borra asignaciones', async () => {
    const { bd, sentencias } = bdFalsa({ id: 9, rol: 'responsable' });
    await expect(
      guardarUsuarioCli(
        bd,
        { ...crear, nombre: undefined, temporal: true },
        HASH,
      ),
    ).resolves.toEqual({ id: 9, creado: false });
    const actualizacion = sentencias.find((s) =>
      s.sql.startsWith('UPDATE pai_usuarios'),
    );
    expect(actualizacion?.sql).toBe(
      'UPDATE pai_usuarios SET hash_contrasena = ?, debe_cambiar_contrasena = ?, activo = ?, rol = ? WHERE id = ?',
    );
    expect(actualizacion?.valores).toEqual([HASH, 1, 1, 'administrador', 9]);
    expect(sentencias.map((s) => s.sql)).toEqual(
      expect.arrayContaining([
        'DELETE FROM pai_sesiones WHERE usuario_id = ?',
        'DELETE FROM pai_asignaciones WHERE usuario_id = ?',
      ]),
    );
    const registro = sentencias.find((s) =>
      s.sql.startsWith('INSERT INTO pai_registro'),
    );
    expect(registro?.valores[3]).toBe('editar_usuario');
  });

  it('desactivar: error claro si no existe', async () => {
    await expect(
      desactivarUsuarioCli(bdFalsa(null).bd, 'nadie'),
    ).rejects.toThrow('El usuario nadie no existe.');
    const { bd, sentencias } = bdFalsa({ id: 9, rol: 'responsable' });
    await expect(desactivarUsuarioCli(bd, 'ana')).resolves.toBe(9);
    expect(sentencias.map((s) => s.sql)).toEqual(
      expect.arrayContaining([
        'UPDATE pai_usuarios SET activo = 0 WHERE id = ?',
        'DELETE FROM pai_sesiones WHERE usuario_id = ?',
      ]),
    );
  });
});
