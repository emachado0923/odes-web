/**
 * Formatos de números, porcentajes, fechas y tamaños para la interfaz del PAI
 * (es-CO, hora de Colombia). Puros y probados aparte (formatos.test.ts).
 */
import { ZONA_HORARIA_PAI } from '../api-pai'

const NUMERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const NUMERO_EXACTO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 })
// El signo % se agrega a mano con un espacio (norma del español): el formato
// 'percent' de Intl cambia según la versión de ICU ("85%" o "85 %").
const PORCENTAJE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })
const FECHA = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA_PAI, day: 'numeric', month: 'long', year: 'numeric' })
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA_PAI, day: 'numeric', month: 'long' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA_PAI,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Separadores de Intl (espacios finos y duros) como espacios normales: así se leen y se prueban igual. */
function espacios(texto: string): string {
  // \s incluye el espacio duro (U+00A0) y el fino (U+202F) que usa es-CO.
  return texto.replace(/\s/g, ' ')
}

/** Número para mostrar ("1.234,5"); "—" si es null. */
export function formatoNumero(valor: number | null | undefined, exacto = false): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return espacios((exacto ? NUMERO_EXACTO : NUMERO).format(valor))
}

/** Fracción como porcentaje ("85 %"); "—" si es null. */
export function formatoPorcentaje(fraccion: number | null | undefined): string {
  if (fraccion === null || fraccion === undefined || !Number.isFinite(fraccion)) return '—'
  return `${espacios(PORCENTAJE.format(fraccion * 100))} %`
}

function fecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const valor = new Date(iso)
  return Number.isNaN(valor.getTime()) ? null : valor
}

/** "15 de septiembre de 2026" (hora de Colombia); "" si no es una fecha. */
export function formatoFecha(iso: string | null | undefined): string {
  const valor = fecha(iso)
  return valor ? espacios(FECHA.format(valor)) : ''
}

/** "15 de septiembre" (hora de Colombia). */
export function formatoFechaCorta(iso: string | null | undefined): string {
  const valor = fecha(iso)
  return valor ? espacios(FECHA_CORTA.format(valor)) : ''
}

/** "15 sept 2026, 3:05 p. m." (hora de Colombia). */
export function formatoFechaHora(iso: string | null | undefined): string {
  const valor = fecha(iso)
  return valor ? espacios(FECHA_HORA.format(valor)) : ''
}

/** "2,4 MB", "830 KB", "120 B". */
export function formatoBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formatoNumero(Math.round(bytes / 1024))} KB`
  return `${formatoNumero(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`
}
