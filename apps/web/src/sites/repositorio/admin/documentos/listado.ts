/**
 * Listado de la administración (TypeScript puro): filtros, búsqueda, orden,
 * conteos y paginación de los documentos, y su estado en la URL.
 *
 * La búsqueda es la misma de la página pública (busqueda/indice.ts: difusa,
 * sin tildes, con pesos) y además encuentra por el identificador.
 */
import type { DocumentoAdmin, IdiomaProducto, TipoProducto } from '../../api-repositorio'
import { indexar, puntaje, type DocumentoIndexado } from '../../busqueda/indice'
import { comparar, normalizar, terminos } from '../../busqueda/texto'
import { claveNormalizada } from '../datos/formatos'

export const POR_PAGINA = 50

export type EstadoPublicacion = 'publicado' | 'despublicado'
/** Lo que le falta a un documento. */
export type Falta = 'archivo' | 'portada' | 'miniatura' | 'destino'
export type OrdenAdmin = 'relevancia' | 'posicion' | 'titulo' | 'categoria' | 'anio' | 'estado' | 'actualizado'
export type Direccion = 'asc' | 'desc'

export interface FiltrosAdmin {
  q: string
  /** Nombre de la categoría tal como está en la base ('' = todas). */
  categoria: string
  /**
   * Palabra clave exacta ('' = cualquiera), comparada como la base (sin
   * tildes ni mayúsculas): el enlace del conteo de Palabras clave lleva aquí.
   */
  clave: string
  estado: EstadoPublicacion | ''
  tipo: TipoProducto | ''
  idioma: IdiomaProducto | ''
  falta: Falta | ''
  /** null = orden por defecto (relevancia con búsqueda; si no, posición). */
  orden: OrdenAdmin | null
  dir: Direccion
  /** Desde 1. */
  pagina: number
}

export const FILTROS_INICIALES: FiltrosAdmin = {
  q: '',
  categoria: '',
  clave: '',
  estado: '',
  tipo: '',
  idioma: '',
  falta: '',
  orden: null,
  dir: 'asc',
  pagina: 1,
}

export const TEXTOS_FALTA: Record<Falta, string> = {
  archivo: 'Documentos sin archivo',
  portada: 'Sin portada',
  miniatura: 'Sin miniatura',
  destino: 'Sin archivo ni URL (no se pueden publicar)',
}

export const TEXTOS_ORDEN: Record<OrdenAdmin, string> = {
  relevancia: 'Relevancia',
  posicion: 'Posición en «Más recientes»',
  titulo: 'Título',
  categoria: 'Categoría',
  anio: 'Año',
  estado: 'Estado',
  actualizado: 'Última modificación',
}

const ESTADOS = new Set(['publicado', 'despublicado'])
const TIPOS = new Set(['documento', 'tablero', 'entrada'])
const IDIOMAS = new Set(['es', 'en'])
const FALTAS = new Set(Object.keys(TEXTOS_FALTA))
const ORDENES = new Set(Object.keys(TEXTOS_ORDEN))

function de<T extends string>(valor: string | null, permitidos: ReadonlySet<string>): T | '' {
  return valor && permitidos.has(valor) ? (valor as T) : ''
}

/** Estado de los filtros desde la URL (los valores desconocidos se ignoran). */
export function leerFiltros(p: URLSearchParams): FiltrosAdmin {
  const orden = de<OrdenAdmin>(p.get('orden'), ORDENES)
  const pagina = Number(p.get('pagina'))
  return {
    q: p.get('q') ?? '',
    categoria: p.get('categoria') ?? '',
    clave: p.get('clave') ?? '',
    estado: de<EstadoPublicacion>(p.get('estado'), ESTADOS),
    tipo: de<TipoProducto>(p.get('tipo'), TIPOS),
    idioma: de<IdiomaProducto>(p.get('idioma'), IDIOMAS),
    falta: de<Falta>(p.get('falta'), FALTAS),
    orden: orden || null,
    dir: p.get('dir') === 'desc' ? 'desc' : 'asc',
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  }
}

/** Parámetros de la URL para unos filtros (solo lo que no es el valor inicial). */
export function escribirFiltros(f: FiltrosAdmin): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q)
  if (f.categoria) p.set('categoria', f.categoria)
  if (f.clave.trim()) p.set('clave', f.clave)
  if (f.estado) p.set('estado', f.estado)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.idioma) p.set('idioma', f.idioma)
  if (f.falta) p.set('falta', f.falta)
  if (f.orden) {
    p.set('orden', f.orden)
    if (f.dir === 'desc') p.set('dir', 'desc')
  }
  if (f.pagina > 1) p.set('pagina', String(f.pagina))
  return p
}

