import { describe, expect, it } from 'vitest';
import {
  claveComparacion,
  esPalabraVacia,
  normalizarParaIndice,
  plegar,
  raiz,
  terminos,
  variantesDeRaiz,
} from './normalizacion.js';

describe('plegar', () => {
  it('quita tildes, diéresis y eñes, y pasa a minúsculas', () => {
    expect(plegar('Educación Pingüino AÑO')).toBe('educacion pinguino ano');
  });

  it('aplica compatibilidad Unicode (ligaduras y superíndices)', () => {
    expect(plegar('\uFB01nanciación m²')).toBe('financiacion m2');
  });
});

describe('raiz (raíces ligeras del español)', () => {
  it.each([
    ['becas', 'beca'],
    ['mujeres', 'mujer'],
    ['mujer', 'mujer'],
    ['universidades', 'universidad'],
    ['jóvenes', 'joven'],
    ['deserciones', 'desercion'],
    ['deserción', 'desercion'],
    ['luces', 'luz'],
    ['meses', 'mes'],
  ])('%s -> %s', (palabra, esperada) => {
    expect(raiz(palabra)).toBe(esperada);
  });

  it('pliega singular y plural a la misma raíz', () => {
    expect(raiz('estudiantes')).toBe(raiz('estudiante'));
    expect(raiz('matrículas')).toBe(raiz('matrícula'));
    expect(raiz('educativos')).toBe(raiz('educativa'));
    expect(raiz('procesos')).toBe(raiz('proceso'));
    expect(raiz('intereses')).toBe(raiz('interés'));
    expect(raiz('países')).toBe(raiz('país'));
    expect(raiz('ingleses')).not.toBe('ingl');
  });

  it('no toca palabras cortas ni con cifras', () => {
    expect(raiz('ies')).toBe('ies');
    expect(raiz('covid19')).toBe('covid19');
    expect(raiz('2018')).toBe('2018');
  });
});

describe('terminos y normalizarParaIndice', () => {
  it('quita palabras vacías y letras sueltas, conserva las cifras', () => {
    expect(terminos('Fe de erratas del Boletín N.º 19')).toEqual([
      'fe',
      'errat',
      'boletin',
      '19',
    ]);
    expect(terminos('de la the of y o')).toEqual([]);
    expect(terminos('grado 11°')).toEqual(['grad', '11']);
  });

  it('parte las palabras unidas por guion en términos seguidos', () => {
    expect(normalizarParaIndice('Convocatoria 2018-2 (COVID-19)')).toBe(
      'convocatori 2018 2 covid 19',
    );
  });

  it('marca palabras vacías y basura', () => {
    expect(esPalabraVacia('de')).toBe(true);
    expect(esPalabraVacia('n')).toBe(true);
    expect(esPalabraVacia('2')).toBe(false);
    expect(esPalabraVacia('x'.repeat(41))).toBe(true);
    expect(esPalabraVacia('desercion')).toBe(false);
  });
});

describe('variantesDeRaiz', () => {
  it('agrega la forma singular para quien escribe sin tilde', () => {
    expect(variantesDeRaiz('interes')).toContain(raiz('interés'));
    expect(variantesDeRaiz('pais')).toContain(raiz('país'));
    expect(variantesDeRaiz('becas')[0]).toBe('beca');
  });
});

describe('claveComparacion', () => {
  it('iguala categorías y claves escritas distinto', () => {
    expect(claveComparacion('Boletines')).toBe(claveComparacion('boletín'));
    expect(claveComparacion('Infografías')).toBe(
      claveComparacion('Infografía'),
    );
    expect(claveComparacion('informes dinámicos')).toBe(
      claveComparacion('Informe dinámico'),
    );
  });
});
