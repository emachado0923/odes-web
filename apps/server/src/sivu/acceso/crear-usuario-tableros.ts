/**
 * Crea una cuenta de los tableros privados de SIVU, o le cambia la contraseña
 * si ya existe (y cierra sus sesiones abiertas).
 *
 *   npm run tableros:crear-usuario -- --usuario <usuario> [--nombre "Nombre"]
 *   npm run tableros:crear-usuario -- --usuario <usuario> --desactivar
 *
 * La contraseña (mínimo 12 caracteres) se pide dos veces sin mostrarla. Para
 * automatizar, se toma de la variable TABLEROS_CONTRASENA. Nunca se acepta en
 * los argumentos. Usa la conexión de la aplicación (REPOSITORIO_MYSQL_* o
 * REPOSITORIO_POSTGRES_URL). Con --solo-sql no se conecta: imprime el SQL de
 * Postgres con el hash scrypt (nunca la contraseña), para Supabase.
 *
 * Estas cuentas solo abren los tableros privados: no entran a la
 * administración del repositorio ni al PAI.
 */
import { parseArgs } from 'node:util';
import type { RowDataPacket } from 'mysql2/promise';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import {
  abrirBaseDatos,
  ejecutarCli,
  ErrorCli,
  leerContrasenaOculta,
  rechazarContrasenaEnArgumentos,
} from '../../repositorio/cli/comun.js';
import { hashContrasena, problemaContrasena } from '../../repositorio/dominio/contrasenas.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';
import { PATRON_USUARIO } from '../../repositorio/dominio/validacion.js';

const AYUDA = `Uso: npm run tableros:crear-usuario -- --usuario <usuario> [--nombre "Nombre"]
       npm run tableros:crear-usuario -- --usuario <usuario> --desactivar

  --usuario     3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo
  --nombre      nombre para mostrar
  --desactivar  impide que el usuario inicie sesión y cierra sus sesiones
  --solo-sql    no se conecta: imprime el SQL (Postgres) que crea el usuario
  --ayuda       muestra esta ayuda

Si el usuario existe, se le cambia la contraseña (y se reactiva).
La contraseña (mínimo 12 caracteres) se pide sin mostrarla; para automatizar,
use la variable de entorno TABLEROS_CONTRASENA.`;

async function pedirContrasena(): Promise<string> {
  const desdeEntorno = process.env.TABLEROS_CONTRASENA;
  if (desdeEntorno !== undefined) {
    const problema = problemaContrasena(desdeEntorno);
    if (problema) throw new ErrorCli(`TABLEROS_CONTRASENA: ${problema}`, 2);
    return desdeEntorno;
  }
  for (let intento = 1; intento <= 3; intento++) {
    const primera = await leerContrasenaOculta('Contraseña nueva (mínimo 12 caracteres): ');
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

const literal = (texto: string | null): string => (texto === null ? 'NULL' : `'${texto.replaceAll("'", "''")}'`);

/** SQL (Postgres) que crea la cuenta o, si existe, le cambia la contraseña, la reactiva y cierra sus sesiones. */
export function sqlCrearUsuarioTableros(usuario: string, nombre: string | null, hash: string): string {
  return [
    '-- Cuenta de los tableros privados de SIVU (generado por tableros:crear-usuario --solo-sql).',
    'BEGIN;',
    'INSERT INTO sivu_acceso_usuarios (usuario, nombre, hash_contrasena, activo)',
    `VALUES (${literal(usuario)}, ${literal(nombre)}, ${literal(hash)}, 1)`,
    `ON CONFLICT (usuario) DO UPDATE SET hash_contrasena = EXCLUDED.hash_contrasena, activo = 1${
      nombre !== null ? ', nombre = EXCLUDED.nombre' : ''
    };`,
    `DELETE FROM sivu_acceso_sesiones WHERE usuario_id = (SELECT id FROM sivu_acceso_usuarios WHERE usuario = ${literal(usuario)});`,
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
  if (!usuario || !PATRON_USUARIO.test(usuario)) throw new ErrorCli(`Indique un --usuario válido.\n\n${AYUDA}`, 2);
  const nombre = values.nombre !== undefined ? textoLinea(values.nombre).slice(0, 120) || null : undefined;

  if (values['solo-sql']) {
    if (values.desactivar) throw new ErrorCli('--solo-sql no se combina con --desactivar.', 2);
    console.log(sqlCrearUsuarioTableros(usuario, nombre ?? null, await hashContrasena(await pedirContrasena())));
    return 0;
  }

  const bd = await abrirBaseDatos();
  try {
    const [existente] = await bd.filas<RowDataPacket>('SELECT id FROM sivu_acceso_usuarios WHERE usuario = ?', [usuario]);
    if (values.desactivar) {
      if (!existente) throw new ErrorCli(`El usuario ${usuario} no existe.`);
      await bd.transaccion(async (conexion) => {
        await conexion.query('UPDATE sivu_acceso_usuarios SET activo = 0 WHERE id = ?', [existente.id]);
        await conexion.query('DELETE FROM sivu_acceso_sesiones WHERE usuario_id = ?', [existente.id]);
      });
      console.log(`Usuario ${usuario} desactivado y sus sesiones cerradas.`);
      return 0;
    }
    const hash = await hashContrasena(await pedirContrasena());
    await bd.transaccion(async (conexion) => {
      if (existente) {
        await conexion.query(
          `UPDATE sivu_acceso_usuarios SET hash_contrasena = ?, activo = 1${nombre !== undefined ? ', nombre = ?' : ''} WHERE id = ?`,
          nombre !== undefined ? [hash, nombre, existente.id] : [hash, existente.id],
        );
        await conexion.query('DELETE FROM sivu_acceso_sesiones WHERE usuario_id = ?', [existente.id]);
      } else {
        await conexion.query('INSERT INTO sivu_acceso_usuarios (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)', [
          usuario,
          nombre ?? null,
          hash,
        ]);
      }
    });
    console.log(
      existente
        ? `Contraseña de ${usuario} actualizada; sus sesiones abiertas se cerraron.`
        : `Usuario ${usuario} creado. Ya puede entrar a los tableros privados.`,
    );
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
