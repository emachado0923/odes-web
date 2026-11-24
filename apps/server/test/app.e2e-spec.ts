import { createHash } from 'node:crypto';
import { chmod, utimes, writeFile } from 'node:fs/promises';
import { request as peticionHttp, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { cargarConfiguracion } from '../src/config/configuracion.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { MENSAJE_ERROR_INTERNO } from '../src/frontend/frontend.js';
import {
  BYTES_GLB,
  crearDistTemporal,
  HTML_INDEX,
  HTML_PRINCIPAL,
  JS_ASSET,
  SCRIPT_PRINCIPAL,
  SECRETO,
  type DistTemporal,
} from './dist-temporal.js';

/** Cabecera Accept de Chrome al navegar a una página. */
const ACCEPT_NAVEGADOR =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

async function crearApp(
  env: NodeJS.ProcessEnv,
): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = modulo.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configurarAplicacion(app, cargarConfiguracion(env));
  await app.init();
  return app;
}

/** chmod 000 no impide leer a root ni existe en Windows. */
const sinPermisosReales =
  process.platform === 'win32' || process.getuid?.() === 0;

/**
 * Ejecuta `accion` y devuelve los mensajes que llegaron a Logger.error (el
 * registro del front-end y el ExceptionsHandler de Nest usan Logger).
 */
async function erroresRegistrados(
  accion: () => Promise<unknown>,
): Promise<string[]> {
  const espia = vi.spyOn(Logger.prototype, 'error');
  try {
    await accion();
    return espia.mock.calls.map(([mensaje]) => String(mensaje));
  } finally {
    espia.mockRestore();
  }
}

