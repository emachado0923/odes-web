import { pipeline } from 'node:stream/promises';
import type { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  AlmacenArchivos,
  ReferenciaArchivo,
} from '../archivos/almacen-archivos.js';
import { contentDisposition, type Disposicion } from './cabeceras.js';
import { interpretarRango, noModificado, rangoAplicable } from './rango.js';

/**
 * Política de caché de cada tipo de archivo servido desde la base.
 *
 * - Documento (/ver, /descargar): la URL no cambia al reemplazar el archivo,
 *   así que se guarda 10 minutos y luego se revalida con el ETag (304).
 * - Portada y miniatura: su URL lleva ?v=<sha256>, así que con esa versión se
 *   guardan un año (immutable); sin ella (o con una vieja), un día.
 * - Administración: privada y siempre revalidada.
 */
export const CACHE_DOCUMENTO = 'public, max-age=600, must-revalidate';
export const CACHE_IMAGEN_VERSIONADA = 'public, max-age=31536000, immutable';
export const CACHE_IMAGEN = 'public, max-age=86400';
export const CACHE_ADMIN = 'private, no-cache';

export function etagDeArchivo(archivo: Pick<ReferenciaArchivo, 'sha256'>): string {
  return `"${archivo.sha256}"`;
}

export interface OpcionesEnvio {
  archivo: ReferenciaArchivo;
  almacen: AlmacenArchivos;
  cacheControl: string;
  disposicion?: { tipo: Disposicion; nombre: string };
  registro?: Pick<Logger, 'error'>;
}

function cuerpoError(res: Response, estado: number, mensaje: string): void {
  const cuerpo = JSON.stringify({ codigo: 'solicitud_invalida', mensaje });
  res.status(estado);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(cuerpo));
  res.end(cuerpo);
}

function esCierrePrematuro(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return (
    codigo === 'ERR_STREAM_PREMATURE_CLOSE' ||
    codigo === 'ECONNRESET' ||
    codigo === 'EPIPE'
  );
}

/**
 * Envía un archivo guardado en la base: GET/HEAD, ETag fuerte (sha256),
 * Last-Modified, 304, Range (206/416) con If-Range, y el cuerpo como flujo
 * trozo a trozo.
 *
 * Si el archivo está en Supabase Storage, en cambio, redirige (302) a su URL
 * pública: el bucket lo sirve con Range y caché, sin pasar por el servidor.
 * La redirección lleva la misma política de caché que tendría el archivo.
 */
export async function enviarArchivo(
  req: Request,
  res: Response,
  { archivo, almacen, cacheControl, disposicion, registro }: OpcionesEnvio,
): Promise<void> {
  const destino = almacen.urlPublica?.(
    archivo,
    disposicion?.tipo === 'attachment' ? { descarga: disposicion.nombre } : {},
  );
  if (destino) {
    res.setHeader('Cache-Control', cacheControl);
    res.redirect(302, destino);
    return;
  }
  const etag = etagDeArchivo(archivo);
  const modificado = archivo.creadoEn;
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', modificado.toUTCString());
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Accept-Ranges', 'bytes');

  if (
    noModificado(
      {
        ifNoneMatch: req.get('if-none-match'),
        ifModifiedSince: req.get('if-modified-since'),
      },
      etag,
      modificado,
    )
  ) {
    res.status(304).end();
    return;
  }

  let inicio = 0;
  let fin = archivo.bytes - 1;
  let estado = 200;
  const rango = req.get('range');
  if (rango && rangoAplicable(req.get('if-range'), etag, modificado)) {
    const resultado = interpretarRango(rango, archivo.bytes);
    if (resultado.tipo === 'no_satisfacible') {
      res.setHeader('Content-Range', `bytes */${archivo.bytes}`);
      res.setHeader('Cache-Control', 'no-store');
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      cuerpoError(res, 416, 'El rango pedido no existe en el archivo.');
      return;
    }
    if (resultado.tipo === 'parcial') {
      inicio = resultado.inicio;
      fin = resultado.fin;
      estado = 206;
      res.setHeader(
        'Content-Range',
        `bytes ${inicio}-${fin}/${archivo.bytes}`,
      );
    }
  }

  const conCuerpo = req.method !== 'HEAD' && archivo.bytes > 0;
  // El primer trozo se pide antes de responder: si la base falla, el filtro
  // de errores responde 503 en JSON en lugar de cortar la conexión.
  const flujo = conCuerpo ? await almacen.abrirFlujo(archivo, inicio, fin) : null;
  res.status(estado);
  res.setHeader('Content-Type', archivo.mime);
  res.setHeader('Content-Length', String(Math.max(0, fin - inicio + 1)));
  if (disposicion) {
    res.setHeader(
      'Content-Disposition',
      contentDisposition(disposicion.tipo, disposicion.nombre),
    );
  }
  if (!flujo) {
    res.end();
    return;
  }

  try {
    await pipeline(flujo, res);
  } catch (error) {
    if (esCierrePrematuro(error)) return; // el cliente cerró la conexión
    registro?.error(
      `Falló el envío del archivo ${archivo.id} (${archivo.sha256}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (!res.headersSent) throw error;
    res.destroy(error instanceof Error ? error : undefined);
  }
}
