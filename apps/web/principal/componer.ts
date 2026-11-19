/**
 * Inserta el bloque de WordPress en la página de /principal.
 *
 * principal/index.html (cabecera, pie y estilos de la página) lleva un
 * comentario MARCADOR donde va el bloque. El bloque se copia tal cual, byte
 * por byte: lo que se ve en /principal es exactamente lo que se pega en
 * WordPress. Sin dependencias de Node: lo usan el plugin de Vite y las pruebas.
 */

/** Comentario de principal/index.html que se reemplaza por el bloque. */
export const MARCADOR = '<!-- BLOQUE: aquí va observatorio-bloque.html, tal cual -->'

export function componerPagina(pagina: string, bloque: string): string {
  const partes = pagina.split(MARCADOR)
  if (partes.length !== 2) {
    throw new Error(
      `principal/index.html debe tener el marcador del bloque exactamente una vez (tiene ${partes.length - 1}): ${MARCADOR}`,
    )
  }
  // split/join y no replace(): el bloque trae "$" ("$ 999.999 millones") y
  // replace() interpretaría secuencias como "$&" o "$'".
  return partes.join(bloque)
}
