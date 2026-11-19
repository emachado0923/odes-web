import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * /principal: la página principal del Observatorio. No es parte de la SPA de
 * React: es HTML puro, el bloque de WordPress
 * (apps/web/principal/observatorio-bloque.html) insertado tal cual en la
 * página que arma Vite (apps/web/principal/index.html ->
 * dist/principal/index.html). Ver apps/web/principal/LEEME.md.
 *
 * El bloque trae su JavaScript en línea, y la CSP del sitio (helmet) solo
 * admite scripts del propio origen. En vez de abrir 'unsafe-inline', esta
 * página lleva su propia CSP: la del sitio, pero con un script-src que
 * autoriza cada script en línea de ESTE archivo por su hash (sha256). El
 * hash se calcula al servir, sobre los mismos bytes que se envían, así que
 * siempre coincide con el bloque compilado, cambie como cambie.
 */

/** /principal, /principal/ y /principal/index.html, sin distinguir mayúsculas. */
const PATRON_RUTA_PRINCIPAL = /^\/principal(?:\/(?:index\.html)?)?$/i;

export function esRutaPrincipal(ruta: string): boolean {
  return PATRON_RUTA_PRINCIPAL.test(ruta);
}

/** La página compilada, relativa a WEB_DIST_DIR. */
export const ARCHIVO_PRINCIPAL = join('principal', 'index.html');

/** Se revalida siempre (ETag): un build nuevo trae otro bloque. */
export const CACHE_PRINCIPAL = 'no-cache';

export const MENSAJE_SIN_PRINCIPAL = [
  'La página principal todavía no está compilada: falta principal/index.html en WEB_DIST_DIR.',
  'En desarrollo abre http://localhost:5173/principal (servidor de Vite).',
  'Para producción ejecuta "npm run build" en la raíz del proyecto.',
  '',
].join('\n');

/**
 * Tipos de <script> que el navegador ejecuta como JavaScript (los "JavaScript
 * MIME type essence" del estándar HTML, más "module"). Uno con otro tipo,
 * como los datos del mapa (application/json), no se ejecuta ni necesita hash.
 */
const TIPOS_EJECUTABLES = new Set([
  '',
  'module',
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/**
 * Recorre comentarios y <script> en orden: así un "<script" dentro de un
 * comentario no cuenta como script. Un comentario sin cerrar llega al final.
 */
const PATRON_COMENTARIO_O_SCRIPT =
  /<!--[\s\S]*?(?:-->|$)|<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script[\s/>]/gi;

function atributo(atributos: string, nombre: string): string | undefined {
  const patron = new RegExp(
    `(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  );
  const coincidencia = patron.exec(atributos);
  return coincidencia
    ? (coincidencia[1] ?? coincidencia[2] ?? coincidencia[3] ?? '')
    : undefined;
}

function tieneAtributo(atributos: string, nombre: string): boolean {
  return new RegExp(`(?:^|\\s)${nombre}(?:\\s*=|\\s|$)`, 'i').test(atributos);
}

/**
 * Fuentes CSP ('sha256-…') de los scripts en línea ejecutables de `html`, sin
 * repetir y en orden de aparición. Se omiten los que tienen src (los cubre
 * 'self') y los de tipos que no se ejecutan.
 */
export function hashesDeScriptsEnLinea(html: string): string[] {
  const hashes = new Set<string>();
  for (const [, atributos, contenido] of html.matchAll(
    PATRON_COMENTARIO_O_SCRIPT,
  )) {
    if (atributos === undefined || contenido === undefined) continue; // comentario
    if (tieneAtributo(atributos, 'src')) continue;
    const tipo = (atributo(atributos, 'type') ?? '').trim().toLowerCase();
    if (!TIPOS_EJECUTABLES.has(tipo)) continue;
    // El navegador calcula el hash del texto ya leído, con los saltos de
    // línea normalizados (CRLF y CR -> LF).
    const texto = contenido.replace(/\r\n?/g, '\n');
    hashes.add(
      `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`,
    );
  }
  return [...hashes];
}

/**
 * La CSP del sitio con otro script-src (reemplaza el que había o lo agrega).
 * Las demás directivas quedan exactamente como las puso helmet.
 */
export function conScriptSrc(csp: string, fuentes: readonly string[]): string {
  const nueva = ['script-src', ...fuentes].join(' ');
  const directivas = csp.split(';');
  const indice = directivas.findIndex((directiva) =>
    /^\s*script-src(?:\s|$)/i.test(directiva),
  );
  if (indice === -1) return [...directivas, nueva].join(';');
  directivas[indice] = nueva;
  return directivas.join(';');
}

interface PaginaCargada {
  readonly version: string;
  readonly cuerpo: Buffer;
  readonly fuentesScript: readonly string[];
}

/**
 * Manejador de GET/HEAD /principal. Lee dist/principal/index.html una vez por
 * versión del archivo (tamaño, fechas e inodo) y lo sirve desde memoria, de
 * modo que la CSP siempre corresponde a los bytes enviados. Express agrega
 * el ETag y responde 304 si no cambió.
 */
export function crearManejadorPrincipal(directorio: string) {
  const ruta = join(directorio, ARCHIVO_PRINCIPAL);
  let cargada: PaginaCargada | undefined;

  async function cargar(): Promise<PaginaCargada> {
    const estado = await stat(ruta);
    const version = `${estado.size}-${estado.mtimeMs}-${estado.ctimeMs}-${estado.ino}`;
    if (cargada?.version === version) return cargada;
    const cuerpo = await readFile(ruta);
    cargada = {
      version,
      cuerpo,
      fuentesScript: [
        "'self'",
        ...hashesDeScriptsEnLinea(cuerpo.toString('utf8')),
      ],
    };
    return cargada;
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      !esRutaPrincipal(req.path)
    ) {
      next();
      return;
    }
    cargar().then(
      ({ cuerpo, fuentesScript }) => {
        const csp = res.getHeader('Content-Security-Policy');
        if (typeof csp === 'string') {
          res.setHeader(
            'Content-Security-Policy',
            conScriptSrc(csp, fuentesScript),
          );
        }
        res.setHeader('Cache-Control', CACHE_PRINCIPAL);
        res.type('html').send(cuerpo);
      },
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          res
            .status(503)
            .set('Cache-Control', 'no-store')
            .type('text/plain')
            .send(MENSAJE_SIN_PRINCIPAL);
          return;
        }
        next(error);
      },
    );
  };
}
