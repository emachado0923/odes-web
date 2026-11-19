/**
 * Datos de presentación de un documento, compartidos por el índice de
 * búsqueda y la tarjeta (las mismas reglas que el bloque v4.2: textos con los
 * espacios colapsados, solo los dígitos del número, "sf" sin año, palabras
 * clave sin repetidas). La tarjeta ya no muestra el número ni el idioma, pero
 * la búsqueda los sigue usando.
 */
import type { DocumentoPublico, IdiomaProducto } from '../api-repositorio'
import { comparar, normalizar } from '../busqueda/texto'

/** Valor de año (filtro y URL) de los documentos sin fecha ("S. F."). */
export const SIN_FECHA = 'sf'

export interface ClaveDocumento {
  /** Normalizada (sin tildes ni mayúsculas): valor del filtro "Palabra clave". */
  valor: string
  /** Tal como está escrita en el documento. */
  texto: string
}

export interface DatosTarjeta {
  titulo: string
  subtitulo: string
  /** Descripción del producto (unas 30 palabras); "" si no tiene. */
  descripcion: string
  textoCategoria: string
  /** Categoría normalizada: valor del filtro "Categoría". */
  categoria: string
  /** Solo los dígitos del número de edición ("" si no tiene). */
  numero: string
  /** "2024" o "sf". */
  anio: string
  idioma: IdiomaProducto
  tablero: boolean
  /** Documento que solo existe como entrada del blog. */
  soloEntrada: boolean
  /** En orden alfabético (pedido del Observatorio, 14 de noviembre de 2026). */
  claves: ClaveDocumento[]
  nota: string
}

/** Espacios colapsados y recortados. */
export function limpiar(texto: unknown): string {
  return String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function datosTarjeta(doc: DocumentoPublico): DatosTarjeta {
  const textoCategoria = limpiar(doc.categoria) || 'Sin categoría'
  const anioTexto = String(doc.anio ?? '').trim()
  const claves: ClaveDocumento[] = []
  for (const original of Array.isArray(doc.claves) ? doc.claves : []) {
    const texto = String(original ?? '').trim()
    const valor = normalizar(texto)
    if (!valor || claves.some((c) => c.valor === valor)) continue
    claves.push({ valor, texto })
  }
  claves.sort((a, b) => comparar(a.texto, b.texto))
  return {
    titulo: limpiar(doc.titulo) || 'Documento sin título',
    subtitulo: limpiar(doc.subtitulo),
    descripcion: limpiar(doc.descripcion),
    textoCategoria,
    categoria: normalizar(textoCategoria),
    numero: String(doc.numero ?? '').replace(/\D+/g, ''),
    anio: /^\d{4}$/.test(anioTexto) ? anioTexto : SIN_FECHA,
    idioma: doc.idioma === 'en' ? 'en' : 'es',
    tablero: doc.tipo === 'tablero',
    soloEntrada: doc.tipo === 'entrada',
    claves,
    nota: limpiar(doc.nota),
  }
}

/** id del título de la tarjeta de un documento (aria-describedby de sus acciones y destino del foco). */
export function idTituloDocumento(id: string): string {
  return `rp-doc-${id.replace(/[^\w-]/g, '_')}`
}
