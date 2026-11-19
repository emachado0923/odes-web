/**
 * Estado de la búsqueda y los filtros, y su reflejo en la URL
 * (?q=…&categoria=…&anio=…&clave=…&orden=…), para poder compartir un enlace
 * con la búsqueda y volver a ella con Atrás.
 *
 * Los valores de las casillas son los normalizados (sin tildes ni
 * mayúsculas): categoria=boletin, anio=2024 o anio=sf, clave=acceso. Un
 * filtro admite varios valores (parámetro repetido).
 *
 * El filtro de idioma se quitó (comentarios del Observatorio, 12 de noviembre
 * de 2026): un enlace viejo con ?idioma= se ignora y el parámetro sale de la URL.
 */

export type NombreFaceta = 'categoria' | 'anio' | 'clave'
export const FACETAS: readonly NombreFaceta[] = ['categoria', 'anio', 'clave']

/** Parámetros de filtros que ya no existen: se ignoran al leer y se borran al escribir. */
const PARAMETROS_RETIRADOS = ['idioma'] as const

export type Orden = 'relevancia' | 'reciente' | 'antiguo' | 'titulo'
export const ORDENES: readonly { valor: Orden; texto: string }[] = [
  { valor: 'relevancia', texto: 'Relevancia' },
  { valor: 'reciente', texto: 'Más recientes' },
  { valor: 'antiguo', texto: 'Más antiguos' },
  { valor: 'titulo', texto: 'Título (A–Z)' },
]
export const ORDEN_INICIAL: Orden = 'relevancia'

export type Seleccion = Record<NombreFaceta, string[]>

export interface EstadoFiltros {
  /** Texto del buscador tal como se escribió. */
  q: string
  seleccion: Seleccion
  orden: Orden
}

export function seleccionVacia(): Seleccion {
  return { categoria: [], anio: [], clave: [] }
}

export const ESTADO_INICIAL: EstadoFiltros = { q: '', seleccion: seleccionVacia(), orden: ORDEN_INICIAL }

/** Máximo de caracteres del buscador que se leen de la URL. */
const MAX_Q = 200
/** Máximo de valores por filtro que se leen de la URL. */
const MAX_VALORES = 50

function esOrden(valor: string | null): valor is Orden {
  return ORDENES.some((o) => o.valor === valor)
}

/** Lee el estado de los parámetros de la URL (valores sin validar contra los datos). */
export function leerEstado(parametros: URLSearchParams): EstadoFiltros {
  const seleccion = seleccionVacia()
  for (const faceta of FACETAS) {
    const valores = parametros
      .getAll(faceta)
      .map((v) => v.trim())
      .filter(Boolean)
    seleccion[faceta] = [...new Set(valores)].slice(0, MAX_VALORES)
  }
  const orden = parametros.get('orden')
  return {
    q: (parametros.get('q') ?? '').slice(0, MAX_Q),
    seleccion,
    orden: esOrden(orden) ? orden : ORDEN_INICIAL,
  }
}

/**
 * Escribe el estado en parámetros de URL. Conserva los parámetros ajenos al
 * repositorio y omite los valores por defecto (sin búsqueda, "Relevancia").
 */
export function escribirEstado(estado: EstadoFiltros, base?: URLSearchParams): URLSearchParams {
  const parametros = new URLSearchParams(base)
  for (const nombre of ['q', 'orden', ...FACETAS, ...PARAMETROS_RETIRADOS]) parametros.delete(nombre)
  if (estado.q.trim()) parametros.set('q', estado.q)
  for (const faceta of FACETAS) {
    for (const valor of estado.seleccion[faceta]) parametros.append(faceta, valor)
  }
  if (estado.orden !== ORDEN_INICIAL) parametros.set('orden', estado.orden)
  return parametros
}

/** Deja en la selección solo los valores que existen en los datos (un enlace viejo puede traer otros). */
export function validarSeleccion(seleccion: Seleccion, existentes: Record<NombreFaceta, ReadonlySet<string>>): Seleccion {
  const limpia = seleccionVacia()
  for (const faceta of FACETAS) limpia[faceta] = seleccion[faceta].filter((v) => existentes[faceta].has(v))
  return limpia
}

/** Marca o desmarca un valor de un filtro. */
export function alternar(valores: readonly string[], valor: string): string[] {
  return valores.includes(valor) ? valores.filter((v) => v !== valor) : [...valores, valor]
}

/** Cuántas casillas hay marcadas en total. */
export function contarActivos(seleccion: Seleccion): number {
  return FACETAS.reduce((n, f) => n + seleccion[f].length, 0)
}
