import { describe, expect, it } from 'vitest';
import {
  fragmentarPaginas,
  FRAGMENTO_MAXIMO,
  partirTexto,
  type PaginaTexto,
} from './fragmentacion.js';

/** Texto de prueba de `largo` caracteres, con frases. */
function texto(largo: number, semilla = 'a'): string {
  const frase = `Frase de prueba ${semilla} sobre la deserción estudiantil en Medellín. `;
  return frase
    .repeat(Math.ceil(largo / frase.length))
    .slice(0, largo)
    .trim();
}

describe('fragmentarPaginas', () => {
  it('junta páginas cortas consecutivas y conserva el rango de páginas', () => {
    const paginas: PaginaTexto[] = [1, 2, 3, 4, 5, 6].map((numero) => ({
      numero,
      texto: texto(450, String(numero)),
    }));
    const fragmentos = fragmentarPaginas(paginas);
    expect(fragmentos.length).toBeGreaterThan(1);
    expect(fragmentos[0]).toMatchObject({ paginaInicio: 1, paginaFin: 3 });
    // Rangos contiguos, crecientes y que cubren todas las páginas.
    expect(fragmentos.at(-1)!.paginaFin).toBe(6);
    for (let i = 1; i < fragmentos.length; i++) {
      expect(fragmentos[i]!.paginaInicio).toBe(
        fragmentos[i - 1]!.paginaFin + 1,
      );
    }
    for (const fragmento of fragmentos)
      expect(fragmento.texto.length).toBeLessThanOrEqual(2200);
  });

  it('parte una página larga en trozos con solape, todos de esa página', () => {
    const fragmentos = fragmentarPaginas([{ numero: 7, texto: texto(6000) }]);
    expect(fragmentos.length).toBeGreaterThanOrEqual(4);
    for (const fragmento of fragmentos) {
      expect(fragmento).toMatchObject({ paginaInicio: 7, paginaFin: 7 });
      expect(fragmento.texto.length).toBeLessThanOrEqual(FRAGMENTO_MAXIMO);
    }
    // El comienzo de cada trozo ya estaba al final del anterior (solape).
    for (let i = 1; i < fragmentos.length; i++) {
      const inicio = fragmentos[i]!.texto.slice(0, 40);
      expect(fragmentos[i - 1]!.texto).toContain(inicio);
    }
  });

  it('pega una portada corta al primer trozo de la página larga siguiente', () => {
    const fragmentos = fragmentarPaginas([
      { numero: 1, texto: 'Boletín N.º 29 · Diciembre 2024' },
      { numero: 2, texto: texto(4000) },
    ]);
    expect(fragmentos[0]).toMatchObject({ paginaInicio: 1, paginaFin: 2 });
    expect(fragmentos[0]!.texto.startsWith('Boletín N.º 29')).toBe(true);
    expect(fragmentos.slice(1).every((f) => f.paginaInicio === 2)).toBe(true);
  });

  it('pega un resto final corto al fragmento anterior', () => {
    const fragmentos = fragmentarPaginas([
      { numero: 1, texto: texto(1300) },
      { numero: 2, texto: 'Fin del documento.' },
    ]);
    expect(fragmentos).toHaveLength(1);
    expect(fragmentos[0]).toMatchObject({ paginaInicio: 1, paginaFin: 2 });
  });

  it('ignora páginas vacías sin romper los números', () => {
    const fragmentos = fragmentarPaginas([
      { numero: 1, texto: '' },
      { numero: 2, texto: texto(1300) },
      { numero: 3, texto: '   ' },
      { numero: 4, texto: texto(1300, 'b') },
    ]);
    expect(fragmentos.map((f) => [f.paginaInicio, f.paginaFin])).toEqual([
      [2, 2],
      [4, 4],
    ]);
    expect(fragmentarPaginas([])).toEqual([]);
  });
});

describe('partirTexto', () => {
  it('prefiere cortar en un salto de párrafo', () => {
    const parrafo = texto(1200);
    const partes = partirTexto(`${parrafo}\n${texto(1200, 'z')}`);
    expect(partes[0]).toBe(parrafo);
  });

  it('no deja texto sin cubrir', () => {
    const original = texto(9000);
    const partes = partirTexto(original);
    expect(partes.at(-1)!.endsWith(original.slice(-30))).toBe(true);
  });
});
