/**
 * Lógica pura de la página de autorizaciones (probada en
 * autorizaciones.test.tsx): qué procesos e indicadores se le pueden
 * autorizar a un responsable (los que tiene asignados: sin asignación no
 * podría reportar aunque tuviera la autorización) y el orden de la lista.
 */
import type { AutorizacionPai, IndicadorTableroPai, ProcesoTableroPai, TableroPai, UsuarioPai } from '../api-pai'

export interface AlcancePosible {
  proceso: ProcesoTableroPai
  /** ¿Tiene el proceso completo asignado? */
  completo: boolean
  /** Indicadores que tiene asignados de ese proceso (todos, si es completo). */
  indicadores: IndicadorTableroPai[]
}

/** Procesos (en el orden del tablero) con los indicadores que el responsable tiene asignados. */
export function alcancesDeUsuario(
  usuario: Pick<UsuarioPai, 'asignaciones'>,
  tablero: Pick<TableroPai, 'procesos' | 'indicadores' | 'dependencias'>,
): AlcancePosible[] {
  const procesosAsignados = new Set(usuario.asignaciones.procesos)
  const indicadoresAsignados = new Set(usuario.asignaciones.indicadores)
  const posicion = new Map(tablero.dependencias.map((d, i) => [d.id, i]))
  return [...tablero.procesos]
    .sort((a, b) => (posicion.get(a.dependenciaId) ?? 0) - (posicion.get(b.dependenciaId) ?? 0) || a.orden - b.orden)
    .map((proceso) => {
      const completo = procesosAsignados.has(proceso.id)
      const indicadores = tablero.indicadores.filter(
        (i) => i.procesoId === proceso.id && (completo || indicadoresAsignados.has(i.id)),
      )
      return { proceso, completo, indicadores }
    })
    .filter((alcance) => alcance.completo || alcance.indicadores.length > 0)
}

/** Vigentes primero (vencen antes, primero); luego las demás, de la más reciente a la más antigua. */
export function ordenarAutorizaciones(lista: AutorizacionPai[]): AutorizacionPai[] {
  return [...lista].sort((a, b) => {
    const vigenteA = a.estado === 'vigente' ? 0 : 1
    const vigenteB = b.estado === 'vigente' ? 0 : 1
    if (vigenteA !== vigenteB) return vigenteA - vigenteB
    if (vigenteA === 0) return a.vigenteHasta.localeCompare(b.vigenteHasta) || b.id - a.id
    return b.otorgadaEn.localeCompare(a.otorgadaEn) || b.id - a.id
  })
}

export function dividirAutorizaciones(lista: AutorizacionPai[]): {
  vigentes: AutorizacionPai[]
  otras: AutorizacionPai[]
} {
  const ordenadas = ordenarAutorizaciones(lista)
  return {
    vigentes: ordenadas.filter((a) => a.estado === 'vigente'),
    otras: ordenadas.filter((a) => a.estado !== 'vigente'),
  }
}
