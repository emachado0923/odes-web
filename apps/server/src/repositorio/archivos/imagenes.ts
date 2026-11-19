import { MIME } from './tipos-archivo.js';

/**
 * Dimensiones de una imagen leyendo solo su cabecera (PNG, JPEG, WebP), sin
 * decodificarla. Las portadas y miniaturas pesan poco (máximo 5 MB), así que
 * se reciben completas en memoria.
 */

export interface Dimensiones {
  ancho: number;
  alto: number;
}

function dimensionesPng(datos: Buffer): Dimensiones | null {
  // Firma (8) + longitud (4) + "IHDR" (4) + ancho (4) + alto (4)
  if (datos.length < 24 || datos.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return { ancho: datos.readUInt32BE(16), alto: datos.readUInt32BE(20) };
}

/** Marcadores SOF con dimensiones: C0-CF salvo C4 (DHT), C8 (JPG) y CC (DAC). */
function esSof(marcador: number): boolean {
  return (
    marcador >= 0xc0 &&
    marcador <= 0xcf &&
    marcador !== 0xc4 &&
    marcador !== 0xc8 &&
    marcador !== 0xcc
  );
}

function dimensionesJpeg(datos: Buffer): Dimensiones | null {
  let i = 2;
  while (i + 4 <= datos.length) {
    if (datos[i] !== 0xff) return null;
    let marcador = datos[i + 1];
    // Bytes de relleno 0xFF entre segmentos.
    while (marcador === 0xff && i + 2 < datos.length) {
      i++;
      marcador = datos[i + 1];
    }
    if (marcador === 0xd9 || marcador === 0xda) return null; // EOI / SOS sin SOF
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      i += 2; // marcadores sin longitud
      continue;
    }
    if (i + 4 > datos.length) return null;
    const longitud = datos.readUInt16BE(i + 2);
    if (longitud < 2) return null;
    if (esSof(marcador)) {
      if (i + 9 > datos.length) return null;
      return { alto: datos.readUInt16BE(i + 5), ancho: datos.readUInt16BE(i + 7) };
    }
    i += 2 + longitud;
  }
  return null;
}

function dimensionesWebp(datos: Buffer): Dimensiones | null {
  if (datos.length < 30) return null;
  const fragmento = datos.toString('latin1', 12, 16);
  if (fragmento === 'VP8 ') {
    // Cabecera del cuadro clave: 3 bytes + código 9D 01 2A + ancho/alto de 14 bits.
    if (datos[23] !== 0x9d || datos[24] !== 0x01 || datos[25] !== 0x2a) {
      return null;
    }
    return {
      ancho: datos.readUInt16LE(26) & 0x3fff,
      alto: datos.readUInt16LE(28) & 0x3fff,
    };
  }
  if (fragmento === 'VP8L') {
    if (datos[20] !== 0x2f) return null;
    const b1 = datos[21];
    const b2 = datos[22];
    const b3 = datos[23];
    const b4 = datos[24];
    return {
      ancho: 1 + (b1 | ((b2 & 0x3f) << 8)),
      alto: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  if (fragmento === 'VP8X') {
    return {
      ancho: 1 + datos.readUIntLE(24, 3),
      alto: 1 + datos.readUIntLE(27, 3),
    };
  }
  return null;
}

export function dimensionesImagen(
  mime: string,
  datos: Buffer,
): Dimensiones | null {
  switch (mime) {
    case MIME.png:
      return dimensionesPng(datos);
    case MIME.jpeg:
      return dimensionesJpeg(datos);
    case MIME.webp:
      return dimensionesWebp(datos);
    default:
      return null;
  }
}