export function hayFiltros(f: FiltrosAdmin): boolean {
  return Boolean(f.q.trim() || f.categoria || f.clave.trim() || f.estado || f.tipo || f.idioma || f.falta)
}

export function tieneDestino(d: Pick<DocumentoAdmin, 'archivo' | 'urlVerExterna'>): boolean {
  return d.archivo !== null || Boolean(d.urlVerExterna)
}

function falta(d: DocumentoAdmin, que: Falta): boolean {
  switch (que) {
    case 'archivo':
      return d.tipo === 'documento' && d.archivo === null
    case 'portada':
      return d.urlPortada === null
    case 'miniatura':
      return d.urlMiniatura === null
    case 'destino':
      return !tieneDestino(d)
  }
}

export interface IndiceAdmin {
  indexados: DocumentoIndexado[]
  porId: Map<string, DocumentoAdmin>
}

export function indexarAdmin(docs: readonly DocumentoAdmin[]): IndiceAdmin {
  return { indexados: indexar(docs), porId: new Map(docs.map((d) => [d.id, d])) }
}

export interface Fila {
  doc: DocumentoAdmin
  puntos: number
}

function valorOrden(d: DocumentoAdmin, orden: OrdenAdmin): string | number {
  switch (orden) {
    case 'titulo':
      return d.titulo
    case 'categoria':
      return d.categoria
    case 'anio':
      return d.anio ?? -1
    case 'estado':
      return d.publicado ? 1 : 0
    case 'actualizado':
      return Date.parse(d.actualizadoEn) || 0
    default:
      return d.orden
  }
}

/** Filtra, busca y ordena. */
export function filtrarDocumentos(indice: IndiceAdmin, f: FiltrosAdmin): Fila[] {
  const consulta = terminos(f.q)
  const frase = consulta.join(' ')
  const idBuscado = f.q.trim().toLowerCase()
  const categoria = normalizar(f.categoria)
  const clave = claveNormalizada(f.clave)
  const filas: Fila[] = []
  for (const d of indice.indexados) {
    const doc = indice.porId.get(d.doc.id)
    if (!doc) continue
    if (categoria && normalizar(doc.categoria) !== categoria) continue
    if (clave && !doc.claves.some((c) => claveNormalizada(c) === clave)) continue
    if (f.estado && (f.estado === 'publicado') !== doc.publicado) continue
    if (f.tipo && doc.tipo !== f.tipo) continue
    if (f.idioma && doc.idioma !== f.idioma) continue
    if (f.falta && !falta(doc, f.falta)) continue
    let puntos = 1
    if (consulta.length) {
      puntos = puntaje(d, consulta, frase)
      // El identificador también cuenta (p. ej., "boletin-19").
      if (idBuscado.length > 2 && doc.id.includes(idBuscado)) puntos = Math.max(puntos, 4)
    }
    if (puntos > 0) filas.push({ doc, puntos })
  }
  const orden: OrdenAdmin = f.orden ?? (consulta.length ? 'relevancia' : 'posicion')
  const signo = f.orden && f.dir === 'desc' ? -1 : 1
  return filas.sort((a, b) => {
    if (orden === 'relevancia') return b.puntos - a.puntos || a.doc.orden - b.doc.orden
    const va = valorOrden(a.doc, orden)
    const vb = valorOrden(b.doc, orden)
    const c = typeof va === 'string' && typeof vb === 'string' ? comparar(va, vb) : Number(va) - Number(vb)
    return signo * c || a.doc.orden - b.doc.orden
  })
}

export interface Resumen {
  total: number
  publicados: number
  despublicados: number
  sinArchivo: number
  sinPortada: number
  sinDestino: number
}

export function resumir(docs: readonly DocumentoAdmin[]): Resumen {
  const r: Resumen = { total: docs.length, publicados: 0, despublicados: 0, sinArchivo: 0, sinPortada: 0, sinDestino: 0 }
  for (const d of docs) {
    if (d.publicado) r.publicados++
    else r.despublicados++
    if (falta(d, 'archivo')) r.sinArchivo++
    if (falta(d, 'portada')) r.sinPortada++
    if (falta(d, 'destino')) r.sinDestino++
  }
  return r
}

export interface Pagina<T> {
  elementos: T[]
  pagina: number
  paginas: number
  desde: number
  hasta: number
}

/** Página `pagina` (desde 1), ajustada si se sale del rango. */
export function paginar<T>(lista: readonly T[], pagina: number, porPagina = POR_PAGINA): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina))
  const actual = Math.min(Math.max(1, pagina), paginas)
  const inicio = (actual - 1) * porPagina
  const elementos = lista.slice(inicio, inicio + porPagina)
  return {
    elementos,
    pagina: actual,
    paginas,
    desde: elementos.length ? inicio + 1 : 0,
    hasta: inicio + elementos.length,
  }
}
