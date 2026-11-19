/**
 * Filtrar y ordenar (portado del bloque v4.2).
 *
 * - Dentro de un filtro basta con cumplir una de las casillas marcadas (O);
 *   entre filtros hay que cumplirlos todos (Y).
 * - Con texto en el buscador, cada documento recibe un puntaje (indice.ts);
 *   sin texto, todos los que pasan los filtros valen 1.
 * - "Más recientes" es el orden de los datos y "Más antiguos" el inverso.
 *   "Relevancia" pone primero lo que mejor coincide con el buscador (sin
 *   búsqueda, los más recientes). "Título (A–Z)" usa el orden alfabético
 *   español.
 */
import { puntaje, type DocumentoIndexado } from '../busqueda/indice'
import { comparar, terminos } from '../busqueda/texto'
import { contarActivos, type EstadoFiltros, type Orden, type Seleccion } from './estado'

export interface Coincidencia {
  d: DocumentoIndexado
  puntos: number
}

export interface Resultado {
  /** Documentos que coinciden, ya ordenados. */
  coinciden: Coincidencia[]
  /** Palabras útiles de la búsqueda (para resaltar). */
  consulta: string[]
  /** Casillas marcadas en total. */
  activos: number
  /** Hay búsqueda o algún filtro. */
  filtrando: boolean
}

function pasaFiltros(d: DocumentoIndexado, s: Seleccion): boolean {
  return (
    (!s.categoria.length || s.categoria.includes(d.categoria)) &&
    (!s.anio.length || s.anio.includes(d.anio)) &&
    (!s.clave.length || s.clave.some((c) => d.claves.some((k) => k.valor === c)))
  )
}

function ordenar(coinciden: Coincidencia[], orden: Orden, conBusqueda: boolean): Coincidencia[] {
  return coinciden.sort((a, b) => {
    if (orden === 'titulo') return comparar(a.d.titulo, b.d.titulo) || a.d.posicion - b.d.posicion
    if (orden === 'antiguo') return b.d.posicion - a.d.posicion
    if (orden === 'relevancia' && conBusqueda) return b.puntos - a.puntos || a.d.posicion - b.d.posicion
    return a.d.posicion - b.d.posicion
  })
}

export function filtrar(indice: readonly DocumentoIndexado[], estado: EstadoFiltros): Resultado {
  const consulta = terminos(estado.q)
  const frase = consulta.join(' ')
  const coinciden: Coincidencia[] = []
  for (const d of indice) {
    if (!pasaFiltros(d, estado.seleccion)) continue
    const puntos = consulta.length ? puntaje(d, consulta, frase) : 1
    if (puntos > 0) coinciden.push({ d, puntos })
  }
  const activos = contarActivos(estado.seleccion)
  return {
    coinciden: ordenar(coinciden, estado.orden, consulta.length > 0),
    consulta,
    activos,
    filtrando: consulta.length > 0 || activos > 0,
  }
}
