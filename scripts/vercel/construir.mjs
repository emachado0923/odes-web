#!/usr/bin/env node
/**
 * Arma .vercel/output (Build Output API v3 de Vercel) para desplegar con
 *
 *   npm run build:vercel
 *   vercel deploy --prebuilt --prod
 *
 * Resultado:
 *   .vercel/output/static/         apps/web/dist sin las páginas HTML: JS, CSS,
 *                                  fuentes, imágenes, el modelo 3D (CDN de Vercel)
 *   .vercel/output/functions/servidor.func/
 *                                  NestJS completo: la API, las páginas de la
 *                                  SPA y /principal (con sus cabeceras de
 *                                  seguridad y la CSP por hash), el índice
 *                                  del Asistente ODES y las dependencias de
 *                                  producción. Nunca apps/server/.env.
 *   .vercel/output/config.json     rutas: primero los archivos estáticos;
 *                                  todo lo demás, a la función.
 *
 * Opciones:
 *   --sin-compilar   usa los dist/ que ya existen (por defecto: npm run build)
 *   --indice <ruta>  índice del Asistente ODES a incluir (por defecto
 *                    apps/server/datos/odes/indice.sqlite)
 *   --runtime <x>    runtime de Node de Vercel (por defecto nodejs24.x)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const SALIDA = join(RAIZ, '.vercel', 'output');
const WEB_DIST = join(RAIZ, 'apps', 'web', 'dist');
const SERVIDOR = join(RAIZ, 'apps', 'server');
const FUNCION = join(SALIDA, 'functions', 'servidor.func');
/** Páginas que sirve la función (no la CDN): llevan CSP y cabeceras de helmet. */
const PAGINAS = ['index.html', join('principal', 'index.html')];

const { values } = parseArgs({
  options: {
    'sin-compilar': { type: 'boolean', default: false },
    indice: { type: 'string', default: join(SERVIDOR, 'datos', 'odes', 'indice.sqlite') },
    runtime: { type: 'string', default: 'nodejs24.x' },
  },
});

function npm(argumentos, cwd = RAIZ) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', argumentos, { cwd, stdio: 'inherit' });
}

async function tamano(ruta) {
  const datos = await lstat(ruta);
  if (!datos.isDirectory()) return datos.size;
  let total = 0;
  for (const nombre of await readdir(ruta)) total += await tamano(join(ruta, nombre));
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

if (!values['sin-compilar']) npm(['run', 'build']);
for (const ruta of [...PAGINAS.map((p) => join(WEB_DIST, p)), join(SERVIDOR, 'dist', 'vercel.js')]) {
  if (!existsSync(ruta)) throw new Error(`Falta ${relative(RAIZ, ruta)}: ejecute npm run build.`);
}
const indice = resolve(values.indice);
if (!existsSync(indice)) {
  console.warn(`Aviso: no existe ${relative(RAIZ, indice)}; el Asistente ODES dirá que no tiene índice.`);
}

await rm(SALIDA, { recursive: true, force: true });

// 1. Archivos estáticos (CDN), sin las páginas HTML.
const ESTATICOS = join(SALIDA, 'static');
await cp(WEB_DIST, ESTATICOS, { recursive: true });
for (const pagina of PAGINAS) await rm(join(ESTATICOS, pagina), { force: true });
await rmdir(join(ESTATICOS, 'principal')).catch(() => undefined);

// 2. La función: la misma estructura de carpetas del proyecto, así las rutas
//    relativas del servidor (apps/web/dist, datos/odes) siguen valiendo.
const APP = join(FUNCION, 'apps', 'server');
await cp(join(SERVIDOR, 'dist'), join(APP, 'dist'), {
  recursive: true,
  filter: (origen) => !origen.endsWith('.d.ts') && !origen.endsWith('.tsbuildinfo'),
});
await writeFile(join(APP, 'package.json'), `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`);
for (const pagina of PAGINAS) {
  await mkdir(dirname(join(FUNCION, 'apps', 'web', 'dist', pagina)), { recursive: true });
  await cp(join(WEB_DIST, pagina), join(FUNCION, 'apps', 'web', 'dist', pagina));
}
if (existsSync(indice)) {
  await mkdir(join(APP, 'datos', 'odes'), { recursive: true });
  await cp(indice, join(APP, 'datos', 'odes', 'indice.sqlite'));
}

// Dependencias de producción, instaladas aparte con el package-lock.json.
const PREPARACION = join(RAIZ, '.vercel', 'preparacion-servidor');
await rm(PREPARACION, { recursive: true, force: true });
await mkdir(PREPARACION, { recursive: true });
await cp(join(SERVIDOR, 'package.json'), join(PREPARACION, 'package.json'));
await cp(join(SERVIDOR, 'package-lock.json'), join(PREPARACION, 'package-lock.json'));
npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], PREPARACION);
await cp(join(PREPARACION, 'node_modules'), join(APP, 'node_modules'), { recursive: true });
await rm(PREPARACION, { recursive: true, force: true });
// Los ejecutables (.bin, enlaces simbólicos) no hacen falta en la función.
await rm(join(APP, 'node_modules', '.bin'), { recursive: true, force: true });

await writeFile(
  join(FUNCION, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: values.runtime,
      handler: 'apps/server/dist/vercel.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      supportsResponseStreaming: true,
      maxDuration: 300,
    },
    null,
    2,
  )}\n`,
);

// 3. Rutas: cabeceras de los estáticos, luego el sistema de archivos y, si
//    no hay archivo, la función (que recibe la URL original).
await writeFile(
  join(SALIDA, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '^/assets/(.*)$',
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '^/(.*)$', headers: { 'x-content-type-options': 'nosniff' }, continue: true },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/servidor' },
      ],
    },
    null,
    2,
  )}\n`,
);

if (existsSync(join(APP, '.env')) || existsSync(join(FUNCION, '.env'))) {
  throw new Error('La función no puede llevar un .env (secretos): revise el script.');
}
// Las migraciones y los datos de carga (tableros, PAI) se usan solo desde una
// estación, con las CLI: nada en la función puede leerlos.
for (const carpeta of ['db', join('datos', 'tableros'), join('datos', 'pai')]) {
  if (existsSync(join(APP, carpeta))) {
    throw new Error(`La función no debe llevar apps/server/${carpeta}: revise el script.`);
  }
}
console.log(
  `Listo: .vercel/output (estáticos ${mb(await tamano(ESTATICOS))}, función ${mb(await tamano(FUNCION))}).`,
);
