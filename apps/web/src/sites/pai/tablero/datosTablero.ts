/**
 * Operaciones puras sobre el tablero ya cargado (probadas en
 * datosTablero.test.ts): agrupar la lista por proceso -> acción y
 * reemplazar una fila después de guardar, sin volver a pedir todo.
 */
import type {
  AccionTableroPai,
  DependenciaPai,
  IndicadorTableroPai,
  NumeroBimestre,
  ProcesoTableroPai,
  ResumenProcesoPai,
  TableroPai,
} from '../api-pai'

export interface GrupoAccion {
  accionId: number
  /** null si la acción no está en el catálogo (no debería pasar). */
  accion: AccionTableroPai | null
  indicadores: IndicadorTableroPai[]
}

export interface GrupoProceso {
  procesoId: number
  proceso: ProcesoTableroPai | null
  dependencia: DependenciaPai | null
  /** Resumen del proceso (logro por bimestre, avance anual, conteo); null si no vino. */
  resumen: ResumenProcesoPai | null
  acciones: GrupoAccion[]
  /** Indicadores del grupo (después de los filtros). */
  total: number
}

/**
 * Agrupa los indicadores (ya filtrados) por proceso y, dentro de cada uno,
 * por acción, en el orden en que aparecen (el del tablero: dependencia,
 * proceso, acción, indicador).
 */
export function agruparIndicadores(tablero: TableroPai, indicadores: readonly IndicadorTableroPai[]): GrupoProceso[] {
  const procesos = new Map(tablero.procesos.map((p) => [p.id, p]))
  const dependencias = new Map(tablero.dependencias.map((d) => [d.id, d]))
  const acciones = new Map(tablero.acciones.map((a) => [a.id, a]))
  const resumenes = new Map(tablero.resumen.procesos.map((r) => [r.procesoId, r]))
  const grupos = new Map<number, GrupoProceso>()
  const gruposAccion = new Map<string, GrupoAccion>()
  for (const indicador of indicadores) {
    let grupo = grupos.get(indicador.procesoId)
    if (!grupo) {
      const proceso = procesos.get(indicador.procesoId) ?? null
      grupo = {
        procesoId: indicador.procesoId,
        proceso,
        dependencia: proceso ? (dependencias.get(proceso.dependenciaId) ?? null) : null,
        resumen: resumenes.get(indicador.procesoId) ?? null,
        acciones: [],
        total: 0,
      }
      grupos.set(indicador.procesoId, grupo)
    }
    const clave = `${indicador.procesoId}:${indicador.accionId}`
    let grupoAccion = gruposAccion.get(clave)
    if (!grupoAccion) {
      grupoAccion = { accionId: indicador.accionId, accion: acciones.get(indicador.accionId) ?? null, indicadores: [] }
      gruposAccion.set(clave, grupoAccion)
      grupo.acciones.push(grupoAccion)
    }
    grupoAccion.indicadores.push(indicador)
    grupo.total++
  }
  return [...grupos.values()]
}

/** El tablero con la fila del indicador reemplazada (RespuestaReportePai.indicador). */
export function reemplazarIndicador(tablero: TableroPai, indicador: IndicadorTableroPai): TableroPai {
  let cambiado = false
  const indicadores = tablero.indicadores.map((actual) => {
    if (actual.id !== indicador.id) return actual
    cambiado = true
    return indicador
  })
  return cambiado ? { ...tablero, indicadores } : tablero
}

/** El tablero con el nuevo número de evidencias de (indicador, bimestre). */
export function conEvidencias(
  tablero: TableroPai,
  indicadorId: number,
  bimestre: NumeroBimestre,
  cantidad: number,
): TableroPai {
  const actual = tablero.indicadores.find((i) => i.id === indicadorId)
  if (!actual || actual.evidencias[bimestre - 1] === cantidad) return tablero
  const evidencias = actual.evidencias.map((n, i) => (i === bimestre - 1 ? cantidad : n))
  return reemplazarIndicador(tablero, { ...actual, evidencias })
}

/** Indicador del tablero por id (null si ya no está). */
export function buscarIndicador(tablero: TableroPai, indicadorId: number): IndicadorTableroPai | null {
  return tablero.indicadores.find((i) => i.id === indicadorId) ?? null
}
