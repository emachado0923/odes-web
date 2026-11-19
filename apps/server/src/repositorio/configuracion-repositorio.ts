import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  ErrorDeConfiguracion,
  RAIZ_SERVIDOR,
} from '../config/configuracion.js';

/**
 * Configuración de la rama /repositorio (Repositorio de Productos del
 * Observatorio), leída de las variables de entorno REPOSITORIO_* (ver
 * `.env.example`, sección "Repositorio de Productos").
 *
 * La base puede ser MySQL (REPOSITORIO_MYSQL_*: la Cloud SQL de la entidad) o
 * Postgres (REPOSITORIO_POSTGRES_URL: Supabase u otro), nunca las dos. Los
 * archivos van dentro de la base salvo que se configure Supabase Storage
 * (REPOSITORIO_SUPABASE_*).
 *
 * Sin ninguna de las dos bases queda "sin configurar": el servidor arranca
 * igual (/sivu y /odes siguen funcionando) y /api/repositorio/* responde 503.
 * Un valor inválido (puerto, modo TLS, archivo de certificado que no existe,
 * configuración a medias) sí impide arrancar, con un mensaje claro, igual que
 * el resto de la configuración.
 */

export const MODOS_SSL = [
  'desactivado',
  'requerido',
  'verificar-ca',
  'verificar-identidad',
] as const;
export type ModoSsl = (typeof MODOS_SSL)[number];

export interface OpcionesSsl {
  readonly modo: Exclude<ModoSsl, 'desactivado'>;
  /** Contenido PEM de la CA del servidor (Cloud SQL: server-ca.pem). */
  readonly ca: string | null;
  /** Certificado y clave del cliente, si la instancia los exige. */
  readonly cert: string | null;
  readonly key: string | null;
}

export interface OpcionesMysql {
  readonly host: string;
  readonly puerto: number;
  readonly usuario: string;
  readonly contrasena: string;
  readonly baseDatos: string;
  readonly ssl: OpcionesSsl | null;
  /** Conexiones simultáneas del pool. */
  readonly conexiones: number;
  /** Tiempo máximo para abrir una conexión (ms). */
  readonly timeoutConexionMs: number;
}

export interface OpcionesPostgres {
  /** URL de conexión sin parámetros sslmode (el TLS va en `ssl`). */
  readonly url: string;
  /** Datos de la URL para los mensajes (nunca la contraseña). */
  readonly host: string;
  readonly puerto: number;
  readonly usuario: string;
  readonly baseDatos: string;
  readonly ssl: OpcionesSsl | null;
  /** Conexiones simultáneas del pool (en Vercel, pocas: cada instancia abre las suyas). */
  readonly conexiones: number;
  /** Tiempo máximo para obtener una conexión (ms). */
  readonly timeoutConexionMs: number;
}

/** Supabase Storage para los archivos (documentos, portadas y miniaturas). */
export interface OpcionesSupabase {
  /** https://<proyecto>.supabase.co */
  readonly url: string;
  /** Clave secreta del proyecto (sb_secret_... o service_role): solo en el servidor. */
  readonly clave: string;
  /** Bucket público donde quedan los archivos. */
  readonly bucket: string;
}

export interface ConfiguracionRepositorio {
  /** Base MySQL; null si no se configuró (o si la base es Postgres). */
  readonly mysql: OpcionesMysql | null;
  /** Base Postgres; null si no se configuró (o si la base es MySQL). */
  readonly postgres: OpcionesPostgres | null;
  /** Archivos en Supabase Storage; null = dentro de la base, en trozos. */
  readonly supabase: OpcionesSupabase | null;
  /** Cookie de sesión con Secure (NODE_ENV=production o REPOSITORIO_COOKIE_SEGURA=true). */
  readonly cookieSegura: boolean;
  /** Vencimiento por inactividad de la sesión de administración (ms). */
  readonly sesionInactividadMs: number;
  /** Duración máxima de una sesión, aunque se use (ms). */
  readonly sesionMaximaMs: number;
  /** Carpeta de los archivos subidos mientras se validan y se guardan. */
  readonly directorioTemporal: string;
  /**
   * La instancia se congela entre peticiones (Vercel, VERCEL=1): nada corre en
   * segundo plano, así que la conexión a la base se verifica dentro de la
   * petición que la necesita (ver BaseDatosRepositorio).
   */
  readonly instanciaCongelable: boolean;
}

/** Token de inyección de Nest para la configuración. */
export const CONFIGURACION_REPOSITORIO = Symbol('CONFIGURACION_REPOSITORIO');

export const BASE_DATOS_POR_DEFECTO = 'repositoriobd';

function leer(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const valor = env[nombre]?.trim();
  return valor ? valor : undefined;
}

