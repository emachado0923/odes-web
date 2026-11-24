/**
 * Clave del líder del CRM (/crm/lider). El líder entra solo con la
 * contraseña: hay una sola cuenta, de usuario fijo USUARIO_LIDER_CRM. Esta CLI
 * la crea o, si ya existe, le cambia la contraseña y el nombre, la reactiva,
 * cierra sus sesiones y levanta su bloqueo por intentos fallidos.
 *
 *   npm run crm:clave-lider [-- --nombre "Nombre visible"]
 *   npm run crm:clave-lider -- --solo-sql [--motor mysql|postgres] [--nombre "Nombre visible"]
 *
 * La contraseña (mínimo 12 caracteres) se pide dos veces sin mostrarla; para
 * automatizar, se toma de CRM_CLAVE_LIDER. Nunca se acepta en los argumentos.
 * Sin --solo-sql usa la conexión de la aplicación (REPOSITORIO_MYSQL_* o
 * REPOSITORIO_POSTGRES_URL de apps/server/.env). Con --solo-sql no se conecta:
 * imprime el SQL de MySQL (el motor de producción, planeacionbd) o de
 * Postgres, con el hash scrypt y nunca la contraseña.
 *
 * También exporta lo que comparte con crm:cargar-equipo (motor, literales SQL,
 * textos de una línea).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import {
  abrirBaseDatos,
  ejecutarCli,
  ErrorCli,
  leerContrasenaOculta,
  rechazarContrasenaEnArgumentos,
} from '../../repositorio/cli/comun.js';
import {
  hashContrasena,
  MIN_LONGITUD_CONTRASENA,
  problemaContrasena,
} from '../../repositorio/dominio/contrasenas.js';
import { sinControl } from '../../repositorio/dominio/normalizacion.js';
import { LIMITES_CRM } from '../api-crm.js';
import { TABLAS_SESIONES_CRM, USUARIO_LIDER_CRM } from '../sesion/servicio-sesiones-crm.js';

// ── Lo común de las dos CLI del CRM ─────────────────────────────────────────

/** Motor del SQL de --solo-sql. Por defecto MySQL: producción es la planeacionbd de Cloud SQL. */
export type MotorSql = 'mysql' | 'postgres';

export function leerMotor(valor: string | undefined): MotorSql {
  if (valor === undefined) return 'mysql';
  const motor = valor.trim().toLowerCase();
  if (motor === 'mysql' || motor === 'postgres') return motor;
  throw new ErrorCli(`--motor debe ser mysql o postgres (no «${valor}»).`, 2);
}

export function nombreMotor(motor: MotorSql): string {
  return motor === 'mysql' ? 'MySQL' : 'Postgres';
}

/**
 * Literal de texto SQL: comillas simples dobladas y, en MySQL, también la
 * barra invertida (allá es carácter de escape, salvo con NO_BACKSLASH_ESCAPES,
 * que no usan ni Cloud SQL ni el servidor). En Postgres la barra va tal cual
 * (standard_conforming_strings).
 */
export function literalSql(motor: MotorSql, texto: string | null): string {
  if (texto === null) return 'NULL';
  const escapado = motor === 'mysql' ? texto.replaceAll('\\', '\\\\') : texto;
  return `'${escapado.replaceAll("'", "''")}'`;
}

