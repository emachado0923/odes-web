import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { ClientBase } from 'pg';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { esTablaInexistente } from './errores-bd.js';

/**
 * Aplicación del esquema (db/repositorio/esquema.sql) y de las migraciones
 * posteriores (db/repositorio/migraciones/NNN-nombre.sql, NNN > versión
 * actual). Lo usan `npm run repositorio:migrar` y las pruebas. Necesita una
 * cuenta con permisos de CREATE/ALTER/INDEX/REFERENCES (y DROP en MySQL, para
 * el paso a la versión 4: RENAME TABLE lo exige): nunca el usuario de la
 * aplicación.
 */

export const DIRECTORIO_SQL = resolve(RAIZ_SERVIDOR, 'db', 'repositorio');
export const RUTA_ESQUEMA = join(DIRECTORIO_SQL, 'esquema.sql');
export const DIRECTORIO_MIGRACIONES = join(DIRECTORIO_SQL, 'migraciones');
/** El mismo esquema para Postgres (Supabase), con sus migraciones aparte. */
export const DIRECTORIO_SQL_POSTGRES = join(DIRECTORIO_SQL, 'postgres');
export const RUTA_ESQUEMA_POSTGRES = join(DIRECTORIO_SQL_POSTGRES, 'esquema.sql');
export const DIRECTORIO_MIGRACIONES_POSTGRES = join(DIRECTORIO_SQL_POSTGRES, 'migraciones');

/**
 * Nombres de tabla anteriores a la versión 4 del esquema y los que los
 * reemplazan. Desde la versión 4 cada tabla lleva el prefijo de su módulo, y
 * cada módulo que guarda archivos tiene su propio almacén:
 * repositorio_ (Repositorio de Productos, con repositorio_almacen_archivos),
 * sivu_ (SIVU: el catálogo sivu_tableros y las tablas de cada tablero, que
 * llevan su nombre: sivu_tablero_<tablero>_<tabla>), pai_ (sin cambios de
 * nombre; su almacén, pai_almacen_archivos, lo crea la migración 003 o, en
 * una base que ya la tenía, la 004) y sistema_ (control del esquema). Los
 * índices y las restricciones conservan su nombre (el código reconoce, por
 * ejemplo, uq_archivos_sha256).
 */
export const TABLAS_RENOMBRADAS: ReadonlyArray<readonly [viejo: string, nuevo: string]> = [
  ['esquema_version', 'sistema_esquema_version'],
  ['estado_repositorio', 'repositorio_estado'],
  ['categorias', 'repositorio_categorias'],
  ['documentos', 'repositorio_documentos'],
  ['palabras_clave', 'repositorio_palabras_clave'],
  ['documento_palabras_clave', 'repositorio_documento_palabras_clave'],
  ['administradores', 'repositorio_administradores'],
  ['sesiones', 'repositorio_sesiones'],
  ['intentos_acceso', 'repositorio_intentos_acceso'],
  ['cambios', 'repositorio_cambios'],
  ['archivos', 'repositorio_almacen_archivos'],
  ['archivo_trozos', 'repositorio_almacen_archivo_trozos'],
  ['tableros', 'sivu_tableros'],
  ['matricula_meta', 'sivu_tablero_matricula_2025_meta'],
  ['matricula_categorias', 'sivu_tablero_matricula_2025_categorias'],
  ['matricula_ies', 'sivu_tablero_matricula_2025_ies'],
  ['matricula_programas', 'sivu_tablero_matricula_2025_programas'],
  ['matricula_filas', 'sivu_tablero_matricula_2025_filas'],
];

/** Tablas renombradas con `id` de identidad (su secuencia se renombra en Postgres). */
const RENOMBRADAS_CON_ID = new Set([
  'repositorio_categorias',
  'repositorio_palabras_clave',
  'repositorio_administradores',
  'repositorio_sesiones',
  'repositorio_intentos_acceso',
  'repositorio_cambios',
  'repositorio_almacen_archivos',
]);