function leerEntero(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: number,
  minimo: number,
  maximo: number,
): number {
  const valor = leer(env, nombre);
  if (valor === undefined) return porDefecto;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < minimo || numero > maximo) {
    throw new ErrorDeConfiguracion(
      `${nombre} debe ser un entero entre ${minimo} y ${maximo} (recibido: "${valor}").`,
    );
  }
  return numero;
}

export function leerBooleano(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: boolean,
): boolean {
  const valor = leer(env, nombre)?.toLowerCase();
  if (valor === undefined) return porDefecto;
  if (['1', 'true', 'si', 'sí', 'on', 'yes'].includes(valor)) return true;
  if (['0', 'false', 'no', 'off'].includes(valor)) return false;
  throw new ErrorDeConfiguracion(
    `${nombre} debe ser true o false (recibido: "${valor}").`,
  );
}

/** Rutas relativas de las variables: contra apps/server (no contra el cwd). */
export function rutaDesdeEntorno(valor: string): string {
  return isAbsolute(valor) ? resolve(valor) : resolve(RAIZ_SERVIDOR, valor);
}

function leerPem(env: NodeJS.ProcessEnv, nombre: string): string | null {
  const valor = leer(env, nombre);
  if (valor === undefined) return null;
  const ruta = rutaDesdeEntorno(valor);
  let contenido: string;
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code ?? 'error';
    throw new ErrorDeConfiguracion(
      `${nombre}: no se pudo leer ${ruta} (${codigo}).`,
    );
  }
  if (!contenido.includes('-----BEGIN ')) {
    throw new ErrorDeConfiguracion(
      `${nombre}: ${ruta} no parece un archivo PEM (falta "-----BEGIN ...").`,
    );
  }
  return contenido;
}

/**
 * TLS de la conexión. `prefijo` es REPOSITORIO_MYSQL o REPOSITORIO_POSTGRES;
 * `modoPorDefecto` se usa cuando no hay variable ni CA.
 */
function leerSsl(
  env: NodeJS.ProcessEnv,
  prefijo = 'REPOSITORIO_MYSQL',
  modoPorDefecto: ModoSsl = 'desactivado',
): OpcionesSsl | null {
  const ca = leerPem(env, `${prefijo}_SSL_CA`);
  const cert = leerPem(env, `${prefijo}_SSL_CERT`);
  const key = leerPem(env, `${prefijo}_SSL_KEY`);
  const modoTexto = leer(env, `${prefijo}_SSL`)?.toLowerCase();
  let modo: ModoSsl;
  if (modoTexto === undefined) {
    // Con CA, como mínimo se verifica la cadena; un modo más estricto pedido
    // en la URL (sslmode=verify-full) se respeta.
    modo =
      ca && (modoPorDefecto === 'desactivado' || modoPorDefecto === 'requerido')
        ? 'verificar-ca'
        : modoPorDefecto;
  } else if ((MODOS_SSL as readonly string[]).includes(modoTexto)) {
    modo = modoTexto as ModoSsl;
  } else {
    throw new ErrorDeConfiguracion(
      `${prefijo}_SSL debe ser uno de ${MODOS_SSL.join(', ')} (recibido: "${modoTexto}").`,
    );
  }
  if ((cert === null) !== (key === null)) {
    throw new ErrorDeConfiguracion(
      `${prefijo}_SSL_CERT y ${prefijo}_SSL_KEY van juntos: defina los dos o ninguno.`,
    );
  }
  if (modo === 'desactivado') {
    if (ca || cert) {
      throw new ErrorDeConfiguracion(
        `${prefijo}_SSL=desactivado no se puede combinar con certificados (${prefijo}_SSL_CA/CERT/KEY).`,
      );
    }
    return null;
  }
  if (modo === 'verificar-ca' && !ca) {
    throw new ErrorDeConfiguracion(
      `${prefijo}_SSL=verificar-ca necesita ${prefijo}_SSL_CA (en Cloud SQL: server-ca.pem; en Supabase: el certificado del proyecto).`,
    );
  }
  return { modo, ca, cert, key };
}

interface DatosConexion {
  host: string;
  puerto: number;
  usuario: string;
  contrasena: string;
  baseDatos: string;
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    throw new ErrorDeConfiguracion(
      'La URL de la base (REPOSITORIO_MYSQL_URL o REPOSITORIO_POSTGRES_URL) tiene una secuencia %XX inválida en el usuario o la contraseña.',
    );
  }
}

