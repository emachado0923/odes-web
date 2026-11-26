/**
 * El estado del tablero en la dirección (?anio=2018&seccion=instituciones&modo=indice&ies=universidad-de-antioquia):
 * así un enlace guarda lo que se está viendo y recargar no lo pierde. Los filtros van por nombre (en minúsculas, sin
 * tildes ni espacios), no por posición: las posiciones cambian cuando el ETL regenera los datos.
 */
import { FILTROS_VACIOS, type FiltrosHistoricos } from './calculos'
import type { MatriculaHistorica } from './tipos'

export interface EstadoTablero {
  /** Posición del año en c.anios. */
  anio: number
  seccion: string
  modo: string
  filtros: FiltrosHistoricos
}

const CAMPOS = ['ies', 'sector', 'nivel', 'modalidad', 'area'] as const

/** «Universidad de Antioquia» -> «universidad-de-antioquia». */
export const slug = (t: string): string =>
  String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function nombres(c: MatriculaHistorica, campo: (typeof CAMPOS)[number]): string[] {
  return campo === 'ies' ? c.dim.ies.map((i) => i.nombre) : c.dim[campo]
}

/** Lee el estado de la dirección; lo que no se reconoce queda en su valor por defecto. */
export function leerEstado(c: MatriculaHistorica, busqueda: string, porDefecto: Omit<EstadoTablero, 'filtros'>): EstadoTablero {
  const q = new URLSearchParams(busqueda)
  const anio = c.anios.indexOf(Number(q.get('anio')))
  const filtros: FiltrosHistoricos = { ...FILTROS_VACIOS }
  for (const campo of CAMPOS) {
    const pedidos = (q.get(campo) ?? '').split(',').filter(Boolean)
    if (!pedidos.length) continue
    const lista = nombres(c, campo).map(slug)
    filtros[campo] = pedidos.map((p) => lista.indexOf(p)).filter((i) => i >= 0)
  }
  return {
    anio: anio >= 0 ? anio : porDefecto.anio,
    seccion: q.get('seccion') || porDefecto.seccion,
    modo: q.get('modo') || porDefecto.modo,
    filtros,
  }
}

/** La parte ?… de la dirección para un estado; sin lo que está en su valor por defecto (vacía si todo lo está). */
export function escribirEstado(c: MatriculaHistorica, e: EstadoTablero, porDefecto: Omit<EstadoTablero, 'filtros'>): string {
  const q = new URLSearchParams()
  if (e.anio !== porDefecto.anio) q.set('anio', String(c.anios[e.anio]))
  if (e.seccion !== porDefecto.seccion) q.set('seccion', e.seccion)
  if (e.modo !== porDefecto.modo) q.set('modo', e.modo)
  for (const campo of CAMPOS) {
    if (!e.filtros[campo].length) continue
    const lista = nombres(c, campo)
    q.set(campo, e.filtros[campo].map((i) => slug(lista[i])).join(','))
  }
  const texto = q.toString()
  return texto ? '?' + texto : ''
}
