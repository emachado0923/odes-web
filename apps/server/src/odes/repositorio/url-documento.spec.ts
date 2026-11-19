import { describe, expect, it } from 'vitest';
import {
  crearConstructorUrl,
  ErrorPlantillaUrl,
  urlEnPagina,
} from './url-documento.js';

const conArchivo = {
  id: 'boletin-19',
  urlVer: 'https://sapiencia.gov.co/b19.pdf',
  tieneArchivo: true,
};
const tablero = {
  id: 'tablero-x',
  urlVer: 'https://app.powerbi.com/view?r=abc',
  tieneArchivo: false,
};

describe('crearConstructorUrl', () => {
  it('sin plantilla usa la URL original', () => {
    const construir = crearConstructorUrl(null);
    expect(construir(conArchivo)).toBe(conArchivo.urlVer);
    expect(crearConstructorUrl('   ')(tablero)).toBe(tablero.urlVer);
  });

  it('aplica la plantilla solo a los documentos con archivo propio', () => {
    const construir = crearConstructorUrl(
      '/api/repositorio/documentos/{id}/ver',
    );
    expect(construir(conArchivo)).toBe(
      '/api/repositorio/documentos/boletin-19/ver',
    );
    expect(construir(tablero)).toBe(tablero.urlVer);
    expect(
      crearConstructorUrl('https://archivo.example/{id}?origen={url_ver}')(
        conArchivo,
      ),
    ).toBe(
      'https://archivo.example/boletin-19?origen=https://sapiencia.gov.co/b19.pdf',
    );
  });

  it('rechaza plantillas peligrosas o sin marcador', () => {
    for (const plantilla of [
      'javascript:alert({id})',
      '//otro.sitio/{id}',
      '/sin-marcador',
      '/a b/{id}',
    ]) {
      expect(() => crearConstructorUrl(plantilla)).toThrow(ErrorPlantillaUrl);
    }
  });
});

describe('urlEnPagina', () => {
  it('agrega #page=N solo a los PDF con página', () => {
    expect(urlEnPagina('https://x/a.pdf', 'pdf', 3)).toBe(
      'https://x/a.pdf#page=3',
    );
    expect(urlEnPagina('https://x/a.pdf', 'pdf', null)).toBe('https://x/a.pdf');
    expect(urlEnPagina('https://x/tablero', 'tablero', 1)).toBe(
      'https://x/tablero',
    );
    expect(urlEnPagina('https://x/a.pdf#zoom=50', 'pdf', 2)).toBe(
      'https://x/a.pdf#zoom=50',
    );
  });
});
