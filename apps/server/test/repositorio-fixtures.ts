import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';

/**
 * Archivos sintéticos para las pruebas del repositorio: ZIP (DOCX/PPTX),
 * JPEG, PNG, WebP y PDF con cabeceras válidas, sin depender de bibliotecas
 * de imágenes ni de archivos externos.
 */

export interface EntradaZip {
  nombre: string;
  datos?: Buffer;
  /** Marca el nombre como UTF-8 (bit 11). */
  utf8?: boolean;
}

/** ZIP "stored" (sin compresión). Con `zip64` agrega los registros ZIP64 del final. */
export function crearZip(
  entradas: EntradaZip[],
  { comentario = '', zip64 = false }: { comentario?: string; zip64?: boolean } = {},
): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let posicion = 0;
  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.nombre, entrada.utf8 ? 'utf8' : 'latin1');
    const datos = entrada.datos ?? Buffer.alloc(0);
    const crc = crc32(datos);
    const banderas = entrada.utf8 ? 0x800 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(banderas, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    locales.push(local, nombre, datos);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(banderas, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(posicion, 42);
    centrales.push(central, nombre);
    posicion += 30 + nombre.length + datos.length;
  }
  const directorio = Buffer.concat(centrales);
  const final: Buffer[] = [];
  if (zip64) {
    const fin64 = Buffer.alloc(56);
    fin64.writeUInt32LE(0x06064b50, 0);
    fin64.writeBigUInt64LE(44n, 4);
    fin64.writeUInt16LE(45, 12);
    fin64.writeUInt16LE(45, 14);
    fin64.writeBigUInt64LE(BigInt(entradas.length), 24);
    fin64.writeBigUInt64LE(BigInt(entradas.length), 32);
    fin64.writeBigUInt64LE(BigInt(directorio.length), 40);
    fin64.writeBigUInt64LE(BigInt(posicion), 48);
    const localizador = Buffer.alloc(20);
    localizador.writeUInt32LE(0x07064b50, 0);
    localizador.writeBigUInt64LE(BigInt(posicion + directorio.length), 8);
    localizador.writeUInt32LE(1, 16);
    final.push(fin64, localizador);
  }
  const textoComentario = Buffer.from(comentario, 'latin1');
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(zip64 ? 0xffff : entradas.length, 8);
  fin.writeUInt16LE(zip64 ? 0xffff : entradas.length, 10);
  fin.writeUInt32LE(zip64 ? 0xffffffff : directorio.length, 12);
  fin.writeUInt32LE(zip64 ? 0xffffffff : posicion, 16);
  fin.writeUInt16LE(textoComentario.length, 20);
  return Buffer.concat([...locales, directorio, ...final, fin, textoComentario]);
}

export function docxFalso(): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
    { nombre: '_rels/.rels', datos: Buffer.from('<Relationships/>') },
    { nombre: 'word/document.xml', datos: Buffer.from('<w:document/>') },
  ]);
}

export function pptxFalso(): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
    { nombre: 'ppt/presentation.xml', datos: Buffer.from('<p:presentation/>') },
  ]);
}

/** JPEG mínimo: SOI, APP0 (JFIF), SOF0 o SOF2 con las dimensiones, EOI. */
export function jpegFalso(ancho: number, alto: number, progresivo = false): Buffer {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof = Buffer.alloc(19);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(progresivo ? 0xc2 : 0xc0, 1);
  sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(alto, 5);
  sof.writeUInt16BE(ancho, 7);
  sof.writeUInt8(3, 9);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, randomBytes(64), Buffer.from([0xff, 0xd9])]);
}

export function pngFalso(ancho: number, alto: number): Buffer {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(ancho, 8);
  ihdr.writeUInt32BE(alto, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(6, 17);
  ihdr.writeUInt32BE(crc32(ihdr.subarray(4, 21)), 21);
  return Buffer.concat([firma, ihdr, Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]);
}

/** WebP con cabecera VP8X (lienzo), VP8L (sin pérdida) o 'VP8 ' (con pérdida). */
export function webpFalso(ancho: number, alto: number, tipo: 'VP8X' | 'VP8L' | 'VP8 ' = 'VP8X'): Buffer {
  let fragmento: Buffer;
  if (tipo === 'VP8X') {
    fragmento = Buffer.alloc(18);
    fragmento.write('VP8X', 0, 'latin1');
    fragmento.writeUInt32LE(10, 4);
    fragmento.writeUIntLE(ancho - 1, 12, 3);
    fragmento.writeUIntLE(alto - 1, 15, 3);
  } else if (tipo === 'VP8L') {
    fragmento = Buffer.alloc(13);
    fragmento.write('VP8L', 0, 'latin1');
    fragmento.writeUInt32LE(5, 4);
    fragmento.writeUInt8(0x2f, 8);
    const bits = (ancho - 1) | ((alto - 1) << 14);
    fragmento.writeUInt32LE(bits >>> 0, 9);
  } else {
    fragmento = Buffer.alloc(18);
    fragmento.write('VP8 ', 0, 'latin1');
    fragmento.writeUInt32LE(10, 4);
    fragmento.writeUInt8(0x9d, 11);
    fragmento.writeUInt8(0x01, 12);
    fragmento.writeUInt8(0x2a, 13);
    fragmento.writeUInt16LE(ancho & 0x3fff, 14);
    fragmento.writeUInt16LE(alto & 0x3fff, 16);
  }
  const cabecera = Buffer.alloc(12);
  cabecera.write('RIFF', 0, 'latin1');
  cabecera.writeUInt32LE(4 + fragmento.length + 32, 4);
  cabecera.write('WEBP', 8, 'latin1');
  return Buffer.concat([cabecera, fragmento, randomBytes(32)]);
}

/** "PDF" de `bytes` bytes: cabecera %PDF-1.7 y contenido aleatorio. */
export function pdfFalso(bytes = 2048): Buffer {
  const cabecera = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  return Buffer.concat([cabecera, randomBytes(Math.max(0, bytes - cabecera.length))]);
}