/**
 * Qué renombrar en una base con estas tablas. `versionNueva` es MAX(version)
 * de sistema_esquema_version (null si esa tabla no existe).
 *
 * - Una base sin tabla de versiones (con ninguno de los dos nombres) es nueva
 *   o ajena: no se toca, aunque tenga tablas que se llamen igual.
 * - Una base ya en la versión 4 o posterior, sin esquema_version, ya está
 *   migrada: tampoco se toca (las tablas con nombre anterior serían ajenas).
 * - En cualquier otro caso es una base de este proyecto con nombres
 *   anteriores, o a medio renombrar a mano: se renombra lo que falte.
 * - Si una tabla existe con los dos nombres (típico: alguien pegó el
 *   esquema.sql nuevo, o corrió un dist/ viejo, sobre una base vieja), se
 *   detiene sin tocar nada y dice qué revisar.
 */
export function planRenombre(
  existentes: ReadonlySet<string>,
  versionNueva: number | null = null,
): Array<readonly [string, string]> {
  const conViejo = existentes.has('esquema_version');
  if (!conViejo && !existentes.has('sistema_esquema_version')) return [];
  if (!conViejo && (versionNueva ?? 0) >= 4) return [];
  const dobles = TABLAS_RENOMBRADAS.filter(([viejo, nuevo]) => existentes.has(viejo) && existentes.has(nuevo));
  if (dobles.length > 0) {
    throw new Error(
      'La base tiene tablas con el nombre anterior a la versión 4 y con el nuevo a la vez (' +
        dobles.map(([viejo, nuevo]) => `${viejo} y ${nuevo}`).join(', ') +
        '). Suele pasar cuando se pegó el esquema.sql nuevo (o se corrió un dist/ sin recompilar) sobre una ' +
        'base vieja: las tablas con el nombre nuevo quedan vacías (la de versiones, a lo sumo con la versión 1). ' +
        'Compruébelo, bórrelas (DROP TABLE ' +
        dobles.map(([, nuevo]) => nuevo).join(', ') +
        ') y vuelva a ejecutar repositorio:migrar. Ver "Paso a la versión 4" en db/repositorio/LEEME.md.',
    );
  }
  return TABLAS_RENOMBRADAS.filter(([viejo]) => existentes.has(viejo));
}

/** MAX(version) de sistema_esquema_version si la tabla está entre `existentes` (si no, null). */
async function versionNuevaSiExiste(
  existentes: ReadonlySet<string>,
  leer: () => Promise<number>,
): Promise<number | null> {
  return existentes.has('sistema_esquema_version') ? leer() : null;
}

/**
 * Pasa una base con los nombres anteriores a la versión 4 a los nombres
 * nuevos, ANTES de aplicar esquema.sql (que, si no, crearía vacías las
 * tablas con el nombre nuevo junto a las viejas). Un solo RENAME TABLE:
 * en MySQL es atómico, y las llaves foráneas siguen a sus tablas. La cuenta
 * necesita ALTER y DROP sobre las tablas viejas, y CREATE e INSERT.
 */
