import { useLayoutEffect, useRef } from 'react'
import bloque from '../../../../pertinencia/pertinencia-bloque.html?raw'
import ejecutarBloque from '../../../../pertinencia/pertinencia-bloque.html?script'

/**
 * El contenido de /pertinencia: el bloque de WordPress
 * (apps/web/pertinencia/pertinencia-bloque.html), la única fuente de la
 * página. Es el mismo archivo que se pega en un "Raw HTML" de
 * https://sapiencia.gov.co/metodologia_de_pertinencia/, así que todo cambio
 * del contenido se hace allí (ver apps/web/pertinencia/LEEME.md), nunca aquí.
 *
 * - Estilos y contenido: el archivo tal cual (?raw), con innerHTML. Su
 *   <script> en línea no corre (innerHTML nunca ejecuta scripts, y la CSP del
 *   sitio tampoco lo dejaría).
 * - Script: el mismo, servido como módulo por pertinencia/plugin-vite.ts
 *   (?script) y corrido al montar. Antes de correrlo se pone el tablero
 *   estático del propio sitio en el espacio del tablero (data-odes-tablero-url):
 *   el bloque viaja sin dirección y aquí siempre se muestra el tablero.
 */

/** Tablero de pertinencia del propio sitio (public/tableros/pertinencia/, versión resumida). */
export const URL_TABLERO = '/tableros/pertinencia/index.html'

// Constante de módulo: React no vuelve a escribir el innerHTML en cada render (el script cambia el DOM del bloque).
const CONTENIDO = { __html: bloque }

export default function BloquePertinencia() {
  const contenedor = useRef<HTMLDivElement>(null)
  const iniciado = useRef(false)

  // Antes de pintar, para que no se alcance a ver el recuadro punteado en lugar del tablero. En StrictMode el
  // efecto corre dos veces sobre el mismo DOM: la segunda no hace nada (y el script se protege igual).
  useLayoutEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    contenedor.current?.querySelector('[data-odes-tablero-url]')?.setAttribute('data-odes-tablero-url', URL_TABLERO)
    ejecutarBloque()
  }, [])

  return <div ref={contenedor} dangerouslySetInnerHTML={CONTENIDO} />
}
