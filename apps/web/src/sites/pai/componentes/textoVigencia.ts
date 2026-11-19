/**
 * Texto del bimestre abierto para la barra de navegación (puro; probado en
 * textoVigencia.test.ts):
 *   "Bimestre 4 · julio–agosto · abierto hasta el 15 de septiembre"
 *   "Bimestre 4 · julio–agosto · abierto" (sin fecha límite)
 *   "Bimestre 4 · julio–agosto · el plazo venció el 15 de septiembre"
 *   "No hay bimestre abierto"
 * La fecha lleva el año solo si no es el de la vigencia.
 */
import { ZONA_HORARIA_PAI, infoBimestre, type VigenciaPai } from '../api-pai'
import { formatoFecha, formatoFechaCorta } from '../datos/formatos'

const ANIO_COLOMBIA = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA_PAI, year: 'numeric' })

export const SIN_BIMESTRE_ABIERTO = 'No hay bimestre abierto'

/** "15 de septiembre" o, si es de otro año que la vigencia, "15 de enero de 2027". */
export function fechaLimite(iso: string, anioVigencia: number): string {
  const valor = new Date(iso)
  if (Number.isNaN(valor.getTime())) return ''
  return Number(ANIO_COLOMBIA.format(valor)) === anioVigencia ? formatoFechaCorta(iso) : formatoFecha(iso)
}

/** Nombre y meses de un bimestre: "Bimestre 4 · julio–agosto". */
export function nombreBimestre(vigencia: Pick<VigenciaPai, 'bimestres'>, numero: VigenciaPai['bimestreAbierto']): string {
  if (numero === null) return ''
  const info = vigencia.bimestres.find((b) => b.numero === numero) ?? infoBimestre(numero)
  return `${info.nombre} · ${info.meses}`
}

export function textoVigencia(
  vigencia: Pick<VigenciaPai, 'anio' | 'bimestreAbierto' | 'abiertoHasta' | 'abiertoAhora' | 'bimestres'>,
): string {
  if (vigencia.bimestreAbierto === null) return SIN_BIMESTRE_ABIERTO
  const nombre = nombreBimestre(vigencia, vigencia.bimestreAbierto)
  const limite = vigencia.abiertoHasta ? fechaLimite(vigencia.abiertoHasta, vigencia.anio) : ''
  if (!limite) return `${nombre} · abierto`
  return vigencia.abiertoAhora ? `${nombre} · abierto hasta el ${limite}` : `${nombre} · el plazo venció el ${limite}`
}
