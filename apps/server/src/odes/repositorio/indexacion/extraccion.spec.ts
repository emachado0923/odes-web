import { describe, expect, it } from 'vitest';
import {
  decodificarEntidades,
  formatoDeArchivo,
  ordenDeDiapositivas,
  paginasDeDocx,
  paginasDePdftotext,
  tamanosDePdfinfo,
  textoDeDiapositiva,
} from './extraccion.js';

describe('paginasDePdftotext', () => {
  it('separa por salto de página y descarta el vacío final', () => {
    expect(paginasDePdftotext('uno\fdos\f\ftres\f')).toEqual([
      'uno',
      'dos',
      '',
      'tres',
    ]);
    expect(paginasDePdftotext('')).toEqual(['']);
  });
});

describe('tamanosDePdfinfo', () => {
  it('lee el tamaño de cada página', () => {
    const salida =
      'Pages:          2\nPage    1 size: 595.276 x 841.89 pts (A4)\nPage    2 size: 960 x 540 pts\n';
    const tamanos = tamanosDePdfinfo(salida);
    expect(tamanos.get(1)).toEqual({ ancho: 595.276, alto: 841.89 });
    expect(tamanos.get(2)).toEqual({ ancho: 960, alto: 540 });
  });
});

describe('paginasDeDocx', () => {
  it('extrae párrafos, separa páginas y descarta códigos de campo', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>Educaci</w:t></w:r><w:r><w:t>ón &amp; datos</w:t></w:r></w:p>' +
      '<w:p><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r><w:r><w:t>Índice</w:t></w:r></w:p>' +
      '<w:p><w:r><w:lastRenderedPageBreak/><w:t>Página</w:t><w:tab/><w:t>dos</w:t></w:r></w:p>' +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      '</w:body></w:document>';
    const paginas = paginasDeDocx(xml);
    expect(paginas).toHaveLength(2);
    expect(paginas[0]).toContain('Educación & datos');
    expect(paginas[0]).toContain('Índice');
    expect(paginas[0]).not.toContain('TOC');
    expect(paginas[1]).toContain('Página dos');
  });
});

describe('PPTX', () => {
  it('extrae el texto de una diapositiva', () => {
    const xml =
      '<p:sld><p:sp><a:p><a:r><a:t>Grupos de</a:t></a:r><a:br/><a:r><a:t>investigación</a:t></a:r></a:p></p:sp>' +
      '<p:sp><a:p><a:r><a:t>Semilleros &lt;2022&gt;</a:t></a:r></a:p></p:sp></p:sld>';
    const texto = textoDeDiapositiva(xml);
    expect(texto).toContain('Grupos de\ninvestigación');
    expect(texto).toContain('Semilleros <2022>');
  });

  it('ordena las diapositivas según la presentación', () => {
    const presentacion =
      '<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>';
    const relaciones =
      '<Relationships><Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/>' +
      '<Relationship Id="rId3" Type="slide" Target="slides/slide2.xml"/></Relationships>';
    const entradas = ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'];
    expect(ordenDeDiapositivas(presentacion, relaciones, entradas)).toEqual([
      'ppt/slides/slide2.xml',
      'ppt/slides/slide1.xml',
    ]);
    // Sin presentation.xml: orden numérico.
    expect(
      ordenDeDiapositivas('', '', [
        'ppt/slides/slide10.xml',
        'ppt/slides/slide2.xml',
      ]),
    ).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide10.xml']);
  });
});

describe('decodificarEntidades', () => {
  it('decodifica entidades con nombre y numéricas', () => {
    expect(decodificarEntidades('&lt;a&gt; &amp; &#233;&#xF1; &bogus;')).toBe(
      '<a> & éñ &bogus;',
    );
  });
});

describe('formatoDeArchivo', () => {
  it('reconoce el formato por tipo MIME o extensión', () => {
    expect(formatoDeArchivo('x.pdf', null)).toBe('pdf');
    expect(formatoDeArchivo('x.bin', 'application/pdf')).toBe('pdf');
    expect(formatoDeArchivo('x.png', 'image/png')).toBe('imagen');
    expect(formatoDeArchivo('x.JPG', null)).toBe('imagen');
    expect(formatoDeArchivo('x.docx', null)).toBe('docx');
    expect(formatoDeArchivo('x.pptx', null)).toBe('pptx');
    expect(formatoDeArchivo('x.xlsx', null)).toBeNull();
  });
});
