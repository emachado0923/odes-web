import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { cargarConfiguracion } from './config/configuracion.js';
import { configurarAplicacion } from './configurar-aplicacion.js';

/**
 * Entrada de la función de Vercel (ver scripts/vercel/construir.mjs en la
 * raíz). Es la misma aplicación de main.ts, pero sin listen(): Vercel llama a
 * esta función con cada petición que no es un archivo estático (la API, las
 * páginas de la SPA y /principal), y la aplicación se crea una vez por
 * instancia, en la primera.
 *
 * Las variables de entorno las pone Vercel (Settings -> Environment
 * Variables); aquí no se lee apps/server/.env, que nunca se despliega.
 */

type Manejador = (req: IncomingMessage, res: ServerResponse) => void;

const registro = new Logger('Vercel');
let aplicacion: Promise<Manejador> | null = null;

async function crear(): Promise<Manejador> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurarAplicacion(app, cargarConfiguracion());
  await app.init();
  return app.getHttpAdapter().getInstance() as Manejador;
}

export default async function manejador(req: IncomingMessage, res: ServerResponse): Promise<void> {
  aplicacion ??= crear();
  let express: Manejador;
  try {
    express = await aplicacion;
  } catch (error) {
    // Configuración inválida u otro fallo al crear la aplicación: se informa
    // y la próxima petición lo vuelve a intentar.
    aplicacion = null;
    registro.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined,
    );
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Error interno del servidor\n');
    return;
  }
  express(req, res);
}
