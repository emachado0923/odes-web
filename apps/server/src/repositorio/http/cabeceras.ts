/**
 * Cabeceras HTTP de las descargas: Content-Disposition con el nombre limpio
 * en UTF-8 (RFC 6266 + RFC 8187) y una versión ASCII de respaldo para
 * clientes antiguos.
 */

/** Transliteración a ASCII imprimible: "Boletín N.º 19" -> "Boletin N.o 19". */
export function nombreAscii(nombre: string): string {
  const ascii = nombre
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/[;]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii || 'documento';
}

/**
 * Codificación de RFC 8187 (ext-value): todo lo que no es attr-char va en %XX
 * sobre UTF-8. encodeURIComponent deja sin codificar ' ( ) * !, y de esos solo
 * ! es attr-char.
 */
export function codificarRfc8187(texto: string): string {
  return encodeURIComponent(texto).replace(
    /['()*]/g,
    (caracter) => `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export type Disposicion = 'inline' | 'attachment';

/**
 * `attachment; filename="Boletin 19 - ....pdf"; filename*=UTF-8''Bolet%C3%ADn%2019...`
 * Los navegadores actuales usan filename*; filename es el respaldo.
 */
export function contentDisposition(tipo: Disposicion, nombre: string): string {
  return `${tipo}; filename="${nombreAscii(nombre)}"; filename*=UTF-8''${codificarRfc8187(nombre)}`;
}
