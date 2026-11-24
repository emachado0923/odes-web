/**
 * Archivos del CRM en su propio almacén (crm_almacen_archivos y
 * crm_almacen_archivo_trozos, migración 010), sobre AlmacenArchivosBd: el
 * contenido va dentro de la base, en trozos, y un mismo contenido (sha256)
 * se guarda una sola vez. Valida por firma (detectarTipo + coincideDeclarado),
 * nunca por la extensión sola.
 *
 * Flujo de una subida: el controlador recibe el archivo con multer
 * (LIMITES_MULTER_CRM o LIMITES_MULTER_FOTO_CRM), `validar` lo revisa en la
 * carpeta temporal y, dentro de la transacción del llamador, `guardar` lo
 * pasa al almacén. Al quitar una referencia, `recolectar` borra lo que quedó
 * sin uso (ALMACEN_CRM.usos).
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LIMITES_CRM, tamanoLegible } from '../api-crm.js';
import {
  AlmacenArchivosBd,
  aReferencia,
  COLUMNAS_ARCHIVO,
  type FilaArchivo,
  type ReferenciaArchivo,
  type TablasAlmacen,
} from '../../repositorio/archivos/almacen-archivos.js';
import { conFuenteDeArchivo } from '../../repositorio/archivos/fuente-bytes.js';
import { dimensionesImagen } from '../../repositorio/archivos/imagenes.js';
import {
  coincideDeclarado,
  detectarTipo,
  extensionDeMime,
  MIME,
  type MimeConocido,
  nombreTipo,
} from '../../repositorio/archivos/tipos-archivo.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';
import {
  demasiadoGrande,
  noEncontrado,
  solicitudInvalida,
  tipoNoPermitido,
} from '../../repositorio/errores-repositorio.js';
import { CACHE_ADMIN, enviarArchivo } from '../../repositorio/http/enviar-archivo.js';

export const ALMACEN_CRM: TablasAlmacen = {
  archivos: 'crm_almacen_archivos',
  trozos: 'crm_almacen_archivo_trozos',
  unicoSha256: 'uq_crm_almacen_archivos_sha256',
  usos: [
    { tabla: 'crm_tarea_archivos', columna: 'archivo_id' },
    { tabla: 'crm_personas', columna: 'foto_archivo_id' },
  ],
};

/** Límites de multer para FileInterceptor('archivo', { limits }) en las rutas de archivos de tareas. */
export const LIMITES_MULTER_CRM = {
  fileSize: LIMITES_CRM.maxBytesArchivo,
  files: 1,
  fields: 5,
  parts: 7,
  fieldSize: 64 * 1024,
};

/** Igual, para las fotos de las personas. */
export const LIMITES_MULTER_FOTO_CRM = { ...LIMITES_MULTER_CRM, fileSize: LIMITES_CRM.maxBytesFoto };

/** 'documento' = archivo de tarea (PDF, Office, imagen; maxBytesArchivo); 'foto' = PNG, JPEG o WEBP (maxBytesFoto). */
export type ClaseArchivoCrm = 'documento' | 'foto';

/** Un archivo ya validado, todavía en la carpeta temporal de multer. */
export interface ArchivoRecibidoCrm {
  ruta: string;
  /** Nombre original, limpio (sin rutas ni caracteres de control), máximo 255. */
  nombre: string;
  /** Tipo real, detectado por la firma. */
  mime: string;
  bytes: number;
  /** Solo fotos (si se pudo leer), o null. */
  ancho: number | null;
  alto: number | null;
}

/** Tipos reales (por firma) que acepta cada clase. */
export const TIPOS_ARCHIVO_CRM: Readonly<Record<ClaseArchivoCrm, readonly MimeConocido[]>> = {
  documento: [MIME.pdf, MIME.docx, MIME.xlsx, MIME.pptx, MIME.png, MIME.jpeg, MIME.webp],
  foto: [MIME.png, MIME.jpeg, MIME.webp],
};

const MAX_BYTES: Readonly<Record<ClaseArchivoCrm, number>> = {
  documento: LIMITES_CRM.maxBytesArchivo,
  foto: LIMITES_CRM.maxBytesFoto,
};

const TEXTO_TIPOS: Readonly<Record<ClaseArchivoCrm, string>> = {
  documento: 'Use PDF, Word, Excel, PowerPoint o una imagen (PNG, JPG o WEBP).',
  foto: 'Use una imagen PNG, JPG o WEBP.',
};

/** Fotos de las personas: su URL lleva ?v=…, así que se guardan unos minutos. */
export const CACHE_FOTO_CRM = 'public, max-age=300';

