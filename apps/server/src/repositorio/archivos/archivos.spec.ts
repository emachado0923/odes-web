import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  crearZip,
  docxFalso,
  jpegFalso,
  pdfFalso,
  pngFalso,
  pptxFalso,
  webpFalso,
} from '../../../test/repositorio-fixtures.js';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { TIPOS_ARCHIVO_PERMITIDOS } from '../api-repositorio.js';
import { conFuenteDeArchivo, fuenteDeBuffer } from './fuente-bytes.js';
import { dimensionesImagen } from './imagenes.js';
import { ErrorZip, leerNombresZip } from './lector-zip.js';
import {
  coincideDeclarado,
  detectarTipo,
  extensionDeMime,
  MIME,
  tipoPorCabecera,
} from './tipos-archivo.js';

describe('lector del directorio central de ZIP', () => {
  it('lee los nombres en orden, con nombres UTF-8 y comentario al final', async () => {
    const zip = crearZip(
      [
        { nombre: '[Content_Types].xml', datos: Buffer.from('x') },
        { nombre: 'carpeta/año.xml', utf8: true },
        { nombre: 'word/document.xml', datos: Buffer.alloc(1000, 1) },
      ],
      { comentario: 'comentario del zip' },
    );
    expect(await leerNombresZip(fuenteDeBuffer(zip))).toEqual([
      '[Content_Types].xml',
      'carpeta/año.xml',
      'word/document.xml',
    ]);
  });

  it('entiende el fin de directorio ZIP64', async () => {
    const zip = crearZip([{ nombre: 'a.txt' }, { nombre: 'b.txt' }], { zip64: true });
    expect(await leerNombresZip(fuenteDeBuffer(zip))).toEqual(['a.txt', 'b.txt']);
  });

  it.each([
    ['no empieza con PK', Buffer.from('%PDF-1.7 no es un zip')],
    ['está truncado', crearZip([{ nombre: 'a.txt' }]).subarray(0, 40)],
    ['es demasiado corto', Buffer.from('PK\x03\x04')],
  ])('rechaza un archivo que %s', async (_caso, datos) => {
    await expect(leerNombresZip(fuenteDeBuffer(datos))).rejects.toBeInstanceOf(ErrorZip);
  });

  it('rechaza más entradas que el límite', async () => {
    const zip = crearZip(Array.from({ length: 5 }, (_v, i) => ({ nombre: `${i}.txt` })));
    await expect(
      leerNombresZip(fuenteDeBuffer(zip), { maxEntradas: 3, maxDirectorio: 1e6 }),
    ).rejects.toThrow(/Demasiadas entradas/);
  });

  it('rechaza un directorio central que se sale del archivo', async () => {
    const zip = crearZip([{ nombre: 'a.txt' }]);
    zip.writeUInt32LE(0x7fffffff, zip.length - 6); // posición del directorio
    await expect(leerNombresZip(fuenteDeBuffer(zip))).rejects.toBeInstanceOf(ErrorZip);
  });
});

/** XLSX mínimo: [Content_Types].xml + xl/workbook.xml (Office Open XML). */
function xlsxFalso(): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
    { nombre: '_rels/.rels', datos: Buffer.from('<Relationships/>') },
    { nombre: 'xl/workbook.xml', datos: Buffer.from('<workbook/>') },
    { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from('<worksheet/>') },
  ]);
}

