import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Conexion } from '../bd/base-datos.js';
import { claveNormalizada } from '../dominio/normalizacion.js';
import { noEncontrado, solicitudInvalida } from '../errores-repositorio.js';

/**
 * Operaciones de escritura compartidas por la administración y el
 * importador: categorías por nombre, palabras clave de un documento y orden
 * "Más recientes". Todas reciben la conexión de una transacción abierta.
 */

type Consultable = Pick<Conexion, 'query' | 'dialecto'>;

/** Bloquea el documento (FOR UPDATE) o lanza 404. */
export async function bloquearDocumento(
  conexion: Consultable,
  id: string,
): Promise<void> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT id FROM repositorio_documentos WHERE id = ? FOR UPDATE',
    [id],
  );
  if (!filas[0]) throw noEncontrado('El documento no existe.');
}

export async function existeDocumento(
  conexion: Consultable,
  id: string,
): Promise<boolean> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT 1 FROM repositorio_documentos WHERE id = ?',
    [id],
  );
  return filas.length > 0;
}

/**
 * Categoría por nombre, sin distinguir tildes ni mayúsculas (intercalación
 * _ai_ci). Lanza 400 en el campo "categoria" si no existe.
 */
export async function categoriaPorNombre(
  conexion: Consultable,
  nombre: string,
): Promise<{ id: number; nombre: string }> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT id, nombre FROM repositorio_categorias WHERE nombre = ?',
    [nombre],
  );
  const fila = filas[0];
  if (!fila) {
    throw solicitudInvalida(`La categoría "${nombre}" no existe.`, {
      categoria: `La categoría "${nombre}" no existe. Créela primero en Categorías.`,
    });
  }
  return { id: Number(fila.id), nombre: String(fila.nombre) };
}

/** Id de la palabra clave (la crea si no existe; si existe, conserva su escritura). */
export async function idPalabraClave(
  conexion: Consultable,
  texto: string,
): Promise<number> {
  const clave = claveNormalizada(texto);
  // Si ya existía, insertId devuelve el id existente: en MySQL con
  // LAST_INSERT_ID(id); en Postgres, DO UPDATE (sin cambiar nada) hace que
  // RETURNING también devuelva la fila existente.
  const [resultado] = await conexion.query<ResultSetHeader>(
    conexion.dialecto === 'postgres'
      ? `INSERT INTO repositorio_palabras_clave (texto, clave, creado_en) VALUES (?, ?, ?)
         ON CONFLICT (clave) DO UPDATE SET clave = EXCLUDED.clave RETURNING id`
      : `INSERT INTO repositorio_palabras_clave (texto, clave, creado_en) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [texto, clave, new Date()],
  );
  return resultado.insertId;
}

/** Reemplaza las palabras clave del documento, en el orden dado. */
export async function asignarClaves(
  conexion: Consultable,
  documentoId: string,
  claves: readonly string[],
): Promise<void> {
  await conexion.query(
    'DELETE FROM repositorio_documento_palabras_clave WHERE documento_id = ?',
    [documentoId],
  );
  const filas: Array<[string, number, number]> = [];
  const vistas = new Set<number>();
  for (const texto of claves) {
    const id = await idPalabraClave(conexion, texto);
    if (vistas.has(id)) continue;
    vistas.add(id);
    filas.push([documentoId, id, filas.length + 1]);
  }
  if (filas.length > 0) {
    await conexion.query(
      'INSERT INTO repositorio_documento_palabras_clave (documento_id, palabra_id, posicion) VALUES ?',
      [filas],
    );
  }
}

/** Clave de orden por fecha: más alto = más reciente; sin año, al final. */
function claveFecha(anio: number | null, mes: number | null): number {
  return anio === null ? -1 : anio * 100 + (mes ?? 0);
}

/**
 * Posición "Más recientes" para un documento de esa fecha: antes del primer
 * documento más antiguo; sin año (o el más antiguo de todos), al final.
 */
export async function posicionPorFecha(
  conexion: Consultable,
  anio: number | null,
  mes: number | null,
  excluirId: string | null,
): Promise<number> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT id, orden, anio, mes FROM repositorio_documentos ORDER BY orden, id',
  );
  const propia = claveFecha(anio, mes);
  let maximo = 0;
  for (const fila of filas) {
    if (fila.id === excluirId) continue;
    const orden = Number(fila.orden);
    maximo = Math.max(maximo, orden);
    const otra = claveFecha(
      fila.anio === null ? null : Number(fila.anio),
      fila.mes === null ? null : Number(fila.mes),
    );
    if (propia >= 0 && otra < propia) return orden;
  }
  return maximo + 1;
}

async function ordenMaximo(conexion: Consultable, excluirId: string | null): Promise<number> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(orden), 0) AS maximo FROM repositorio_documentos WHERE id <> ?',
    [excluirId ?? ''],
  );
  return Number(filas[0]?.maximo ?? 0);
}

/**
 * Hace lugar para un documento nuevo en `posicion` (corre los siguientes una
 * posición). Devuelve la posición final (entre 1 y máximo + 1).
 */
export async function abrirPosicion(
  conexion: Consultable,
  posicion: number,
): Promise<number> {
  const final = Math.max(1, Math.min(posicion, (await ordenMaximo(conexion, null)) + 1));
  await conexion.query(
    'UPDATE repositorio_documentos SET orden = orden + 1 WHERE orden >= ?',
    [final],
  );
  return final;
}

/** Mueve el documento de `actual` a `nueva`, corriendo los del medio. */
export async function moverPosicion(
  conexion: Consultable,
  id: string,
  actual: number,
  nueva: number,
): Promise<number> {
  const final = Math.max(1, Math.min(nueva, Math.max(actual, await ordenMaximo(conexion, id))));
  if (final < actual) {
    await conexion.query(
      'UPDATE repositorio_documentos SET orden = orden + 1 WHERE orden >= ? AND orden < ? AND id <> ?',
      [final, actual, id],
    );
  } else if (final > actual) {
    await conexion.query(
      'UPDATE repositorio_documentos SET orden = orden - 1 WHERE orden > ? AND orden <= ? AND id <> ?',
      [actual, final, id],
    );
  }
  await conexion.query('UPDATE repositorio_documentos SET orden = ? WHERE id = ?', [final, id]);
  return final;
}

/** Cierra el hueco que deja un documento borrado. */
export async function cerrarPosicion(
  conexion: Consultable,
  posicion: number,
): Promise<void> {
  await conexion.query(
    'UPDATE repositorio_documentos SET orden = orden - 1 WHERE orden > ?',
    [posicion],
  );
}
