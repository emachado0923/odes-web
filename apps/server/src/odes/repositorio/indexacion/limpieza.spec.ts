import { describe, expect, it } from 'vitest';
import {
  bloquesDeTexto,
  caracteresVisibles,
  filtrarRuidoOcr,
  limpiarPaginas,
  normalizarCaracteres,
} from './limpieza.js';

describe('bloquesDeTexto', () => {
  it('une las líneas de cada bloque y separa los bloques', () => {
    expect(
      bloquesDeTexto(
        'La mayoría de los\nencuestados (64,5%)\n\nEstrato 2\n\n28%',
      ),
    ).toEqual(['La mayoría de los encuestados (64,5%)', 'Estrato 2', '28%']);
  });

  it('une las palabras cortadas con guion al final de la línea', () => {
    expect(bloquesDeTexto('la educa-\nción superior')).toEqual([
      'la educación superior',
    ]);
    expect(bloquesDeTexto('la educa\u00AD\nción superior')).toEqual([
      'la educación superior',
    ]);
    // Entre mayúsculas o cifras el guion se conserva.
    expect(bloquesDeTexto('COVID-\n19')).toEqual(['COVID- 19']);
  });

  it('quita bloques de relleno (redes, sitio web, viñetas sueltas)', () => {
    expect(
      bloquesDeTexto(
        'Texto útil\n\n@SapienciaMed\n\nwww.sapiencia.gov.co\n\n•\n\n-',
      ),
    ).toEqual(['Texto útil']);
  });
});

describe('normalizarCaracteres', () => {
  it('reemplaza ligaduras, espacios raros e invisibles', () => {
    expect(normalizarCaracteres('\uFB01nanciación\u00A0y\u200Bdatos')).toBe(
      'financiación ydatos',
    );
  });

  it('quita caracteres de control y de uso privado (iconos)', () => {
    expect(normalizarCaracteres('a\u0007b\uE000c')).toBe('a b c');
  });
});

describe('limpiarPaginas', () => {
  it('quita encabezados, pies y números de página repetidos', () => {
    const temas = [
      'acceso',
      'permanencia',
      'deserción',
      'financiación',
      'calidad',
      'pertinencia',
    ];
    const paginas = temas.map(
      (tema, i) =>
        `Observatorio de Educación Superior de Medellín\n\nAnálisis de ${tema} en la ciudad.\n\nPágina ${i + 1} de 6\n\n${i + 3}`,
    );
    expect(limpiarPaginas(paginas)).toEqual(
      temas.map((tema) => `Análisis de ${tema} en la ciudad.`),
    );
  });

  it('conserva los números que no avanzan con la página (datos de gráficos)', () => {
    const paginas = ['36,5%', '28%', '12', '7', '8,3%'].map(
      (dato, i) =>
        `Gráfico ${['uno', 'dos', 'tres', 'cuatro', 'cinco'][i]} sobre estratos\n\n${dato}`,
    );
    expect(limpiarPaginas(paginas).map((p) => p.split('\n').at(-1))).toEqual([
      '36,5%',
      '28%',
      '12',
      '7',
      '8,3%',
    ]);
  });

  it('no toca documentos cortos', () => {
    expect(limpiarPaginas(['Título\n\nTexto', 'Título\n\nOtro'])).toEqual([
      'Título\nTexto',
      'Título\nOtro',
    ]);
  });
});

describe('filtrarRuidoOcr', () => {
  it('quita líneas sin palabras ni cifras y deja los datos', () => {
    expect(
      filtrarRuidoOcr(
        'Ww\nUN,\n36,5%\n\u2018~\u2014_\nLa mayoría reside en estratos dos y tres',
      ),
    ).toBe('36,5%\nLa mayoría reside en estratos dos y tres');
  });
});

describe('caracteresVisibles', () => {
  it('cuenta lo que no es espacio', () => {
    expect(caracteresVisibles(' a b\n c\t')).toBe(3);
  });
});