export async function renombrarTablasAnteriores(
  conexion: Connection,
  registro: (mensaje: string) => void = () => undefined,
): Promise<string[]> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  const existentes = new Set(filas.map((fila) => String(fila.nombre)));
  const pares = planRenombre(existentes, await versionNuevaSiExiste(existentes, () => versionEsquema(conexion)));
  if (pares.length === 0) return [];
  await conexion.query(
    `RENAME TABLE ${pares.map(([viejo, nuevo]) => `\`${viejo}\` TO \`${nuevo}\``).join(', ')}`,
  );
  const hechos = pares.map(([viejo, nuevo]) => `${viejo} -> ${nuevo}`);
  registro(`Tablas renombradas a los nombres de la versión 4: ${hechos.join(', ')}.`);
  return hechos;
}

/**
 * Lo mismo en Postgres, dentro de la transacción de aplicarEsquemaPostgres.
 * Renombra también la secuencia de cada `id` (categorias_id_seq ->
 * repositorio_categorias_id_seq) y, en Postgres 18 o posterior, las
 * restricciones NOT NULL que Postgres nombró con la tabla (archivos_id_not_null
 * -> repositorio_almacen_archivos_id_not_null), para que la base quede igual a
 * una nueva.
 */
export async function renombrarTablasAnterioresPostgres(
  cliente: ClientePostgres,
  registro: (mensaje: string) => void = () => undefined,
): Promise<string[]> {
  const { rows } = await cliente.query<{ nombre: string }>(
    'SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = current_schema()',
  );
  const existentes = new Set(rows.map((fila) => fila.nombre));
  const pares = planRenombre(existentes, await versionNuevaSiExiste(existentes, () => versionEsquemaPostgres(cliente)));
  for (const [viejo, nuevo] of pares) {
    await cliente.query(`ALTER TABLE "${viejo}" RENAME TO "${nuevo}"`);
    const { rows: noNulos } = await cliente.query<{ nombre: string }>(
      "SELECT conname AS nombre FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'n' AND starts_with(conname, $2)",
      [nuevo, `${viejo}_`],
    );
    for (const { nombre } of noNulos) {
      const nombreNuevo = `${nuevo}${nombre.slice(viejo.length)}`;
      if (nombreNuevo.length <= 63) {
        await cliente.query(`ALTER TABLE "${nuevo}" RENAME CONSTRAINT "${nombre}" TO "${nombreNuevo}"`);
      }
    }
    if (!RENOMBRADAS_CON_ID.has(nuevo)) continue;
    const { rows: secuencias } = await cliente.query<{ secuencia: string | null }>(
      "SELECT pg_get_serial_sequence($1, 'id') AS secuencia",
      [nuevo],
    );
    const secuencia = secuencias[0]?.secuencia;
    if (secuencia && secuencia.replace(/^.*\./, '').replaceAll('"', '') !== `${nuevo}_id_seq`) {
      await cliente.query(`ALTER SEQUENCE ${secuencia} RENAME TO "${nuevo}_id_seq"`);
    }
  }
  const hechos = pares.map(([viejo, nuevo]) => `${viejo} -> ${nuevo}`);
  if (hechos.length > 0) registro(`Tablas renombradas a los nombres de la versión 4: ${hechos.join(', ')}.`);
  return hechos;
}

/**
 * Parte un guion SQL en sentencias. Respeta comillas ('', "", ``), comentarios
 * (-- , #, /* *\/) y punto y coma dentro de textos. No admite DELIMITER (el
 * esquema no usa procedimientos ni disparadores).
 */
export function dividirSentencias(sql: string): string[] {
  const sentencias: string[] = [];
  let actual = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const siguiente = sql[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '\\' && c !== '`') {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      actual += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (
      (c === '-' && siguiente === '-' && /[\s]/.test(sql[i + 2] ?? '\n')) ||
      c === '#'
    ) {
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? n : fin + 1;
      actual += '\n';
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? n : fin + 2;
      actual += ' ';
      continue;
    }
    if (c === ';') {
      if (actual.trim()) sentencias.push(actual.trim());
      actual = '';
      i++;
      continue;
    }
    actual += c;
    i++;
  }
  if (actual.trim()) sentencias.push(actual.trim());
  return sentencias;
}

export async function versionEsquema(conexion: Connection): Promise<number> {
  try {
    const [filas] = await conexion.query<RowDataPacket[]>(
      'SELECT MAX(version) AS version FROM sistema_esquema_version',
    );
    return Number(filas[0]?.version ?? 0);
  } catch (error) {
    if (esTablaInexistente(error)) return 0;
    throw error;
  }
}

