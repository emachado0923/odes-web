import { extname } from 'node:path';
import type { FuenteBytes } from './fuente-bytes.js';
import { ErrorZip, leerNombresZip } from './lector-zip.js';

/**
 * Reconocimiento del tipo REAL de un archivo por su contenido (firmas o
 * "números mágicos"), sin confiar en la extensión ni en el Content-Type que
 * manda el navegador.
 */

export const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export type MimeConocido = (typeof MIME)[keyof typeof MIME];

/** Extensión canónica de cada tipo (la que llevan las descargas). */
export const EXTENSION_DE_MIME: Readonly<Record<string, string>> = {
  [MIME.pdf]: 'pdf',
  [MIME.png]: 'png',
  [MIME.jpeg]: 'jpg',
  [MIME.webp]: 'webp',
  [MIME.docx]: 'docx',
  [MIME.xlsx]: 'xlsx',
  [MIME.pptx]: 'pptx',
};

/** Extensiones que se aceptan en el nombre del archivo subido, por tipo. */
const MIME_DE_EXTENSION: Readonly<Record<string, MimeConocido>> = {
  pdf: MIME.pdf,
  png: MIME.png,
  jpg: MIME.jpeg,
  jpeg: MIME.jpeg,
  jpe: MIME.jpeg,
  webp: MIME.webp,
  docx: MIME.docx,
  xlsx: MIME.xlsx,
  pptx: MIME.pptx,
};

export function extensionDeMime(mime: string): string {
  return EXTENSION_DE_MIME[mime.toLowerCase()] ?? 'bin';
}

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Tipo según los primeros bytes (sin mirar dentro de los ZIP). */
export function tipoPorCabecera(
  cabecera: Buffer,
): MimeConocido | 'zip' | null {
  if (cabecera.subarray(0, 8).equals(FIRMA_PNG)) return MIME.png;
  if (
    cabecera.length >= 3 &&
    cabecera[0] === 0xff &&
    cabecera[1] === 0xd8 &&
    cabecera[2] === 0xff
  ) {
    return MIME.jpeg;
  }
  if (
    cabecera.length >= 12 &&
    cabecera.toString('latin1', 0, 4) === 'RIFF' &&
    cabecera.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return MIME.webp;
  }
  if (
    cabecera.length >= 4 &&
    cabecera.readUInt32LE(0) === 0x04034b50 // PK\x03\x04
  ) {
    return 'zip';
  }
  // %PDF- exactamente al inicio (así empiezan los 290 PDF del paquete y los
  // que generan Office, Acrobat o Chrome). No se tolera basura antes de la
  // firma: un HTML con "%PDF-" en el medio no pasa por PDF.
  if (cabecera.toString('latin1', 0, 5) === '%PDF-') return MIME.pdf;
  return null;
}

/**
 * DOCX, XLSX o PPTX según las entradas del ZIP (Office Open XML): la parte
 * principal de cada uno (word/document.xml, xl/workbook.xml,
 * ppt/presentation.xml). El repositorio solo acepta DOCX y PPTX
 * (TIPOS_ARCHIVO_PERMITIDOS); XLSX lo usan las evidencias del PAI.
 */
export function tipoPorEntradasZip(nombres: readonly string[]): MimeConocido | null {
  const conjunto = new Set(nombres);
  if (!conjunto.has('[Content_Types].xml')) return null;
  if (conjunto.has('word/document.xml')) return MIME.docx;
  if (conjunto.has('xl/workbook.xml')) return MIME.xlsx;
  if (conjunto.has('ppt/presentation.xml')) return MIME.pptx;
  return null;
}

/** Tipo real del archivo, o null si no es uno de los conocidos. */
export async function detectarTipo(
  fuente: FuenteBytes,
): Promise<MimeConocido | null> {
  const cabecera = await fuente.leer(0, 1024);
  const tipo = tipoPorCabecera(cabecera);
  if (tipo !== 'zip') return tipo;
  try {
    return tipoPorEntradasZip(await leerNombresZip(fuente));
  } catch (error) {
    if (error instanceof ErrorZip) return null;
    throw error;
  }
}

/** Tipo que el cliente dice que tiene el archivo (extensión y Content-Type). */
export interface TipoDeclarado {
  nombre?: string | null;
  mime?: string | null;
}

/**
 * ¿Coincide lo declarado con el tipo real? La extensión, si la hay, debe ser
 * una de las del tipo real; el Content-Type, si no es genérico
 * (application/octet-stream), también. Un .pdf que en realidad es un PNG no
 * coincide.
 */
export function coincideDeclarado(
  real: MimeConocido,
  declarado: TipoDeclarado,
): boolean {
  const extension = declarado.nombre
    ? extname(declarado.nombre).replace(/^\./, '').toLowerCase()
    : '';
  if (extension && MIME_DE_EXTENSION[extension] !== real) return false;
  const mime = declarado.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (
    mime &&
    mime !== 'application/octet-stream' &&
    mime !== real &&
    !(real === MIME.jpeg && mime === 'image/jpg') &&
    !(real === MIME.jpeg && mime === 'image/pjpeg')
  ) {
    return false;
  }
  return true;
}

/** Nombre corto del tipo para mensajes ("PDF", "PNG", "DOCX"...). */
export function nombreTipo(mime: string | null): string {
  if (!mime) return 'desconocido';
  const extension = EXTENSION_DE_MIME[mime];
  return extension ? (extension === 'jpg' ? 'JPEG' : extension.toUpperCase()) : mime;
}