/** Texto de una línea: NFC, sin caracteres de control, espacios colapsados y recortado. */
export function textoUnaLinea(texto: string): string {
  return sinControl(texto.normalize('NFC').replace(/\s/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longitud en caracteres, como VARCHAR(n) de MySQL (no en unidades UTF-16). */
export function largo(texto: string): number {
  return [...texto].length;
}

/** ¿Este módulo es el que se ejecutó con `node <archivo>`? Las pruebas lo importan sin ejecutar la CLI. */
export function seEjecutaDirecto(urlModulo: string): boolean {
  const ruta = process.argv[1];
  if (!ruta) return false;
  try {
    return realpathSync(ruta) === fileURLToPath(urlModulo);
  } catch {
    return false;
  }
}

/** Corre parseArgs y devuelve sus errores (opción desconocida, falta un valor…) como ErrorCli con la ayuda. */
export function conAyudaSiFalla<T>(interpretar: () => T, ayuda: string): T {
  try {
    return interpretar();
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorCli(`Opción no válida: ${detalle}\n\n${ayuda}`, 2);
  }
}

// ── crm:clave-lider ─────────────────────────────────────────────────────────

export const VARIABLE_CLAVE_LIDER = 'CRM_CLAVE_LIDER';
export const NOMBRE_LIDER_POR_DEFECTO = 'Líder';

/** El nombre de la persona líder del equipo (la activa, si hay varias). */
export const SQL_NOMBRE_LIDER =
  'SELECT nombre FROM crm_personas WHERE es_lider = 1 ORDER BY activo DESC, orden, id LIMIT 1';

export const AYUDA_CLAVE_LIDER = `Uso: npm run crm:clave-lider [-- --nombre "Nombre visible"]
       npm run crm:clave-lider -- --solo-sql [--motor mysql|postgres] [--nombre "Nombre visible"]

  --nombre    nombre de la sesión del líder (máximo ${LIMITES_CRM.nombrePersona} caracteres). Sin él, el
              de la persona líder del equipo (crm_personas) o «${NOMBRE_LIDER_POR_DEFECTO}»
  --solo-sql  no se conecta: imprime el SQL (con el hash scrypt, nunca la
              contraseña) para correrlo a mano
  --motor     con --solo-sql: mysql (por defecto; producción, planeacionbd) o postgres
  --ayuda     muestra esta ayuda

El líder entra solo con la contraseña (usuario fijo «${USUARIO_LIDER_CRM}»). Si la cuenta
existe, se le cambian la contraseña y el nombre, se reactiva, se cierran sus
sesiones y se levanta su bloqueo por intentos fallidos.
La contraseña (mínimo ${MIN_LONGITUD_CONTRASENA} caracteres) se pide dos veces sin mostrarla; para
automatizar, use la variable de entorno ${VARIABLE_CLAVE_LIDER}. Nunca se acepta
en los argumentos. Sin --solo-sql usa la conexión de la aplicación
(apps/server/.env) y necesita el esquema versión 12 (npm run repositorio:migrar).`;

export interface OpcionesClaveLider {
  soloSql: boolean;
  motor: MotorSql;
  /** null: el de la persona líder de crm_personas (o «Líder»). */
  nombre: string | null;
}

/** Opciones de la línea de comandos (null = --ayuda). */
export function interpretarArgumentosClaveLider(argumentos: readonly string[]): OpcionesClaveLider | null {
  rechazarContrasenaEnArgumentos(argumentos);
  const { values: valores } = conAyudaSiFalla(
    () =>
      parseArgs({
        args: [...argumentos],
        options: {
          nombre: { type: 'string' },
          'solo-sql': { type: 'boolean', default: false },
          motor: { type: 'string' },
          ayuda: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }),
    AYUDA_CLAVE_LIDER,
  );
  if (valores.ayuda) return null;
  const soloSql = valores['solo-sql'];
  if (valores.motor !== undefined && !soloSql) {
    throw new ErrorCli('--motor solo va con --solo-sql: sin ella se usa el motor de la conexión (apps/server/.env).', 2);
  }
  let nombre: string | null = null;
  if (valores.nombre !== undefined) {
    nombre = textoUnaLinea(valores.nombre);
    if (!nombre) throw new ErrorCli('--nombre está vacío. Omítalo para usar el de la persona líder del equipo.', 2);
    if (largo(nombre) > LIMITES_CRM.nombrePersona) {
      throw new ErrorCli(`--nombre: máximo ${LIMITES_CRM.nombrePersona} caracteres.`, 2);
    }
  }
  return { soloSql, motor: leerMotor(valores.motor), nombre };
}

/**
 * La contraseña de CRM_CLAVE_LIDER, o null si la variable no está definida.
 * Si no sirve, el error dice por qué sin repetirla.
 */
export function contrasenaDelEntorno(entorno: NodeJS.ProcessEnv = process.env): string | null {
  const valor = entorno[VARIABLE_CLAVE_LIDER];
  if (valor === undefined) return null;
  const problema = problemaContrasena(valor);
  if (problema) throw new ErrorCli(`${VARIABLE_CLAVE_LIDER}: ${problema}`, 2);
  return valor;
}

async function pedirContrasena(): Promise<string> {
  const desdeEntorno = contrasenaDelEntorno();
  if (desdeEntorno !== null) return desdeEntorno;
  for (let intento = 1; intento <= 3; intento++) {
    const primera = await leerContrasenaOculta(`Contraseña del líder (mínimo ${MIN_LONGITUD_CONTRASENA} caracteres): `);
    const problema = problemaContrasena(primera);
    if (problema) {
      console.error(problema);
      continue;
    }
    if (primera !== (await leerContrasenaOculta('Repita la contraseña: '))) {
      console.error('Las contraseñas no coinciden.');
      continue;
    }
    return primera;
  }
  throw new ErrorCli('Demasiados intentos. No se guardó nada.', 2);
}

/**
 * SQL que crea la cuenta del líder o, si existe, le cambia la contraseña y el
 * nombre, la reactiva, cierra sus sesiones y levanta su bloqueo. Con nombre
 * null, el nombre lo toma la propia sentencia de crm_personas. Lleva el hash,
 * nunca la contraseña.
 */
export function sqlClaveLider(motor: MotorSql, hash: string, nombre: string | null): string {
  const { usuarios, sesiones, intentos } = TABLAS_SESIONES_CRM;
  const usuario = literalSql(motor, USUARIO_LIDER_CRM);
  const nombreSql =
    nombre !== null
      ? literalSql(motor, nombre)
      : `COALESCE((${SQL_NOMBRE_LIDER}), ${literalSql(motor, NOMBRE_LIDER_POR_DEFECTO)})`;
  const hashSql = literalSql(motor, hash);
  return [
    `-- Cuenta del líder del CRM (generado por crm:clave-lider --solo-sql, ${nombreMotor(motor)}).`,
    '-- Lleva el hash scrypt de la contraseña, no la contraseña.',
    ...(motor === 'mysql' ? ['SET NAMES utf8mb4;', 'START TRANSACTION;'] : ['BEGIN;']),
    `INSERT INTO ${usuarios} (usuario, nombre, hash_contrasena, activo)`,
    `  VALUES (${usuario}, ${nombreSql}, ${hashSql}, 1)`,
    motor === 'mysql'
      ? `  ON DUPLICATE KEY UPDATE nombre = ${nombreSql}, hash_contrasena = ${hashSql}, activo = 1;`
      : '  ON CONFLICT (usuario) DO UPDATE SET nombre = EXCLUDED.nombre, hash_contrasena = EXCLUDED.hash_contrasena, activo = 1;',
    '-- Cierra sus sesiones abiertas y levanta el bloqueo por intentos fallidos.',
    `DELETE FROM ${sesiones} WHERE usuario_id = (SELECT id FROM ${usuarios} WHERE usuario = ${usuario});`,
    `DELETE FROM ${intentos} WHERE usuario = ${usuario};`,
    'COMMIT;',
  ].join('\n');
}

export interface ResultadoClaveLider {
  creada: boolean;
  nombre: string;
}

/** Lo mismo que sqlClaveLider, en una transacción con la conexión de la aplicación. */
export async function guardarClaveLider(
  bd: Pick<BaseDatosRepositorio, 'transaccion'>,
  hash: string,
  nombreIndicado: string | null,
): Promise<ResultadoClaveLider> {
  const { usuarios, sesiones, intentos } = TABLAS_SESIONES_CRM;
  return bd.transaccion(async (conexion) => {
    let nombre = nombreIndicado;
    if (nombre === null) {
      const [lideres] = await conexion.query<Array<{ nombre: string }>>(SQL_NOMBRE_LIDER);
      nombre = lideres[0]?.nombre ?? NOMBRE_LIDER_POR_DEFECTO;
    }
    const [existentes] = await conexion.query<Array<{ id: number }>>(`SELECT id FROM ${usuarios} WHERE usuario = ?`, [
      USUARIO_LIDER_CRM,
    ]);
    const existente = existentes[0];
    if (existente) {
      await conexion.query(`UPDATE ${usuarios} SET nombre = ?, hash_contrasena = ?, activo = 1 WHERE id = ?`, [
        nombre,
        hash,
        existente.id,
      ]);
      await conexion.query(`DELETE FROM ${sesiones} WHERE usuario_id = ?`, [existente.id]);
    } else {
      await conexion.query(`INSERT INTO ${usuarios} (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)`, [
        USUARIO_LIDER_CRM,
        nombre,
        hash,
      ]);
    }
    await conexion.query(`DELETE FROM ${intentos} WHERE usuario = ?`, [USUARIO_LIDER_CRM]);
    return { creada: !existente, nombre };
  });
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const opciones = interpretarArgumentosClaveLider(process.argv.slice(2));
  if (!opciones) {
    console.log(AYUDA_CLAVE_LIDER);
    return 0;
  }
  if (opciones.soloSql) {
    const hash = await hashContrasena(await pedirContrasena());
    console.log(sqlClaveLider(opciones.motor, hash, opciones.nombre));
    return 0;
  }
  const bd = await abrirBaseDatos();
  try {
    const hash = await hashContrasena(await pedirContrasena());
    const { creada, nombre } = await guardarClaveLider(bd, hash, opciones.nombre);
    console.log(
      creada
        ? `Cuenta del líder creada (${nombre}). Ya puede entrar a /crm/lider con su contraseña.`
        : `Contraseña del líder cambiada (${nombre}). Sus sesiones abiertas se cerraron y se levantó el bloqueo por intentos fallidos.`,
    );
    return 0;
  } finally {
    await bd.cerrar();
  }
}

if (seEjecutaDirecto(import.meta.url)) await ejecutarCli(principal);
