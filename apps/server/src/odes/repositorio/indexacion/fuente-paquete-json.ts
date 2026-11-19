import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type {
  FuenteRepositorio,
  LecturaFuente,
  RegistroFuente,
} from './fuente.js';

/**
 * Fuente: paquete de datos del repositorio (carpeta con repositorio.json,
 * documentos/ y portadas/; diccionario en su LEEME.md). Solo lee: nunca
 * modifica el paquete.
 *
 * Cada registro se valida con zod. Un registro inválido se omite con un aviso
 * (no detiene la indexación). Los campos que el índice no usa —entre ellos
 * `curaduria`, que es interna— se descartan aquí.
 */

const textoOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor?.trim() ? valor.trim() : null));

const esquemaRegistro = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,199}$/, 'id debe ser un slug en minúsculas'),
  orden: z.number().int().min(1),
  titulo: z.string().trim().min(1),
  subtitulo: textoOpcional,
  categoria: z.string().trim().min(1),
  numero: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((valor) =>
      valor === null || valor === undefined || String(valor).trim() === ''
        ? null
        : String(valor).trim(),
    ),
  anio: z.number().int().min(1900).max(2200).nullable(),
  mes: z
    .number()
    .int()
    .min(1)
    .max(12)
    .nullish()
    .transform((v) => v ?? null),
  idioma: z.enum(['es', 'en']),
  tipo: z.enum(['documento', 'tablero', 'entrada']),
  claves: z.array(z.string().trim().min(1)).default([]),
  archivo: textoOpcional,
  archivo_tipo: textoOpcional,
  portada: textoOpcional,
  url_ver: z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/i, 'url_ver debe ser http(s)'),
  nota: textoOpcional,
  origen: z
    .object({ equivalente_en_espanol: textoOpcional })
    .nullish()
    .transform((origen) => origen ?? { equivalente_en_espanol: null }),
});

const esquemaPaquete = z.object({
  version: z.union([z.string(), z.number()]).nullish(),
  generado: z.string().nullish(),
  documentos: z.array(z.unknown()),
});

export class ErrorFuente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFuente';
  }
}

export class FuentePaqueteJson implements FuenteRepositorio {
  readonly directorio: string;

  constructor(directorio: string) {
    this.directorio = resolve(directorio);
  }

  /** Ruta dentro del paquete; null si sale de la carpeta (../, absoluta). */
  private rutaInterna(rutaRelativa: string): string | null {
    if (isAbsolute(rutaRelativa)) return null;
    const ruta = resolve(this.directorio, rutaRelativa);
    const desdeRaiz = relative(this.directorio, ruta);
    if (!desdeRaiz || desdeRaiz.startsWith('..') || isAbsolute(desdeRaiz)) {
      return null;
    }
    return ruta;
  }

  private archivoExistente(
    rutaRelativa: string | null,
    id: string,
    campo: string,
    avisos: string[],
  ): string | null {
    if (!rutaRelativa) return null;
    const ruta = this.rutaInterna(rutaRelativa);
    if (!ruta) {
      avisos.push(
        `${id}: ${campo} fuera del paquete (${rutaRelativa}); se ignora.`,
      );
      return null;
    }
    if (!existsSync(ruta) || !statSync(ruta).isFile()) {
      avisos.push(
        `${id}: no existe ${campo} ${rutaRelativa}; se indexan solo sus metadatos.`,
      );
      return null;
    }
    return ruta;
  }

  async leer(): Promise<LecturaFuente> {
    const rutaJson = resolve(this.directorio, 'repositorio.json');
    let crudo: unknown;
    try {
      crudo = JSON.parse(await readFile(rutaJson, 'utf8'));
    } catch (error) {
      throw new ErrorFuente(
        `No se pudo leer ${rutaJson}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const paquete = esquemaPaquete.safeParse(crudo);
    if (!paquete.success) {
      throw new ErrorFuente(
        `${rutaJson} no tiene el formato esperado ({ version, generado, documentos: [...] }).`,
      );
    }

    const avisos: string[] = [];
    const registros: RegistroFuente[] = [];
    const ids = new Set<string>();
    paquete.data.documentos.forEach((elemento, posicion) => {
      const resultado = esquemaRegistro.safeParse(elemento);
      if (!resultado.success) {
        const id =
          typeof elemento === 'object' && elemento && 'id' in elemento
            ? String((elemento as { id: unknown }).id)
            : `#${posicion + 1}`;
        const detalle = resultado.error.issues
          .slice(0, 3)
          .map(
            (issue) =>
              `${issue.path.join('.') || '(registro)'}: ${issue.message}`,
          )
          .join('; ');
        avisos.push(`${id}: registro inválido, se omite (${detalle}).`);
        return;
      }
      const r = resultado.data;
      if (ids.has(r.id)) {
        avisos.push(`${r.id}: id repetido, se omite la segunda aparición.`);
        return;
      }
      ids.add(r.id);
      registros.push({
        metadatos: {
          id: r.id,
          orden: r.orden,
          titulo: r.titulo,
          subtitulo: r.subtitulo,
          categoria: r.categoria,
          numero: r.numero,
          anio: r.anio,
          mes: r.mes,
          idioma: r.idioma,
          tipo: r.tipo,
          claves: r.claves,
          urlVer: r.url_ver,
          nota: r.nota,
          equivalenteEnEspanol: r.origen.equivalente_en_espanol,
          archivoTipo: r.archivo_tipo,
        },
        archivo: this.archivoExistente(r.archivo, r.id, 'el archivo', avisos),
        portada: this.archivoExistente(r.portada, r.id, 'la portada', avisos),
      });
    });

    const version = paquete.data.version ?? null;
    const generado = paquete.data.generado ?? null;
    return {
      descripcion:
        `paquete JSON ${this.directorio}` +
        (version !== null
          ? ` (versión ${version}` + (generado ? `, ${generado})` : ')')
          : ''),
      version: version === null ? null : String(version),
      registros,
      avisos,
      origen: 'paquete',
    };
  }
}