/** Largo máximo del nombre guardado (crm_tarea_archivos.nombre). */
export const MAX_NOMBRE_ARCHIVO_CRM = 255;

/** Las columnas ancho y alto del almacén son SMALLINT UNSIGNED en MySQL. */
const MAX_MEDIDA = 65_535;

/** Marcas de dirección (bidi): permiten disfrazar una extensión al mostrar el nombre. */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/**
 * Busboy entrega los nombres UTF-8 leídos como latin1 («InformaciÃ³n.pdf»):
 * se reinterpretan si todos sus caracteres caben en latin1 y así quedan bien.
 */
function nombreLegible(nombre: string): string {
  const codigos = Array.from(nombre, (c) => c.codePointAt(0) ?? 0);
  if (!codigos.some((c) => c >= 0x80) || codigos.some((c) => c > 0xff)) return nombre;
  const reinterpretado = Buffer.from(nombre, 'latin1').toString('utf8');
  return reinterpretado.includes('�') ? nombre : reinterpretado;
}

/** Nombre declarado, limpio y sin carpetas, pero todavía sin tocar su extensión ('' si no queda nada). */
function nombreDeclarado(original: string): string {
  const sinCarpetas = nombreLegible(original).split(/[\\/]/).pop() ?? '';
  return textoLinea(sinCarpetas.replace(/[\t\r\n]+/g, ' ').replace(BIDI, ''))
    .replace(/^\.+$/, '')
    .replace(/[.\s]+$/, '');
}

/** Recorta a `maximo` caracteres completos conservando la extensión (si es corta). */
function recortarNombre(nombre: string, maximo: number): string {
  const caracteres = Array.from(nombre);
  if (caracteres.length <= maximo) return nombre;
  const extension = Array.from(extname(nombre));
  const conservar = extension.length > 0 && extension.length <= 10 ? extension : [];
  return caracteres.slice(0, maximo - conservar.length).join('').trimEnd() + conservar.join('');
}

/**
 * Nombre con el que se guarda y se descarga un archivo del CRM: el original
 * (arreglado si busboy lo leyó como latin1), sin carpetas, sin caracteres de
 * control ni marcas bidi, con los espacios colapsados, con la extensión del
 * tipo real si no traía una que le corresponda, y de a lo sumo 255
 * caracteres conservando la extensión. Sin nombre útil, 'archivo.<ext>'.
 */
export function nombreArchivoCrm(original: string, mime: string): string {
  const extensionReal = `.${extensionDeMime(mime)}`;
  let nombre = nombreDeclarado(original);
  if (!nombre) nombre = 'archivo';
  else if (/^\.[^.]+$/.test(nombre)) nombre = `archivo${nombre}`; // «.pdf»
  const extension = extname(nombre).slice(1);
  const conocido = (Object.values(MIME) as string[]).includes(mime);
  if (!extension || !conocido || !coincideDeclarado(mime as MimeConocido, { nombre })) {
    nombre += extensionReal;
  }
  return recortarNombre(nombre, MAX_NOMBRE_ARCHIVO_CRM);
}

function demasiado(nombre: string, bytes: number, maximo: number): Error {
  const mensaje = `«${nombre}» pesa ${tamanoLegible(bytes)}; el máximo es ${tamanoLegible(maximo)}.`;
  return demasiadoGrande(mensaje, { archivo: mensaje });
}

function medida(valor: number | undefined): number | null {
  return valor !== undefined && Number.isInteger(valor) && valor > 0 && valor <= MAX_MEDIDA ? valor : null;
}

@Injectable()
export class ServicioArchivosCrm {
  private readonly almacen: AlmacenArchivosBd;
  private readonly registro = new Logger('CRM');

  constructor(@Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio) {
    this.almacen = new AlmacenArchivosBd(bd, ALMACEN_CRM);
  }

