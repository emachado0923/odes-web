/**
 * Textos y reglas del ingreso y del cambio de contraseña (puros; probados en
 * textos.test.ts).
 */
import { LIMITES_PAI } from '../api-pai'

/** "Espere 15 minutos" a partir de los segundos de Retry-After (429). */
export function textoBloqueo(segundos: number | null): string {
  if (segundos === null) return 'Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.'
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  return `Demasiados intentos fallidos. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e intente de nuevo.`
}

/** Quien administra el aplicativo: recibe el correo de "¿Olvidó su contraseña?". */
export const CORREO_SOPORTE_PAI = 'juan.escobar@sapiencia.gov.co'

/**
 * mailto: de "¿Olvidó su contraseña?", con asunto y cuerpo listos y el
 * usuario si ya lo escribió (saltos CRLF, como pide el RFC 6068).
 */
export function enlaceOlvidoContrasena(usuario: string): string {
  const cuerpo = [
    'Hola:',
    '',
    'Olvidé mi contraseña del Plan de Acción Institucional (PAI). ¿Me ayuda a restablecerla?',
    '',
    `Usuario: ${usuario.trim().toLowerCase()}`,
  ].join('\r\n')
  const asunto = 'PAI: olvidé mi contraseña'
  return `mailto:${CORREO_SOPORTE_PAI}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}

/** Reglas de la contraseña, para la ayuda de los formularios. */
export const AYUDA_CONTRASENA = `Mínimo ${LIMITES_PAI.minContrasena} caracteres, sin espacios al inicio ni al final.`

/**
 * Caracteres de una contraseña como los cuenta el servidor: puntos de código
 * después de normalizar a NFC (un emoji cuenta 1, no 2 unidades UTF-16).
 */
export function largoContrasena(contrasena: string): number {
  return [...contrasena.normalize('NFC')].length
}

/**
 * Problema de una contraseña (las mismas reglas del servidor: entre 12 y 1024
 * caracteres, sin espacios al inicio ni al final), o null si sirve.
 */
export function problemaContrasena(contrasena: string): string | null {
  if (!contrasena) return 'Escriba la contraseña.'
  const largo = largoContrasena(contrasena)
  if (largo < LIMITES_PAI.minContrasena) {
    return `La contraseña debe tener al menos ${LIMITES_PAI.minContrasena} caracteres.`
  }
  if (largo > LIMITES_PAI.maxContrasena) {
    return `La contraseña no puede tener más de ${LIMITES_PAI.maxContrasena} caracteres.`
  }
  if (contrasena.trim() !== contrasena) return 'La contraseña no puede empezar ni terminar con espacios.'
  return null
}

export interface DatosCambioContrasena {
  actual: string
  nueva: string
  confirmacion: string
}

export type CampoCambioContrasena = keyof DatosCambioContrasena

/** Errores por campo del formulario de cambio de contraseña (vacío si se puede enviar). */
export function erroresCambioContrasena(
  datos: DatosCambioContrasena,
): Partial<Record<CampoCambioContrasena, string>> {
  const errores: Partial<Record<CampoCambioContrasena, string>> = {}
  if (!datos.actual) errores.actual = 'Escriba su contraseña actual.'
  const nueva = problemaContrasena(datos.nueva)
  if (nueva) errores.nueva = datos.nueva ? nueva : 'Escriba la contraseña nueva.'
  else if (datos.actual && datos.nueva === datos.actual) errores.nueva = 'La contraseña nueva debe ser distinta de la actual.'
  if (!errores.nueva && datos.confirmacion !== datos.nueva) errores.confirmacion = 'La confirmación no coincide con la contraseña nueva.'
  return errores
}