/** Versiones registradas en sistema_esquema_version (vacío si la tabla no existe). */
export async function versionesRegistradas(
  conexion: Connection,
): Promise<Set<number>> {
  try {
    const [filas] = await conexion.query<RowDataPacket[]>(
      'SELECT version FROM sistema_esquema_version',
    );
    return new Set(filas.map((fila) => Number(fila.version)));
  } catch (error) {
    if (esTablaInexistente(error)) return new Set();
    throw error;
  }
}

export interface Migracion {
  version: number;
  nombre: string;
  ruta: string;
}

/** Migraciones NNN-nombre.sql del directorio, en orden. */
export async function listarMigraciones(
  directorio = DIRECTORIO_MIGRACIONES,
): Promise<Migracion[]> {
  if (!existsSync(directorio)) return [];
  const archivos = await readdir(directorio);
  return archivos
    .map((archivo) => /^(\d{3,})-([\w.-]+)\.sql$/.exec(archivo))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      version: Number(m[1]),
      nombre: m[2],
      ruta: join(directorio, m[0]),
    }))
    .toSorted((a, b) => a.version - b.version);
}

export interface ResultadoEsquema {
  versionAntes: number;
  versionDespues: number;
  sentencias: number;
  migraciones: string[];
  /** Tablas pasadas de su nombre anterior al de la versión 4 ("viejo -> nuevo"). */
  renombradas: string[];
}

/**
 * Aplica esquema.sql (idempotente) y las migraciones pendientes sobre la base
 * seleccionada en `conexion`. Pendiente = no registrada en sistema_esquema_version
 * (no "mayor que la última"): si alguien pegó a mano una migración posterior
 * y registró su versión saltándose otra (p. ej., 1 y 3 sin la 2), la que
 * falta se aplica igual. Las migraciones son re-ejecutables.
 */
export async function aplicarEsquema(
  conexion: Connection,
  {
    rutaEsquema = RUTA_ESQUEMA,
    directorioMigraciones = DIRECTORIO_MIGRACIONES,
    registro = (_mensaje: string): void => undefined,
  }: {
    rutaEsquema?: string;
    directorioMigraciones?: string;
    registro?: (mensaje: string) => void;
  } = {},
): Promise<ResultadoEsquema> {
  await conexion.query("SET time_zone = '+00:00'");
  const versionAntes = await versionEsquemaAnterior(conexion, () => versionEsquema(conexion));
  const renombradas = await renombrarTablasAnteriores(conexion, registro);
  const sentencias = dividirSentencias(await readFile(rutaEsquema, 'utf8'));
  for (const sentencia of sentencias) {
    await conexion.query(sentencia);
  }
  registro(`esquema.sql: ${sentencias.length} sentencias aplicadas.`);

  const aplicadas: string[] = [];
  const registradas = await versionesRegistradas(conexion);
  for (const migracion of await listarMigraciones(directorioMigraciones)) {
    if (registradas.has(migracion.version)) continue;
    const pasos = dividirSentencias(await readFile(migracion.ruta, 'utf8'));
    // El DDL de MySQL confirma solo (no hay transacción): cada migración
    // debe poder repetirse si falla a mitad de camino.
    for (const paso of pasos) await conexion.query(paso);
    await conexion.query(
      'INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (?, ?)',
      [migracion.version, migracion.nombre.slice(0, 200)],
    );
    aplicadas.push(`${migracion.version}-${migracion.nombre}`);
    registro(`Migración ${migracion.version}-${migracion.nombre} aplicada.`);
  }
  return {
    versionAntes,
    versionDespues: await versionEsquema(conexion),
    sentencias: sentencias.length,
    migraciones: aplicadas,
    renombradas,
  };
}

type ClientePostgres = Pick<ClientBase, 'query'>;

/**
 * Versión antes de migrar: la de sistema_esquema_version o, en una base con
 * los nombres anteriores a la versión 4, la de esquema_version.
 */
