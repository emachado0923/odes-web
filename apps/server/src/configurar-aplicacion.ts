import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import type { Configuracion } from './config/configuracion.js';
import { crearRouterFrontend } from './frontend/frontend.js';
import { crearOpcionesHelmet } from './seguridad/opciones-helmet.js';

export const PREFIJO_API = 'api';

/**
 * Tope del cuerpo JSON. El de Express por defecto (100 kB) es menor que una
 * conversación del chat de ODES dentro de los límites de su protocolo
 * (LIMITES_CHAT: hasta 10 preguntas de 2000 caracteres y 9 respuestas de
 * 12 000, unos 130 kB en español y más con caracteres de varios bytes): con
 * 100 kB una conversación larga recibía un 413 genérico en cada pregunta
 * nueva. El controlador del chat valida después los límites exactos.
 */
export const LIMITE_CUERPO_JSON = '512kb';

/**
 * El .glb ya viene comprimido (Draco + texturas webp): gzip apenas le quita
 * ~10 % a cambio de CPU en cada descarga, y además eliminaría Content-Length,
 * que GLTFLoader usa para calcular el progreso de carga, y el soporte de
 * Range. El resto (JS, CSS, HTML, JSON, wasm) sí se comprime.
 */
export function filtrarCompresion(req: Request, res: Response): boolean {
  const tipo = String(res.getHeader('Content-Type') ?? '');
  if (tipo.startsWith('model/gltf-binary')) return false;
  return compression.filter(req, res);
}

/**
 * Configura una aplicación Nest ya creada. Lo usan main.ts y los tests e2e,
 * así ambos ejercitan exactamente el mismo pipeline. Debe llamarse antes de
 * app.init()/app.listen(): los app.use() quedan delante de las rutas de Nest.
 */
export function configurarAplicacion(
  app: NestExpressApplication,
  config: Configuracion,
): NestExpressApplication {
  // Detrás de nginx: req.ip / req.protocol salen de X-Forwarded-* solo si se confía en el proxy.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet(crearOpcionesHelmet(config.cspFrameAncestors, config.origenesArchivos)),
  );
  app.use(compression({ filter: filtrarCompresion }));

  // Antes de app.init(): Nest ya no agrega su parser JSON de 100 kB.
  app.useBodyParser('json', { limit: LIMITE_CUERPO_JSON });

  app.setGlobalPrefix(PREFIJO_API);

  // Archivos del build del front-end: /principal, estáticos y fallback de la
  // SPA (/, /sivu, /odes, /repositorio).
  app.use(
    crearRouterFrontend({
      directorio: config.directorioWeb,
      prefijoApi: PREFIJO_API,
    }),
  );

  // SIGTERM/SIGINT (systemd, pm2, docker) cierran Nest de forma ordenada.
  app.enableShutdownHooks();

  return app;
}
