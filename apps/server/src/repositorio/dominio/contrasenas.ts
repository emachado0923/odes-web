import {
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Contraseñas de los administradores con scrypt (RFC 7914) y sal aleatoria
 * por usuario. Formato guardado (sin la contraseña, claro):
 *
 *   scrypt$<N>$<r>$<p>$<sal base64>$<hash base64>
 *
 * N=2^15, r=8, p=1 (~32 MiB y ~50-100 ms por verificación): la recomendación
 * de OWASP para scrypt. Si en el futuro se suben los parámetros,
 * `necesitaRehash` avisa y el inicio de sesión vuelve a calcular el hash.
 */

export const PARAMETROS_SCRYPT = { N: 32768, r: 8, p: 1 } as const;
const LONGITUD_HASH = 64;
const LONGITUD_SAL = 16;
export const MIN_LONGITUD_CONTRASENA = 12;
export const MAX_LONGITUD_CONTRASENA = 1024;

function scrypt(
  contrasena: string,
  sal: Buffer,
  longitud: number,
  parametros: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scryptCallback(contrasena, sal, longitud, parametros, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

function opciones(N: number, r: number, p: number): ScryptOptions {
  // maxmem por defecto (32 MiB) es justo lo que usa N=2^15, r=8: se dobla.
  return { N, r, p, maxmem: 256 * N * r };
}

/** La misma contraseña escrita en macOS o Windows produce los mismos bytes. */
function normalizar(contrasena: string): string {
  return contrasena.normalize('NFC');
}

export async function hashContrasena(contrasena: string): Promise<string> {
  const { N, r, p } = PARAMETROS_SCRYPT;
  const sal = randomBytes(LONGITUD_SAL);
  const hash = await scrypt(normalizar(contrasena), sal, LONGITUD_HASH, opciones(N, r, p));
  return `scrypt$${N}$${r}$${p}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

interface HashInterpretado {
  N: number;
  r: number;
  p: number;
  sal: Buffer;
  hash: Buffer;
}

export function interpretarHash(almacenado: string): HashInterpretado | null {
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return null;
  const [N, r, p] = partes.slice(1, 4).map(Number);
  const potenciaDeDos = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (
    !potenciaDeDos ||
    N > 2 ** 20 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 32 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 16
  ) {
    return null;
  }
  const sal = Buffer.from(partes[4], 'base64');
  const hash = Buffer.from(partes[5], 'base64');
  if (sal.length < 8 || hash.length < 32) return null;
  return { N, r, p, sal, hash };
}

/** Compara en tiempo constante. Un hash mal formado nunca coincide. */
export async function verificarContrasena(
  contrasena: string,
  almacenado: string,
): Promise<boolean> {
  const datos = interpretarHash(almacenado);
  if (!datos) return false;
  const calculado = await scrypt(
    normalizar(contrasena),
    datos.sal,
    datos.hash.length,
    opciones(datos.N, datos.r, datos.p),
  );
  return timingSafeEqual(calculado, datos.hash);
}

export function necesitaRehash(almacenado: string): boolean {
  const datos = interpretarHash(almacenado);
  return (
    !datos ||
    datos.N !== PARAMETROS_SCRYPT.N ||
    datos.r !== PARAMETROS_SCRYPT.r ||
    datos.p !== PARAMETROS_SCRYPT.p ||
    datos.hash.length !== LONGITUD_HASH
  );
}

let hashFicticio: Promise<string> | null = null;

/**
 * Hash de una contraseña aleatoria: cuando el usuario no existe se verifica
 * contra él, para que la respuesta tarde lo mismo y no revele qué usuarios
 * existen.
 */
export function obtenerHashFicticio(): Promise<string> {
  hashFicticio ??= hashContrasena(randomBytes(32).toString('base64'));
  return hashFicticio;
}

/** Problema de una contraseña nueva, o null si sirve. */
export function problemaContrasena(contrasena: string): string | null {
  const longitud = [...normalizar(contrasena)].length;
  if (longitud < MIN_LONGITUD_CONTRASENA) {
    return `La contraseña debe tener al menos ${MIN_LONGITUD_CONTRASENA} caracteres.`;
  }
  if (longitud > MAX_LONGITUD_CONTRASENA) {
    return `La contraseña no puede pasar de ${MAX_LONGITUD_CONTRASENA} caracteres.`;
  }
  if (/^\s|\s$/.test(contrasena)) {
    return 'La contraseña no puede empezar ni terminar con espacios.';
  }
  return null;
}
