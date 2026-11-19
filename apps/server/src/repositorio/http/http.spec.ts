import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { nombreDescarga } from '../api-repositorio.js';
import { codificarRfc8187, contentDisposition, nombreAscii } from './cabeceras.js';
import { esMismoSitio, esMutacion, ipCliente, leerCookie } from './peticion.js';
import {
  coincideIfNoneMatch,
  interpretarRango,
  noModificado,
  rangoAplicable,
} from './rango.js';

describe('Range (un solo rango)', () => {
  const T = 1000;
  it.each([
    [undefined, { tipo: 'completo' }],
    ['bytes=0-99', { tipo: 'parcial', inicio: 0, fin: 99 }],
    ['bytes=500-', { tipo: 'parcial', inicio: 500, fin: 999 }],
    ['bytes=-100', { tipo: 'parcial', inicio: 900, fin: 999 }],
    ['bytes=-5000', { tipo: 'parcial', inicio: 0, fin: 999 }],
    ['bytes=990-2000', { tipo: 'parcial', inicio: 990, fin: 999 }],
    ['BYTES = 10 - 19', { tipo: 'parcial', inicio: 10, fin: 19 }],
    ['bytes=999-999', { tipo: 'parcial', inicio: 999, fin: 999 }],
    ['bytes=1000-', { tipo: 'no_satisfacible' }],
    ['bytes=5000-6000', { tipo: 'no_satisfacible' }],
    ['bytes=-0', { tipo: 'no_satisfacible' }],
    ['bytes=99999999999999999999-', { tipo: 'no_satisfacible' }],
    // Se ignoran (respuesta completa): mal formados, al revés, varios, otra unidad.
    ['bytes=20-10', { tipo: 'completo' }],
    ['bytes=-', { tipo: 'completo' }],
    ['bytes=a-b', { tipo: 'completo' }],
    ['bytes=0-1,5-6', { tipo: 'completo' }],
    ['items=0-1', { tipo: 'completo' }],
  ])('%j', (cabecera, esperado) => {
    expect(interpretarRango(cabecera, T)).toEqual(esperado);
  });

  it('un archivo vacío no tiene rangos satisfacibles', () => {
    expect(interpretarRango('bytes=0-', 0)).toEqual({ tipo: 'no_satisfacible' });
    expect(interpretarRango('bytes=-1', 0)).toEqual({ tipo: 'no_satisfacible' });
  });
});

describe('peticiones condicionales', () => {
  const etag = '"abc123"';
  const fecha = new Date('2026-10-08T07:36:01.456Z');

  it('If-None-Match con comparación débil, lista y *', () => {
    expect(coincideIfNoneMatch('"abc123"', etag)).toBe(true);
    expect(coincideIfNoneMatch('W/"abc123"', etag)).toBe(true);
    expect(coincideIfNoneMatch('"x", "abc123"', etag)).toBe(true);
    expect(coincideIfNoneMatch('*', etag)).toBe(true);
    expect(coincideIfNoneMatch('"otro"', etag)).toBe(false);
    expect(coincideIfNoneMatch(undefined, etag)).toBe(false);
  });

  it('If-None-Match manda sobre If-Modified-Since', () => {
    const despues = new Date(fecha.getTime() + 60_000).toUTCString();
    expect(noModificado({ ifNoneMatch: '"otro"', ifModifiedSince: despues }, etag, fecha)).toBe(false);
    expect(noModificado({ ifModifiedSince: despues }, etag, fecha)).toBe(true);
    expect(noModificado({ ifModifiedSince: fecha.toUTCString() }, etag, fecha)).toBe(true);
    expect(noModificado({ ifModifiedSince: 'basura' }, etag, fecha)).toBe(false);
    expect(noModificado({}, etag, fecha)).toBe(false);
  });

  it('If-Range: ETag fuerte exacto o la fecha exacta', () => {
    expect(rangoAplicable(undefined, etag, fecha)).toBe(true);
    expect(rangoAplicable('"abc123"', etag, fecha)).toBe(true);
    expect(rangoAplicable('W/"abc123"', etag, fecha)).toBe(false);
    expect(rangoAplicable('"otro"', etag, fecha)).toBe(false);
    expect(rangoAplicable(fecha.toUTCString(), etag, fecha)).toBe(true);
    expect(rangoAplicable(new Date(fecha.getTime() - 5000).toUTCString(), etag, fecha)).toBe(false);
  });
});

