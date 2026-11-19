/**
 * Piezas del bloque de WordPress de /pertinencia (pertinencia-bloque.html).
 *
 * El aplicativo pone el bloque tal cual en la página (estilos y contenido) y
 * ejecuta su script como un módulo de JavaScript, porque la CSP del sitio
 * (script-src 'self') no deja correr scripts en línea. Sin dependencias de
 * Node: lo usan el plugin de Vite y las pruebas.
 */

/** Scripts del bloque, con sus atributos y su contenido, en orden. */
function scripts(bloque: string): { atributos: string; contenido: string }[] {
  return [...bloque.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(([, atributos = '', contenido = '']) => ({
    atributos,
    contenido,
  }))
}

/** El contenido del único script ejecutable del bloque (sin type; los de datos no cuentan). */
export function scriptDelBloque(bloque: string): string {
  const ejecutables = scripts(bloque).filter(({ atributos }) => !/\btype\s*=/i.test(atributos))
  if (ejecutables.length !== 1) {
    throw new Error(`pertinencia-bloque.html debe tener exactamente un script ejecutable (tiene ${ejecutables.length}).`)
  }
  return ejecutables[0].contenido
}

/**
 * Módulo ES que exporta por defecto una función que corre el script del
 * bloque. Cada llamada lo vuelve a correr: el propio script se protege para
 * hacer su trabajo una sola vez por bloque (data-odes-iniciado).
 */
export function moduloDelScript(bloque: string): string {
  return [
    '// Generado por apps/web/pertinencia/plugin-vite.ts a partir del script de pertinencia-bloque.html.',
    'export default function ejecutarBloquePertinencia() {',
    scriptDelBloque(bloque),
    '}',
    '',
  ].join('\n')
}
