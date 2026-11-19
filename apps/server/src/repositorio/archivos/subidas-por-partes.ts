import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { RowDataPacket } from 'mysql2/promise';
import type { BaseDatosRepositorio } from '../bd/base-datos.js';

/**
 * Subidas por partes, para cuando los archivos van dentro de la base (sin
 * Supabase Storage). En Vercel una petición no puede llevar más de 4,5 MB, así
 * que el navegador manda un archivo más grande en partes de TAMANO_PARTE:
 *
 *   1. empieza la subida declarando su tamaño total: el módulo anota una fila
 *      con dueño, total y fecha (repositorio_subidas o pai_subidas) y le da
 *      una ruta partes/<uuid>, imposible de adivinar;
 *   2. manda cada parte, en cualquier orden y reintentando si hace falta: se
 *      guarda en la tabla de partes del módulo (guardarParte);
 *   3. confirma como una subida directa ({ subida: ruta, nombre, tipo }): el
 *      servidor arma el archivo en su carpeta temporal (armarSubida), lo valida
 *      y lo guarda como cualquier otro, y borra la fila (las partes se van en
 *      cascada).
 *
 * Las partes van en la base y no en disco porque en Vercel cada petición puede
 * caer en una instancia distinta. Cada módulo tiene sus propias tablas, con
 * las columnas (subida_id, n, datos); aquí solo está lo común.
 */

/** Tamaño de cada parte (la última puede ser menor). Cabe con holgura en los 4,5 MB de Vercel. */
export const TAMANO_PARTE = 4 * 1024 * 1024;
/** Vida de una subida por partes sin terminar: después se purga con sus partes. */
export const VIGENCIA_SUBIDA_PARTES_MS = 2 * 3_600_000;

const PATRON_RUTA = /^partes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function rutaPartesNueva(): string {
  return `partes/${randomUUID()}`;
}

/** ¿`ruta` es la de una subida por partes (partes/<uuid>)? */
export function esRutaPartes(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && PATRON_RUTA.test(ruta);
}

/** Cuántas partes tiene un archivo de `bytes` bytes. */
export function partesDe(bytes: number): number {
  return Math.ceil(bytes / TAMANO_PARTE);
}

/** Tamaño exacto de la parte `n` de un archivo de `bytes` bytes. */
export function tamanoDeParte(bytes: number, n: number): number {
  return Math.min(TAMANO_PARTE, bytes - n * TAMANO_PARTE);
}

export type MotivoErrorPartes = 'parte_invalida' | 'incompleta' | 'demasiado_grande';

/** Error de una subida por partes; cada módulo lo traduce a su respuesta HTTP. */
export class ErrorSubidaPartes extends Error {
  constructor(
    readonly motivo: MotivoErrorPartes,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorSubidaPartes';
  }
}

/** Número de parte de la URL (texto) o ErrorSubidaPartes. */
export function numeroDeParte(texto: string, bytes: number): number {
  const n = /^\d{1,6}$/.test(texto) ? Number(texto) : -1;
  if (n < 0 || n >= partesDe(bytes)) {
    throw new ErrorSubidaPartes('parte_invalida', 'La parte no corresponde a esta subida.');
  }
  return n;
}

/**
 * Lee el cuerpo binario de una petición (application/octet-stream). Corta en
 * cuanto pasa de `maximo` bytes (ErrorSubidaPartes demasiado_grande).
 */
export async function leerCuerpoBinario(
  req: Readable & { headers: Record<string, string | string[] | undefined> },
  maximo: number,
): Promise<Buffer> {
  const declarado = Number(req.headers['content-length']);
  if (Number.isFinite(declarado) && declarado > maximo) {
    req.resume();
    throw new ErrorSubidaPartes('demasiado_grande', 'La parte es más grande de lo permitido.');
  }
  const partes: Buffer[] = [];
  let total = 0;
  for await (const trozo of req) {
    const buffer = trozo as Buffer;
    total += buffer.length;
    if (total > maximo) {
      req.resume();
      throw new ErrorSubidaPartes('demasiado_grande', 'La parte es más grande de lo permitido.');
    }
    partes.push(buffer);
  }
  return Buffer.concat(partes, total);
}

/**
 * Guarda la parte `n` (o la reemplaza, si el navegador la reintenta) de la
 * subida `subidaId`, de `bytes` bytes en total. Exige el tamaño exacto de esa
 * parte: así el archivo armado no puede quedar con huecos ni sobrantes.
 */
export async function guardarParte(
  bd: BaseDatosRepositorio,
  tablaPartes: string,
  subidaId: number,
  bytes: number,
  n: number,
  datos: Buffer,
): Promise<void> {
  if (datos.length !== tamanoDeParte(bytes, n)) {
    throw new ErrorSubidaPartes(
      'parte_invalida',
      `La parte ${n + 1} debe tener ${tamanoDeParte(bytes, n)} bytes (llegaron ${datos.length}).`,
    );
  }
  await bd.transaccion(async (conexion) => {
    await conexion.query(`DELETE FROM ${tablaPartes} WHERE subida_id = ? AND n = ?`, [subidaId, n]);
    await conexion.execute(`INSERT INTO ${tablaPartes} (subida_id, n, datos) VALUES (?, ?, ?)`, [
      subidaId,
      n,
      datos,
    ]);
  });
}

/**
 * Arma en `destino` (disco) el archivo de la subida `subidaId`, parte por
 * parte y sin cargarlo entero en memoria. Exige todas las partes
 * (ErrorSubidaPartes incompleta si falta alguna) y devuelve los bytes escritos.
 */
export async function armarSubida(
  bd: BaseDatosRepositorio,
  tablaPartes: string,
  subidaId: number,
  bytes: number,
  destino: string,
): Promise<number> {
  const total = partesDe(bytes);
  const [conteo] = await bd.filas<RowDataPacket & { n: number }>(
    `SELECT COUNT(*) AS n FROM ${tablaPartes} WHERE subida_id = ?`,
    [subidaId],
  );
  if (Number(conteo?.n ?? 0) !== total) {
    throw new ErrorSubidaPartes(
      'incompleta',
      `Llegaron ${Number(conteo?.n ?? 0)} de ${total} partes del archivo: vuelva a subirlo.`,
    );
  }
  const archivo = await open(destino, 'w', 0o600);
  let escritos = 0;
  try {
    for (let n = 0; n < total; n++) {
      const filas = await bd.preparada<RowDataPacket & { datos: Buffer }>(
        `SELECT datos FROM ${tablaPartes} WHERE subida_id = ? AND n = ?`,
        [subidaId, n],
      );
      const datos = filas[0]?.datos;
      if (!datos) {
        throw new ErrorSubidaPartes('incompleta', `Falta la parte ${n + 1} del archivo: vuelva a subirlo.`);
      }
      await archivo.write(datos);
      escritos += datos.length;
    }
  } finally {
    await archivo.close();
  }
  if (escritos !== bytes) {
    throw new ErrorSubidaPartes('incompleta', 'El archivo armado no tiene el tamaño declarado: vuelva a subirlo.');
  }
  return escritos;
}
