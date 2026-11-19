import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { VERSION_ESQUEMA } from './esquema-indice.js';

/**
 * Lectura rápida de la tabla `meta` de un índice (sin cargarlo entero): la
 * usa la administración para mostrar cuándo se generó, desde qué fuente y
 * con cuántos documentos, justo después de una reindexación (el servidor
 * puede tardar unos segundos más en cargarlo para el chat).
 */

export interface MetaIndice {
  disponible: boolean;
  /** Motivo si no está disponible (no existe, dañado, otra versión). */
  error: string | null;
  generado: string | null;
  /** Descripción de la fuente. */
  fuente: string | null;
  /** paquete | mysql, o null (índices anteriores a la rama /repositorio). */
  origen: 'paquete' | 'mysql' | null;
  versionFuente: string | null;
  /** Huella del contenido de la fuente al indexar (solo índices desde la base). */
  huella: string | null;
  documentos: number;
  documentosConTexto: number;
  paginas: number;
  paginasOcr: number;
  bytes: number;
}

const VACIA: Omit<MetaIndice, 'error'> = {
  disponible: false,
  generado: null,
  fuente: null,
  origen: null,
  versionFuente: null,
  huella: null,
  documentos: 0,
  documentosConTexto: 0,
  paginas: 0,
  paginasOcr: 0,
  bytes: 0,
};

function numero(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: string | undefined): string | null {
  return valor && valor.trim() ? valor : null;
}

export function leerMetaIndice(ruta: string): MetaIndice {
  let bytes: number;
  try {
    const datos = statSync(ruta);
    if (!datos.isFile()) return { ...VACIA, error: 'No hay índice.' };
    bytes = datos.size;
  } catch {
    return { ...VACIA, error: 'No hay índice: todavía no se ha generado.' };
  }
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
    const meta = new Map<string, string>();
    for (const fila of db.prepare('SELECT clave, valor FROM meta').all()) {
      meta.set(String(fila.clave), String(fila.valor));
    }
    const version = Number(meta.get('version_esquema'));
    if (version !== VERSION_ESQUEMA) {
      return {
        ...VACIA,
        bytes,
        error: `El índice es de otra versión (${meta.get('version_esquema') ?? '¿?'}); vuelva a indexar.`,
      };
    }
    const origen = meta.get('fuente_tipo');
    return {
      disponible: true,
      error: null,
      generado: texto(meta.get('generado')),
      fuente: texto(meta.get('fuente')),
      origen: origen === 'mysql' || origen === 'paquete' ? origen : null,
      versionFuente: texto(meta.get('version_fuente')),
      huella: texto(meta.get('huella_fuente')),
      documentos: numero(meta.get('documentos')),
      documentosConTexto: numero(meta.get('documentos_con_texto')),
      paginas: numero(meta.get('paginas')),
      paginasOcr: numero(meta.get('paginas_ocr')),
      bytes,
    };
  } catch (error) {
    return {
      ...VACIA,
      bytes,
      error: `No se pudo leer el índice: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    db?.close();
  }
}
