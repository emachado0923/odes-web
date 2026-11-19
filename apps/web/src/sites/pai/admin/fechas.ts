/**
 * Fechas de los formularios de administración (fecha límite del bimestre,
 * vigencia de una autorización): un <input type="date"> da 'AAAA-MM-DD' y la
 * API recibe ISO. La fecha elegida vale hasta el final de ese día en hora de
 * Colombia (UTC-5 todo el año: Colombia no tiene horario de verano).
 */
import { ZONA_HORARIA_PAI } from '../api-pai'

const DESFASE_COLOMBIA = '-05:00'

const FECHA_ISO_COLOMBIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA_PAI,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'AAAA-MM-DD' del día en Colombia de una fecha (ISO o Date); '' si no es válida. */
export function diaColombia(fecha: string | Date | null | undefined): string {
  if (!fecha) return ''
  const valor = typeof fecha === 'string' ? new Date(fecha) : fecha
  return Number.isNaN(valor.getTime()) ? '' : FECHA_ISO_COLOMBIA.format(valor)
}

/** Hoy en Colombia ('AAAA-MM-DD'), para el atributo min de los campos de fecha. */
export function hoyColombia(ahora: Date = new Date()): string {
  return diaColombia(ahora)
}

/**
 * ISO del último instante del día 'AAAA-MM-DD' en Colombia (23:59:59.999), o
 * null si el texto no es una fecha real (p. ej., 2026-02-30).
 */
export function finDelDiaColombia(dia: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const valor = new Date(`${dia}T23:59:59.999${DESFASE_COLOMBIA}`)
  if (Number.isNaN(valor.getTime()) || diaColombia(valor) !== dia) return null
  return valor.toISOString()
}

/**
 * Días que puede durar una autorización desde hoy. El servidor admite hasta
 * 366 días desde el momento de otorgarla; con 365 días, el final de ese día
 * en Colombia siempre cabe.
 */
export const DIAS_MAX_AUTORIZACION = 365

/** Último día ('AAAA-MM-DD', Colombia) que se puede elegir como vencimiento de una autorización. */
export function diaMaxAutorizacion(ahora: Date = new Date()): string {
  return diaColombia(new Date(ahora.getTime() + DIAS_MAX_AUTORIZACION * 86_400_000))
}
