/**
 * Crea un usuario de la administración del repositorio, o le cambia la
 * contraseña si ya existe (y cierra sus sesiones abiertas).
 *
 *   npm run repositorio:crear-admin -- --usuario <usuario> [--nombre "Nombre Apellido"]
 *   npm run repositorio:crear-admin -- --usuario <usuario> --desactivar
 *
 * La contraseña (mínimo 12 caracteres) se pide dos veces sin mostrarla. Para
 * automatizar, se toma de la variable REPOSITORIO_ADMIN_CONTRASENA. Nunca se
 * acepta en los argumentos. Usa la conexión de la aplicación
 * (REPOSITORIO_MYSQL_* o REPOSITORIO_POSTGRES_URL).
 *
 * Con --solo-sql no se conecta a ninguna base: imprime el INSERT (con el hash
 * scrypt, nunca la contraseña) para pegarlo en el editor SQL de Supabase u
 * otra consola, por ejemplo cuando la base no es accesible desde este equipo.
 */
import { parseArgs } from 'node:util';
import type { RowDataPacket } from 'mysql2/promise';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import { hashContrasena, problemaContrasena } from '../dominio/contrasenas.js';
import { textoLinea } from '../dominio/normalizacion.js';
import { PATRON_USUARIO } from '../dominio/validacion.js';
import { registrarCambio } from '../servicios/cambios.js';
import {
  abrirBaseDatos,
  ejecutarCli,
  ErrorCli,
  leerContrasenaOculta,
  rechazarContrasenaEnArgumentos,
} from './comun.js';

const AYUDA = `Uso: npm run repositorio:crear-admin -- --usuario <usuario> [--nombre "Nombre"]
       npm run repositorio:crear-admin -- --usuario <usuario> --desactivar

  --usuario     3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo
  --nombre      nombre para mostrar en la administración y en el registro de cambios
  --desactivar  impide que el usuario inicie sesión y cierra sus sesiones
  --solo-sql    no se conecta: imprime el SQL que crea el usuario (o le cambia la
                contraseña), para pegarlo en el editor SQL de Supabase
  --ayuda       muestra esta ayuda

Si el usuario existe, se le cambia la contraseña (y se reactiva).
La contraseña (mínimo 12 caracteres) se pide sin mostrarla; para automatizar,
use la variable de entorno REPOSITORIO_ADMIN_CONTRASENA.`;

async function pedirContrasena(): Promise<string> {
  const desdeEntorno = process.env.REPOSITORIO_ADMIN_CONTRASENA;
  if (desdeEntorno !== undefined) {
    const problema = problemaContrasena(desdeEntorno);
    if (problema) throw new ErrorCli(`REPOSITORIO_ADMIN_CONTRASENA: ${problema}`, 2);
    return desdeEntorno;
  }
  for (let intento = 1; intento <= 3; intento++) {
    const primera = await leerContrasenaOculta('Contraseña nueva (mínimo 12 caracteres): ');
    const problema = problemaContrasena(primera);
    if (problema) {
      console.error(problema);
      continue;
    }
    const segunda = await leerContrasenaOculta('Repita la contraseña: ');
    if (primera !== segunda) {
      console.error('Las contraseñas no coinciden.');
      continue;
    }
    return primera;
  }
  throw new ErrorCli('Demasiados intentos. No se guardó nada.', 2);
}

/** Texto SQL entre comillas simples (las del texto, dobladas). */
function literal(texto: string | null): string {
  return texto === null ? 'NULL' : `'${texto.replaceAll("'", "''")}'`;
}

/**
 * SQL (Postgres) que crea el usuario o, si existe, le cambia la contraseña,
 * lo reactiva y cierra sus sesiones. Lleva el hash, nunca la contraseña.
 */
export function sqlCrearAdmin(usuario: string, nombre: string | null, hash: string): string {
  return [
    '-- Usuario de la administración del repositorio (generado por repositorio:crear-admin --solo-sql).',
    'BEGIN;',
    `INSERT INTO repositorio_administradores (usuario, nombre, hash_contrasena, activo)`,
    `VALUES (${literal(usuario)}, ${literal(nombre)}, ${literal(hash)}, 1)`,
    `ON CONFLICT (usuario) DO UPDATE SET hash_contrasena = EXCLUDED.hash_contrasena, activo = 1${
      nombre !== null ? ', nombre = EXCLUDED.nombre' : ''
    };`,
    `DELETE FROM repositorio_sesiones WHERE usuario_id = (SELECT id FROM repositorio_administradores WHERE usuario = ${literal(usuario)});`,
    'COMMIT;',
  ].join('\n');
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  rechazarContrasenaEnArgumentos(process.argv.slice(2));
  const { values } = parseArgs({
    options: {
      usuario: { type: 'string' },
      nombre: { type: 'string' },
      desactivar: { type: 'boolean', default: false },
      'solo-sql': { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const usuario = values.usuario?.trim().toLowerCase();
  if (!usuario || !PATRON_USUARIO.test(usuario)) {
    throw new ErrorCli(`Indique un --usuario válido.\n\n${AYUDA}`, 2);
  }
  const nombre = values.nombre !== undefined ? textoLinea(values.nombre).slice(0, 120) || null : undefined;

  if (values['solo-sql']) {
    if (values.desactivar) throw new ErrorCli('--solo-sql no se combina con --desactivar.', 2);
    console.log(sqlCrearAdmin(usuario, nombre ?? null, await hashContrasena(await pedirContrasena())));
    return 0;
  }

  const bd = await abrirBaseDatos();
  try {
    const [existente] = await bd.filas<RowDataPacket>(
      'SELECT id, nombre, activo FROM repositorio_administradores WHERE usuario = ?',
      [usuario],
    );
    if (values.desactivar) {
      if (!existente) throw new ErrorCli(`El usuario ${usuario} no existe.`);
      await bd.transaccion(async (conexion) => {
        await conexion.query('UPDATE repositorio_administradores SET activo = 0 WHERE id = ?', [existente.id]);
        await conexion.query('DELETE FROM repositorio_sesiones WHERE usuario_id = ?', [existente.id]);
        await registrarCambio(conexion, {
          usuario,
          accion: 'sesion',
          detalle: 'Usuario de administración desactivado (crear-admin)',
        });
      });
      console.log(`Usuario ${usuario} desactivado y sus sesiones cerradas.`);
      return 0;
    }

    const contrasena = await pedirContrasena();
    const hash = await hashContrasena(contrasena);
    await bd.transaccion(async (conexion) => {
      if (existente) {
        await conexion.query(
          `UPDATE repositorio_administradores SET hash_contrasena = ?, activo = 1${nombre !== undefined ? ', nombre = ?' : ''} WHERE id = ?`,
          nombre !== undefined ? [hash, nombre, existente.id] : [hash, existente.id],
        );
        await conexion.query('DELETE FROM repositorio_sesiones WHERE usuario_id = ?', [existente.id]);
      } else {
        await conexion.query(
          'INSERT INTO repositorio_administradores (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)',
          [usuario, nombre ?? null, hash],
        );
      }
      await registrarCambio(conexion, {
        usuario,
        accion: 'sesion',
        detalle: existente
          ? 'Contraseña de administración cambiada (crear-admin); sesiones cerradas'
          : 'Usuario de administración creado (crear-admin)',
      });
    });
    console.log(
      existente
        ? `Contraseña de ${usuario} actualizada; sus sesiones abiertas se cerraron.`
        : `Usuario ${usuario} creado. Ya puede entrar en /repositorio/admin.`,
    );
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
