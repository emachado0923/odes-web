/**
 * Aplica el esquema del Repositorio de Productos (db/repositorio/esquema.sql)
 * y las migraciones pendientes (db/repositorio/migraciones/NNN-*.sql).
 *
 *   npm run repositorio:migrar -- [--usuario <admin>] [--crear-base]
 *
 * Es idempotente: se puede correr todas las veces que haga falta. Necesita una
 * cuenta ADMINISTRADORA (CREATE, ALTER, INDEX, REFERENCES y, en MySQL, DROP para
 * el paso a la versión 4, que renombra tablas): el usuario de la aplicación no
 * tiene esos permisos a propósito.
 *
 * Conexión (host, puerto, base, TLS): REPOSITORIO_MYSQL_* de apps/server/.env.
 * Credenciales, en este orden:
 *   1. --usuario <admin>: pide la contraseña sin mostrarla (o la toma de
 *      REPOSITORIO_MIGRAR_CONTRASENA, para automatizar);
 *   2. REPOSITORIO_MIGRAR_USUARIO + REPOSITORIO_MIGRAR_CONTRASENA;
 *   3. las de la aplicación (REPOSITORIO_MYSQL_USER/PASSWORD), que normalmente
 *      fallan por permisos, con un mensaje que lo explica.
 * La contraseña nunca va en los argumentos.
 *
 * Alternativa sin Node: abrir la base en TablePlus con la cuenta admin, pegar
 * esquema.sql y ejecutarlo completo.
 *
 * Con Postgres (REPOSITORIO_POSTGRES_URL o, sola, REPOSITORIO_MIGRAR_POSTGRES_URL)
 * aplica db/repositorio/postgres/esquema.sql en una transacción. La cuenta
 * sale de REPOSITORIO_MIGRAR_POSTGRES_URL si existe (otra URL, con la cuenta
 * administradora) o de la misma REPOSITORIO_POSTGRES_URL (en Supabase, el
 * usuario postgres ya es el dueño de las tablas). --usuario cambia solo el
 * usuario de la URL y pide la contraseña.
 *
 * Las migraciones pendientes son las que no están registradas en
 * sistema_esquema_version (aunque haya una posterior registrada a mano).
 */
import { parseArgs } from 'node:util';
import mysql from 'mysql2/promise';
import { Client as ClientePg } from 'pg';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import {
  crearOpcionesPool,
  crearOpcionesPoolPostgres,
  VERSION_ESQUEMA_REQUERIDA,
} from '../bd/base-datos.js';
import { esPermisoDenegado } from '../bd/errores-bd.js';
import {
  aplicarEsquema,
  aplicarEsquemaPostgres,
  RUTA_ESQUEMA,
  RUTA_ESQUEMA_POSTGRES,
  type ResultadoEsquema,
} from '../bd/esquema.js';
import {
  cargarOpcionesMysql,
  cargarOpcionesPostgres,
  type OpcionesPostgres,
} from '../configuracion-repositorio.js';
import {
  ejecutarCli,
  ErrorCli,
  leerContrasenaOculta,
  rechazarContrasenaEnArgumentos,
} from './comun.js';

const AYUDA = `Uso: npm run repositorio:migrar -- [--usuario <admin>] [--crear-base]

  --usuario     cuenta administradora de MySQL (pide la contraseña sin mostrarla;
                para automatizar: REPOSITORIO_MIGRAR_CONTRASENA)
  --crear-base  crea la base (CREATE DATABASE IF NOT EXISTS ... utf8mb4) si no existe
  --ayuda       muestra esta ayuda

Host, puerto, base y TLS salen de REPOSITORIO_MYSQL_* (apps/server/.env).
Sin --usuario se usan REPOSITORIO_MIGRAR_USUARIO/REPOSITORIO_MIGRAR_CONTRASENA o,
si no existen, el usuario de la aplicación (que no puede crear tablas).
Esquema: ${RUTA_ESQUEMA}

Con Postgres (REPOSITORIO_POSTGRES_URL, o solo REPOSITORIO_MIGRAR_POSTGRES_URL):
la cuenta de REPOSITORIO_MIGRAR_POSTGRES_URL o la de REPOSITORIO_POSTGRES_URL;
--usuario cambia el usuario y pide su contraseña. --crear-base no aplica.
Esquema: ${RUTA_ESQUEMA_POSTGRES}`;

