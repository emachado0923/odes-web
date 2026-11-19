/**
 * Resaltado de la búsqueda (portado del bloque v4.2): marca las palabras del
 * texto que se parecen a alguna palabra buscada de 2 letras o más.
 */
import { parecido } from './parecido'
import { normalizar } from './texto'

/** Un pedazo de texto; `marca` = se muestra dentro de <mark>. */
export interface Trozo {
  texto: string
  marca: boolean
}

const RE_PALABRA = /[0-9A-Za-z\u00C0-\u024F]+/g

/** Divide `texto` en pedazos marcados y sin marcar según la búsqueda (`consulta` = terminos(...)). */
export function trozosResaltados(texto: string, consulta: readonly string[]): Trozo[] {
  const utiles = consulta.filter((p) => p.length > 1)
  if (!utiles.length) return [{ texto, marca: false }]
  const trozos: Trozo[] = []
  let desde = 0
  for (const m of texto.matchAll(RE_PALABRA)) {
    const w = normalizar(m[0])
    if (!utiles.some((p) => parecido(p, w) > 0)) continue
    if (m.index > desde) trozos.push({ texto: texto.slice(desde, m.index), marca: false })
    trozos.push({ texto: m[0], marca: true })
    desde = m.index + m[0].length
  }
  if (!desde) return [{ texto, marca: false }]
  if (desde < texto.length) trozos.push({ texto: texto.slice(desde), marca: false })
  return trozos
}
