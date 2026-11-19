import { isAbsolute, resolve } from 'node:path';
import type { LoggerService } from '@nestjs/common';
import { BaseDatosRepositorio } from '../bd/base-datos.js';
import {
  cargarConfiguracionRepositorio,
  type ConfiguracionRepositorio,
} from '../configuracion-repositorio.js';

/** Carpeta desde la que se ejecutó `npm run` (npm cambia el cwd a apps/server). */
export const DIRECTORIO_LLAMADA = process.env.INIT_CWD ?? process.cwd();

/** Las rutas de las opciones se resuelven contra la carpeta de la llamada. */
export function rutaDeOpcion(valor: string): string {
  return isAbsolute(valor) ? resolve(valor) : resolve(DIRECTORIO_LLAMADA, valor);
}

/** Registro de Nest que escribe en la consola (sin colores ni marcas de tiempo). */
export const REGISTRO_CONSOLA: LoggerService = {
  log: (mensaje: unknown) => console.log(String(mensaje)),
  warn: (mensaje: unknown) => console.warn(`Aviso: ${String(mensaje)}`),
  error: (mensaje: unknown) => console.error(`Error: ${String(mensaje)}`),
};

export class ErrorCli extends Error {
  constructor(
    mensaje: string,
    readonly codigoSalida = 1,
  ) {
    super(mensaje);
    this.name = 'ErrorCli';
  }
}

/**
 * Conexión de las CLI con el usuario de la aplicación (REPOSITORIO_MYSQL_* o
 * REPOSITORIO_POSTGRES_URL):
 * espera la verificación inicial y falla con un mensaje claro si la base no
 * está configurada, no responde o no tiene el esquema.
 */
export async function abrirBaseDatos(
  config: ConfiguracionRepositorio = cargarConfiguracionRepositorio(process.env),
): Promise<BaseDatosRepositorio> {
  const datos = config.postgres ?? config.mysql;
  if (!datos) {
    throw new ErrorCli(
      'Falta la conexión a la base: defina REPOSITORIO_MYSQL_HOST/USER/PASSWORD/DATABASE ' +
        '(o REPOSITORIO_MYSQL_URL), o REPOSITORIO_POSTGRES_URL, en apps/server/.env.',
      2,
    );
  }
  const motor = config.postgres ? 'Postgres' : 'MySQL';
  const bd = new BaseDatosRepositorio(config);
  bd.registro = { log: () => undefined, warn: () => undefined, error: () => undefined };
  bd.iniciar();
  try {
    await bd.listo();
  } catch {
    const estado = bd.estado;
    await bd.cerrar();
    const destino = `${datos.baseDatos} en ${datos.host}:${datos.puerto}`;
    throw new ErrorCli(
      estado === 'sin_esquema'
        ? `La base ${destino} no tiene el esquema que necesita este código (o tiene los nombres de tabla anteriores a la versión 4). Aplíquelo primero: npm run repositorio:migrar -- --usuario <admin>.`
        : config.postgres
          ? `No se pudo conectar a ${motor} (${destino}). Revise REPOSITORIO_POSTGRES_URL (usuario, contraseña, puerto) y el TLS.`
          : `No se pudo conectar a ${motor} (${destino}). Revise REPOSITORIO_MYSQL_*, la red autorizada de Cloud SQL y el certificado TLS.`,
    );
  }
  return bd;
}

/**
 * Lee una contraseña de la terminal sin mostrarla (modo crudo). Nunca se
 * acepta por argumentos: quedaría en el historial y en la lista de procesos.
 */
export function leerContrasenaOculta(pregunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY) {
    return Promise.reject(
      new ErrorCli(
        'No hay una terminal interactiva para pedir la contraseña. Para automatizar, use la variable de entorno indicada en --ayuda.',
        2,
      ),
    );
  }
  return new Promise((resolver, rechazar) => {
    let texto = '';
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const terminar = (error: Error | null): void => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', alEscribir);
      process.stdout.write('\n');
      if (error) rechazar(error);
      else resolver(texto);
    };
    const alEscribir = (datos: string): void => {
      for (const caracter of datos) {
        if (caracter === '\r' || caracter === '\n' || caracter === '\u0004') {
          terminar(null);
          return;
        }
        if (caracter === '\u0003') {
          terminar(new ErrorCli('Cancelado.', 130));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') {
          texto = [...texto].slice(0, -1).join('');
          continue;
        }
        if (caracter >= ' ') texto += caracter;
      }
    };
    entrada.on('data', alEscribir);
  });
}

/** Rechaza opciones que parezcan una contraseña en la línea de comandos. */
export function rechazarContrasenaEnArgumentos(argumentos: readonly string[]): void {
  const prohibida = argumentos.find((argumento) =>
    /^--?(contrasena|contraseña|password|pass|clave|p)(=|$)/i.test(argumento),
  );
  if (prohibida) {
    throw new ErrorCli(
      'La contraseña nunca se pasa por la línea de comandos (quedaría en el historial y en la lista de procesos). ' +
        'Ejecute sin ella y escríbala cuando se pida, o use la variable de entorno indicada en --ayuda.',
      2,
    );
  }
}

/** Ejecuta la función principal de una CLI con el manejo de errores común. */
export async function ejecutarCli(principal: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await principal();
  } catch (error) {
    if (error instanceof ErrorCli) {
      console.error(error.message);
      process.exitCode = error.codigoSalida;
      return;
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
