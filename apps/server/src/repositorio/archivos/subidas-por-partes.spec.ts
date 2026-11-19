import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  ErrorSubidaPartes,
  esRutaPartes,
  leerCuerpoBinario,
  numeroDeParte,
  partesDe,
  rutaPartesNueva,
  TAMANO_PARTE,
  tamanoDeParte,
} from './subidas-por-partes.js';

/** Petición falsa con cuerpo binario y cabeceras. */
function peticion(trozos: Buffer[], cabeceras: Record<string, string> = {}) {
  return Object.assign(Readable.from(trozos), { headers: cabeceras });
}

describe('subidas por partes', () => {
  it('cada parte cabe en una petición de Vercel (4,5 MB)', () => {
    expect(TAMANO_PARTE).toBe(4 * 1024 * 1024);
    expect(TAMANO_PARTE).toBeLessThan(4.5 * 1000 * 1000);
  });

  it('partes y tamaño exacto de cada una', () => {
    expect(partesDe(1)).toBe(1);
    expect(partesDe(TAMANO_PARTE)).toBe(1);
    expect(partesDe(TAMANO_PARTE + 1)).toBe(2);
    const bytes = 2 * TAMANO_PARTE + 10;
    expect(partesDe(bytes)).toBe(3);
    expect([0, 1, 2].map((n) => tamanoDeParte(bytes, n))).toEqual([TAMANO_PARTE, TAMANO_PARTE, 10]);
  });

  it('rutas: partes/<uuid>, nada más', () => {
    const ruta = rutaPartesNueva();
    expect(esRutaPartes(ruta)).toBe(true);
    expect(esRutaPartes('subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d')).toBe(false);
    expect(esRutaPartes('partes/../../etc/passwd')).toBe(false);
    expect(esRutaPartes(`${ruta}/0`)).toBe(false);
    expect(esRutaPartes(null)).toBe(false);
  });

  it('el número de parte debe existir en la subida', () => {
    const bytes = TAMANO_PARTE + 1; // 2 partes
    expect(numeroDeParte('0', bytes)).toBe(0);
    expect(numeroDeParte('1', bytes)).toBe(1);
    for (const malo of ['2', '-1', '1.5', 'x', '', '0001234567']) {
      expect(() => numeroDeParte(malo, bytes)).toThrow(ErrorSubidaPartes);
    }
  });

  it('lee el cuerpo binario y corta lo que pasa del tope', async () => {
    const datos = await leerCuerpoBinario(peticion([Buffer.from('ab'), Buffer.from('cd')]), 4);
    expect(datos.toString()).toBe('abcd');
    // Más grande de lo permitido: por la cabecera, sin leer...
    await expect(leerCuerpoBinario(peticion([Buffer.from('abcde')], { 'content-length': '5' }), 4)).rejects.toMatchObject({
      motivo: 'demasiado_grande',
    });
    // ...o leyendo, si la cabecera no está o miente.
    await expect(leerCuerpoBinario(peticion([Buffer.from('abc'), Buffer.from('de')]), 4)).rejects.toMatchObject({
      motivo: 'demasiado_grande',
    });
  });
});
