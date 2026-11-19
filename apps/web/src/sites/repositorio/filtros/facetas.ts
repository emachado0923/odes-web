/**
 * Opciones de los filtros de casillas (Categoría, Año y Palabra clave),
 * armadas con lo que hay en los datos:
 *
 * - Categoría: de la que tiene más productos a la que tiene menos
 *   (comentarios del Observatorio, 12 de noviembre de 2026); a igualdad, el
 *   orden configurado en la administración (ListadoPublico.categorias) y
 *   luego el alfabético.
 * - Año: del más reciente al más antiguo y "Sin fecha" al final.
 * - Palabra clave: en orden alfabético (pedido del Observatorio, 14 de
 *   noviembre de 2026). El panel no muestra cuántos productos tiene cada una
 *   (FacetaCasillas, conTotal).
 *
 * Cada opción lleva sus palabras para el buscador del panel.
 */
import { SIN_FECHA } from '../datos/presentacion'
import type { DocumentoIndexado } from '../busqueda/indice'
import { parecido } from '../busqueda/parecido'
import { comparar, fichas, normalizar, siglas, terminos } from '../busqueda/texto'
import type { NombreFaceta } from './estado'

export interface OpcionFaceta {
  valor: string
  texto: string
  /** Documentos que la tienen. */
  total: number
  fichas: string[]
}

export type OpcionesFacetas = Record<NombreFaceta, OpcionFaceta[]>

/** Con 5 opciones o menos el panel no necesita buscador. */
export const MAX_SIN_BUSCADOR = 5

type Conteo = Map<string, { texto: string; total: number }>

function contar(mapa: Conteo, valor: string, texto: string): void {
  const actual = mapa.get(valor)
  if (actual) actual.total += 1
  else mapa.set(valor, { texto, total: 1 })
}

function opciones(mapa: Conteo, orden: (a: string, b: string) => number): OpcionFaceta[] {
  return [...mapa.keys()].sort(orden).map((valor) => {
    const { texto, total } = mapa.get(valor)!
    return {
      valor,
      texto,
      total,
      fichas: [...fichas(texto + (valor === SIN_FECHA ? ' sf' : '')), ...siglas(texto)],
    }
  })
}

export function construirFacetas(
  indice: readonly DocumentoIndexado[],
  ordenCategorias: readonly string[] = [],
): OpcionesFacetas {
  const vistos: Record<NombreFaceta, Conteo> = {
    categoria: new Map(),
    anio: new Map(),
    clave: new Map(),
  }
  for (const d of indice) {
    for (const c of d.claves) contar(vistos.clave, c.valor, c.texto)
    contar(vistos.categoria, d.categoria, d.textoCategoria)
    contar(vistos.anio, d.anio, d.anio === SIN_FECHA ? 'Sin fecha' : d.anio)
  }
  const posicionCategoria = new Map(ordenCategorias.map((c, i) => [normalizar(c), i]))
  const textoDe = (mapa: Conteo, valor: string) => mapa.get(valor)!.texto
  const totalDe = (mapa: Conteo, valor: string) => mapa.get(valor)!.total
  return {
    categoria: opciones(vistos.categoria, (a, b) => {
      const porTotal = totalDe(vistos.categoria, b) - totalDe(vistos.categoria, a)
      if (porTotal) return porTotal
      const pa = posicionCategoria.get(a) ?? Infinity
      const pb = posicionCategoria.get(b) ?? Infinity
      if (pa !== pb) return pa < pb ? -1 : 1
      return comparar(textoDe(vistos.categoria, a), textoDe(vistos.categoria, b))
    }),
    anio: opciones(vistos.anio, (a, b) => {
      if (a === SIN_FECHA || b === SIN_FECHA) return a === b ? 0 : a === SIN_FECHA ? 1 : -1
      return b.localeCompare(a, 'es', { numeric: true })
    }),
    clave: opciones(vistos.clave, (a, b) => comparar(textoDe(vistos.clave, a), textoDe(vistos.clave, b))),
  }
}

/** Buscador de cada panel: las opciones que se parecen a lo escrito (todas si no hay texto). */
export function opcionesVisibles(opciones: readonly OpcionFaceta[], q: string): OpcionFaceta[] {
  const consulta = terminos(q)
  return opciones.filter((o) => consulta.every((p) => o.fichas.some((w) => parecido(p, w) > 0)))
}
