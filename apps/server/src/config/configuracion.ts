import { accessSync, constants, existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Configuración del servidor, leída una sola vez de las variables de entorno
 * (ver `.env.example`). Es un helper tipado sin dependencias: el proyecto solo
 * necesita un puñado de variables y así no hace falta `@nestjs/config`.
 */
export interface Configuracion {
  /** NODE_ENV tal como llega (`development` si no está definido). */
  readonly entorno: string;
  /** PORT: puerto HTTP (por defecto 3000). */
  readonly puerto: number;
  /** HOST: interfaz de escucha (por defecto 0.0.0.0, todas las interfaces). */
  readonly host: string;
  /** WEB_DIST_DIR resuelto a ruta absoluta: carpeta del build de React (Vite). */
  readonly directorioWeb: string;
  /** CSP_FRAME_ANCESTORS separado en fuentes CSP (por defecto `'self'`). */
  readonly cspFrameAncestors: readonly string[];
  /** TRUST_PROXY ya convertido al valor que espera `app.set('trust proxy')`. */
  readonly trustProxy: boolean | number | string;
  /**
   * Orígenes de otro dominio de donde el navegador trae archivos del
   * repositorio (Supabase Storage, de REPOSITORIO_SUPABASE_URL): la CSP los
   * admite en img-src y connect-src.
   */
  readonly origenesArchivos: readonly string[];
}

/**
 * Raíz del paquete apps/server. Con `rootDir: ./src` (tsconfig.build.json) el
 * compilado replica la estructura de src/, así que este archivo vive en
 * src/config/ (vitest) o en dist/config/ (`nest start --watch` y
 * `node dist/main.js`): en los tres casos la raíz está dos niveles arriba.
 */
export const RAIZ_SERVIDOR = resolve(import.meta.dirname, '..', '..');

/** apps/web/dist, hermano de apps/server dentro de apps/. */
export const DIRECTORIO_WEB_POR_DEFECTO = resolve(
  RAIZ_SERVIDOR,
  '..',
  'web',
  'dist',
);

export class ErrorDeConfiguracion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeConfiguracion';
  }
}

/** Devuelve el valor recortado o `undefined` si la variable está vacía. */
function leer(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const valor = env[nombre]?.trim();
  return valor ? valor : undefined;
}

function leerPuerto(env: NodeJS.ProcessEnv): number {
  const valor = leer(env, 'PORT');
  if (valor === undefined) return 3000;
  const puerto = Number(valor);
  if (!/^\d+$/.test(valor) || puerto > 65535) {
    throw new ErrorDeConfiguracion(
      `PORT debe ser un entero entre 0 y 65535 (recibido: "${valor}").`,
    );
  }
  return puerto;
}

