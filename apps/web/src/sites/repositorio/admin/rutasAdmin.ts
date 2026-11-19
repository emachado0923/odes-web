/** Rutas de la administración (bajo /repositorio/admin). */
import { RUTA_ADMIN } from '../rutas'

export { RUTA_ADMIN }
export const RUTA_DOCUMENTOS = RUTA_ADMIN
export const RUTA_NUEVO = `${RUTA_ADMIN}/documentos/nuevo`
export const RUTA_CATEGORIAS = `${RUTA_ADMIN}/categorias`
export const RUTA_PALABRAS = `${RUTA_ADMIN}/palabras-clave`
export const RUTA_CAMBIOS = `${RUTA_ADMIN}/cambios`
export const RUTA_ASISTENTE = `${RUTA_ADMIN}/asistente`

export function rutaDocumento(id: string): string {
  return `${RUTA_ADMIN}/documentos/${encodeURIComponent(id)}`
}

export function rutaCambiosDe(id: string): string {
  return `${RUTA_CAMBIOS}?documento=${encodeURIComponent(id)}`
}
