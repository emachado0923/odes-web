import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import {
  cargarArchivoEnv,
  cargarConfiguracion,
} from './config/configuracion.js';
import { configurarAplicacion } from './configurar-aplicacion.js';

const registro = new Logger('Arranque');

/** La aplicación creada (para cerrarla si el arranque falla después de crearla). */
let app: NestExpressApplication | undefined;

async function iniciar(): Promise<void> {
  cargarArchivoEnv();
  const config = cargarConfiguracion();

  app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurarAplicacion(app, config);
  await app.listen(config.puerto, config.host);

  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  registro.log(
    `Servidor listo en http://${host}:${config.puerto} ` +
      `(NODE_ENV=${config.entorno}, front-end: ${config.directorioWeb})`,
  );
}

try {
  await iniciar();
} catch (error) {
  registro.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
  // Si falló listen (p. ej. el puerto está ocupado), se cierra lo que ya se
  // abrió (conexiones a MySQL, vigilancia del índice de ODES) para que el
  // proceso termine enseguida con código 1.
  await app?.close().catch(() => undefined);
}
