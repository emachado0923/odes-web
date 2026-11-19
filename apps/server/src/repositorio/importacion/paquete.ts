import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { LIMITES_REPOSITORIO } from '../api-repositorio.js';
import { PATRON_ID_DOCUMENTO, textoLinea } from '../dominio/normalizacion.js';
import { esUrlHttp } from '../dominio/validacion.js';

/**
 * Lectura del paquete de la carga inicial
 * (Septiembre/observatorio/repositorio-datos: repositorio.json + documentos/
 * + portadas/; diccionario en su LEEME.md). Solo lee: nunca lo modifica.
 * Cada registro se valida con zod; uno inválido se omite con un aviso.
 */

export class ErrorPaquete extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPaquete';
  }
}

const textoOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor && textoLinea(valor) ? textoLinea(valor) : null));

const multilineaOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor?.trim() ? valor.trim() : null));

const urlOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor?.trim() ? valor.trim() : null))
  .refine((valor) => valor === null || esUrlHttp(valor), 'URL no válida (http/https)');

const esquemaRegistro = z.object({
  id: z.string().max(120).regex(PATRON_ID_DOCUMENTO, 'id debe ser un slug en minúsculas'),
  orden: z.number().int().min(1),
  titulo: z.string().transform(textoLinea).pipe(z.string().min(1).max(LIMITES_REPOSITORIO.maxTitulo)),
  subtitulo: textoOpcional,
  categoria: z.string().transform(textoLinea).pipe(z.string().min(1).max(100)),
  numero: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((valor) =>
      valor === null || valor === undefined || String(valor).trim() === ''
        ? null
        : textoLinea(String(valor)),
    ),
  anio: z.number().int().min(1900).max(2200).nullish().transform((v) => v ?? null),
  mes: z.number().int().min(1).max(12).nullish().transform((v) => v ?? null),
  idioma: z.enum(['es', 'en']),
  tipo: z.enum(['documento', 'tablero', 'entrada']),
  claves: z.array(z.string()).default([]),
  archivo: textoOpcional,
  archivo_tipo: textoOpcional,
  archivo_bytes: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  portada: textoOpcional,
  url_ver: z.string().trim().refine(esUrlHttp, 'url_ver debe ser http(s)'),
  url_descarga: urlOpcional,
  permite_descarga: z.boolean().default(false),
  url_entrada_blog: urlOpcional,
  nota: textoOpcional,
  origen: z
    .object({
      pagina_sitio: textoOpcional,
      subido: textoOpcional,
      equivalente_en_espanol: textoOpcional,
    })
    .nullish()
    .transform((o) => o ?? { pagina_sitio: null, subido: null, equivalente_en_espanol: null }),
  curaduria: z
    .object({ evidencia: multilineaOpcional, dudas: multilineaOpcional })
    .nullish()
    .transform((c) => c ?? { evidencia: null, dudas: null }),
});

export type RegistroPaquete = z.infer<typeof esquemaRegistro> & {
  /** Rutas absolutas ya verificadas (dentro del paquete y existentes), o null. */
  rutaArchivo: string | null;
  rutaPortada: string | null;
};

export interface Paquete {
  directorio: string;
  version: string | null;
  generado: string | null;
  registros: RegistroPaquete[];
  avisos: string[];
}

const esquemaPaquete = z.object({
  version: z.union([z.string(), z.number()]).nullish(),
  generado: z.string().nullish(),
  documentos: z.array(z.unknown()),
});

/** Ruta dentro del paquete (rechaza ../ y rutas absolutas). */
function rutaInterna(directorio: string, relativa: string): string | null {
  const absoluta = resolve(directorio, relativa);
  const desde = relative(directorio, absoluta);
  if (!desde || desde.split(/[\\/]/)[0] === '..' || isAbsolute(desde)) return null;
  return absoluta;
}

export async function leerPaquete(directorio: string): Promise<Paquete> {
  const raiz = resolve(directorio);
  const rutaJson = join(raiz, 'repositorio.json');
  if (!existsSync(rutaJson)) {
    throw new ErrorPaquete(`No existe ${rutaJson}. ¿Es la carpeta del paquete (repositorio-datos)?`);
  }
  let datos: unknown;
  try {
    datos = JSON.parse(await readFile(rutaJson, 'utf8'));
  } catch (error) {
    throw new ErrorPaquete(
      `repositorio.json no es JSON válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const paquete = esquemaPaquete.safeParse(datos);
  if (!paquete.success) {
    throw new ErrorPaquete('repositorio.json no tiene la forma { version, generado, documentos: [...] }.');
  }
  const avisos: string[] = [];
  const registros: RegistroPaquete[] = [];
  const vistos = new Set<string>();
  paquete.data.documentos.forEach((crudo, indice) => {
    const resultado = esquemaRegistro.safeParse(crudo);
    const etiqueta = `registro ${indice + 1}${
      typeof (crudo as { id?: unknown })?.id === 'string' ? ` (${(crudo as { id: string }).id})` : ''
    }`;
    if (!resultado.success) {
      const problema = resultado.error.issues[0];
      avisos.push(`${etiqueta}: omitido, ${problema?.path.join('.') || 'registro'}: ${problema?.message}`);
      return;
    }
    const registro = resultado.data;
    if (vistos.has(registro.id)) {
      avisos.push(`${etiqueta}: omitido, id repetido`);
      return;
    }
    vistos.add(registro.id);
    let rutaArchivo: string | null = null;
    if (registro.archivo) {
      rutaArchivo = rutaInterna(raiz, registro.archivo);
      if (!rutaArchivo || !existsSync(rutaArchivo)) {
        avisos.push(`${etiqueta}: el archivo ${registro.archivo} no existe en el paquete; queda sin archivo`);
        rutaArchivo = null;
      }
    }
    let rutaPortada: string | null = null;
    if (registro.portada) {
      rutaPortada = rutaInterna(raiz, registro.portada);
      if (!rutaPortada || !existsSync(rutaPortada)) {
        avisos.push(`${etiqueta}: la portada ${registro.portada} no existe en el paquete`);
        rutaPortada = null;
      }
    }
    registros.push({ ...registro, rutaArchivo, rutaPortada });
  });
  return {
    directorio: raiz,
    version: paquete.data.version === null || paquete.data.version === undefined ? null : String(paquete.data.version),
    generado: paquete.data.generado ?? null,
    registros,
    avisos,
  };
}

/** Notas internas a partir de la curaduría y del origen (solo la administración las ve). */
export function notasInternasDe(registro: RegistroPaquete): string | null {
  const partes: string[] = [];
  if (registro.curaduria.evidencia) partes.push(`Evidencia: ${registro.curaduria.evidencia}`);
  if (registro.curaduria.dudas) partes.push(`Dudas: ${registro.curaduria.dudas}`);
  const origen: string[] = [];
  if (registro.origen.pagina_sitio) origen.push(`página ${registro.origen.pagina_sitio}`);
  if (registro.origen.subido) origen.push(`subido ${registro.origen.subido}`);
  partes.push(
    `Publicado originalmente en: ${registro.url_ver}` +
      (registro.url_descarga ? ` (descarga: ${registro.url_descarga})` : '') +
      (origen.length ? ` — ${origen.join(', ')}` : ''),
  );
  return partes.join('\n\n');
}
