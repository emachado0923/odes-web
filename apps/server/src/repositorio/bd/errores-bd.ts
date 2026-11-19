/**
 * Clasificación de los errores de la base (mysql2 y pg): por código, nunca
 * por el texto, salvo los pocos que esos controladores lanzan sin código
 * (cola del pool de mysql2 llena, conexión cortada o tiempo de espera de pg).
 *
 * MySQL usa códigos con nombre (ER_DUP_ENTRY); Postgres, los SQLSTATE de cinco
 * caracteres (23505). Ninguno coincide con los del otro, así que cada función
 * reconoce los dos sin saber de qué motor viene el error.
 */

interface ErrorBd {
  code?: unknown;
  errno?: unknown;
  fatal?: unknown;
  sqlMessage?: unknown;
  /** pg: restricción violada (p. ej. uq_archivos_sha256 o documentos_pkey). */
  constraint?: unknown;
}

function codigo(error: unknown): string {
  const valor = (error as ErrorBd | null)?.code;
  return typeof valor === 'string' ? valor : '';
}

/** Errores de red, TLS, credenciales o de un servidor caído: la base "no está disponible". */
const CODIGOS_CONEXION = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'POOL_CLOSED',
  'HANDSHAKE_SSL_ERROR',
  'HANDSHAKE_NO_SSL_SUPPORT',
  'ER_ACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_HOST_NOT_PRIVILEGED',
  'ER_HOST_IS_BLOCKED',
  'ER_CON_COUNT_ERROR',
  'ER_TOO_MANY_USER_CONNECTIONS',
  'ER_SERVER_SHUTDOWN',
  'ER_NOT_SUPPORTED_AUTH_MODE',
  'ER_SECURE_TRANSPORT_REQUIRED',
  // TLS (Node)
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  // Postgres: servidor apagándose, sin cupo, credenciales o base inexistente.
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '28000',
  '28P01',
  '3D000',
]);

/** Mensajes de pg sin código: conexión cortada o sin respuesta. */
const MENSAJES_CONEXION_PG = [
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Cannot use a pool after calling end on the pool',
  'Client has encountered a connection error and is not queryable',
  'The server does not support SSL connections',
];

export function esErrorDeConexion(error: unknown): boolean {
  const c = codigo(error);
  if (CODIGOS_CONEXION.has(c)) return true;
  // Postgres: clase 08 (connection_exception).
  if (/^08[0-9A-Z]{3}$/.test(c)) return true;
  if ((error as ErrorBd | null)?.fatal === true) return true;
  if (c === '' && error instanceof Error) {
    return MENSAJES_CONEXION_PG.some((mensaje) => error.message.includes(mensaje));
  }
  return false;
}

/** Mensaje exacto de mysql2 (lib/base/pool.js) cuando la cola de espera del pool está llena. */
export const MENSAJE_COLA_LLENA = 'Queue limit reached.';

/**
 * La cola de espera del pool está llena (queueLimit): hay más consultas
 * pendientes de las que el pool admite. La base NO está caída: es carga
 * momentánea. mysql2 3.x lo rechaza con `new Error('Queue limit reached.')`
 * sin `code` (el código POOL_ENQUEUELIMIT era del paquete `mysql` antiguo),
 * así que este es el único caso que se reconoce por el texto. (El pool de pg
 * no tiene cola con tope: espera hasta su tiempo máximo de conexión.)
 */
export function esColaLlena(error: unknown): boolean {
  return error instanceof Error && codigo(error) === '' && error.message === MENSAJE_COLA_LLENA;
}

/** La tabla no existe: falta aplicar el esquema (npm run repositorio:migrar). */
export function esTablaInexistente(error: unknown): boolean {
  const c = codigo(error);
  return c === 'ER_NO_SUCH_TABLE' || c === '42P01';
}

/**
 * Clave única repetida. `indice` es el nombre del índice o restricción (el
 * mismo en los dos esquemas); 'PRIMARY' es la llave primaria (en Postgres,
 * la restricción <tabla>_pkey).
 */
export function esDuplicado(error: unknown, indice?: string): boolean {
  const c = codigo(error);
  if (c === '23505') {
    if (!indice) return true;
    const restriccion = (error as ErrorBd).constraint;
    if (typeof restriccion !== 'string') return false;
    return indice === 'PRIMARY' ? restriccion.endsWith('_pkey') : restriccion === indice;
  }
  if (c !== 'ER_DUP_ENTRY') return false;
  if (!indice) return true;
  const mensaje = (error as ErrorBd).sqlMessage;
  return typeof mensaje === 'string' && mensaje.includes(indice);
}

/** Interbloqueo, espera de bloqueo agotada o conflicto de serialización: la transacción se puede reintentar. */
export function esReintentable(error: unknown): boolean {
  const c = codigo(error);
  return (
    c === 'ER_LOCK_DEADLOCK' ||
    c === 'ER_LOCK_WAIT_TIMEOUT' ||
    c === '40P01' ||
    c === '40001' ||
    c === '55P03'
  );
}

/** Fila referenciada por otra (llave foránea). */
export function esReferenciada(error: unknown): boolean {
  const c = codigo(error);
  return c === 'ER_ROW_IS_REFERENCED_2' || c === 'ER_ROW_IS_REFERENCED' || c === '23503';
}

/** Falta de permisos sobre una tabla (cuenta de la aplicación al migrar, pruebas). */
export function esPermisoDenegado(error: unknown): boolean {
  const c = codigo(error);
  return (
    c === 'ER_TABLEACCESS_DENIED_ERROR' ||
    c === 'ER_DBACCESS_DENIED_ERROR' ||
    c === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' ||
    c === 'ER_COLUMNACCESS_DENIED_ERROR' ||
    c === '42501'
  );
}

/** Descripción corta para el registro: código y mensaje, nunca la contraseña. */
export function describirError(error: unknown): string {
  const c = codigo(error);
  const mensaje = error instanceof Error ? error.message : String(error);
  return c && !mensaje.includes(c) ? `${c}: ${mensaje}` : mensaje;
}
