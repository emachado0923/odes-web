import { describe, expect, it } from 'vitest';
import {
  type EjecutorComando,
  herramientasFaltantes,
  idiomasTesseract,
  mensajeHerramientasFaltantes,
} from './herramientas-indexacion.js';

const LISTA = 'List of available languages in "/usr/share/tesseract-ocr/5/tessdata/" (3):\neng\nosd\nspa\n';

function ejecutor(existentes: Record<string, string>): EjecutorComando {
  return async (comando) =>
    comando in existentes ? { stdout: existentes[comando]!, stderr: '' } : { stdout: null, stderr: '' };
}

const TODAS = { pdftotext: '', pdftoppm: '', pdfinfo: '', unzip: '', tesseract: LISTA, cwebp: '' };

describe('herramientas de indexación', () => {
  it('no falta nada', async () => {
    const faltan = await herramientasFaltantes({ ocr: true, idiomasOcr: 'spa+eng', miniaturas: true }, ejecutor(TODAS));
    expect(faltan).toEqual([]);
    expect(mensajeHerramientasFaltantes(faltan)).toBeNull();
  });

  it('sin poppler ni el idioma spa: dice qué instalar', async () => {
    const { pdftotext: _a, pdftoppm: _b, pdfinfo: _c, ...resto } = TODAS;
    const faltan = await herramientasFaltantes(
      { ocr: true, idiomasOcr: 'spa+eng', miniaturas: false },
      ejecutor({ ...resto, tesseract: 'List of available languages (1):\neng\n' }),
    );
    const mensaje = mensajeHerramientasFaltantes(faltan)!;
    expect(mensaje).toMatch(/pdftotext, pdftoppm, pdfinfo; el idioma "spa" de tesseract/);
    expect(mensaje).toMatch(/sudo apt-get install poppler-utils tesseract-ocr-spa/);
    expect(mensaje).toMatch(/brew install poppler tesseract-lang/);
    expect(mensaje).toMatch(/El índice anterior no se modificó/);
  });

  it('sin OCR no exige tesseract; sin miniaturas no exige cwebp', async () => {
    const { tesseract: _t, cwebp: _w, ...resto } = TODAS;
    expect(await herramientasFaltantes({ ocr: false, idiomasOcr: 'spa+eng', miniaturas: false }, ejecutor(resto))).toEqual([]);
    const faltan = await herramientasFaltantes({ ocr: true, idiomasOcr: 'spa+eng', miniaturas: true }, ejecutor(resto));
    expect(faltan.map((f) => f.queFalta)).toEqual(['tesseract', 'cwebp']);
  });

  it('lee la lista de idiomas aunque llegue por stderr (tesseract antiguo)', async () => {
    const conStderr: EjecutorComando = async (comando) =>
      comando === 'tesseract' ? { stdout: '', stderr: LISTA } : { stdout: '', stderr: '' };
    expect(await herramientasFaltantes({ ocr: true, idiomasOcr: 'spa+eng', miniaturas: false }, conStderr)).toEqual([]);
    expect([...idiomasTesseract(LISTA)]).toEqual(['eng', 'osd', 'spa']);
  });
});
