/**
 * Índice de búsqueda en memoria: prepara cada DocumentoPublico con las
 * palabras de cada campo y su peso, igual que el bloque v4.2.
 *
 * Pesos: título 3, palabras clave 2,5, categoría 2, subtítulo 1,5,
 * descripción 1, número 1 y año 1. El campo de categoría también lleva
 * "tablero interactivo", "entrada blog" (solo los productos de ese tipo) y,
 * en las versiones en inglés, "inglés english" más el nombre en inglés del
 * tipo ("issues note", "infographic"...). La descripción (30 palabras) se
 * agregó el 12 de noviembre de 2026 con su peso bajo: pesa menos que el
 * subtítulo para que una coincidencia ahí no adelante a un título.
 */
import type { DocumentoPublico, IdiomaProducto } from '../api-repositorio'
import { SIN_FECHA, datosTarjeta, type ClaveDocumento } from '../datos/presentacion'
import { parecido } from './parecido'
import { fichas, normalizar, siglas } from './texto'

/** Nombre en inglés de cada categoría (normalizada), para encontrar las versiones en inglés. */
const EN_INGLES: Readonly<Record<string, string>> = {
  boletin: 'bulletin',
  estudio: 'study',
  infografia: 'infographic',
  'nota tematica': 'issues note',
  'informe dinamico': 'dynamic report strategic intelligence',
  'informe de tendencias': 'trends megatrends report',
  'otros productos': 'other products',
}

export interface CampoBusqueda {
  peso: number
  fichas: string[]
}

export interface DocumentoIndexado {
  doc: DocumentoPublico
  /** Posición en el orden "Más recientes" (0 = más reciente). */
  posicion: number
  /** Textos limpios (espacios colapsados) que se muestran en la tarjeta. */
  titulo: string
  subtitulo: string
  descripcion: string
  textoCategoria: string
  /** Categoría normalizada: valor del filtro "Categoría". */
  categoria: string
  /** Solo los dígitos del número de edición ("" si no tiene). */
  numero: string
  /** "2024" o "sf". */
  anio: string
  idioma: IdiomaProducto
  /** Palabras clave sin repetidas (comparadas sin tildes ni mayúsculas), en su orden. */
  claves: ClaveDocumento[]
  tituloNormal: string
  campos: CampoBusqueda[]
}

/** Prepara un documento para la búsqueda. `posicion` es su lugar en "Más recientes". */
export function indexarDocumento(doc: DocumentoPublico, posicion: number): DocumentoIndexado {
  const t = datosTarjeta(doc)
  const ingles = t.idioma === 'en'
  const conEntrada = t.soloEntrada
  const fichasClaves = t.claves.flatMap((c) => [...fichas(c.texto), ...siglas(c.texto)])
  const textoTipo =
    t.textoCategoria +
    (t.tablero ? ' tablero interactivo' : '') +
    (conEntrada ? ' entrada blog' : '') +
    (ingles ? ` inglés english ${EN_INGLES[t.categoria] ?? ''}` : '')
  return {
    doc,
    posicion,
    titulo: t.titulo,
    subtitulo: t.subtitulo,
    descripcion: t.descripcion,
    textoCategoria: t.textoCategoria,
    categoria: t.categoria,
    numero: t.numero,
    anio: t.anio,
    idioma: t.idioma,
    claves: t.claves,
    tituloNormal: normalizar(t.titulo),
    campos: [
      { peso: 3, fichas: [...fichas(t.titulo), ...siglas(t.titulo)] },
      { peso: 2.5, fichas: fichasClaves },
      { peso: 2, fichas: fichas(textoTipo) },
      { peso: 1.5, fichas: [...fichas(t.subtitulo), ...siglas(t.subtitulo)] },
      { peso: 1, fichas: [...fichas(t.descripcion), ...siglas(t.descripcion)] },
      { peso: 1, fichas: t.numero ? [t.numero] : [] },
      { peso: 1, fichas: t.anio === SIN_FECHA ? fichas('sin fecha sf') : [t.anio] },
    ],
  }
}

/**
 * Índice de todos los documentos, en el orden "Más recientes": por `orden`
 * (1 = más reciente) y, a igualdad, en el orden en que llegaron.
 */
export function indexar(docs: readonly DocumentoPublico[]): DocumentoIndexado[] {
  return docs
    .map((doc, i) => ({ doc, i }))
    .sort((a, b) => (a.doc.orden ?? 0) - (b.doc.orden ?? 0) || a.i - b.i)
    .map(({ doc }, posicion) => indexarDocumento(doc, posicion))
}

/**
 * Puntaje de un documento para una búsqueda: suma lo mejor que encuentra cada
 * palabra (pesa más el título); 0 si alguna palabra no aparece. Si la frase
 * completa está en el título, suma 2.
 */
export function puntaje(d: DocumentoIndexado, consulta: readonly string[], frase: string): number {
  let total = 0
  for (const p of consulta) {
    let mejor = 0
    for (const campo of d.campos) {
      for (const w of campo.fichas) {
        const s = parecido(p, w) * campo.peso
        if (s > mejor) mejor = s
      }
    }
    if (!mejor) return 0
    total += mejor
  }
  if (frase && d.tituloNormal.indexOf(frase) !== -1) total += 2
  return total
}
