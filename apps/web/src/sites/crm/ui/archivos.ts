/**
 * Archivos antes de subirlos: de qué tipo son (para el ícono) y si se pueden
 * subir (extensión y tamaño), con un mensaje que dice qué hacer. El servidor
 * vuelve a validar por la firma del archivo: esto solo evita esperar una
 * subida que se va a rechazar.
 */
import { EXTENSIONES_ARCHIVO_CRM, LIMITES_CRM, tamanoLegible } from '../api-crm'

export type TipoArchivo = 'pdf' | 'texto' | 'hoja' | 'presentacion' | 'imagen' | 'otro'

/** '.pdf' de «Informe final.PDF»; '' si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.')
  return punto > 0 && punto < nombre.length - 1 ? nombre.slice(punto).toLowerCase() : ''
}

export function tipoArchivo(nombre: string, mime = ''): TipoArchivo {
  const extension = extensionDe(nombre)
  if (extension === '.pdf' || mime === 'application/pdf') return 'pdf'
  if (extension === '.docx' || extension === '.doc' || mime.includes('wordprocessing')) return 'texto'
  if (extension === '.xlsx' || extension === '.xls' || mime.includes('spreadsheet')) return 'hoja'
  if (extension === '.pptx' || extension === '.ppt' || mime.includes('presentation')) return 'presentacion'
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension) || mime.startsWith('image/')) return 'imagen'
  return 'otro'
}

const NOMBRE_FORMATO: Readonly<Record<string, string>> = {
  '.pdf': 'PDF',
  '.docx': 'Word',
  '.xlsx': 'Excel',
  '.pptx': 'PowerPoint',
}

/** «PDF, Word, Excel, PowerPoint o imágenes (PNG, JPG o WEBP)». */
export function formatosLegibles(extensiones: readonly string[] = EXTENSIONES_ARCHIVO_CRM): string {
  const partes: string[] = []
  const imagenes: string[] = []
  for (const extension of extensiones) {
    if (NOMBRE_FORMATO[extension]) partes.push(NOMBRE_FORMATO[extension])
    else if (extension === '.jpeg') continue
    else imagenes.push(extension.slice(1).toUpperCase())
  }
  if (imagenes.length > 0) {
    const lista = imagenes.length === 1 ? imagenes[0] : `${imagenes.slice(0, -1).join(', ')} o ${imagenes[imagenes.length - 1]}`
    partes.push(partes.length > 0 ? `imágenes (${lista})` : `una imagen ${lista}`)
  }
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} o ${partes[partes.length - 1]}`
}

export interface ReglasArchivo {
  extensiones?: readonly string[]
  maxBytes?: number
}

/**
 * null si el archivo se puede subir; si no, el mensaje para mostrar, p. ej.
 * «acta.zip» no se puede subir. Use PDF, Word, Excel, PowerPoint o imágenes
 * (PNG, JPG o WEBP). Por defecto, las reglas de los archivos de las tareas.
 */
export function validarArchivo(archivo: File, reglas: ReglasArchivo = {}): string | null {
  const extensiones = reglas.extensiones ?? EXTENSIONES_ARCHIVO_CRM
  const maxBytes = reglas.maxBytes ?? LIMITES_CRM.maxBytesArchivo
  if (!extensiones.includes(extensionDe(archivo.name))) {
    return `«${archivo.name}» no se puede subir. Use ${formatosLegibles(extensiones)}.`
  }
  if (archivo.size === 0) return `«${archivo.name}» está vacío. Elija otro archivo.`
  if (archivo.size > maxBytes) {
    return `«${archivo.name}» pesa ${tamanoLegible(archivo.size)}; el máximo es ${tamanoLegible(maxBytes)}.`
  }
  return null
}
