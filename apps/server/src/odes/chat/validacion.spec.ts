import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_CONVERSACION, origenPermitido, validarSolicitud } from './validacion.js';

const u = (texto: string) => ({ rol: 'usuario', texto });
const a = (texto: string) => ({ rol: 'asistente', texto });

describe('validarSolicitud', () => {
  it('acepta una conversación válida y la normaliza', () => {
    expect(validarSolicitud({ mensajes: [u('  Hola  '), a('Hola.⟦1⟧ ¿Qué buscas?⟦2⟧'), u('Deserción\r\n2023')] })).toEqual({
      ok: true,
      mensajes: [
        { rol: 'usuario', texto: 'Hola' },
        { rol: 'asistente', texto: 'Hola. ¿Qué buscas?' },
        { rol: 'usuario', texto: 'Deserción\n2023' },
      ],
    });
  });

  it('ignora campos desconocidos (compatibilidad hacia adelante)', () => {
    expect(validarSolicitud({ mensajes: [u('hola')], version: 2 })).toMatchObject({ ok: true });
  });

  it('descarta respuestas vacías y une mensajes seguidos del mismo rol', () => {
    const resultado = validarSolicitud({ mensajes: [u('primera'), a('   '), u('segunda')] });
    expect(resultado).toEqual({ ok: true, mensajes: [{ rol: 'usuario', texto: 'primera\n\nsegunda' }] });
  });

  it('descarta respuestas del asistente al inicio', () => {
    const resultado = validarSolicitud({ mensajes: [a('¡Hola! Soy el Asistente ODES.'), u('hola')] });
    expect(resultado).toEqual({ ok: true, mensajes: [{ rol: 'usuario', texto: 'hola' }] });
  });

  it('quita caracteres de control salvo saltos de línea y tabuladores', () => {
    const resultado = validarSolicitud({ mensajes: [u(`a${String.fromCharCode(0)}b\tc${String.fromCharCode(7)}\nd`)] });
    expect(resultado).toEqual({ ok: true, mensajes: [{ rol: 'usuario', texto: 'ab\tc\nd' }] });
  });

  it.each([
    [null, 400],
    ['texto', 400],
    [{ mensajes: 'hola' }, 400],
    [{ mensajes: [{ rol: 'usuario' }] }, 400],
    [{ mensajes: [{ rol: 'usuario', texto: 5 }] }, 400],
    [{ mensajes: [] }, 400],
    [{ mensajes: [u('a'), a('b')] }, 400],
    [{ mensajes: [u('')] }, 400],
    [{ mensajes: [u('x'.repeat(2001))] }, 413],
    [{ mensajes: [u('a'), a('x'.repeat(12001)), u('b')] }, 413],
    [{ mensajes: Array.from({ length: 21 }, () => u('x')) }, 413],
  ])('rechaza %j con %i', (cuerpo, status) => {
    const resultado = validarSolicitud(cuerpo);
    expect(resultado).toMatchObject({ ok: false, status, error: { codigo: 'solicitud_invalida' } });
  });

  it('mide los límites después de unir: 18 respuestas seguidas o 20 preguntas seguidas dan 413', () => {
    const respuestas = validarSolicitud({
      mensajes: [u('a'.repeat(2000)), ...Array.from({ length: 18 }, () => a('b'.repeat(12000))), u('¿Qué es Matrícula Cero?')],
    });
    expect(respuestas).toMatchObject({ ok: false, status: 413, error: { codigo: 'solicitud_invalida' } });
    const preguntas = validarSolicitud({ mensajes: Array.from({ length: 20 }, () => u('x'.repeat(2000))) });
    expect(preguntas).toMatchObject({ ok: false, status: 413 });
    // Tres preguntas seguidas (dos respuestas vacías) también superan el tope del turno.
    expect(validarSolicitud({ mensajes: [u('x'.repeat(1500)), a(''), u('y'.repeat(1500)), a(' '), u('z'.repeat(1500))] })).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it('la conversación más larga que arma el cliente (9 pares al máximo y la pregunta) se acepta', () => {
    const mensajes = [
      ...Array.from({ length: 9 }, () => [u('p'.repeat(2000)), a('r'.repeat(12000))]).flat(),
      u('q'.repeat(2000)),
    ];
    const resultado = validarSolicitud({ mensajes });
    expect(resultado).toMatchObject({ ok: true, mensajes: { length: 19 } });
    expect(MAX_CARACTERES_CONVERSACION).toBe(128_000);
    // Dos preguntas unidas por una respuesta vacía, ambas al máximo: se aceptan.
    expect(validarSolicitud({ mensajes: [u('x'.repeat(2000)), a(''), u('y'.repeat(2000))] }).ok).toBe(true);
  });

  it('acepta los límites exactos', () => {
    expect(validarSolicitud({ mensajes: [u('x'.repeat(2000))] }).ok).toBe(true);
    // 20 mensajes: el primero (del asistente, el saludo) se descarta al normalizar.
    const veinte = Array.from({ length: 20 }, (_, i) => (i % 2 ? u('p') : a('r')));
    expect(validarSolicitud({ mensajes: veinte })).toMatchObject({ ok: true, mensajes: { length: 19 } });
  });
});

function peticion(cabeceras: Record<string, string>): Request {
  const minusculas = Object.fromEntries(Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (nombre: string) => minusculas[nombre.toLowerCase()] } as unknown as Request;
}

describe('origenPermitido', () => {
  it.each([
    [{}, true],
    [{ 'Sec-Fetch-Site': 'same-origin' }, true],
    [{ 'Sec-Fetch-Site': 'none' }, true],
    [{ 'Sec-Fetch-Site': 'same-site' }, false],
    [{ 'Sec-Fetch-Site': 'cross-site' }, false],
    [{ Origin: 'https://odes.ejemplo.gov.co', Host: 'odes.ejemplo.gov.co' }, true],
    [{ Origin: 'https://odes.ejemplo.gov.co', Host: 'odes.ejemplo.gov.co:443' }, true],
    [{ Origin: 'http://localhost:5173', Host: 'localhost:5173' }, true],
    [{ Origin: 'https://otro.test', Host: 'odes.ejemplo.gov.co' }, false],
    [{ Origin: 'null', Host: 'odes.ejemplo.gov.co' }, false],
  ])('%o -> %s', (cabeceras, permitido) => {
    expect(origenPermitido(peticion(cabeceras))).toBe(permitido);
  });
});