/** mysql://usuario:contraseña@host:3306/base (la contraseña con %XX si lleva : @ / # ?). */
export function interpretarUrlMysql(texto: string): DatosConexion {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_MYSQL_URL no es una URL válida. Formato: mysql://usuario:contraseña@host:3306/base ' +
        '(caracteres especiales de la contraseña codificados con %XX).',
    );
  }
  if (url.protocol !== 'mysql:') {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_MYSQL_URL debe empezar por mysql://.',
    );
  }
  const puerto = url.port ? Number(url.port) : 3306;
  const baseDatos = decodificar(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !url.username) {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_MYSQL_URL debe incluir usuario y host: mysql://usuario:contraseña@host:3306/base.',
    );
  }
  return {
    host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    puerto,
    usuario: decodificar(url.username),
    contrasena: decodificar(url.password),
    baseDatos: baseDatos || BASE_DATOS_POR_DEFECTO,
  };
}

function validarBaseDatos(nombre: string): string {
  if (!/^[A-Za-z0-9_$]{1,64}$/.test(nombre)) {
    throw new ErrorDeConfiguracion(
      `El nombre de la base de datos "${nombre}" no es válido (letras, números, _ y $; máximo 64).`,
    );
  }
  return nombre;
}

function leerConexion(env: NodeJS.ProcessEnv): DatosConexion | null {
  const url = leer(env, 'REPOSITORIO_MYSQL_URL');
  const host = leer(env, 'REPOSITORIO_MYSQL_HOST');
  if (url && host) {
    throw new ErrorDeConfiguracion(
      'Defina REPOSITORIO_MYSQL_URL o REPOSITORIO_MYSQL_HOST/USER/PASSWORD/DATABASE, no ambas.',
    );
  }
  if (url) return interpretarUrlMysql(url);
  if (!host) {
    const sueltas = [
      'REPOSITORIO_MYSQL_USER',
      'REPOSITORIO_MYSQL_PASSWORD',
      'REPOSITORIO_MYSQL_PORT',
    ].filter((nombre) => leer(env, nombre) !== undefined);
    if (sueltas.length > 0) {
      throw new ErrorDeConfiguracion(
        `Falta REPOSITORIO_MYSQL_HOST (se definió ${sueltas.join(', ')}).`,
      );
    }
    return null;
  }
  const usuario = leer(env, 'REPOSITORIO_MYSQL_USER');
  if (!usuario) {
    throw new ErrorDeConfiguracion(
      'Falta REPOSITORIO_MYSQL_USER (el usuario de la aplicación, p. ej. repositorio_app).',
    );
  }
  return {
    host,
    puerto: leerEntero(env, 'REPOSITORIO_MYSQL_PORT', 3306, 1, 65535),
    usuario,
    // La contraseña no se recorta: puede empezar o terminar en espacio.
    contrasena: env.REPOSITORIO_MYSQL_PASSWORD ?? '',
    baseDatos: leer(env, 'REPOSITORIO_MYSQL_DATABASE') ?? BASE_DATOS_POR_DEFECTO,
  };
}

/** Solo las opciones de conexión (también las usan las CLI). */
export function cargarOpcionesMysql(
  env: NodeJS.ProcessEnv = process.env,
): OpcionesMysql | null {
  const conexion = leerConexion(env);
  if (!conexion) return null;
  return Object.freeze({
    ...conexion,
    baseDatos: validarBaseDatos(conexion.baseDatos),
    ssl: leerSsl(env),
    conexiones: leerEntero(env, 'REPOSITORIO_MYSQL_CONEXIONES', 8, 1, 50),
    timeoutConexionMs:
      leerEntero(env, 'REPOSITORIO_MYSQL_TIMEOUT_SEGUNDOS', 10, 1, 120) * 1000,
  });
}

/** sslmode de una URL de Postgres -> modo TLS de esta configuración. */
const SSLMODE_A_MODO: Readonly<Record<string, ModoSsl>> = {
  disable: 'desactivado',
  allow: 'desactivado',
  prefer: 'requerido',
  require: 'requerido',
  'verify-ca': 'verificar-ca',
  'verify-full': 'verificar-identidad',
};

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * REPOSITORIO_POSTGRES_URL: postgres://usuario:contraseña@host:5432/base
 * (en Supabase, la del pooler "Transaction" del proyecto, puerto 6543). El
 * sslmode de la URL se convierte en REPOSITORIO_POSTGRES_SSL; sin ninguno de
 * los dos, el TLS es obligatorio salvo en localhost.
 */
