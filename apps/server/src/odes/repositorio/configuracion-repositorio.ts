import { isAbsolute, resolve } from 'node:path';
import {
  ErrorDeConfiguracion,
  RAIZ_SERVIDOR,
} from '../../config/configuracion.js';

/**
 * Variables de entorno del índice del repositorio (todas opcionales):
 *
 *   ODES_INDICE         Archivo del índice SQLite. Por defecto
 *                       apps/server/datos/odes/indice.sqlite. Una ruta relativa
 *                       se resuelve contra apps/server (igual que WEB_DIST_DIR).
 *   ODES_URL_DOCUMENTO  Plantilla del enlace de los documentos con archivo
 *                       propio, con {id} y/o {url_ver}. Por defecto, el
 *                       destino que guardó el indexador: la copia propia de
 *                       la rama /repositorio (índice desde la base) o la URL
 *                       original (índice desde el paquete). Ver url-documento.ts.
 *   ODES_FUENTE         (solo el indexador) mysql | paquete. Por defecto,
 *                       mysql si la base del repositorio está configurada
 *                       (REPOSITORIO_MYSQL_*), si no paquete.
 *   ODES_PAQUETE        (solo el indexador) carpeta del paquete de datos con
 *                       repositorio.json, documentos/ y portadas/.
 */

/** apps/server/datos/odes: índice, caché de extracción y casos de evaluación. */
export const DIRECTORIO_DATOS_ODES = resolve(RAIZ_SERVIDOR, 'datos', 'odes');

export const INDICE_POR_DEFECTO = resolve(
  DIRECTORIO_DATOS_ODES,
  'indice.sqlite',
);

/** apps/web/public/odes/portadas: miniaturas que sirve el front-end en /odes/portadas/. */
export const DIRECTORIO_MINIATURAS_POR_DEFECTO = resolve(
  RAIZ_SERVIDOR,
  '..',
  'web',
  'public',
  'odes',
  'portadas',
);

function leer(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const valor = env[nombre]?.trim();
  return valor ? valor : undefined;
}

/** Resuelve una ruta de configuración: relativa = contra apps/server. */
export function resolverDesdeServidor(ruta: string): string {
  return isAbsolute(ruta) ? resolve(ruta) : resolve(RAIZ_SERVIDOR, ruta);
}

export function rutaIndiceDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const valor = leer(env, 'ODES_INDICE');
  return valor ? resolverDesdeServidor(valor) : INDICE_POR_DEFECTO;
}

export function plantillaUrlDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return leer(env, 'ODES_URL_DOCUMENTO') ?? null;
}

export function paqueteDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const valor = leer(env, 'ODES_PAQUETE');
  return valor ? resolverDesdeServidor(valor) : null;
}

export const FUENTES_INDEXADOR = ['mysql', 'paquete'] as const;
export type FuenteIndexador = (typeof FUENTES_INDEXADOR)[number];

/** Valida el nombre de una fuente del indexador (opción --fuente u ODES_FUENTE). */
export function interpretarFuente(
  valor: string,
  nombre = 'ODES_FUENTE',
): FuenteIndexador {
  const limpio = valor.trim().toLowerCase();
  if ((FUENTES_INDEXADOR as readonly string[]).includes(limpio)) {
    return limpio as FuenteIndexador;
  }
  throw new ErrorDeConfiguracion(
    `${nombre} debe ser mysql o paquete (recibido: "${valor}").`,
  );
}

/** ODES_FUENTE, o null si no está definida (el indexador decide). */
export function fuenteDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): FuenteIndexador | null {
  const valor = leer(env, 'ODES_FUENTE');
  return valor ? interpretarFuente(valor) : null;
}
