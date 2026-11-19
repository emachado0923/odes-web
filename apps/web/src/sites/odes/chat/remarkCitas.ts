/**
 * Plugin de remark que convierte las marcas de cita (⟦n⟧) del texto en nodos
 * `<sup data-cita="n">n</sup>`. TextoMarkdown los dibuja como número volado
 * que enlaza con la fuente n.
 *
 * - Solo se buscan marcas en nodos de texto: dentro de `código` quedan tal cual.
 * - Dentro de un enlace se quitan (un enlace no puede contener otro enlace).
 */
import { PATRON_MARCA_CITA } from './protocolo'

interface NodoMd {
  type: string
  value?: string
  children?: NodoMd[]
  data?: Record<string, unknown>
}

const TIPOS_ENLACE = new Set(['link', 'linkReference'])

function dividirTexto(valor: string): NodoMd[] {
  const patron = new RegExp(PATRON_MARCA_CITA.source, 'g')
  const nodos: NodoMd[] = []
  let ultimo = 0
  for (const coincidencia of valor.matchAll(patron)) {
    const inicio = coincidencia.index
    if (inicio > ultimo) nodos.push({ type: 'text', value: valor.slice(ultimo, inicio) })
    const indice = coincidencia[1]
    nodos.push({
      type: 'citaOdes',
      data: { hName: 'sup', hProperties: { className: ['odes-cita'], dataCita: indice } },
      children: [{ type: 'text', value: indice }],
    })
    ultimo = inicio + coincidencia[0].length
  }
  if (ultimo < valor.length) nodos.push({ type: 'text', value: valor.slice(ultimo) })
  return nodos
}

function recorrer(nodo: NodoMd, dentroDeEnlace: boolean): void {
  if (!nodo.children) return
  const enlace = dentroDeEnlace || TIPOS_ENLACE.has(nodo.type)
  const hijos: NodoMd[] = []
  for (const hijo of nodo.children) {
    if (hijo.type === 'text' && typeof hijo.value === 'string' && hijo.value.includes('⟦')) {
      if (enlace) hijos.push({ ...hijo, value: hijo.value.replace(PATRON_MARCA_CITA, '') })
      else hijos.push(...dividirTexto(hijo.value))
    } else {
      recorrer(hijo, enlace)
      hijos.push(hijo)
    }
  }
  nodo.children = hijos
}

export default function remarkCitas() {
  return (arbol: object): void => {
    recorrer(arbol as NodoMd, false)
  }
}