export function cargarOpcionesPostgres(
  env: NodeJS.ProcessEnv = process.env,
): OpcionesPostgres | null {
  const texto = leer(env, 'REPOSITORIO_POSTGRES_URL');
  if (!texto) return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_POSTGRES_URL no es una URL válida. Formato: postgres://usuario:contraseña@host:5432/base ' +
        '(caracteres especiales de la contraseña codificados con %XX).',
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_POSTGRES_URL debe empezar por postgres:// o postgresql://.',
    );
  }
  if (!url.hostname || !url.username) {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_POSTGRES_URL debe incluir usuario y host: postgres://usuario:contraseña@host:5432/base.',
    );
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
  if (sslmode !== undefined && !(sslmode in SSLMODE_A_MODO)) {
    throw new ErrorDeConfiguracion(
      `REPOSITORIO_POSTGRES_URL tiene un sslmode desconocido ("${sslmode}").`,
    );
  }
  // pg interpretaría sslmode a su manera (require = verify-full): se quita de
  // la URL y el TLS se configura con ssl.
  url.searchParams.delete('sslmode');
  const modoPorDefecto: ModoSsl =
    (sslmode && SSLMODE_A_MODO[sslmode]) ||
    (HOSTS_LOCALES.has(host) ? 'desactivado' : 'requerido');
  return Object.freeze({
    url: url.toString(),
    host,
    puerto: url.port ? Number(url.port) : 5432,
    usuario: decodificar(url.username),
    baseDatos: decodificar(url.pathname.replace(/^\//, '')) || 'postgres',
    ssl: leerSsl(env, 'REPOSITORIO_POSTGRES', modoPorDefecto),
    conexiones: leerEntero(env, 'REPOSITORIO_POSTGRES_CONEXIONES', 5, 1, 50),
    timeoutConexionMs:
      leerEntero(env, 'REPOSITORIO_POSTGRES_TIMEOUT_SEGUNDOS', 10, 1, 120) * 1000,
  });
}

/**
 * Supabase Storage: REPOSITORIO_SUPABASE_URL y REPOSITORIO_SUPABASE_CLAVE van
 * juntas; REPOSITORIO_SUPABASE_BUCKET es opcional ("repositorio").
 */
export function cargarOpcionesSupabase(
  env: NodeJS.ProcessEnv = process.env,
): OpcionesSupabase | null {
  const texto = leer(env, 'REPOSITORIO_SUPABASE_URL');
  const clave = leer(env, 'REPOSITORIO_SUPABASE_CLAVE');
  if (!texto && !clave) return null;
  if (!texto || !clave) {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_SUPABASE_URL y REPOSITORIO_SUPABASE_CLAVE van juntas: defina las dos (o ninguna, para guardar los archivos en la base).',
    );
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorDeConfiguracion(
      'REPOSITORIO_SUPABASE_URL no es una URL válida (https://<proyecto>.supabase.co).',
    );
  }
  if (url.protocol !== 'https:' && !HOSTS_LOCALES.has(url.hostname)) {
    throw new ErrorDeConfiguracion('REPOSITORIO_SUPABASE_URL debe ser https://.');
  }
  const bucket = leer(env, 'REPOSITORIO_SUPABASE_BUCKET') ?? 'repositorio';
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/.test(bucket)) {
    throw new ErrorDeConfiguracion(
      `REPOSITORIO_SUPABASE_BUCKET "${bucket}" no es un nombre de bucket válido (minúsculas, números, . _ -).`,
    );
  }
  if (/[\s]/.test(clave)) {
    throw new ErrorDeConfiguracion('REPOSITORIO_SUPABASE_CLAVE no puede tener espacios.');
  }
  return Object.freeze({ url: url.origin, clave, bucket });
}

/** Lee y valida la configuración completa. Lanza ErrorDeConfiguracion. */
export function cargarConfiguracionRepositorio(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracionRepositorio {
  const temporal = leer(env, 'REPOSITORIO_DIRECTORIO_TEMPORAL');
  const mysql = cargarOpcionesMysql(env);
  const postgres = cargarOpcionesPostgres(env);
  if (mysql && postgres) {
    throw new ErrorDeConfiguracion(
      'Defina una sola base para el repositorio: REPOSITORIO_MYSQL_* o REPOSITORIO_POSTGRES_URL, no las dos.',
    );
  }
  return Object.freeze({
    mysql,
    postgres,
    supabase: cargarOpcionesSupabase(env),
    cookieSegura: leerBooleano(
      env,
      'REPOSITORIO_COOKIE_SEGURA',
      leer(env, 'NODE_ENV') === 'production',
    ),
    sesionInactividadMs:
      leerEntero(env, 'REPOSITORIO_SESION_INACTIVIDAD_MINUTOS', 30, 5, 1440) *
      60_000,
    sesionMaximaMs:
      leerEntero(env, 'REPOSITORIO_SESION_MAXIMA_HORAS', 12, 1, 168) *
      3_600_000,
    directorioTemporal: temporal
      ? rutaDesdeEntorno(temporal)
      : join(tmpdir(), 'sapiencia-repositorio-subidas'),
    instanciaCongelable: leer(env, 'VERCEL') === '1',
  });
}
