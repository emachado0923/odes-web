/**
 * Crea o actualiza un usuario del PAI (el primer administrador se crea así;
 * los demás, normalmente, desde /pai/admin/usuarios).
 *
 *   npm run pai:crear-usuario -- --usuario <u> --nombre "<nombre>" --rol administrador|responsable
 *        [--correo <c>] [--cargo "<cargo>"] [--temporal] [--solo-sql]
 *   npm run pai:crear-usuario -- --usuario <u> [--temporal] [--solo-sql]   (cambia la contraseña)
 *   npm run pai:crear-usuario -- --usuario <u> --desactivar [--solo-sql]
 *
 * - La contraseña se lee oculta dos veces (leerContrasenaOculta) o de
 *   PAI_USUARIO_CONTRASENA; nunca de los argumentos
 *   (rechazarContrasenaEnArgumentos).
 * - --temporal: el usuario debe cambiarla al entrar (debe_cambiar_contrasena).
 * - Si el usuario existe: cambia la contraseña (y nombre/rol/correo/cargo si
 *   se dan), lo reactiva y cierra sus sesiones. --desactivar lo desactiva y
 *   cierra sus sesiones.
 * - --solo-sql: no se conecta; imprime SQL de Postgres con el hash (INSERT …
 *   ON CONFLICT (usuario) DO UPDATE …; DELETE FROM pai_sesiones …) para el
 *   editor SQL de Supabase.
 * - Registra 'crear_usuario' / 'editar_usuario' en pai_registro (sin hash).
 *
 * Usa la conexión de la aplicación (apps/server/.env) y necesita el esquema
 * versión 5 (npm run repositorio:migrar). Las partes probadas están en
 * crear-usuario-comun.ts.
 */
import { cargarArchivoEnv } from '../../config/configuracion.js';
import {
  abrirBaseDatos,
  ejecutarCli,
  ErrorCli,
  leerContrasenaOculta,
  rechazarContrasenaEnArgumentos,
} from '../../repositorio/cli/comun.js';
import {
  hashContrasena,
  problemaContrasena,
} from '../../repositorio/dominio/contrasenas.js';
import {
  AYUDA_CREAR_USUARIO,
  buscarUsuarioCli,
  desactivarUsuarioCli,
  exigirDatosDeCreacion,
  guardarUsuarioCli,
  interpretarArgumentosCrearUsuario,
  sqlCrearUsuarioPai,
  sqlDesactivarUsuarioPai,
  VARIABLE_CONTRASENA,
} from './crear-usuario-comun.js';

async function pedirContrasena(temporal: boolean): Promise<string> {
  const desdeEntorno = process.env[VARIABLE_CONTRASENA];
  if (desdeEntorno !== undefined) {
    const problema = problemaContrasena(desdeEntorno);
    if (problema) throw new ErrorCli(`${VARIABLE_CONTRASENA}: ${problema}`, 2);
    return desdeEntorno;
  }
  const que = temporal ? 'Contraseña temporal' : 'Contraseña nueva';
  for (let intento = 1; intento <= 3; intento++) {
    const primera = await leerContrasenaOculta(
      `${que} (mínimo 12 caracteres): `,
    );
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

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const argumentos = process.argv.slice(2);
  rechazarContrasenaEnArgumentos(argumentos);
  const opciones = interpretarArgumentosCrearUsuario(argumentos);
  if (!opciones) {
    console.log(AYUDA_CREAR_USUARIO);
    return 0;
  }

  if (opciones.soloSql) {
    console.log(
      opciones.desactivar
        ? sqlDesactivarUsuarioPai(opciones.usuario)
        : sqlCrearUsuarioPai(
            opciones,
            await hashContrasena(await pedirContrasena(opciones.temporal)),
          ),
    );
    return 0;
  }

  const bd = await abrirBaseDatos();
  try {
    if (opciones.desactivar) {
      await desactivarUsuarioCli(bd, opciones.usuario);
      console.log(
        `Usuario ${opciones.usuario} desactivado y sus sesiones cerradas.`,
      );
      return 0;
    }
    // Antes de pedir la contraseña: ¿faltan datos para crearlo?
    if (!(await buscarUsuarioCli(bd, opciones.usuario))) {
      exigirDatosDeCreacion(opciones);
    }
    const hash = await hashContrasena(await pedirContrasena(opciones.temporal));
    const resultado = await guardarUsuarioCli(bd, opciones, hash);
    const temporal = opciones.temporal
      ? ' Deberá cambiar la contraseña al entrar.'
      : '';
    console.log(
      resultado.creado
        ? `Usuario ${opciones.usuario} (${opciones.rol}) creado. Ya puede entrar en /pai.${temporal}`
        : `Usuario ${opciones.usuario} actualizado y reactivado; sus sesiones abiertas se cerraron.${temporal}`,
    );
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
