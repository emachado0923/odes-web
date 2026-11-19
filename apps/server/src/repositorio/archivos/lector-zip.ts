import type { FuenteBytes } from './fuente-bytes.js';

/**
 * Lector mínimo del directorio central de un ZIP (también ZIP64): devuelve
 * los nombres de las entradas sin descomprimir nada. Sirve para reconocer
 * DOCX y PPTX por su contenido (word/document.xml, ppt/presentation.xml),
 * sin depender de herramientas externas.
 *
 * Formato: APPNOTE.TXT de PKWARE, secciones 4.3.12 (cabecera del directorio
 * central), 4.3.14-4.3.16 (fin del directorio central, ZIP64).
 */

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const FIRMA_LOCALIZADOR_ZIP64 = 0x07064b50;
const FIRMA_FIN_ZIP64 = 0x06064b50;

/** Fin del directorio central (22 bytes) + comentario de hasta 65 535. */
const TAMANO_FIN = 22;
const MAX_COLA = TAMANO_FIN + 0xffff;

export interface LimitesZip {
  /** Máximo de entradas que se aceptan (un DOCX normal tiene decenas). */
  maxEntradas: number;
  /** Tamaño máximo del directorio central que se lee (bytes). */
  maxDirectorio: number;
}

export const LIMITES_ZIP_POR_DEFECTO: LimitesZip = {
  maxEntradas: 20_000,
  maxDirectorio: 16 * 1024 * 1024,
};

export class ErrorZip extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorZip';
  }
}

function leerUint64(buffer: Buffer, posicion: number): number {
  const valor = buffer.readBigUInt64LE(posicion);
  if (valor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ErrorZip('ZIP64 con valores fuera de rango');
  }
  return Number(valor);
}

interface FinDirectorio {
  entradas: number;
  tamano: number;
  posicion: number;
}

async function buscarFin(fuente: FuenteBytes): Promise<FinDirectorio> {
  if (fuente.tamano < TAMANO_FIN) throw new ErrorZip('Archivo demasiado corto');
  const inicioCola = Math.max(0, fuente.tamano - MAX_COLA);
  const cola = await fuente.leer(inicioCola, fuente.tamano - inicioCola);
  for (let i = cola.length - TAMANO_FIN; i >= 0; i--) {
    if (cola.readUInt32LE(i) !== FIRMA_FIN) continue;
    const longitudComentario = cola.readUInt16LE(i + 20);
    // El comentario debe llegar justo al final del archivo.
    if (i + TAMANO_FIN + longitudComentario !== cola.length) continue;
    let entradas = cola.readUInt16LE(i + 10);
    let tamano = cola.readUInt32LE(i + 12);
    let posicion = cola.readUInt32LE(i + 16);
    if (entradas === 0xffff || tamano === 0xffffffff || posicion === 0xffffffff) {
      // ZIP64: el localizador está justo antes del fin del directorio.
      const posicionFin = inicioCola + i;
      if (posicionFin < 20) throw new ErrorZip('ZIP64 sin localizador');
      const localizador = await fuente.leer(posicionFin - 20, 20);
      if (localizador.readUInt32LE(0) !== FIRMA_LOCALIZADOR_ZIP64) {
        throw new ErrorZip('ZIP64 sin localizador');
      }
      const posicionFin64 = leerUint64(localizador, 8);
      const fin64 = await fuente.leer(posicionFin64, 56);
      if (fin64.length < 56 || fin64.readUInt32LE(0) !== FIRMA_FIN_ZIP64) {
        throw new ErrorZip('ZIP64 con fin de directorio inválido');
      }
      entradas = leerUint64(fin64, 32);
      tamano = leerUint64(fin64, 40);
      posicion = leerUint64(fin64, 48);
    }
    return { entradas, tamano, posicion };
  }
  throw new ErrorZip('No se encontró el fin del directorio central');
}

/** Nombres de las entradas del ZIP, en el orden del directorio central. */
export async function leerNombresZip(
  fuente: FuenteBytes,
  limites: LimitesZip = LIMITES_ZIP_POR_DEFECTO,
): Promise<string[]> {
  const cabecera = await fuente.leer(0, 4);
  if (cabecera.length < 4 || cabecera.readUInt32LE(0) !== FIRMA_LOCAL) {
    throw new ErrorZip('No empieza con una cabecera local de ZIP');
  }
  const fin = await buscarFin(fuente);
  if (fin.entradas > limites.maxEntradas) {
    throw new ErrorZip(`Demasiadas entradas (${fin.entradas})`);
  }
  if (fin.tamano > limites.maxDirectorio) {
    throw new ErrorZip('Directorio central demasiado grande');
  }
  if (fin.posicion + fin.tamano > fuente.tamano) {
    throw new ErrorZip('El directorio central se sale del archivo');
  }
  const directorio = await fuente.leer(fin.posicion, fin.tamano);
  const nombres: string[] = [];
  let i = 0;
  for (let entrada = 0; entrada < fin.entradas; entrada++) {
    if (i + 46 > directorio.length) {
      throw new ErrorZip('Directorio central truncado');
    }
    if (directorio.readUInt32LE(i) !== FIRMA_CENTRAL) {
      throw new ErrorZip('Firma de entrada inválida en el directorio central');
    }
    const banderas = directorio.readUInt16LE(i + 8);
    const longitudNombre = directorio.readUInt16LE(i + 28);
    const longitudExtra = directorio.readUInt16LE(i + 30);
    const longitudComentario = directorio.readUInt16LE(i + 32);
    const finNombre = i + 46 + longitudNombre;
    if (finNombre > directorio.length) {
      throw new ErrorZip('Nombre de entrada truncado');
    }
    const bytesNombre = directorio.subarray(i + 46, finNombre);
    // Bit 11: nombre en UTF-8; si no, CP437 (los nombres que importan son ASCII).
    nombres.push(bytesNombre.toString(banderas & 0x800 ? 'utf8' : 'latin1'));
    i = finNombre + longitudExtra + longitudComentario;
  }
  return nombres;
}