const PERMISOS = new Set([
  'ER_TABLEACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_SPECIFIC_ACCESS_DENIED_ERROR',
  'ER_COLUMNACCESS_DENIED_ERROR',
]);

async function principal(): Promise<number> {
  cargarArchivoEnv();
  rechazarContrasenaEnArgumentos(process.argv.slice(2));
  const { values } = parseArgs({
    options: {
      usuario: { type: 'string' },
      'crear-base': { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  // Postgres si hay REPOSITORIO_POSTGRES_URL o, aunque falte, si se definió
  // REPOSITORIO_MIGRAR_POSTGRES_URL (quien la define quiere migrar Postgres,
  // no la MySQL de apps/server/.env).
  const urlMigrar = process.env.REPOSITORIO_MIGRAR_POSTGRES_URL?.trim();
  const p =
    cargarOpcionesPostgres(process.env) ??
    (urlMigrar
      ? cargarOpcionesPostgres({
          ...process.env,
          REPOSITORIO_POSTGRES_URL: urlMigrar,
        })
      : null);
  if (p) return migrarPostgres(p, values.usuario);
  const m = cargarOpcionesMysql(process.env);
  if (!m) {
    throw new ErrorCli(
      'Falta la conexión: defina REPOSITORIO_MYSQL_HOST (y PORT, DATABASE, TLS) o REPOSITORIO_MYSQL_URL en apps/server/.env.\n\n' +
        AYUDA,
      2,
    );
  }

  let usuario = m.usuario;
  let contrasena = m.contrasena;
  let origen = 'usuario de la aplicación (REPOSITORIO_MYSQL_USER)';
  if (values.usuario) {
    usuario = values.usuario;
    contrasena =
      process.env.REPOSITORIO_MIGRAR_CONTRASENA ??
      (await leerContrasenaOculta(`Contraseña de ${usuario}@${m.host}: `));
    origen = `--usuario ${usuario}`;
  } else if (process.env.REPOSITORIO_MIGRAR_USUARIO) {
    usuario = process.env.REPOSITORIO_MIGRAR_USUARIO;
    contrasena = process.env.REPOSITORIO_MIGRAR_CONTRASENA ?? '';
    origen = 'REPOSITORIO_MIGRAR_USUARIO';
  }

  const opciones = crearOpcionesPool({ ...m, usuario, contrasena });
  console.log(`MySQL ${m.host}:${m.puerto}, base ${m.baseDatos}, como ${usuario} (${origen}).`);
  let conexion: mysql.Connection;
  try {
    conexion = await mysql.createConnection({
      host: opciones.host,
      port: opciones.port,
      user: opciones.user,
      password: opciones.password,
      ssl: opciones.ssl,
      connectTimeout: opciones.connectTimeout,
      charset: opciones.charset,
      timezone: 'Z',
      ...(values['crear-base'] ? {} : { database: m.baseDatos }),
    });
  } catch (error) {
    const codigo = (error as { code?: string }).code ?? '';
    if (codigo === 'ER_BAD_DB_ERROR') {
      throw new ErrorCli(
        `La base ${m.baseDatos} no existe. Créela con db/repositorio/permisos.sql o use --crear-base con una cuenta que pueda crearla.`,
      );
    }
    throw new ErrorCli(
      `No se pudo conectar (${codigo || (error as Error).message}). Revise host, red autorizada, usuario, contraseña y TLS.`,
    );
  }
  try {
    const [version] = await conexion.query<mysql.RowDataPacket[]>('SELECT VERSION() AS v');
    console.log(`Servidor MySQL ${String(version[0]?.v ?? '?')}.`);
    if (values['crear-base']) {
      await conexion.query(
        `CREATE DATABASE IF NOT EXISTS \`${m.baseDatos}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      );
      await conexion.changeUser({ database: m.baseDatos });
      console.log(`Base ${m.baseDatos} lista.`);
    }
    const resultado = await aplicarEsquema(conexion, {
      registro: (mensaje) => console.log(mensaje),
    });
    return informar(resultado);
  } catch (error) {
    const codigo = (error as { code?: string }).code ?? '';
    if (PERMISOS.has(codigo)) {
      throw new ErrorCli(
        `El usuario ${usuario} no tiene permisos para crear o cambiar tablas (${codigo}). ` +
          'Use una cuenta administradora: npm run repositorio:migrar -- --usuario <admin>.',
      );
    }
    throw error;
  } finally {
    await conexion.end().catch(() => undefined);
  }
}

function informar(resultado: ResultadoEsquema): number {
  console.log(
    resultado.versionAntes === resultado.versionDespues
      ? `Esquema al día (versión ${resultado.versionDespues}); no había nada pendiente.`
      : `Esquema actualizado de la versión ${resultado.versionAntes} a la ${resultado.versionDespues}.`,
  );
  if (resultado.versionDespues < VERSION_ESQUEMA_REQUERIDA) {
    throw new ErrorCli(
      `La base quedó en la versión ${resultado.versionDespues} y el servidor necesita la ${VERSION_ESQUEMA_REQUERIDA}.`,
    );
  }
  console.log(
    'Siguiente paso: npm run repositorio:crear-admin -- --usuario <usuario> y luego npm run repositorio:importar -- --paquete <carpeta>.',
  );
  return 0;
}

async function migrarPostgres(
  aplicacion: OpcionesPostgres,
  usuarioAdmin: string | undefined,
): Promise<number> {
  const admin = cargarOpcionesPostgres({
    ...process.env,
    REPOSITORIO_POSTGRES_URL:
      process.env.REPOSITORIO_MIGRAR_POSTGRES_URL ?? process.env.REPOSITORIO_POSTGRES_URL,
  }) as OpcionesPostgres;
  const url = new URL(admin.url);
  if (usuarioAdmin) {
    url.username = encodeURIComponent(usuarioAdmin);
    url.password = encodeURIComponent(
      process.env.REPOSITORIO_MIGRAR_CONTRASENA ??
        (await leerContrasenaOculta(`Contraseña de ${usuarioAdmin}@${admin.host}: `)),
    );
  }
  const usuario = usuarioAdmin ?? admin.usuario;
  console.log(
    `Postgres ${aplicacion.host}:${aplicacion.puerto}, base ${aplicacion.baseDatos}, como ${usuario}.`,
  );
  const cliente = new ClientePg(crearOpcionesPoolPostgres({ ...admin, url: url.toString() }));
  try {
    await cliente.connect();
  } catch (error) {
    const codigo = (error as { code?: string }).code ?? '';
    throw new ErrorCli(
      `No se pudo conectar (${codigo || (error as Error).message}). Revise la URL, la contraseña y el TLS.`,
    );
  }
  try {
    const { rows } = await cliente.query<{ v: string }>('SELECT version() AS v');
    console.log(`Servidor ${String(rows[0]?.v ?? '?').split(' on ')[0]}.`);
    const resultado = await aplicarEsquemaPostgres(cliente, {
      registro: (mensaje) => console.log(mensaje),
    });
    return informar(resultado);
  } catch (error) {
    if (esPermisoDenegado(error)) {
      throw new ErrorCli(
        `El usuario ${usuario} no tiene permisos para crear o cambiar tablas. ` +
          'Use la cuenta dueña de la base (REPOSITORIO_MIGRAR_POSTGRES_URL o --usuario).',
      );
    }
    throw error;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

await ejecutarCli(principal);