function leerFrameAncestors(env: NodeJS.ProcessEnv): string[] {
  const valor = leer(env, 'CSP_FRAME_ANCESTORS') ?? "'self'";
  // Un ";" o un salto de línea permitirían inyectar otra directiva CSP.
  if (/[;\r\n]/.test(valor)) {
    throw new ErrorDeConfiguracion(
      'CSP_FRAME_ANCESTORS no puede contener ";" ni saltos de línea.',
    );
  }
  // Se aceptan espacios o comas como separador. Las palabras clave sin
  // comillas (self, none) se citan: los archivos .env quitan las comillas
  // simples de `CSP_FRAME_ANCESTORS='self'` y `self` a secas sería un host.
  // También se pasan a minúsculas ('SELF' -> 'self').
  const fuentes = valor
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((fuente) =>
      /^('?)(self|none)\1$/i.test(fuente)
        ? `'${fuente.replaceAll("'", '').toLowerCase()}'`
        : fuente,
    );
  for (const fuente of fuentes) {
    // Las fuentes CSP son ASCII imprimible. Una comilla tipográfica (‘self’,
    // copiada de Word, Docs o un PDF) o un dominio con tildes o en otro
    // alfabeto pasarían de aquí y harían fallar setHeader en CADA petición
    // (ERR_INVALID_CHAR: todo el sitio en 500, también /api/salud), o el
    // navegador los ignoraría en silencio. Mejor no arrancar.
    if (!/^[\x21-\x7e]+$/.test(fuente)) {
      throw new ErrorDeConfiguracion(
        `CSP_FRAME_ANCESTORS: la fuente ${JSON.stringify(fuente)} tiene ` +
          "caracteres no válidos. Use comillas rectas ('self') y escriba los " +
          'dominios internacionales en punycode (xn--...).',
      );
    }
    // En frame-ancestors solo 'self' y 'none' van entre comillas.
    if (/["']/.test(fuente) && !/^'(self|none)'$/.test(fuente)) {
      throw new ErrorDeConfiguracion(
        `CSP_FRAME_ANCESTORS: la fuente ${JSON.stringify(fuente)} no es ` +
          "válida. Entre comillas solo se admiten 'self' y 'none'; los " +
          'orígenes van sin comillas (https://www.sapiencia.gov.co).',
      );
    }
  }
  if (fuentes.includes("'none'") && fuentes.length > 1) {
    throw new ErrorDeConfiguracion(
      "CSP_FRAME_ANCESTORS: 'none' no se puede combinar con otras fuentes.",
    );
  }
  return fuentes;
}

/**
 * TRUST_PROXY: vacío o "false" = no confiar en X-Forwarded-*; "true" = confiar
 * en cualquier proxy (desaconsejado); un número = cantidad de saltos (1 para
 * un nginx delante); cualquier otro texto se pasa tal cual a Express
 * ("loopback", "10.0.0.0/8, 127.0.0.1", ...).
 */
function leerTrustProxy(env: NodeJS.ProcessEnv): boolean | number | string {
  const valor = leer(env, 'TRUST_PROXY');
  if (valor === undefined || valor.toLowerCase() === 'false') return false;
  if (valor.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

/**
 * Las rutas relativas de WEB_DIST_DIR se resuelven contra la raíz de
 * apps/server (no contra el cwd) para que el resultado no dependa de desde
 * dónde se lance el proceso (npm --prefix, systemd, pm2...).
 */
function leerDirectorioWeb(env: NodeJS.ProcessEnv): string {
  const valor = leer(env, 'WEB_DIST_DIR');
  if (valor === undefined) return DIRECTORIO_WEB_POR_DEFECTO;
  return isAbsolute(valor) ? resolve(valor) : resolve(RAIZ_SERVIDOR, valor);
}

/** Origen de REPOSITORIO_SUPABASE_URL (la validación completa es del repositorio). */
function leerOrigenesArchivos(env: NodeJS.ProcessEnv): string[] {
  const valor = leer(env, 'REPOSITORIO_SUPABASE_URL');
  if (valor === undefined) return [];
  try {
    const origen = new URL(valor).origin;
    return origen === 'null' ? [] : [origen];
  } catch {
    return [];
  }
}

/** Lee y valida la configuración. Lanza `ErrorDeConfiguracion` si algo no cuadra. */
export function cargarConfiguracion(
  env: NodeJS.ProcessEnv = process.env,
): Configuracion {
  return Object.freeze({
    entorno: leer(env, 'NODE_ENV') ?? 'development',
    puerto: leerPuerto(env),
    host: leer(env, 'HOST') ?? '0.0.0.0',
    directorioWeb: leerDirectorioWeb(env),
    cspFrameAncestors: Object.freeze(leerFrameAncestors(env)),
    trustProxy: leerTrustProxy(env),
    origenesArchivos: Object.freeze(leerOrigenesArchivos(env)),
  });
}

/**
 * Carga apps/server/.env en process.env si existe (Node >= 20.12). Las
 * variables que ya vengan del entorno real tienen prioridad sobre el archivo.
 * Lo llaman main.ts y las CLI: los tests construyen su configuración
 * explícitamente.
 *
 * Si el archivo existe pero no se puede leer (en la VM queda con permisos 600
 * del usuario del servicio), Node informaría un engañoso "ENOENT: no such
 * file or directory": se explica el motivo real.
 */
export function cargarArchivoEnv(ruta = resolve(RAIZ_SERVIDOR, '.env')): void {
  if (!existsSync(ruta)) return;
  try {
    accessSync(ruta, constants.R_OK);
  } catch {
    throw new ErrorDeConfiguracion(
      `${ruta} existe pero este usuario no lo puede leer (permisos). Ejecute el comando como el ` +
        'usuario del servicio, por ejemplo: sudo -u sapiencia node dist/...',
    );
  }
  process.loadEnvFile(ruta);
}
