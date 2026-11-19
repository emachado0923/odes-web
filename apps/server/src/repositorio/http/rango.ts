/**
 * Peticiones condicionales y de rango (RFC 9110, secciones 13 y 14), como
 * funciones puras. Solo se atiende un rango por petición: varios rangos
 * (multipart/byteranges) se ignoran y se responde el archivo completo, lo que
 * el RFC permite.
 */

export type ResultadoRango =
  | { tipo: 'completo' }
  | { tipo: 'parcial'; inicio: number; fin: number }
  | { tipo: 'no_satisfacible' };

const COMPLETO: ResultadoRango = { tipo: 'completo' };

function numero(texto: string): number {
  // Más dígitos de los que caben: se trata como "enorme".
  return texto.length > 15 ? Number.MAX_SAFE_INTEGER : Number(texto);
}

/** Interpreta la cabecera Range para un recurso de `tamano` bytes. */
export function interpretarRango(
  cabecera: string | undefined,
  tamano: number,
): ResultadoRango {
  if (!cabecera) return COMPLETO;
  const unidad = /^\s*bytes\s*=\s*(.*)$/i.exec(cabecera);
  if (!unidad) return COMPLETO; // otra unidad: se ignora
  const partes = unidad[1].split(',').map((parte) => parte.trim());
  if (partes.length !== 1) return COMPLETO;
  const rango = /^(\d*)\s*-\s*(\d*)$/.exec(partes[0]);
  if (!rango || (!rango[1] && !rango[2])) return COMPLETO; // mal formado: se ignora
  if (!rango[1]) {
    // Sufijo: los últimos N bytes.
    const sufijo = numero(rango[2]);
    if (sufijo === 0 || tamano === 0) return { tipo: 'no_satisfacible' };
    return {
      tipo: 'parcial',
      inicio: Math.max(0, tamano - sufijo),
      fin: tamano - 1,
    };
  }
  const inicio = numero(rango[1]);
  const fin = rango[2] ? numero(rango[2]) : tamano - 1;
  if (rango[2] && fin < inicio) return COMPLETO; // inválido: se ignora
  if (inicio >= tamano) return { tipo: 'no_satisfacible' };
  return { tipo: 'parcial', inicio, fin: Math.min(fin, tamano - 1) };
}

function etiquetas(cabecera: string): string[] {
  return cabecera
    .split(',')
    .map((etiqueta) => etiqueta.trim())
    .filter(Boolean);
}

function sinDebil(etiqueta: string): string {
  return etiqueta.replace(/^W\//, '');
}

/** If-None-Match: comparación débil (RFC 9110 13.1.2). */
export function coincideIfNoneMatch(
  cabecera: string | undefined,
  etag: string,
): boolean {
  if (!cabecera) return false;
  if (cabecera.trim() === '*') return true;
  const propia = sinDebil(etag);
  return etiquetas(cabecera).some((etiqueta) => sinDebil(etiqueta) === propia);
}

function segundos(fecha: Date): number {
  return Math.floor(fecha.getTime() / 1000);
}

/**
 * ¿Basta con un 304? Si llega If-None-Match manda esa cabecera; si no,
 * If-Modified-Since contra la fecha de modificación (al segundo).
 */
export function noModificado(
  cabeceras: { ifNoneMatch?: string; ifModifiedSince?: string },
  etag: string,
  modificado: Date | null,
): boolean {
  if (cabeceras.ifNoneMatch !== undefined) {
    return coincideIfNoneMatch(cabeceras.ifNoneMatch, etag);
  }
  if (cabeceras.ifModifiedSince && modificado) {
    const fecha = Date.parse(cabeceras.ifModifiedSince);
    return Number.isFinite(fecha) && segundos(modificado) <= Math.floor(fecha / 1000);
  }
  return false;
}

/**
 * If-Range: el rango solo se aplica si el validador coincide. Un ETag se
 * compara de forma fuerte (los débiles nunca coinciden); una fecha debe ser
 * exactamente la de Last-Modified.
 */
export function rangoAplicable(
  ifRange: string | undefined,
  etag: string,
  modificado: Date | null,
): boolean {
  if (ifRange === undefined) return true;
  const valor = ifRange.trim();
  if (valor.startsWith('"') || valor.startsWith('W/')) {
    return !valor.startsWith('W/') && !etag.startsWith('W/') && valor === etag;
  }
  const fecha = Date.parse(valor);
  return (
    modificado !== null &&
    Number.isFinite(fecha) &&
    Math.floor(fecha / 1000) === segundos(modificado)
  );
}