  /**
   * Valida lo que dejó multer: 400 si no llegó archivo (o está vacío), 413
   * `demasiado_grande` si pasa del límite de la clase, 415
   * `tipo_no_permitido` si la firma no es de un tipo permitido o no coincide
   * con la extensión o el Content-Type.
   */
  async validar(archivo: Express.Multer.File | undefined, clase: ClaseArchivoCrm): Promise<ArchivoRecibidoCrm> {
    if (!archivo) {
      throw solicitudInvalida('Adjunte un archivo.', { archivo: 'Adjunte un archivo.' });
    }
    if (!archivo.path) {
      throw new Error('El archivo no quedó en la carpeta temporal: el FileInterceptor del CRM necesita el `dest` de multer.');
    }
    const original = archivo.originalname ?? '';
    const declarado = nombreDeclarado(original);
    const mostrado = recortarNombre(declarado || 'archivo', 80);
    const maximo = MAX_BYTES[clase];
    if (archivo.size > maximo) throw demasiado(mostrado, archivo.size, maximo);

    // Tamaño real del archivo en disco (no el que informa multer) y tipo por firma.
    const { bytes, mime } = await conFuenteDeArchivo(archivo.path, async (fuente) => ({
      bytes: fuente.tamano,
      mime: fuente.tamano > 0 ? await detectarTipo(fuente) : null,
    }));
    if (bytes > maximo) throw demasiado(mostrado, bytes, maximo);
    if (bytes === 0) {
      throw solicitudInvalida(`«${mostrado}» está vacío.`, { archivo: 'El archivo está vacío.' });
    }
    if (!mime || !TIPOS_ARCHIVO_CRM[clase].includes(mime)) {
      const mensaje = `«${mostrado}» no es de un tipo permitido. ${TEXTO_TIPOS[clase]}`;
      throw tipoNoPermitido(mensaje, { archivo: mensaje });
    }
    if (!coincideDeclarado(mime, { nombre: declarado, mime: archivo.mimetype })) {
      const mensaje = `La extensión o el tipo de «${mostrado}» no corresponde a su contenido (${nombreTipo(mime)}). ${TEXTO_TIPOS[clase]}`;
      throw tipoNoPermitido(mensaje, { archivo: mensaje });
    }

    let ancho: number | null = null;
    let alto: number | null = null;
    if (clase === 'foto') {
      // Las fotos pesan a lo sumo maxBytesFoto: se leen completas para hallar las medidas.
      const medidas = dimensionesImagen(mime, await readFile(archivo.path));
      const anchoLeido = medida(medidas?.ancho);
      const altoLeido = medida(medidas?.alto);
      if (anchoLeido !== null && altoLeido !== null) {
        ancho = anchoLeido;
        alto = altoLeido;
      }
    }
    return { ruta: archivo.path, nombre: nombreArchivoCrm(original, mime), mime, bytes, ancho, alto };
  }

  /** Guarda el archivo en el almacén dentro de la transacción del llamador (reutiliza uno idéntico). Devuelve el id del almacén. */
  async guardar(conexion: Conexion, recibido: ArchivoRecibidoCrm): Promise<number> {
    const guardado = await this.almacen.guardar(
      conexion,
      { ruta: recibido.ruta },
      { mime: recibido.mime, ancho: recibido.ancho, alto: recibido.alto },
    );
    return guardado.id;
  }

  /** Borra del almacén los de `archivoIds` que ya nadie usa (llamar después de quitar las referencias, en la misma transacción). */
  async recolectar(conexion: Conexion, archivoIds: readonly number[]): Promise<void> {
    const ids = archivoIds.filter((id) => Number.isSafeInteger(id) && id > 0);
    if (ids.length > 0) await this.almacen.recolectar(conexion, ids);
  }

  /** Ficha del archivo `archivoId` del almacén (sha256, tipo, tamaño, trozos), o null. */
  async referencia(archivoId: number): Promise<ReferenciaArchivo | null> {
    if (!Number.isSafeInteger(archivoId) || archivoId <= 0) return null;
    const filas = await this.bd.filas<FilaArchivo>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${ALMACEN_CRM.archivos} WHERE id = ?`,
      [archivoId],
    );
    return filas[0] ? aReferencia(filas[0]) : null;
  }

  /**
   * Responde con el archivo `archivoId` del almacén (ETag, Range, 304):
   * `attachment` con `nombre` para descargas; `inline` para fotos.
   * cache 'privado' = 'private, no-cache'; 'foto' = 'public, max-age=300'.
   */
  async enviar(
    req: Request,
    res: Response,
    opciones: { archivoId: number; nombre: string; disposicion: 'attachment' | 'inline'; cache: 'privado' | 'foto' },
  ): Promise<void> {
    const archivo = await this.referencia(opciones.archivoId);
    if (!archivo) throw noEncontrado('El archivo no existe.');
    await enviarArchivo(req, res, {
      archivo,
      almacen: this.almacen,
      cacheControl: opciones.cache === 'foto' ? CACHE_FOTO_CRM : CACHE_ADMIN,
      disposicion: { tipo: opciones.disposicion, nombre: opciones.nombre },
      registro: this.registro,
    });
  }

  /** Contenido completo de un archivo del almacén (para adjuntarlo a un correo). 404 si no existe. */
  async leerCompleto(archivoId: number): Promise<Buffer> {
    const archivo = await this.referencia(archivoId);
    if (!archivo) throw noEncontrado('El archivo no existe.');
    return this.almacen.leerCompleto(archivo);
  }
}
