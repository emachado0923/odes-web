/**
 * Formatos de la administración: tamaños, fechas, tipos de archivo y
 * comparación de palabras clave (la misma clave que usa el servidor:
 * sin tildes ni mayúsculas y con espacios simples).
 */
import { TIPOS_ARCHIVO_PERMITIDOS } from '../../api-repositorio'

const NUMERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** "1,4 MB", "820 kB", "512 bytes". */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${NUMERO.format(bytes / 1024)} kB`
  return `${NUMERO.format(bytes / (1024 * 1024))} MB`
}

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const FECHA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })

function aFecha(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fechaHora(iso: string): string {
  const d = aFecha(iso)
  return d ? FECHA_HORA.format(d) : '—'
}

export function fechaCorta(iso: string): string {
  const d = aFecha(iso)
  return d ? FECHA.format(d) : '—'
}

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Nombre corto del tipo de archivo. */
const NOMBRES_TIPO: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

export function nombreTipo(mime: string): string {
  return NOMBRES_TIPO[mime.toLowerCase()] ?? (mime || 'desconocido')
}

/** Tipo MIME de cada extensión aceptada (algunos sistemas no informan el tipo de los DOCX/PPTX). */
const MIME_POR_EXTENSION: Record<string, (typeof TIPOS_ARCHIVO_PERMITIDOS)[number]> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const EXTENSIONES_PERMITIDAS = '.pdf,.png,.jpg,.jpeg,.docx,.pptx'

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.')
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : ''
}

/**
 * Tipo MIME permitido del archivo (por su tipo declarado o, si falta, por la
 * extensión), o null si no es PDF, PNG, JPEG, DOCX ni PPTX. Si el tipo y la
 * extensión se contradicen, no se acepta (el servidor también lo rechaza).
 */
export function tipoPermitido(archivo: { name: string; type: string }): string | null {
  const permitidos: readonly string[] = TIPOS_ARCHIVO_PERMITIDOS
  const declarado = archivo.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : archivo.type.toLowerCase()
  const porExtension = MIME_POR_EXTENSION[extensionDe(archivo.name)] ?? null
  if (declarado && declarado !== 'application/octet-stream') {
    if (!permitidos.includes(declarado)) return null
    if (porExtension && porExtension !== declarado) return null
    return declarado
  }
  return porExtension
}

/** Extensión canónica de un tipo MIME (la que usan las descargas). */
export function extensionDeTipo(mime: string): string {
  const e = Object.entries(MIME_POR_EXTENSION).find(([, m]) => m === mime)
  return mime === 'image/jpeg' ? 'jpg' : (e?.[0] ?? 'bin')
}

/** Texto de una línea: NFC y espacios simples (como lo guarda el servidor). */
export function textoLinea(texto: string): string {
  return texto.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/**
 * Clave de comparación de una palabra clave, igual que el servidor
 * (claveNormalizada): sin tildes ni diéresis (la ñ pasa a n), minúsculas y
 * espacios simples. "Educación  Superior" = "educacion superior".
 */
export function claveNormalizada(texto: string): string {
  return textoLinea(texto)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** Plural sencillo: "1 documento", "3 documentos". */
export function cantidad(n: number, singular: string, plural = `${singular}s`): string {
  return `${NUMERO.format(n)} ${n === 1 ? singular : plural}`
}