async function versionEsquemaAnterior(
  conexion: Pick<ClientBase, 'query'> | Connection,
  actual: () => Promise<number>,
): Promise<number> {
  const version = await actual();
  if (version > 0) return version;
  try {
    const resultado: unknown = await (conexion as Pick<ClientBase, 'query'>).query(
      'SELECT MAX(version) AS version FROM esquema_version',
    );
    const filas = Array.isArray(resultado)
      ? (resultado[0] as Array<{ version: unknown }>)
      : (resultado as { rows: Array<{ version: unknown }> }).rows;
    return Number(filas[0]?.version ?? 0);
  } catch (error) {
    if (esTablaInexistente(error)) return 0;
    throw error;
  }
}

export async function versionEsquemaPostgres(cliente: ClientePostgres): Promise<number> {
  try {
    const { rows } = await cliente.query<{ version: number | null }>(
      'SELECT MAX(version) AS version FROM sistema_esquema_version',
    );
    return Number(rows[0]?.version ?? 0);
  } catch (error) {
    if (esTablaInexistente(error)) return 0;
    throw error;
  }
}

/** Versiones registradas en sistema_esquema_version de Postgres (vacío si la tabla no existe). */
export async function versionesRegistradasPostgres(
  cliente: ClientePostgres,
): Promise<Set<number>> {
  try {
    const { rows } = await cliente.query<{ version: number }>(
      'SELECT version FROM sistema_esquema_version',
    );
    return new Set(rows.map((fila) => Number(fila.version)));
  } catch (error) {
    if (esTablaInexistente(error)) return new Set();
    throw error;
  }
}

/**
 * Aplica postgres/esquema.sql (idempotente) y las migraciones pendientes de
 * postgres/migraciones/ (las no registradas en sistema_esquema_version, como en
 * aplicarEsquema), todo en una sola transacción: en Postgres el DDL es
 * transaccional, así que si algo falla no queda nada a medias. Cada archivo
 * se envía completo (el esquema tiene funciones con $$ que el divisor de
 * sentencias de MySQL no entiende).
 */
export async function aplicarEsquemaPostgres(
  cliente: ClientePostgres,
  {
    rutaEsquema = RUTA_ESQUEMA_POSTGRES,
    directorioMigraciones = DIRECTORIO_MIGRACIONES_POSTGRES,
    registro = (_mensaje: string): void => undefined,
  }: {
    rutaEsquema?: string;
    directorioMigraciones?: string;
    registro?: (mensaje: string) => void;
  } = {},
): Promise<ResultadoEsquema> {
  const versionAntes = await versionEsquemaAnterior(cliente, () => versionEsquemaPostgres(cliente));
  const esquema = await readFile(rutaEsquema, 'utf8');
  const aplicadas: string[] = [];
  let renombradas: string[] = [];
  await cliente.query('BEGIN');
  try {
    renombradas = await renombrarTablasAnterioresPostgres(cliente, registro);
    await cliente.query(esquema);
    registro('esquema.sql (Postgres) aplicado.');
    const registradas = await versionesRegistradasPostgres(cliente);
    for (const migracion of await listarMigraciones(directorioMigraciones)) {
      if (registradas.has(migracion.version)) continue;
      await cliente.query(await readFile(migracion.ruta, 'utf8'));
      await cliente.query(
        'INSERT INTO sistema_esquema_version (version, descripcion) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
        [migracion.version, migracion.nombre.slice(0, 200)],
      );
      aplicadas.push(`${migracion.version}-${migracion.nombre}`);
      registro(`Migración ${migracion.version}-${migracion.nombre} aplicada.`);
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  return {
    versionAntes,
    versionDespues: await versionEsquemaPostgres(cliente),
    sentencias: dividirSentenciasPostgres(esquema),
    migraciones: aplicadas,
    renombradas,
  };
}

/** Cuenta aproximada de sentencias de un guion de Postgres (solo para el registro). */
function dividirSentenciasPostgres(sql: string): number {
  const sinBloques = sql.replace(/\$\$[\s\S]*?\$\$/g, '$$$$').replace(/--[^\n]*/g, '');
  return sinBloques.split(';').filter((parte) => parte.trim()).length;
}
