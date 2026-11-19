import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Texto que solo existe FUERA del dist: si aparece en una respuesta, hubo path traversal. */
export const SECRETO = 'SECRETO-FUERA-DE-DIST-7f3a';

export const HTML_INDEX =
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title>' +
  '<script type="module" src="/assets/index-abc123.js"></script></head>' +
  '<body><div id="raiz"></div></body></html>';

/** Más de 1 KB y muy repetitivo: comprimible si el filtro lo permitiera. */
export const BYTES_GLB = Buffer.concat([
  Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]), // "glTF" v2
  Buffer.alloc(4096, 0x41),
]);

export const JS_ASSET = `console.log(${JSON.stringify('x'.repeat(4096))});\n`;

/** Script en línea de la página principal falsa (el del bloque de WordPress). */
export const SCRIPT_PRINCIPAL =
  "\n(function () {\n  'use strict';\n  document.body.dataset.bloque = 'listo';\n})();\n";

/**
 * dist/principal/index.html falso: un comentario con un <script> que no se
 * ejecuta, datos JSON (sin hash), el script en línea y relleno para que pase
 * del umbral de compresión.
 */
export const HTML_PRINCIPAL =
  '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">' +
  '<title>Observatorio</title><link rel="stylesheet" href="/assets/principal-abc123.css"></head>' +
  '<body><!-- Ejemplo en un comentario: <script>noCuenta()</script> -->' +
  '<div id="odes-observatorio"><p>Página principal · Educación</p>' +
  `<p>${'Dato de ejemplo. '.repeat(100)}</p>` +
  '<script type="application/json" data-odes-mapa-datos>{"zonas":{}}</script>' +
  `</div><script>${SCRIPT_PRINCIPAL}</script></body></html>`;

export interface DistTemporal {
  /** Carpeta que se pasa como WEB_DIST_DIR. */
  readonly directorio: string;
  /** Carpeta vacía (sin index.html) para el modo "front-end sin compilar". */
  readonly directorioVacio: string;
  /** Build con index.html pero sin principal/index.html (un build anterior a /principal). */
  readonly directorioSinPrincipal: string;
  limpiar(): Promise<void>;
}

/**
 * Crea en os.tmpdir() un build falso de Vite:
 *   <raíz>/proyecto/web/dist/{index.html, assets/index-abc123.js,
 *     principal/index.html, sivu/edificiofinal.glb, sivu/draco/draco_decoder.wasm}
 * y deja un package.json con SECRETO en cada carpeta por encima de dist.
 */
export async function crearDistTemporal(): Promise<DistTemporal> {
  const raiz = await mkdtemp(join(tmpdir(), 'sapiencia-web-e2e-'));
  const directorio = join(raiz, 'proyecto', 'web', 'dist');
  const directorioVacio = join(raiz, 'sin-build');
  const directorioSinPrincipal = join(raiz, 'sin-principal');

  const archivos: Record<string, string | Buffer> = {
    'index.html': HTML_INDEX,
    'assets/index-abc123.js': JS_ASSET,
    'principal/index.html': HTML_PRINCIPAL,
    'sivu/edificiofinal.glb': BYTES_GLB,
    'sivu/draco/draco_decoder.wasm': Buffer.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ]),
    '.oculto': SECRETO,
  };
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(directorio, ruta);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
  }
  for (const carpeta of [
    raiz,
    join(raiz, 'proyecto'),
    join(raiz, 'proyecto', 'web'),
  ]) {
    await writeFile(
      join(carpeta, 'package.json'),
      JSON.stringify({ secreto: SECRETO }),
    );
  }
  await mkdir(directorioVacio);
  await mkdir(directorioSinPrincipal);
  await writeFile(join(directorioSinPrincipal, 'index.html'), HTML_INDEX);

  return {
    directorio,
    directorioVacio,
    directorioSinPrincipal,
    limpiar: () => rm(raiz, { recursive: true, force: true }),
  };
}