describe('nombres de descarga', () => {
  it('ejemplo del encargo', () => {
    expect(
      nombreDescarga({ categoria: 'Boletín', numero: '19', titulo: 'Fe de erratas del Boletín N.º 19' }, 'pdf'),
    ).toBe('Boletín 19 - Fe de erratas del Boletín N.º 19.pdf');
  });

  it('sin número, sin caracteres prohibidos y hasta 120 caracteres', () => {
    expect(nombreDescarga({ categoria: 'Estudio', numero: null, titulo: 'A: b / c? "d" <e>|f*' }, '.docx')).toBe(
      'Estudio - A b c d e f.docx',
    );
    const largo = nombreDescarga({ categoria: 'Infografía', numero: null, titulo: 'palabra '.repeat(40) }, 'png');
    expect(largo.length).toBeLessThanOrEqual(124);
    expect(largo.endsWith('.png')).toBe(true);
  });

  it('Content-Disposition con filename* en UTF-8 y respaldo ASCII', () => {
    const nombre = 'Boletín 19 - Fe de erratas del Boletín N.º 19.pdf';
    expect(nombreAscii(nombre)).toBe('Boletin 19 - Fe de erratas del Boletin N.o 19.pdf');
    expect(contentDisposition('attachment', nombre)).toBe(
      'attachment; filename="Boletin 19 - Fe de erratas del Boletin N.o 19.pdf"; ' +
        "filename*=UTF-8''Bolet%C3%ADn%2019%20-%20Fe%20de%20erratas%20del%20Bolet%C3%ADn%20N.%C2%BA%2019.pdf",
    );
    expect(codificarRfc8187("a'(b)*!")).toBe('a%27%28b%29%2A!');
    expect(nombreAscii('数据 "x"\\y;z')).toBe('__ _x__y,z');
    expect(nombreAscii('')).toBe('documento');
  });
});

function peticion(cabeceras: Record<string, string>): Pick<Request, 'get'> {
  const minusculas = Object.fromEntries(Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: ((nombre: string) => minusculas[nombre.toLowerCase()]) as Request['get'] };
}

describe('utilidades de la petición', () => {
  it('lee cookies', () => {
    expect(leerCookie('a=1; repositorio_sesion=abc%2Ddef; b=2', 'repositorio_sesion')).toBe('abc-def');
    expect(leerCookie('repositorio_sesion="xyz"', 'repositorio_sesion')).toBe('xyz');
    expect(leerCookie('otra=1', 'repositorio_sesion')).toBeUndefined();
    expect(leerCookie(undefined, 'x')).toBeUndefined();
  });

  it.each([
    [{ 'Sec-Fetch-Site': 'same-origin' }, true],
    [{ 'Sec-Fetch-Site': 'none' }, true],
    [{ 'Sec-Fetch-Site': 'same-site' }, false],
    [{ 'Sec-Fetch-Site': 'cross-site', Origin: 'http://localhost:3000', Host: 'localhost:3000' }, false],
    [{ Origin: 'http://localhost:3000', Host: 'localhost:3000' }, true],
    [{ Origin: 'https://sapiencia.gov.co', Host: 'sapiencia.gov.co:443' }, true],
    [{ Origin: 'https://otro.com', Host: 'sapiencia.gov.co' }, false],
    [{ Origin: 'null', Host: 'sapiencia.gov.co' }, false],
    [{}, true],
  ])('mismo sitio %j -> %j', (cabeceras, esperado) => {
    expect(esMismoSitio(peticion(cabeceras))).toBe(esperado);
  });

  it('IP sin prefijo IPv6 de IPv4 y métodos que cambian algo', () => {
    expect(ipCliente({ ip: '::ffff:10.1.2.3', socket: undefined as never })).toBe('10.1.2.3');
    expect(ipCliente({ ip: '2001:db8::1', socket: undefined as never })).toBe('2001:db8::1');
    expect(esMutacion('GET')).toBe(false);
    expect(esMutacion('head')).toBe(false);
    expect(esMutacion('DELETE')).toBe(true);
  });
});
