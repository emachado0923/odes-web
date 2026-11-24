/**
 * Cifrado de la contraseña de aplicación que el líder guarda en
 * crm_correo_cuenta (migración 011). AES-256-GCM con node:crypto; la llave
 * NO está en la base: sale de HKDF-SHA256 de un secreto del servidor, con sal
 * fija 'crm-correo-cuenta' e info 'v1':
 *
 *   1. CRM_CORREO_LLAVE, si existe (mínimo 16 caracteres);
 *   2. si no, la contraseña de la base de la aplicación (la de
 *      REPOSITORIO_MYSQL_PASSWORD, o la que va dentro de REPOSITORIO_POSTGRES_URL),
 *      tomada de la configuración del repositorio.
 *
 * Así, quien lea la base (una copia, un respaldo) no puede descifrarla sin el
 * secreto del servidor. Si el secreto cambia (se rota la contraseña de la
 * base), lo guardado deja de leerse y el líder vuelve a escribir la clave.
 * Sin secreto (base sin contraseña y sin CRM_CORREO_LLAVE) no se puede
 * guardar: 409.
 *
 * Formato guardado: 'v1.' + base64url(iv(12) | tag(16) | cifrado).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import type { ConfiguracionRepositorio } from '../../repositorio/configuracion-repositorio.js';

export const LLAVE_CUENTA_CORREO_CRM = Symbol('LLAVE_CUENTA_CORREO_CRM');

/** De dónde sale el secreto de la llave (para el log; nunca el secreto). */
export type OrigenLlaveCuentaCorreo = 'CRM_CORREO_LLAVE' | 'contraseña de la base';

export interface LlaveCuentaCorreoCrm {
  /** 32 bytes derivados con HKDF-SHA256, o null si el servidor no tiene secreto. */
  readonly llave: Buffer | null;
  readonly origen: OrigenLlaveCuentaCorreo | null;
}

export const VERSION_CIFRADO = 'v1';
const PREFIJO = `${VERSION_CIFRADO}.`;
const SAL = 'crm-correo-cuenta';
const INFO = 'v1';
const BYTES_LLAVE = 32;
const BYTES_IV = 12;
const BYTES_TAG = 16;
/** Largo mínimo de CRM_CORREO_LLAVE. */
export const MINIMO_LLAVE = 16;

/** Contraseña de la base de la aplicación (MySQL, o la de la URL de Postgres), o null. */
export function contrasenaDeLaBase(config: Pick<ConfiguracionRepositorio, 'mysql' | 'postgres'>): string | null {
  if (config.mysql) return config.mysql.contrasena || null;
  if (config.postgres) {
    try {
      const clave = new URL(config.postgres.url).password;
      return clave ? decodeURIComponent(clave) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Secreto de la llave: CRM_CORREO_LLAVE o la contraseña de la base. Lanza ErrorDeConfiguracion si la variable es muy corta. */
export function secretoDeLlave(
  env: NodeJS.ProcessEnv,
  config: Pick<ConfiguracionRepositorio, 'mysql' | 'postgres'>,
): { secreto: string; origen: OrigenLlaveCuentaCorreo } | null {
  const variable = env.CRM_CORREO_LLAVE?.trim();
  if (variable) {
    if (variable.length < MINIMO_LLAVE) {
      throw new ErrorDeConfiguracion(
        `CRM_CORREO_LLAVE debe tener al menos ${MINIMO_LLAVE} caracteres (p. ej. la salida de openssl rand -base64 32).`,
      );
    }
    return { secreto: variable, origen: 'CRM_CORREO_LLAVE' };
  }
  const contrasena = contrasenaDeLaBase(config);
  return contrasena ? { secreto: contrasena, origen: 'contraseña de la base' } : null;
}

/** HKDF-SHA256 del secreto (sal 'crm-correo-cuenta', info 'v1'): 32 bytes. */
export function derivarLlave(secreto: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secreto, 'utf8'), SAL, INFO, BYTES_LLAVE));
}

/** La llave del servidor (o { llave: null } si no hay secreto). */
export function crearLlaveCuentaCorreoCrm(
  env: NodeJS.ProcessEnv,
  config: Pick<ConfiguracionRepositorio, 'mysql' | 'postgres'>,
): LlaveCuentaCorreoCrm {
  const secreto = secretoDeLlave(env, config);
  if (!secreto) return Object.freeze({ llave: null, origen: null });
  return Object.freeze({ llave: derivarLlave(secreto.secreto), origen: secreto.origen });
}

/** 'v1.' + base64url(iv | tag | cifrado), con un iv aleatorio en cada llamada. */
export function cifrarClave(clave: string, llave: Buffer): string {
  if (llave.length !== BYTES_LLAVE) throw new Error('La llave del cifrado debe tener 32 bytes.');
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv('aes-256-gcm', llave, iv, { authTagLength: BYTES_TAG });
  const cifrado = Buffer.concat([cifrador.update(clave, 'utf8'), cifrador.final()]);
  return PREFIJO + Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64url');
}

/** La clave en claro, o null si no se puede descifrar (otra llave, otro formato o el texto alterado). */
export function descifrarClave(guardada: string, llave: Buffer | null): string | null {
  if (!llave || llave.length !== BYTES_LLAVE || !guardada.startsWith(PREFIJO)) return null;
  const cuerpo = guardada.slice(PREFIJO.length);
  if (!/^[A-Za-z0-9_-]+$/.test(cuerpo)) return null;
  const datos = Buffer.from(cuerpo, 'base64url');
  if (datos.length <= BYTES_IV + BYTES_TAG) return null;
  try {
    const descifrador = createDecipheriv('aes-256-gcm', llave, datos.subarray(0, BYTES_IV), {
      authTagLength: BYTES_TAG,
    });
    descifrador.setAuthTag(datos.subarray(BYTES_IV, BYTES_IV + BYTES_TAG));
    return Buffer.concat([descifrador.update(datos.subarray(BYTES_IV + BYTES_TAG)), descifrador.final()]).toString(
      'utf8',
    );
  } catch {
    return null;
  }
}
