/**
 * Revisiones de los archivos elegidos antes de subirlos (tipo y tamaño). El
 * servidor vuelve a revisar el contenido real.
 */
import { LIMITES_REPOSITORIO } from '../../api-repositorio'
import { tamanoLegible, tipoPermitido } from '../datos/formatos'

/** Error del archivo elegido, o null si se puede subir. */
export function revisarArchivo(archivo: { name: string; type: string; size: number }): string | null {
  const tipo = tipoPermitido(archivo)
  if (!tipo) {
    return `«${archivo.name}» no es un tipo permitido. Se aceptan PDF, PNG, JPEG, DOCX y PPTX.`
  }
  if (archivo.size === 0) return `«${archivo.name}» está vacío.`
  if (archivo.size > LIMITES_REPOSITORIO.maxBytesArchivo) {
    return `«${archivo.name}» pesa ${tamanoLegible(archivo.size)}; el máximo es ${tamanoLegible(LIMITES_REPOSITORIO.maxBytesArchivo)}.`
  }
  return null
}

/** Tamaño máximo de una imagen de origen (se recompone; la portada final pesa mucho menos). */
export const MAX_BYTES_IMAGEN_ORIGEN = 25 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']

export function revisarImagen(archivo: { name: string; type: string; size: number }): string | null {
  if (!TIPOS_IMAGEN.includes(archivo.type.toLowerCase())) {
    return `«${archivo.name}» no es una imagen JPEG, PNG o WebP.`
  }
  if (archivo.size > MAX_BYTES_IMAGEN_ORIGEN) {
    return `La imagen pesa ${tamanoLegible(archivo.size)}; el máximo es ${tamanoLegible(MAX_BYTES_IMAGEN_ORIGEN)}.`
  }
  return null
}
