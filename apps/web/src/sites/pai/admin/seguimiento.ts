/**
 * Lógica pura del seguimiento (probada en seguimiento.test.ts): color de las
 * barras de avance, su leyenda, textos del conteo del bimestre abierto
 * (los mismos en el seguimiento y en la cabecera de cada proceso del
 * tablero) y qué bimestres aún no se reportan.
 */
import { NUMEROS_BIMESTRE, type ConteoEstadosPai, type NumeroBimestre, type TableroPai } from '../api-pai'
import { formatoNumero } from '../datos/formatos'

/** Desde aquí el logro se pinta como completo (verde): el mismo umbral del tablero (100 % de la meta). */
export const UMBRAL_COMPLETO = 1
/** Desde aquí, parcial (amarillo); por debajo, bajo (rojo). */
export const UMBRAL_PARCIAL = 0.5

/** Tolerancia para comparar con 100 % (los decimales de Excel llegan redondeados). */
const TOLERANCIA = 1e-9

export type NivelAvance = 'completo' | 'parcial' | 'bajo' | 'sin_dato'

export function nivelAvance(fraccion: number | null | undefined): NivelAvance {
  if (fraccion === null || fraccion === undefined || !Number.isFinite(fraccion)) return 'sin_dato'
  if (fraccion >= UMBRAL_COMPLETO - TOLERANCIA) return 'completo'
  if (fraccion >= UMBRAL_PARCIAL - TOLERANCIA) return 'parcial'
  return 'bajo'
}

/** Variante de color de la barra `progress` del kit. */
export function claseProgreso(fraccion: number | null | undefined): string {
  const clases: Record<NivelAvance, string> = {
    completo: 'progress-success',
    parcial: 'progress-warning',
    bajo: 'progress-danger',
    sin_dato: 'progress-neutral',
  }
  return clases[nivelAvance(fraccion)]
}

/** Leyenda de las barras del seguimiento, en orden (el color nunca va solo: el % se ve siempre). */
export const LEYENDA_NIVELES: readonly { nivel: Exclude<NivelAvance, 'sin_dato'>; clase: string; texto: string }[] = [
  { nivel: 'completo', clase: claseProgreso(1), texto: '100 % o más de la meta' },
  { nivel: 'parcial', clase: claseProgreso(UMBRAL_PARCIAL), texto: 'del 50 % al 99 %' },
  { nivel: 'bajo', clase: claseProgreso(0), texto: 'menos del 50 %' },
]

/** Ancho de la barra (0-100): un logro de más de 100 % llena la barra. */
export function anchoBarra(fraccion: number | null | undefined): number {
  if (fraccion === null || fraccion === undefined || !Number.isFinite(fraccion)) return 0
  return Math.max(0, Math.min(100, Math.round(fraccion * 1000) / 10))
}

/**
 * "120 de 138 reportados": sobre los indicadores que debían reportar en el
 * bimestre (con meta) o que reportaron; los de meta 0 sin reporte van
 * aparte (textoPendientes). Si no hay ninguno: "Sin meta en el bimestre 4".
 */
export function textoReportados(conteo: ConteoEstadosPai): string {
  const total = conteo.reportados + conteo.pendientes
  if (total === 0) return `Sin meta en el bimestre ${conteo.bimestre}`
  return `${formatoNumero(conteo.reportados)} de ${formatoNumero(total)} reportados`
}

/** "18 pendientes · 4 sin meta" (vacío si no hay ninguno de los dos). */
export function textoPendientes(conteo: ConteoEstadosPai): string {
  const partes: string[] = []
  if (conteo.pendientes > 0) {
    partes.push(`${formatoNumero(conteo.pendientes)} ${conteo.pendientes === 1 ? 'pendiente' : 'pendientes'}`)
  }
  if (conteo.sinMeta > 0) partes.push(`${formatoNumero(conteo.sinMeta)} sin meta`)
  return partes.join(' · ')
}

/**
 * Bimestres que aún no se reportan: el servidor marca 'futuro' los que
 * vienen después del bimestre de referencia (el abierto o, sin abierto, el
 * último ya terminado) y no tienen nada reportado. Basta con que algún
 * indicador lo tenga así (los demás de ese bimestre ya reportaron antes de
 * tiempo).
 */
export function bimestresFuturos(tablero: Pick<TableroPai, 'indicadores'>): ReadonlySet<NumeroBimestre> {
  return new Set(NUMEROS_BIMESTRE.filter((b) => tablero.indicadores.some((i) => i.estados[b - 1] === 'futuro')))
}

/** Texto de un logro sin dato: "Aún no se reporta" en un bimestre futuro, "Sin datos" en los demás. */
export function textoSinLogro(bimestre: NumeroBimestre, futuros: ReadonlySet<NumeroBimestre>): string {
  return futuros.has(bimestre) ? 'Aún no se reporta' : 'Sin datos'
}
