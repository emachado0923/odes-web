import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  conScriptSrc,
  esRutaPrincipal,
  hashesDeScriptsEnLinea,
} from './pagina-principal.js';

/** Fuente CSP de un script en línea, calculada aparte para comparar. */
function fuente(texto: string): string {
  return `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`;
}

describe('rutas de la página principal', () => {
  it.each([
    '/principal',
    '/principal/',
    '/principal/index.html',
    '/PRINCIPAL',
    '/Principal/Index.html',
  ])('%s es la página principal', (ruta) => {
    expect(esRutaPrincipal(ruta)).toBe(true);
  });

  it.each([
    '/principales',
    '/principal/otra',
    '/principal/index.htm',
    '/principal/index.html/',
    '/principal.html',
    '/sivu/principal',
    '/',
    '',
  ])('%j no es la página principal', (ruta) => {
    expect(esRutaPrincipal(ruta)).toBe(false);
  });
});

describe('hashesDeScriptsEnLinea', () => {
  it('da el hash de cada script en línea ejecutable', () => {
    const html =
      '<p>x</p><script>uno();</script>' +
      '<script type="module">dos();</script>' +
      "<script type='text/javascript'>tres();</script>" +
      '<SCRIPT TYPE="Text/JavaScript">cuatro();</SCRIPT>';
    expect(hashesDeScriptsEnLinea(html)).toEqual([
      fuente('uno();'),
      fuente('dos();'),
      fuente('tres();'),
      fuente('cuatro();'),
    ]);
  });

  it('omite los datos (JSON) y los scripts con src', () => {
    const html =
      '<script type="application/json" data-odes-mapa-datos>{"a":1}</script>' +
      '<script type="application/ld+json">{}</script>' +
      '<script src="/assets/a.js"></script>' +
      '<script type="module" src="/assets/b.js">ignorado()</script>' +
      '<script data-src="x">conDataSrc();</script>';
    expect(hashesDeScriptsEnLinea(html)).toEqual([fuente('conDataSrc();')]);
  });

  it('no cuenta un <script> escrito dentro de un comentario', () => {
    const html =
      '<!-- ejemplo: <script>noSeEjecuta()</script> y otro <script sin cerrar -->' +
      '<script>siSeEjecuta();</script>';
    expect(hashesDeScriptsEnLinea(html)).toEqual([fuente('siSeEjecuta();')]);
  });

  it('normaliza los saltos de línea como el navegador (CRLF y CR -> LF)', () => {
    expect(
      hashesDeScriptsEnLinea('<script>a();\r\nb();\rc();</script>'),
    ).toEqual([fuente('a();\nb();\nc();')]);
  });

  it('respeta atributos con ">" entre comillas, scripts vacíos y repetidos', () => {
    const html =
      '<script data-nota="a > b">x();</script>' +
      '<script></script>' +
      '<script>x();</script>';
    expect(hashesDeScriptsEnLinea(html)).toEqual([fuente('x();'), fuente('')]);
  });

  it('cuenta caracteres de varios bytes como UTF-8', () => {
    expect(
      hashesDeScriptsEnLinea('<script>var t = "Educación · 2026";</script>'),
    ).toEqual([fuente('var t = "Educación · 2026";')]);
  });

  it('sin scripts en línea devuelve una lista vacía', () => {
    expect(hashesDeScriptsEnLinea('<p>Hola</p>')).toEqual([]);
  });
});

describe('conScriptSrc', () => {
  const csp =
    "default-src 'self';script-src 'self' 'wasm-unsafe-eval';script-src-attr 'none';frame-ancestors 'self'";

  it('reemplaza solo script-src y deja el resto igual y en su orden', () => {
    expect(conScriptSrc(csp, ["'self'", "'sha256-abc='"])).toBe(
      "default-src 'self';script-src 'self' 'sha256-abc=';script-src-attr 'none';frame-ancestors 'self'",
    );
  });

  it('agrega script-src si la política no lo tenía', () => {
    expect(conScriptSrc("default-src 'self'", ["'self'"])).toBe(
      "default-src 'self';script-src 'self'",
    );
  });
});
