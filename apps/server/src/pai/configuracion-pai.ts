import { ErrorDeConfiguracion } from '../config/configuracion.js';

/**
 * Configuración propia de la rama /pai (variables PAI_*). Lo demás se toma de
 * la del repositorio (CONFIGURACION_REPOSITORIO): la base, Supabase
 * (REPOSITORIO_SUPABASE_URL / _CLAVE), la cookie segura
 * (REPOSITORIO_COOKIE_SEGURA) y la duración de las sesiones
 * (REPOSITORIO_SESION_*).
 *
 * - PAI_SUPABASE_BUCKET (opcional, "pai-evidencias"): bucket PRIVADO de
 *   Supabase Storage para las evidencias. Solo se usa si el repositorio tiene
 *   Supabase configurado; las descargas salen con URL firmadas de corta
 *   duración, nunca públicas. Debe ser distinto del bucket público del
 *   repositorio.
 *
 * (PAI_USUARIO_CONTRASENA la lee solo la CLI pai:crear-usuario.)
 */
export interface ConfiguracionPai {
  /** Bucket privado de las evidencias en Supabase Storage. */
  readonly bucketEvidencias: string;
  /** Vigencia de las URL firmadas de descarga (segundos). */
  readonly segundosUrlFirmada: number;
}

/** Token de inyección de Nest (las pruebas lo reemplazan con overrideProvider). */
export const CONFIGURACION_PAI = Symbol('CONFIGURACION_PAI');

export const BUCKET_EVIDENCIAS_POR_DEFECTO = 'pai-evidencias';
export const SEGUNDOS_URL_FIRMADA = 60;

/** Lee y valida la configuración. Lanza ErrorDeConfiguracion. */
export function cargarConfiguracionPai(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracionPai {
  const bucket =
    env.PAI_SUPABASE_BUCKET?.trim() || BUCKET_EVIDENCIAS_POR_DEFECTO;
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/.test(bucket)) {
    throw new ErrorDeConfiguracion(
      `PAI_SUPABASE_BUCKET "${bucket}" no es un nombre de bucket válido (minúsculas, números, . _ -).`,
    );
  }
  const publico = env.REPOSITORIO_SUPABASE_BUCKET?.trim() || 'repositorio';
  if (bucket === publico) {
    throw new ErrorDeConfiguracion(
      'PAI_SUPABASE_BUCKET debe ser un bucket privado distinto del bucket público del repositorio (REPOSITORIO_SUPABASE_BUCKET).',
    );
  }
  return Object.freeze({
    bucketEvidencias: bucket,
    segundosUrlFirmada: SEGUNDOS_URL_FIRMADA,
  });
}
