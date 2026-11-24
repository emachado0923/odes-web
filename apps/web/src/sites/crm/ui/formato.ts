/**
 * Fechas y cantidades para leer, en español de Colombia y con la hora de
 * Bogotá (la misma que usa el servidor para decir si una tarea está vencida).
 */
import { esFechaValida, type TareaCrm } from '../api-crm'

const ZONA = 'America/Bogota'

const DIA_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
const DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const DIA_ANO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const DIA_LARGO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA })
const HORA_DEL_DIA = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: ZONA })

/** El día de `ahora` en Bogotá, 'AAAA-MM-DD'. */
export function hoyBogota(ahora: Date = new Date()): string {
  return DIA_ISO.format(ahora)
}

/** El día (en Bogotá) de una marca ISO 8601: '2026-11-21T02:10:00Z' → '2026-11-20'. */
export function diaDe(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '' : hoyBogota(fecha)
}

function utc(fecha: string): Date | null {
  if (!esFechaValida(fecha)) return null
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

/** Días de `desde` a `hasta` (fechas 'AAAA-MM-DD'); negativo si `hasta` ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  const a = utc(desde)
  const b = utc(hasta)
  if (!a || !b) return Number.NaN
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** '2026-11-28' → «28 de nov»; con el año si no es el de `hoy`: «3 de ene de 2027». */
export function fechaCorta(fecha: string, hoy: string = hoyBogota()): string {
  const f = utc(fecha)
  if (!f) return fecha
  return fecha.slice(0, 4) === hoy.slice(0, 4) ? DIA.format(f) : DIA_ANO.format(f)
}

/** '2026-11-28' → «28 de noviembre de 2026». */
export function fechaLarga(fecha: string): string {
  const f = utc(fecha)
  return f ? DIA_LARGO.format(f) : fecha
}

/** Marca ISO 8601 → «20 de nov, 3:15 p. m.» (hora de Bogotá; con el año si no es el de hoy). */
export function fechaHora(iso: string, hoy: string = hoyBogota()): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return `${fechaCorta(hoyBogota(fecha), hoy)}, ${HORA.format(fecha)}`
}

export type TonoFecha = 'normal' | 'pronto' | 'vencida' | 'terminada'

export interface TextoFecha {
  tono: TonoFecha
  /** Palabra que va resaltada antes del texto («Vencida»). */
  etiqueta?: string
  texto: string
  /** La fecha completa, para el lector de pantalla y el title. */
  completa: string
}

/**
 * Lo que dice la tarjeta de una tarea sobre su fecha: «Vence el 28 de nov»,
 * «Vence hoy», «Vence mañana», «Vencida, era para el 12 de nov» o
 * «Terminada el 20 de nov». null si no hay nada que decir.
 */
export function textoFechaTarea(
  tarea: Pick<TareaCrm, 'fechaLimite' | 'vencida' | 'estado' | 'terminadaEn'>,
  hoy: string = hoyBogota(),
): TextoFecha | null {
  if (tarea.estado === 'terminada') {
    const dia = tarea.terminadaEn ? diaDe(tarea.terminadaEn) : ''
    if (!dia) return null
    return { tono: 'terminada', texto: `Terminada el ${fechaCorta(dia, hoy)}`, completa: `Terminada el ${fechaLarga(dia)}` }
  }
  if (!tarea.fechaLimite || !esFechaValida(tarea.fechaLimite)) return null
  const completa = `Fecha límite: ${fechaLarga(tarea.fechaLimite)}`
  if (tarea.vencida) {
    return { tono: 'vencida', etiqueta: 'Vencida', texto: `era para el ${fechaCorta(tarea.fechaLimite, hoy)}`, completa }
  }
  const dias = diasEntre(hoy, tarea.fechaLimite)
  if (dias === 0) return { tono: 'pronto', texto: 'Vence hoy', completa }
  if (dias === 1) return { tono: 'pronto', texto: 'Vence mañana', completa }
  return { tono: 'normal', texto: `Vence el ${fechaCorta(tarea.fechaLimite, hoy)}`, completa }
}

/** «1 tarea», «3 tareas». */
export function plural(cantidad: number, uno: string, varios: string): string {
  return `${cantidad.toLocaleString('es-CO')} ${cantidad === 1 ? uno : varios}`
}

/** Une con comas y una «y» final: «3 pendientes, 1 en proceso y 2 vencidas». */
export function unirConY(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** «Buenos días», «Buenas tardes» o «Buenas noches», según la hora de Bogotá. */
export function saludo(ahora: Date = new Date()): string {
  const hora = Number(HORA_DEL_DIA.format(ahora))
  if (hora >= 5 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