/** Fuente CSP con el hash de un script en línea, calculada aparte del servidor. */
function fuenteHash(script: string): string {
  return `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
}

/** Una respuesta de error no hereda las cabeceras de caché del archivo. */
function expectErrorSinCache(res: Response): void {
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.etag).toBeUndefined();
  expect(res.headers['last-modified']).toBeUndefined();
  expect(res.headers['accept-ranges']).toBeUndefined();
  // Las cabeceras de seguridad de helmet se conservan.
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['content-security-policy']).toContain(
    "default-src 'self'",
  );
}

/** Parser de superagent que entrega el cuerpo crudo (Buffer) sin importar el tipo. */
function cuerpoCrudo(
  res: Response,
  listo: (error: Error | null, cuerpo: Buffer) => void,
): void {
  // En Node superagent entrega el IncomingMessage; sus tipos no lo reflejan.
  const flujo = res as unknown as NodeJS.ReadableStream;
  const partes: Buffer[] = [];
  flujo.on('data', (parte: Buffer) => partes.push(parte));
  flujo.on('end', () => listo(null, Buffer.concat(partes)));
}

function textoDe(res: Response): string {
  return Buffer.isBuffer(res.body)
    ? res.body.toString('utf8')
    : (res.text ?? '');
}

/**
 * Petición HTTP sin normalizar la ruta (fetch/supertest resuelven "/../" antes
 * de enviar; aquí el servidor recibe el path tal cual).
 */
function peticionCruda(
  servidor: Server,
  ruta: string,
): Promise<{ estado: number; cuerpo: string }> {
  const { port } = servidor.address() as AddressInfo;
  return new Promise((resolver, rechazar) => {
    const req = peticionHttp({ host: '127.0.0.1', port, path: ruta }, (res) => {
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () =>
        resolver({
          estado: res.statusCode ?? 0,
          cuerpo: Buffer.concat(partes).toString('utf8'),
        }),
      );
    });
    req.on('error', rechazar);
    req.end();
  });
}

describe('sapiencia-web (e2e)', () => {
  let dist: DistTemporal;

  beforeAll(async () => {
    dist = await crearDistTemporal();
  });

  afterAll(async () => {
    await dist.limpiar();
  });

  describe('con el front-end compilado', () => {
    let app: NestExpressApplication;
    let servidor: Server;

    beforeAll(async () => {
      app = await crearApp({ WEB_DIST_DIR: dist.directorio });
      servidor = app.getHttpServer() as Server;
      await new Promise<void>((listo) =>
        servidor.listen(0, '127.0.0.1', listo),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    describe('API', () => {
      it('GET /api/salud', async () => {
        const res = await request(servidor).get('/api/salud').expect(200);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toMatchObject({
          estado: 'ok',
          servicio: 'sapiencia-web',
        });
      });

      it('GET /api/sivu', async () => {
        const res = await request(servidor).get('/api/sivu').expect(200);
        expect(res.body).toEqual({
          sitio: 'sivu',
          nombre: 'Sistema de Visualización de Datos de Sapiencia',
        });
      });

      it('GET /api/odes', async () => {
        const res = await request(servidor).get('/api/odes').expect(200);
        expect(res.body).toEqual({ sitio: 'odes', nombre: 'Asistente ODES' });
      });

      it.each(['/api/nope', '/api', '/api/sivu/falta.glb'])(
        'GET %s -> 404 JSON de Nest',
        async (ruta) => {
          const res = await request(servidor).get(ruta).expect(404);
          expect(res.headers['content-type']).toMatch(/^application\/json/);
          expect(res.body).toMatchObject({ statusCode: 404 });
        },
      );
    });

    describe('fallback de la SPA', () => {
      it.each(['/', '/sivu', '/sivu/', '/sivu/a/b', '/odes', '/odes/x', '/pai', '/pai/admin/usuarios', '/pertinencia', '/crm', '/crm/lider'])(
        'GET %s -> index.html sin caché',
        async (ruta) => {
          const res = await request(servidor).get(ruta).expect(200);
          expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
          expect(res.headers['cache-control']).toBe('no-cache');
          expect(res.text).toBe(HTML_INDEX);
        },
      );

      it('HEAD /sivu -> 200 sin cuerpo', async () => {
        const res = await request(servidor).head('/sivu').expect(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.text ?? '').toBe('');
      });

      it('revalida index.html con ETag por contenido (304), sin Last-Modified', async () => {
        const primera = await request(servidor).get('/sivu').expect(200);
        const etag = primera.headers.etag;
        expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/);
        expect(primera.headers['last-modified']).toBeUndefined();
        await request(servidor)
          .get('/sivu/otra')
          .set('If-None-Match', etag)
          .expect(304);
      });

      it('un index.html nuevo con el mismo tamaño y la misma fecha (como en Vercel) se descarga de nuevo', async () => {
        const ruta = join(dist.directorio, 'index.html');
        // Otro build: los bundles cambian de hash, el tamaño no; Vercel fija la fecha.
        const nuevo = HTML_INDEX.replace('index-abc123.js', 'index-def456.js');
        expect(nuevo).not.toBe(HTML_INDEX);
        expect(Buffer.byteLength(nuevo)).toBe(Buffer.byteLength(HTML_INDEX));
        const fecha = new Date('2018-10-20T01:46:40Z');
        try {
          await utimes(ruta, fecha, fecha);
          const antes = await request(servidor).get('/sivu').expect(200);
          await writeFile(ruta, nuevo);
          await utimes(ruta, fecha, fecha);
          const despues = await request(servidor)
            .get('/sivu')
            .set('If-None-Match', antes.headers.etag)
            .set('If-Modified-Since', fecha.toUTCString())
            .expect(200);
          expect(despues.text).toBe(nuevo);
          expect(despues.headers.etag).not.toBe(antes.headers.etag);
        } finally {
          await writeFile(ruta, HTML_INDEX);
        }
      });

      it.each([
        '/sivu/falta.glb',
        '/sivu/falta%2Eglb',
        '/odes/logo.png',
        '/sivu/.env',
      ])(
        'GET %s (archivo con extensión que no existe) -> 404, nunca HTML',
        async (ruta) => {
          const res = await request(servidor).get(ruta).expect(404);
          expect(res.headers['content-type']).not.toMatch(/text\/html/);
        },
      );

      it.each([
        '/otra',
        '/otra-cosa/x',
        '/sivux',
        '/assets/no-existe.js',
        '/index',
      ])('GET %s -> 404 en texto plano', async (ruta) => {
        const res = await request(servidor).get(ruta).expect(404);
        expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
        expect(res.text).toBe('No encontrado\n');
      });

      it('POST /sivu no recibe index.html', async () => {
        const res = await request(servidor).post('/sivu').expect(404);
        expect(res.text).not.toContain('<html');
      });

      it('el index.html del tablero estático de la batería redirige (301) a su ruta en la SPA', async () => {
        const res = await request(servidor)
          .get('/tableros/bateria-indicadores/index.html')
          .set('Accept', ACCEPT_NAVEGADOR)
          .expect(301);
        expect(res.headers.location).toBe('/tableros/bateria-indicadores');
        await request(servidor)
          .get('/tableros/bateria-indicadores/sa-fondo-epm?v=comunas')
          .expect(200)
          .expect((r) => expect(r.text).toBe(HTML_INDEX));
      });

      it.each(['/otra', '/otra-cosa/x', '/sivux', '/index'])(
        'un navegador que abre %s recibe index.html con estado 404 (página 404 de React)',
        async (ruta) => {
          const res = await request(servidor)
            .get(ruta)
            .set('Accept', ACCEPT_NAVEGADOR)
            .expect(404);
          expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
          expect(res.headers['cache-control']).toBe('no-store');
          expect(res.text).toBe(HTML_INDEX);
        },
      );

      it.each([
        ['GET', '/sivu/falta.glb'],
        ['GET', '/otra/logo.png'],
        ['GET', '/..%2fpackage.json'],
        ['POST', '/otra'],
      ])(
        'con Accept text/html, %s %s sigue siendo 404 en texto plano',
        async (metodo, ruta) => {
          const peticion =
            metodo === 'POST'
              ? request(servidor).post(ruta)
              : request(servidor).get(ruta);
          const res = await peticion
            .set('Accept', ACCEPT_NAVEGADOR)
            .expect(404);
          expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
          expect(res.text).toBe('No encontrado\n');
        },
      );
    });

    describe('archivos estáticos', () => {
      it('GET /assets/index-abc123.js -> caché inmutable y comprimido', async () => {
        const res = await request(servidor)
          .get('/assets/index-abc123.js')
          .set('Accept-Encoding', 'gzip')
          .expect(200);
        expect(res.headers['cache-control']).toBe(
          'public, max-age=31536000, immutable',
        );
        expect(res.headers['content-type']).toMatch(/^text\/javascript/);
        expect(res.headers['content-encoding']).toBe('gzip');
      });

      it('GET /sivu/edificiofinal.glb -> model/gltf-binary, revalidable, sin gzip', async () => {
        const res = await request(servidor)
          .get('/sivu/edificiofinal.glb')
          .set('Accept-Encoding', 'gzip')
          .buffer(true)
          .parse(cuerpoCrudo)
          .expect(200);
        expect(res.headers['content-type']).toBe('model/gltf-binary');
        expect(res.headers['cache-control']).toBe('public, no-cache');
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.headers['content-length']).toBe(String(BYTES_GLB.length));
        expect(res.headers['last-modified']).toBeTruthy();
        expect(Buffer.compare(res.body as Buffer, BYTES_GLB)).toBe(0);

        await request(servidor)
          .get('/sivu/edificiofinal.glb')
          .set('If-None-Match', res.headers.etag)
          .expect(304);
      });

      it('GET /sivu/draco/draco_decoder.wasm -> application/wasm', async () => {
        const res = await request(servidor)
          .get('/sivu/draco/draco_decoder.wasm')
          .buffer(true)
          .parse(cuerpoCrudo)
          .expect(200);
        expect(res.headers['content-type']).toBe('application/wasm');
        expect(res.headers['cache-control']).toBe('public, no-cache');
      });

      it('el ETag del .glb depende del contenido: un build nuevo con el mismo archivo responde 304', async () => {
        const ruta = join(dist.directorio, 'sivu', 'edificiofinal.glb');
        const antes = await request(servidor)
          .head('/sivu/edificiofinal.glb')
          .expect(200);
        expect(antes.headers.etag).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/);

        // Vite y copiar-draco.mjs copian public/ sin conservar la fecha.
        const despues = new Date(Date.now() + 60_000);
        await utimes(ruta, despues, despues);
        const revalidada = await request(servidor)
          .get('/sivu/edificiofinal.glb')
          .set('If-None-Match', antes.headers.etag)
          .set('If-Modified-Since', antes.headers['last-modified'])
          .expect(304);
        expect(revalidada.headers.etag).toBe(antes.headers.etag);
      });

      it('si cambia el contenido de un archivo sin hash, cambia su ETag y se descarga de nuevo', async () => {
        const ruta = join(dist.directorio, 'sivu', 'prueba-etag.bin');
        await writeFile(ruta, 'version-1');
        const primera = await request(servidor)
          .get('/sivu/prueba-etag.bin')
          .buffer(true)
          .parse(cuerpoCrudo)
          .expect(200);

        await writeFile(ruta, 'version-2'); // mismo tamaño
        const despues = new Date(Date.now() + 120_000);
        await utimes(ruta, despues, despues);
        const segunda = await request(servidor)
          .get('/sivu/prueba-etag.bin')
          .set('If-None-Match', primera.headers.etag)
          .buffer(true)
          .parse(cuerpoCrudo)
          .expect(200);
        expect(segunda.headers.etag).not.toBe(primera.headers.etag);
        expect((segunda.body as Buffer).toString()).toBe('version-2');
      });

      it('una carpeta de dist sin barra final no redirige: /sivu/draco -> SPA', async () => {
        const res = await request(servidor).get('/sivu/draco').expect(200);
        expect(res.text).toBe(HTML_INDEX);
      });
    });

    describe('errores del cliente al pedir archivos (412/416)', () => {
      it('If-Match sobre /assets/* -> 412 en texto plano, sin caché inmutable y sin registrar', async () => {
        let res: Response | undefined;
        const errores = await erroresRegistrados(async () => {
          res = await request(servidor)
            .get('/assets/index-abc123.js')
            .set('If-Match', '"x"')
            .expect(412);
        });
        expectErrorSinCache(res!);
        expect(res!.headers['cache-control']).not.toContain('immutable');
        expect(res!.text).toBe('Precondition Failed\n');
        expect(errores).toEqual([]);
      });

      it.each([
        ['/sivu', Buffer.byteLength(HTML_INDEX)],
        ['/sivu/edificiofinal.glb', BYTES_GLB.length],
        ['/assets/index-abc123.js', Buffer.byteLength(JS_ASSET)],
      ])(
        'Range fuera del archivo en %s -> 416 en texto plano con Content-Range y sin registrar',
        async (ruta, tamano) => {
          let res: Response | undefined;
          const errores = await erroresRegistrados(async () => {
            res = await request(servidor)
              .get(ruta)
              .set('Range', 'bytes=99999999-')
              .expect(416);
          });
          expectErrorSinCache(res!);
          expect(res!.headers['content-range']).toBe(`bytes */${tamano}`);
          expect(res!.text).toBe('Range Not Satisfiable\n');
          expect(errores).toEqual([]);
        },
      );

      it('If-Match sobre una ruta de la SPA -> 412 en texto plano y sin registrar', async () => {
        let res: Response | undefined;
        const errores = await erroresRegistrados(async () => {
          res = await request(servidor)
            .get('/sivu/x')
            .set('If-Match', '"nope"')
            .expect(412);
        });
        expectErrorSinCache(res!);
        expect(errores).toEqual([]);
      });
    });

    describe('cabeceras de seguridad', () => {
      it('CSP explícita para three.js + Draco', async () => {
        const res = await request(servidor).get('/sivu').expect(200);
        const csp = String(res.headers['content-security-policy']);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
        expect(csp).toContain("worker-src 'self' blob:");
        expect(csp).toContain("img-src 'self' data: blob:");
        expect(csp).toContain("connect-src 'self' blob: data:");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'self'");
        expect(csp).not.toContain('upgrade-insecure-requests');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-powered-by']).toBeUndefined();
      });

      it('la API también lleva las cabeceras', async () => {
        const res = await request(servidor).get('/api/sivu').expect(200);
        expect(res.headers['content-security-policy']).toContain(
          "'wasm-unsafe-eval'",
        );
      });
    });

    describe('página principal (/principal)', () => {
      const HASH_SCRIPT = fuenteHash(SCRIPT_PRINCIPAL);

      it.each([
        '/principal',
        '/principal/',
        '/principal/index.html',
        '/PRINCIPAL',
      ])('GET %s -> la página tal cual, revalidable', async (ruta) => {
        const res = await request(servidor).get(ruta).expect(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.text).toBe(HTML_PRINCIPAL);
      });

      it('su CSP es la del sitio con script-src por hash: sin unsafe-inline ni wasm-unsafe-eval', async () => {
        const sitio = String(
          (await request(servidor).get('/sivu').expect(200)).headers[
            'content-security-policy'
          ],
        );
        const res = await request(servidor).get('/principal').expect(200);
        const csp = String(res.headers['content-security-policy']);
        // Solo el script ejecutable: ni el del comentario ni los datos JSON.
        expect(csp.split(';').find((d) => d.startsWith('script-src '))).toBe(
          `script-src 'self' ${HASH_SCRIPT}`,
        );
        expect(csp).toBe(
          sitio.replace(
            "script-src 'self' 'wasm-unsafe-eval'",
            `script-src 'self' ${HASH_SCRIPT}`,
          ),
        );
        expect(csp).toContain("script-src-attr 'none'");
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });

      it('HEAD /principal -> 200 sin cuerpo', async () => {
        const res = await request(servidor).head('/principal').expect(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.text ?? '').toBe('');
      });

      it('revalida con ETag (304)', async () => {
        const primera = await request(servidor).get('/principal').expect(200);
        const etag = primera.headers.etag;
        expect(etag).toBeTruthy();
        await request(servidor)
          .get('/principal/')
          .set('If-None-Match', etag)
          .expect(304);
      });

      it('se comprime', async () => {
        const res = await request(servidor)
          .get('/principal')
          .set('Accept-Encoding', 'gzip')
          .expect(200);
        expect(res.headers['content-encoding']).toBe('gzip');
      });

      it('con un build nuevo sirve el archivo nuevo y recalcula el hash, sin reiniciar', async () => {
        const archivo = join(dist.directorio, 'principal', 'index.html');
        const otroScript = 'otraVersion();';
        try {
          await writeFile(
            archivo,
            HTML_PRINCIPAL.replace(SCRIPT_PRINCIPAL, otroScript),
          );
          const res = await request(servidor).get('/principal').expect(200);
          expect(res.text).toContain(`<script>${otroScript}</script>`);
          const csp = String(res.headers['content-security-policy']);
          expect(csp).toContain(`script-src 'self' ${fuenteHash(otroScript)}`);
          expect(csp).not.toContain(HASH_SCRIPT);
        } finally {
          await writeFile(archivo, HTML_PRINCIPAL);
        }
        const res = await request(servidor).get('/principal').expect(200);
        expect(res.text).toBe(HTML_PRINCIPAL);
      });

      it.each(['/principal/otra', '/principales', '/principal.html'])(
        'GET %s -> 404 en texto plano',
        async (ruta) => {
          const res = await request(servidor).get(ruta).expect(404);
          expect(res.text).toBe('No encontrado\n');
        },
      );

      it('POST /principal no recibe la página', async () => {
        const res = await request(servidor).post('/principal').expect(404);
        expect(res.text).not.toContain('<html');
      });
    });

    describe('path traversal', () => {
      it.each([
        '/sivu/..%2f..%2fpackage.json',
        '/sivu/..%2f..%2f..%2fpackage.json',
        '/assets/..%2f..%2f..%2fpackage.json',
        '/assets/..%2f..%2fpackage.json',
        '/..%2fpackage.json',
        '/%2e%2e%2fpackage.json',
        '/sivu/%2e%2e/%2e%2e/package.json',
        '/sivu/..%5c..%5cpackage.json',
        '/.oculto',
      ])('GET %s no expone archivos fuera de dist', async (ruta) => {
        const res = await request(servidor)
          .get(ruta)
          .buffer(true)
          .parse(cuerpoCrudo);
        expect(textoDe(res)).not.toContain(SECRETO);
        expect([400, 403, 404]).toContain(res.status);
      });

      it.each([
        '/sivu/../../package.json',
        '/assets/../../../package.json',
        '/../package.json',
        '/sivu/../../../package.json',
      ])(
        'ruta sin normalizar %s no expone archivos fuera de dist',
        async (ruta) => {
          const { estado, cuerpo } = await peticionCruda(servidor, ruta);
          expect(cuerpo).not.toContain(SECRETO);
          expect(estado).not.toBe(200);
        },
      );
    });
  });

  describe.skipIf(sinPermisosReales)(
    'con archivos ilegibles (permisos mal puestos en el despliegue)',
    () => {
      let distIlegible: DistTemporal;
      let app: NestExpressApplication;

      beforeAll(async () => {
        distIlegible = await crearDistTemporal();
        for (const archivo of ['index.html', 'assets/index-abc123.js']) {
          await chmod(join(distIlegible.directorio, archivo), 0o000);
        }
        app = await crearApp({ WEB_DIST_DIR: distIlegible.directorio });
      });

      afterAll(async () => {
        await app.close();
        await distIlegible.limpiar();
      });

      it.each([
        ['/assets/index-abc123.js', '*/*'],
        ['/sivu', '*/*'],
        ['/otra', ACCEPT_NAVEGADOR],
      ])(
        'GET %s -> 500 genérico, sin caché, sin la ruta del disco; el detalle va al log',
        async (ruta, accept) => {
          let res: Response | undefined;
          const errores = await erroresRegistrados(async () => {
            res = await request(app.getHttpServer())
              .get(ruta)
              .set('Accept', accept)
              .expect(500);
          });
          expectErrorSinCache(res!);
          expect(res!.text).toBe(MENSAJE_ERROR_INTERNO);
          expect(res!.text).not.toContain(distIlegible.directorio);
          expect(res!.text).not.toContain('EACCES');
          // Una sola línea, del registro del front-end (no el JSON de Nest).
          expect(errores).toHaveLength(1);
          expect(errores[0]).toContain('EACCES');
          expect(errores[0]).toContain(`GET ${ruta}`);
        },
      );

      it('GET /api/salud sigue respondiendo 200', async () => {
        await request(app.getHttpServer()).get('/api/salud').expect(200);
      });
    },
  );

  describe('con CSP_FRAME_ANCESTORS que permite otro origen', () => {
    it('desactiva X-Frame-Options y lo declara en frame-ancestors', async () => {
      const app = await crearApp({
        WEB_DIST_DIR: dist.directorio,
        CSP_FRAME_ANCESTORS: "'self' https://www.sapiencia.gov.co",
      });
      try {
        const res = await request(app.getHttpServer()).get('/sivu').expect(200);
        expect(res.headers['content-security-policy']).toContain(
          "frame-ancestors 'self' https://www.sapiencia.gov.co",
        );
        expect(res.headers['x-frame-options']).toBeUndefined();
      } finally {
        await app.close();
      }
    });
  });

  describe('sin build del front-end (modo desarrollo)', () => {
    let app: NestExpressApplication;
    let avisosDeArranque: string[] = [];

    beforeAll(async () => {
      // vitest limpia los mocks antes de cada test (clearMocks): se copian aquí.
      const advertencia = vi.spyOn(Logger.prototype, 'warn');
      try {
        app = await crearApp({ WEB_DIST_DIR: dist.directorioVacio });
        avisosDeArranque = advertencia.mock.calls
          .map(([mensaje]) => String(mensaje))
          .filter((mensaje) => mensaje.includes('index.html'));
      } finally {
        advertencia.mockRestore();
      }
    });

    afterAll(async () => {
      await app.close();
    });

    it('avisa una sola vez al arrancar', () => {
      expect(avisosDeArranque).toHaveLength(1);
      expect(avisosDeArranque[0]).toContain('http://localhost:5173');
    });

    it.each(['/', '/sivu', '/sivu/a/b', '/odes', '/pai'])(
      'GET %s -> 503 con indicaciones',
      async (ruta) => {
        const res = await request(app.getHttpServer()).get(ruta).expect(503);
        expect(res.headers['content-type']).toMatch(/^text\/plain/);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.text).toContain('http://localhost:5173');
      },
    );

    it('GET /principal -> 503 con indicaciones', async () => {
      const res = await request(app.getHttpServer())
        .get('/principal')
        .expect(503);
      expect(res.headers['content-type']).toMatch(/^text\/plain/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toContain('http://localhost:5173/principal');
    });

    it('GET /api/salud sigue respondiendo 200', async () => {
      await request(app.getHttpServer()).get('/api/salud').expect(200);
    });

    it('GET /sivu/falta.glb sigue siendo 404', async () => {
      await request(app.getHttpServer()).get('/sivu/falta.glb').expect(404);
    });

    it('un navegador en /otra recibe 404 en texto plano (no 503)', async () => {
      const res = await request(app.getHttpServer())
        .get('/otra')
        .set('Accept', ACCEPT_NAVEGADOR)
        .expect(404);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.text).toBe('No encontrado\n');
    });
  });

  describe('con un build anterior a /principal (sin principal/index.html)', () => {
    let app: NestExpressApplication;
    let avisosDeArranque: string[] = [];

    beforeAll(async () => {
      const advertencia = vi.spyOn(Logger.prototype, 'warn');
      try {
        app = await crearApp({ WEB_DIST_DIR: dist.directorioSinPrincipal });
        // Otros módulos también avisan al arrancar (ODES, repositorio).
        avisosDeArranque = advertencia.mock.calls
          .map(([mensaje]) => String(mensaje))
          .filter((mensaje) => mensaje.includes('index.html'));
      } finally {
        advertencia.mockRestore();
      }
    });

    afterAll(async () => {
      await app.close();
    });

    it('avisa al arrancar que falta la página principal', () => {
      expect(avisosDeArranque).toHaveLength(1);
      expect(avisosDeArranque[0]).toContain('/principal');
    });

    it('GET /principal -> 503 con indicaciones y la SPA sigue respondiendo', async () => {
      const res = await request(app.getHttpServer())
        .get('/principal')
        .expect(503);
      expect(res.text).toContain('npm run build');
      const spa = await request(app.getHttpServer()).get('/sivu').expect(200);
      expect(spa.text).toBe(HTML_INDEX);
    });
  });
});
