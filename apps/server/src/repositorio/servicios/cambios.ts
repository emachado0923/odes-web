import type { RowDataPacket } from 'mysql2/promise';
import type { AccionCambio, CambioRegistro } from '../api-repositorio.js';
import type { BaseDatosRepositorio, Conexion } from '../bd/base-datos.js';

/**
 * Registro de cambios (auditoría) y contador de versión del contenido.
 * Las dos cosas se escriben dentro de la transacción del cambio.
 */

export interface DatosCambio {
  usuario: string | null;
  accion: AccionCambio;
  documentoId?: string | null;
  detalle?: string | null;
}

function recortar(texto: string | null | undefined, maximo: number): string | null {
  if (!texto) return null;
  const caracteres = [...texto];
  return caracteres.length > maximo
    ? `${caracteres.slice(0, maximo - 1).join('')}…`
    : texto;
}

export async function registrarCambio(
  conexion: Pick<Conexion, 'query'>,
  cambio: DatosCambio,
): Promise<void> {
  await conexion.query(
    'INSERT INTO repositorio_cambios (fecha, usuario, accion, documento_id, detalle) VALUES (?, ?, ?, ?, ?)',
    [
      new Date(),
      recortar(cambio.usuario, 64),
      cambio.accion,
      cambio.documentoId ?? null,
      recortar(cambio.detalle, 1000),
    ],
  );
}

/**
 * Incrementa la versión del contenido: el listado público (en este proceso
 * y en cualquier otro que comparta la base) se reconstruye en la siguiente
 * petición.
 */
export async function marcarContenidoCambiado(
  conexion: Pick<Conexion, 'query'>,
): Promise<void> {
  await conexion.query(
    'UPDATE repositorio_estado SET version = version + 1, actualizado_en = ? WHERE id = 1',
    [new Date()],
  );
}

interface FilaCambio extends RowDataPacket {
  id: number;
  fecha: Date;
  usuario: string | null;
  accion: string;
  documento_id: string | null;
  detalle: string | null;
}

export async function listarCambios(
  bd: BaseDatosRepositorio,
  { limite, documentoId }: { limite: number; documentoId?: string | null },
): Promise<CambioRegistro[]> {
  const filas = await bd.filas<FilaCambio>(
    `SELECT id, fecha, usuario, accion, documento_id, detalle FROM repositorio_cambios
      ${documentoId ? 'WHERE documento_id = ?' : ''}
      ORDER BY id DESC LIMIT ${Math.trunc(limite)}`,
    documentoId ? [documentoId] : [],
  );
  return filas.map((fila) => ({
    id: Number(fila.id),
    fecha: fila.fecha.toISOString(),
    usuario: fila.usuario,
    accion: fila.accion as AccionCambio,
    documentoId: fila.documento_id,
    detalle: fila.detalle,
  }));
}
