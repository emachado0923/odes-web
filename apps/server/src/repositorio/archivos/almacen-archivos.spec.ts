import { describe, expect, it } from 'vitest';
import { ALMACEN_PAI } from '../../pai/evidencias/almacen-evidencias.js';
import type { BaseDatosRepositorio, Conexion } from '../bd/base-datos.js';
import { ALMACEN_REPOSITORIO, borrarFichasHuerfanas, idsHuerfanos, type TablasAlmacen } from './almacen-archivos.js';

/**
 * Cada módulo tiene su almacén (repositorio_almacen_archivos y
 * pai_almacen_archivos) y el recolector de huérfanos de uno solo mira los
 * usos de ese módulo: documentos (archivo, portada, miniatura) en el
 * repositorio y pai_evidencias en el PAI. Las pruebas con base
 * (test/pai-evidencias.e2e-spec.ts, test/repositorio-bd.e2e-spec.ts) lo
 * comprueban en MySQL y Postgres; aquí, la lógica con una conexión falsa.
 */

interface EstadoFalso {
  archivos: Set<number>;
  /** Ids usados, por tabla que los usa. */
  usos: Record<string, Set<number>>;
  sentencias: string[];
}

function fila(id: number) {
  return {
    id,
    sha256: 'a'.repeat(64),
    mime: 'application/pdf',
    bytes: 10,
    trozos: 1,
    tamano_trozo: 1024,
    creado_en: new Date(0),
  };
}

function conexionFalsa(tablas: TablasAlmacen, estado: EstadoFalso): Conexion {
  return {
    dialecto: 'mysql',
    query: (sql: string, valores: readonly unknown[] = []) => {
      estado.sentencias.push(sql.replace(/\s+/g, ' ').trim());
      const id = Number(valores[0]);
      if (sql.includes(`FROM ${tablas.archivos} WHERE id = ? FOR UPDATE`)) {
        return Promise.resolve([estado.archivos.has(id) ? [fila(id)] : [], []]);
      }
      const uso = /^SELECT 1 FROM (\w+) WHERE/.exec(sql);
      if (uso) {
        // Todas las columnas de la tabla reciben el mismo id.
        if (valores.some((valor) => valor !== id)) throw new Error(`Valores distintos: ${valores.join(', ')}`);
        return Promise.resolve([estado.usos[uso[1]]?.has(id) ? [{ 1: 1 }] : [], []]);
      }
      if (sql.startsWith(`DELETE FROM ${tablas.archivos} `)) {
        estado.archivos.delete(id);
        return Promise.resolve([{ affectedRows: 1, insertId: 0 }, []]);
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
  } as unknown as Conexion;
}

describe('almacén de archivos de cada módulo', () => {
  it('repositorio: no borra fichas que usa un documento y nunca mira las del PAI', async () => {
    const estado: EstadoFalso = {
      archivos: new Set([1, 2, 3, 4]),
      // La 2 la usa una evidencia con el mismo id en el almacén del PAI: no cuenta.
      usos: { repositorio_documentos: new Set([1]), pai_evidencias: new Set([2]) },
      sentencias: [],
    };
    const borradas = await borrarFichasHuerfanas(conexionFalsa(ALMACEN_REPOSITORIO, estado), ALMACEN_REPOSITORIO, [
      1,
      2,
      3,
      null,
      undefined,
      3,
      99,
    ]);
    expect(borradas.map((ficha) => ficha.id)).toEqual([2, 3]);
    expect([...estado.archivos].toSorted()).toEqual([1, 4]);
    // Una sola lectura con bloqueo por tabla, con las tres columnas.
    expect(estado.sentencias).toContain(
      'SELECT 1 FROM repositorio_documentos WHERE archivo_id = ? OR portada_id = ? OR miniatura_id = ? LIMIT 1 FOR SHARE',
    );
    expect(estado.sentencias.filter((sql) => sql.includes('pai_'))).toEqual([]);
  });

  it('PAI: solo cuentan las evidencias y solo toca pai_almacen_archivos', async () => {
    const estado: EstadoFalso = {
      archivos: new Set([1, 2, 3]),
      usos: { pai_evidencias: new Set([2]), repositorio_documentos: new Set([1]) },
      sentencias: [],
    };
    const borradas = await borrarFichasHuerfanas(conexionFalsa(ALMACEN_PAI, estado), ALMACEN_PAI, [1, 2, 3]);
    expect(borradas.map((ficha) => ficha.id)).toEqual([1, 3]);
    expect(estado.sentencias).toContain('SELECT 1 FROM pai_evidencias WHERE archivo_id = ? LIMIT 1 FOR SHARE');
    expect(estado.sentencias).toContain('DELETE FROM pai_almacen_archivos WHERE id = ?');
    expect(estado.sentencias.filter((sql) => sql.includes('repositorio_'))).toEqual([]);
  });

  it('idsHuerfanos mira solo los usos de su módulo', async () => {
    const consultas: string[] = [];
    const bd = {
      filas: (sql: string) => {
        consultas.push(sql.replace(/\s+/g, ' '));
        return Promise.resolve([{ id: '7' }, { id: 9 }]);
      },
    } as unknown as BaseDatosRepositorio;
    expect(await idsHuerfanos(bd, ALMACEN_REPOSITORIO)).toEqual([7, 9]);
    expect(consultas[0]).toContain('FROM repositorio_almacen_archivos a');
    for (const columna of ['archivo_id', 'portada_id', 'miniatura_id']) {
      expect(consultas[0]).toContain(`NOT EXISTS (SELECT 1 FROM repositorio_documentos u WHERE u.${columna} = a.id)`);
    }
    expect(consultas[0]).not.toContain('pai_');

    await idsHuerfanos(bd, ALMACEN_PAI);
    expect(consultas[1]).toContain('FROM pai_almacen_archivos a');
    expect(consultas[1]).toContain('NOT EXISTS (SELECT 1 FROM pai_evidencias u WHERE u.archivo_id = a.id)');
    expect(consultas[1]).not.toContain('repositorio_');
  });
});