describe('tipo real por contenido (números mágicos)', () => {
  it.each([
    ['PDF', pdfFalso(), MIME.pdf],
    ['PNG', pngFalso(10, 10), MIME.png],
    ['JPEG', jpegFalso(10, 10), MIME.jpeg],
    ['WebP', webpFalso(10, 10), MIME.webp],
    ['DOCX', docxFalso(), MIME.docx],
    ['XLSX', xlsxFalso(), MIME.xlsx],
    ['PPTX', pptxFalso(), MIME.pptx],
  ])('reconoce %s', async (_nombre, datos, mime) => {
    expect(await detectarTipo(fuenteDeBuffer(datos))).toBe(mime);
  });

  it.each([
    ['un ZIP cualquiera', crearZip([{ nombre: 'hola.txt' }])],
    ['un ZIP sin [Content_Types].xml', crearZip([{ nombre: 'word/document.xml' }])],
    ['un XLSX sin [Content_Types].xml', crearZip([{ nombre: 'xl/workbook.xml' }])],
    [
      'un ZIP con [Content_Types].xml pero sin libro (xl/ suelto)',
      crearZip([{ nombre: '[Content_Types].xml' }, { nombre: 'xl/styles.xml' }]),
    ],
    ['un ejecutable', Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01])],
    ['HTML con %PDF- en medio', Buffer.from('<html><body>%PDF-1.4</body></html>')],
    ['un archivo vacío', Buffer.alloc(0)],
    ['un ZIP dañado', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(100)])],
  ])('no acepta %s', async (_caso, datos) => {
    expect(await detectarTipo(fuenteDeBuffer(datos))).toBeNull();
  });

  it('XLSX se reconoce, pero el repositorio sigue sin aceptarlo como archivo de documento', () => {
    const permitidos: readonly string[] = TIPOS_ARCHIVO_PERMITIDOS;
    expect(permitidos).not.toContain(MIME.xlsx);
    expect(permitidos).toContain(MIME.docx);
  });

  it('tipoPorCabecera distingue ZIP sin mirar dentro', () => {
    expect(tipoPorCabecera(docxFalso())).toBe('zip');
  });

  it('extensión canónica de cada tipo', () => {
    expect(extensionDeMime(MIME.jpeg)).toBe('jpg');
    expect(extensionDeMime(MIME.docx)).toBe('docx');
    expect(extensionDeMime(MIME.xlsx)).toBe('xlsx');
    expect(extensionDeMime('application/x-otro')).toBe('bin');
  });

  describe('coincidencia con lo declarado', () => {
    it.each([
      [MIME.pdf, 'informe.pdf', 'application/pdf', true],
      [MIME.pdf, 'informe.PDF', 'application/octet-stream', true],
      [MIME.pdf, 'blob', '', true],
      [MIME.pdf, '', '', true],
      [MIME.jpeg, 'portada.jpeg', 'image/jpg', true],
      [MIME.jpeg, 'portada.jpg', 'image/pjpeg', true],
      // Un .pdf que en realidad es un PNG:
      [MIME.png, 'informe.pdf', 'application/pdf', false],
      [MIME.png, 'imagen.png', 'application/pdf', false],
      [MIME.pdf, 'informe.exe', 'application/pdf', false],
      [MIME.docx, 'informe.pptx', '', false],
      [MIME.xlsx, 'avance.XLSX', MIME.xlsx, true],
      [MIME.xlsx, 'avance.xlsx', 'application/octet-stream', true],
      // Un .docx que en realidad es una hoja de cálculo:
      [MIME.xlsx, 'informe.docx', '', false],
      [MIME.xlsx, 'avance.xlsx', MIME.docx, false],
    ])('%s como %j (%j) -> %j', (real, nombre, mime, esperado) => {
      expect(coincideDeclarado(real, { nombre, mime })).toBe(esperado);
    });
  });

  describe('archivos en disco', () => {
    let carpeta: string;
    beforeAll(async () => {
      carpeta = await mkdtemp(join(tmpdir(), 'repositorio-tipos-'));
    });
    afterAll(async () => {
      await rm(carpeta, { recursive: true, force: true });
    });

    it('lee el DOCX desde el disco sin cargarlo entero', async () => {
      const ruta = join(carpeta, 'a.docx');
      await writeFile(ruta, Buffer.concat([docxFalso()]));
      expect(await conFuenteDeArchivo(ruta, detectarTipo)).toBe(MIME.docx);
    });
  });
});

describe('dimensiones de imágenes', () => {
  it.each([
    ['PNG', MIME.png, pngFalso(720, 480), { ancho: 720, alto: 480 }],
    ['JPEG base', MIME.jpeg, jpegFalso(720, 720), { ancho: 720, alto: 720 }],
    ['JPEG progresivo', MIME.jpeg, jpegFalso(640, 360, true), { ancho: 640, alto: 360 }],
    ['WebP VP8X', MIME.webp, webpFalso(192, 192, 'VP8X'), { ancho: 192, alto: 192 }],
    ['WebP VP8L', MIME.webp, webpFalso(300, 150, 'VP8L'), { ancho: 300, alto: 150 }],
    ['WebP VP8', MIME.webp, webpFalso(192, 100, 'VP8 '), { ancho: 192, alto: 100 }],
  ])('%s', (_nombre, mime, datos, esperado) => {
    expect(dimensionesImagen(mime, datos)).toEqual(esperado);
  });

  it('null si la cabecera no sirve', () => {
    expect(dimensionesImagen(MIME.jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(dimensionesImagen(MIME.pdf, pdfFalso())).toBeNull();
  });

  // Con los archivos reales, si este equipo tiene el paquete y las miniaturas.
  const portadas = resolve(RAIZ_SERVIDOR, '..', 'web', 'public', 'odes', 'portadas');
  const miniatura = join(portadas, 'boletin-1-formacion-sin-distancias-educacion-digital-medellin-2017.webp');
  it.skipIf(!existsSync(miniatura))('miniatura real de 192 × 192 (VP8)', () => {
    expect(dimensionesImagen(MIME.webp, readFileSync(miniatura))).toEqual({ ancho: 192, alto: 192 });
  });
});
