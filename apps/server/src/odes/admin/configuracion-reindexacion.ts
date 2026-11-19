import { availableParallelism, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  ErrorDeConfiguracion,
  RAIZ_SERVIDOR,
} from '../../config/configuracion.js';
import { rutaIndiceDesdeEntorno } from '../repositorio/configuracion-repositorio.js';

/**
 * Reindexación desde la administración (/repositorio/admin): el servidor
 * ejecuta el indexador compilado (dist/odes/cli/indexar.js) como proceso
 * hijo, con la base del repositorio como fuente.
 *
 * Variables de entorno (opcionales):
 *   ODES_REINDEXAR_CONCURRENCIA     procesos externos a la vez (pdftotext,
 *                                   tesseract) del indexador. Por defecto la
 *                                   mitad de los núcleos, para no quitarle
 *                                   toda la CPU al sitio.
 *   ODES_REINDEXAR_TIMEOUT_MINUTOS  tiempo máximo (por defecto 60). Al
 *                                   agotarse se detiene y el índice anterior
 *                                   queda intacto.
 *   ODES_REINDEXAR=desactivado      sin reindexación desde la administración.
 *                                   Es automático en Vercel (VERCEL=1): allí el
 *                                   índice viaja dentro del despliegue, en un
 *                                   disco de solo lectura.
 */

export interface ComandoIndexador {
  ejecutable: string;
  /** Argumentos previos a las opciones del indexador. */
  argumentos: readonly string[];
  /** Archivo que debe existir para poder ejecutarlo (el indexador compilado), o null. */
  requiere: string | null;
}

export interface OpcionesReindexacion {
  /** El mismo índice que lee el servidor (ODES_INDICE). */
  rutaIndice: string;
  comando: ComandoIndexador;
  concurrencia: number;
  timeoutMs: number;
  /** Carpeta del JSON de resultado que escribe el indexador. */
  directorioTemporal: string;
  /** Si no se puede reindexar en este despliegue, el motivo (para el 409); si se puede, null. */
  desactivada?: string | null;
}

export const MOTIVO_SIN_REINDEXACION =
  'En este despliegue no se puede reindexar desde la administración: el índice del Asistente ODES ' +
  'viaja dentro del despliegue (Vercel), en un disco de solo lectura. Para actualizarlo, reindexe en un ' +
  'equipo (npm run odes:indexar) y vuelva a desplegar.';

export const OPCIONES_REINDEXACION = Symbol('OPCIONES_REINDEXACION');

/** apps/server/dist/odes/cli/indexar.js (lo genera `nest build`). */
export const INDEXADOR_COMPILADO = resolve(
  RAIZ_SERVIDOR,
  'dist',
  'odes',
  'cli',
  'indexar.js',
);

function leerEntero(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: number,
  minimo: number,
  maximo: number,
): number {
  const valor = env[nombre]?.trim();
  if (!valor) return porDefecto;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < minimo || numero > maximo) {
    throw new ErrorDeConfiguracion(
      `${nombre} debe ser un entero entre ${minimo} y ${maximo} (recibido: "${valor}").`,
    );
  }
  return numero;
}

export function opcionesReindexacionDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): OpcionesReindexacion {
  return {
    rutaIndice: rutaIndiceDesdeEntorno(env),
    comando: {
      ejecutable: process.execPath,
      argumentos: ['--enable-source-maps', INDEXADOR_COMPILADO],
      requiere: INDEXADOR_COMPILADO,
    },
    concurrencia: leerEntero(
      env,
      'ODES_REINDEXAR_CONCURRENCIA',
      Math.max(1, Math.floor(availableParallelism() / 2)),
      1,
      64,
    ),
    timeoutMs:
      leerEntero(env, 'ODES_REINDEXAR_TIMEOUT_MINUTOS', 60, 1, 720) * 60_000,
    directorioTemporal: tmpdir(),
    desactivada:
      env.ODES_REINDEXAR?.trim().toLowerCase() === 'desactivado' || env.VERCEL === '1'
        ? MOTIVO_SIN_REINDEXACION
        : null,
  };
}
