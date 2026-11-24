import { existsSync, type Stats, statSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import { extname, join, relative, sep } from 'node:path';
import { Logger, type LoggerService } from '@nestjs/common';
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express';
import { crearEtagPorContenido } from './etag-contenido.js';
import {
  ARCHIVO_PRINCIPAL,
  crearManejadorPrincipal,
} from './pagina-principal.js';
import {
  debeServirIndex,
  pareceArchivo,
  redireccionAntigua,
} from './rutas-spa.js';

/**
 * Servido del build de React (apps/web/dist) desde el mismo proceso NestJS.
 *
 * Contrato: /api/* es de Nest; todo lo demás es del front-end y se resuelve
 * aquí (la página /principal, archivo estático, index.html de la SPA o 404).
 * El router se registra con app.use() antes de las rutas de Nest.
 *
 * Por qué código explícito y no @nestjs/serve-static: ServeStaticModule monta
 * express.static más un único renderPath (por defecto el comodín "{*any}")
 * que responde index.html, así que /sivu/falta.glb y /otra-cosa recibirían
 * HTML. Aunque renderPath admite una RegExp, sin build responde 404 (aquí se
 * pide 503 con aviso) e index.html comparte el setHeaders de los estáticos
 * (con un fs.statSync por petición). Unas pocas líneas explícitas dejan las
 * reglas a la vista y cubiertas por los tests e2e.
 */

/** Carpeta de primer nivel de dist con los bundles de Vite (nombres con hash). */
const CARPETA_ASSETS = 'assets';

/** /assets/*: bundles de Vite con hash en el nombre; nunca cambian de contenido. */
export const CACHE_INMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Resto de archivos estáticos (/sivu/edificiofinal.glb, /sivu/draco/*,
 * favicon...): sus nombres no llevan hash, así que si se reemplaza el modelo
 * el navegador debe enterarse en la siguiente visita. "no-cache" permite
 * guardarlos pero obliga a revalidar con el ETag, que se calcula con el
 * contenido (ver etag-contenido.ts): si no cambió, la respuesta es un 304 sin
 * cuerpo y no se vuelven a bajar los ~10 MB del .glb, aunque un build nuevo
 * haya cambiado la fecha del archivo.
 */
export const CACHE_REVALIDAR = 'public, no-cache';

/** index.html se revalida siempre: apunta a los bundles con hash vigentes. */
export const CACHE_INDEX = 'no-cache';

/** Tipos forzados por si la base de datos MIME del sistema no los conoce. */
const TIPOS_MIME: Readonly<Record<string, string>> = {
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

export const MENSAJE_NO_ENCONTRADO = 'No encontrado\n';

/** Cuerpo de los 5xx: nunca el mensaje del error (trae la ruta del disco). */
export const MENSAJE_ERROR_INTERNO = 'Error interno del servidor\n';

/**
 * Cabeceras que send pone antes de abrir el archivo (setHeaders, ETag,
 * Last-Modified, tipo...) y que una respuesta de error no debe heredar: un 500
 * con `immutable` quedaría un año en la caché del navegador.
 */
const CABECERAS_DEL_ARCHIVO = [
  'Cache-Control',
  'ETag',
  'Last-Modified',
  'Accept-Ranges',
  'Content-Range',
  'Content-Type',
  'Content-Length',
] as const;

export const MENSAJE_SIN_BUILD = [
  'El front-end todavía no está compilado: falta index.html en WEB_DIST_DIR.',
  'En desarrollo abre http://localhost:5173 (servidor de Vite, que reenvía /api a este servidor).',
  'Para producción ejecuta "npm run build" en la raíz del proyecto.',
  '',
].join('\n');

export interface OpcionesFrontend {
  /** Carpeta absoluta del build de Vite (WEB_DIST_DIR). */
  readonly directorio: string;
  /** Prefijo global de la API ("api"): esas rutas pasan directo a Nest. */
  readonly prefijoApi: string;
  readonly registro?: Pick<LoggerService, 'log' | 'warn' | 'error'>;
}

export function crearRouterFrontend({
  directorio,
  prefijoApi,
  registro = new Logger('Frontend'),
}: OpcionesFrontend): Router {
  const rutaIndex = join(directorio, 'index.html');
  if (existsSync(rutaIndex)) {
    registro.log(`Sirviendo el front-end compilado desde ${directorio}`);
    if (!existsSync(join(directorio, ARCHIVO_PRINCIPAL))) {
      registro.warn(
        `No existe ${join(directorio, ARCHIVO_PRINCIPAL)}: /principal ` +
          'responderá 503 hasta volver a compilar el front-end (npm run build).',
      );
    }
  } else {
    registro.warn(
      `No existe ${rutaIndex}. Las rutas /, /sivu, /odes, /repositorio, ` +
        '/tableros, /pai, /pertinencia, /crm, /componentes y /principal ' +
        'responderán 503 hasta ' +
        'compilar el ' +
        'front-end (npm run build). En desarrollo usa ' +
        'http://localhost:5173 (Vite).',
    );
  }

  const prefijoEscapado = prefijoApi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patronApi = new RegExp(`^/${prefijoEscapado}(?:/|$)`, 'i');

  // Los archivos sin hash en el nombre se revalidan con un ETag por contenido.
  const etags = crearEtagPorContenido();
  void etags.precalcular(directorio, [CARPETA_ASSETS]);

  // express.static delega en "send", que normaliza la ruta, rechaza "..",
  // ignora dotfiles y nunca sale de `directorio`: no se lee el disco a mano.
  const estaticos = express.static(directorio, {
    index: false, // sin index.html automático para carpetas
    redirect: false, // /sivu es carpeta en dist: sin 301 a /sivu/, que siga a la SPA
    fallthrough: true, // si no existe el archivo, pasa al siguiente manejador
    dotfiles: 'ignore',
    etag: true, // send solo usa el suyo (tamaño + mtime) si no hay otro
    lastModified: true,
    setHeaders(res, rutaArchivo, estado: Stats) {
      const carpeta = relative(directorio, rutaArchivo).split(sep)[0];
      if (carpeta === CARPETA_ASSETS) {
        res.setHeader('Cache-Control', CACHE_INMUTABLE);
      } else {
        res.setHeader('Cache-Control', CACHE_REVALIDAR);
        const etag = etags.obtener(rutaArchivo, estado);
        if (etag) res.setHeader('ETag', etag);
      }
      const tipo = TIPOS_MIME[extname(rutaArchivo).toLowerCase()];
      if (tipo) res.setHeader('Content-Type', tipo);
    },
  });

  /**
   * Cabeceras de index.html: ETag por contenido y sin Last-Modified. Los de
   * send (tamaño + fecha) no distinguen un index de otro: cada build cambia
   * los hashes de los bundles sin cambiar el tamaño, y en Vercel todos los
   * archivos del despliegue llevan la misma fecha. Así, tras desplegar, el
   * navegador recibía 304, seguía con el index anterior y pedía bundles que
   * ya no existen ("Importing a module script failed").
   */
  const cabecerasIndex = (): Record<string, string> => {
    try {
      const etag = etags.obtener(rutaIndex, statSync(rutaIndex));
      if (etag) return { 'Cache-Control': CACHE_INDEX, ETag: etag };
    } catch {
      // Sin build: sendFile responde el 503 con el aviso.
    }
    return { 'Cache-Control': CACHE_INDEX };
  };

  const router = express.Router();

  // /api/* sale de este router sin tocar nada más: lo atiende Nest.
  router.use((req: Request, _res: Response, next: NextFunction) => {
    next(patronApi.test(req.path) ? 'router' : undefined);
  });

  // /principal (HTML puro con el bloque de WordPress y su propia CSP). Va
  // antes de los estáticos: /principal/index.html tampoco debe salir con la
  // CSP general, que bloquearía el script del bloque.
  router.use(crearManejadorPrincipal(directorio));

  // Páginas estáticas que pasaron a la SPA (rutas-spa.ts): 301 a la ruta
  // nueva. Sin esto serían un 404 en texto plano, porque llevan extensión.
  router.use((req: Request, res: Response, next: NextFunction) => {
    const destino =
      req.method === 'GET' || req.method === 'HEAD'
        ? redireccionAntigua(req.path)
        : null;
    if (destino) res.redirect(301, destino);
    else next();
  });

  router.use(estaticos);

  // Fallback de la SPA: solo GET/HEAD a rutas propias sin extensión.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      !debeServirIndex(req.path)
    ) {
      next();
      return;
    }
    // Ruta fija (root + nombre constante): la URL pedida nunca llega al disco.
    res.sendFile(
      'index.html',
      { root: directorio, lastModified: false, headers: cabecerasIndex() },
      (error?: Error & { code?: string; status?: number }) => {
        if (!error || res.headersSent || error.code === 'ECONNABORTED') return;
        if (error.code === 'ENOENT' || error.status === 404) {
          res
            .status(503)
            .set('Cache-Control', 'no-store')
            .type('text/plain')
            .send(MENSAJE_SIN_BUILD);
          return;
        }
        next(error);
      },
    );
  });

  // Cualquier otra ruta fuera de /api: 404. Sin esto respondería el 404 HTML
  // genérico de Express, porque el manejador 404 JSON de Nest solo cubre el
  // prefijo global (/api/*).
  //
  // Un navegador que abre una página inexistente (/otra) recibe index.html con
  // estado 404, para que React dibuje su página "no encontrada"
  // (apps/web/src/compartido/NoEncontrado.tsx) igual que en desarrollo con
  // Vite. Todo lo demás (fetch, curl, archivos con extensión como
  // /sivu/falta.glb, métodos que no son GET/HEAD) recibe texto plano, nunca
  // HTML: GLTFLoader intentaría interpretar ese HTML como modelo.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!pidePaginaHtml(req)) {
      responderNoEncontrado(res);
      return;
    }
    res
      .status(404)
      .sendFile(
        'index.html',
        { root: directorio, headers: { 'Cache-Control': 'no-store' } },
        (error?: Error & { code?: string; status?: number }) => {
          if (!error || res.headersSent || error.code === 'ECONNABORTED')
            return;
          if (error.code === 'ENOENT' || error.status === 404) {
            responderNoEncontrado(res);
            return;
          }
          next(error);
        },
      );
  });

  // Errores de express.static y de sendFile: 412 (If-Match), 416 (Range fuera
  // del archivo) o 500 (EACCES, EIO, EMFILE al abrir un archivo). Sin este
  // manejador respondería el filtro de Nest, que (1) conserva las cabeceras
  // de caché que send ya puso, así que un 500 en /assets/* salía con
  // `immutable` y el navegador lo guardaba un año; (2) devuelve err.message,
  // con la ruta absoluta del disco, y (3) registra como ERROR, con stack, los
  // 412/416 que cualquier cliente puede provocar.
  router.use(
    (error: unknown, req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const estado = estadoDelError(error);
      for (const cabecera of CABECERAS_DEL_ARCHIVO) res.removeHeader(cabecera);
      if (estado >= 500) {
        const { message, stack } =
          error instanceof Error ? error : new Error(String(error));
        registro.error(
          `No se pudo servir ${req.method} ${req.path}: ${message}`,
          stack,
        );
      } else if (estado === 416) {
        // "bytes */<tamaño>": le dice al cliente qué rango sí es válido.
        const rango = (error as { headers?: Record<string, unknown> })
          .headers?.['Content-Range'];
        if (typeof rango === 'string') res.setHeader('Content-Range', rango);
      }
      const cuerpo =
        estado >= 500
          ? MENSAJE_ERROR_INTERNO
          : `${STATUS_CODES[estado] ?? 'Error'}\n`;
      // res.end y no res.send: Express le agregaría un ETag a un no-store.
      res.statusCode = estado;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(cuerpo));
      res.end(cuerpo);
    },
  );

  return router;
}

function responderNoEncontrado(res: Response): void {
  res.status(404).type('text/plain').send(MENSAJE_NO_ENCONTRADO);
}

/** Estado HTTP de un error de send/http-errors; 500 si no trae uno válido. */
function estadoDelError(error: unknown): number {
  const { status, statusCode } = (error ?? {}) as {
    status?: unknown;
    statusCode?: unknown;
  };
  const estado = typeof status === 'number' ? status : statusCode;
  return typeof estado === 'number' &&
    Number.isInteger(estado) &&
    estado >= 400 &&
    estado <= 599
    ? estado
    : 500;
}

/**
 * ¿Es la navegación de un navegador a una página? GET/HEAD, sin extensión y
 * con `text/html` explícito en Accept: fetch(), GLTFLoader y curl aceptan
 * cualquier tipo pero no piden HTML, así que reciben el 404 en texto plano.
 */
function pidePaginaHtml(req: Request): boolean {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    /\btext\/html\b/i.test(req.get('accept') ?? '') &&
    !pareceArchivo(req.path)
  );
}
