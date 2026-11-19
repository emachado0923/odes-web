import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cargarArchivoEnv,
  cargarConfiguracion,
  DIRECTORIO_WEB_POR_DEFECTO,
  ErrorDeConfiguracion,
  RAIZ_SERVIDOR,
} from './configuracion.js';

describe('cargarConfiguracion', () => {
  it('usa valores por defecto con un entorno vacío', () => {
    const config = cargarConfiguracion({});
    expect(config).toEqual({
      entorno: 'development',
      puerto: 3000,
      host: '0.0.0.0',
      directorioWeb: DIRECTORIO_WEB_POR_DEFECTO,
      cspFrameAncestors: ["'self'"],
      trustProxy: false,
      origenesArchivos: [],
    });
  });

  it('toma el origen de REPOSITORIO_SUPABASE_URL para la CSP (sin ruta ni barra)', () => {
    expect(
      cargarConfiguracion({ REPOSITORIO_SUPABASE_URL: 'https://abcd.supabase.co/' }).origenesArchivos,
    ).toEqual(['https://abcd.supabase.co']);
    expect(cargarConfiguracion({ REPOSITORIO_SUPABASE_URL: 'no es url' }).origenesArchivos).toEqual([]);
  });

  it('el directorio web por defecto es apps/web/dist', () => {
    expect(RAIZ_SERVIDOR.endsWith(resolve('/', 'apps', 'server'))).toBe(true);
    expect(DIRECTORIO_WEB_POR_DEFECTO).toBe(
      resolve(RAIZ_SERVIDOR, '..', 'web', 'dist'),
    );
  });

  it('lee PORT, HOST y NODE_ENV', () => {
    const config = cargarConfiguracion({
      PORT: '8080',
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
    });
    expect(config.puerto).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.entorno).toBe('production');
  });

  it.each(['abc', '-1', '70000', '3.5'])('rechaza PORT=%s', (valor) => {
    expect(() => cargarConfiguracion({ PORT: valor })).toThrow(
      ErrorDeConfiguracion,
    );
  });

  it('resuelve WEB_DIST_DIR relativo contra la raíz de apps/server', () => {
    expect(
      cargarConfiguracion({ WEB_DIST_DIR: '../web/dist' }).directorioWeb,
    ).toBe(DIRECTORIO_WEB_POR_DEFECTO);
    expect(
      cargarConfiguracion({ WEB_DIST_DIR: '/srv/web' }).directorioWeb,
    ).toBe(resolve('/srv/web'));
  });

  it('separa CSP_FRAME_ANCESTORS por espacios o comas', () => {
    expect(
      cargarConfiguracion({
        CSP_FRAME_ANCESTORS:
          "'self'  https://www.sapiencia.gov.co,https://b.co",
      }).cspFrameAncestors,
    ).toEqual(["'self'", 'https://www.sapiencia.gov.co', 'https://b.co']);
  });

  it('cita self/none cuando llegan sin comillas (archivo .env)', () => {
    expect(
      cargarConfiguracion({ CSP_FRAME_ANCESTORS: 'self' }).cspFrameAncestors,
    ).toEqual(["'self'"]);
    expect(
      cargarConfiguracion({ CSP_FRAME_ANCESTORS: 'NONE' }).cspFrameAncestors,
    ).toEqual(["'none'"]);
  });

  it.each([
    "'self'; script-src *",
    "'self'\nx",
    "'none' 'self'",
    // Comillas tipográficas copiadas de un documento: harían fallar
    // setHeader (ERR_INVALID_CHAR) en cada petición.
    '\u2018self\u2019 https://www.sapiencia.gov.co',
    // Dominios no ASCII: deben ir en punycode.
    'https://\u0442\u0435\u0441\u0442.\u0440\u0444',
    'https://caf\u00e9.gov.co',
    // Entre comillas solo van 'self' y 'none'.
    "'slef'",
    "'unsafe-inline'",
    "'self https://www.sapiencia.gov.co'",
    `"'self'"`,
  ])('rechaza CSP_FRAME_ANCESTORS=%j', (valor) => {
    expect(() => cargarConfiguracion({ CSP_FRAME_ANCESTORS: valor })).toThrow(
      ErrorDeConfiguracion,
    );
  });

  it('el error de una comilla tipográfica explica cómo corregirlo', () => {
    expect(() =>
      cargarConfiguracion({ CSP_FRAME_ANCESTORS: '\u2018self\u2019' }),
    ).toThrow(/comillas rectas.*punycode/s);
  });

  it.each([
    ['https://xn--e1aybc.xn--p1ai', ['https://xn--e1aybc.xn--p1ai']],
    ['https://*.sapiencia.gov.co', ['https://*.sapiencia.gov.co']],
    ['http://localhost:8080 https:', ['http://localhost:8080', 'https:']],
    ["'SELF' https://b.co", ["'self'", 'https://b.co']],
    ["'none'", ["'none'"]],
  ])('acepta CSP_FRAME_ANCESTORS=%j', (valor, esperado) => {
    expect(
      cargarConfiguracion({ CSP_FRAME_ANCESTORS: valor }).cspFrameAncestors,
    ).toEqual(esperado);
  });

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true],
    ['1', 1],
    ['loopback', 'loopback'],
    ['10.0.0.0/8, 127.0.0.1', '10.0.0.0/8, 127.0.0.1'],
  ])('TRUST_PROXY=%j -> %j', (valor, esperado) => {
    expect(cargarConfiguracion({ TRUST_PROXY: valor }).trustProxy).toBe(
      esperado,
    );
  });
});

describe('cargarArchivoEnv', () => {
  it('sin archivo no hace nada', () => {
    expect(() => cargarArchivoEnv(join(tmpdir(), 'no-existe-sapiencia-web', '.env'))).not.toThrow();
  });

  it.skipIf(process.getuid?.() === 0)(
    'un .env que existe pero no se puede leer da un mensaje claro (no el ENOENT de Node)',
    () => {
      const carpeta = mkdtempSync(join(tmpdir(), 'sapiencia-env-'));
      const ruta = join(carpeta, '.env');
      try {
        writeFileSync(ruta, 'SAPIENCIA_PRUEBA_ENV=1\n');
        chmodSync(ruta, 0o000);
        expect(() => cargarArchivoEnv(ruta)).toThrow(ErrorDeConfiguracion);
        expect(() => cargarArchivoEnv(ruta)).toThrow(/no lo puede leer.*sudo -u sapiencia/);
        expect(process.env.SAPIENCIA_PRUEBA_ENV).toBeUndefined();
      } finally {
        rmSync(carpeta, { recursive: true, force: true });
      }
    },
  );
});
