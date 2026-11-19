/**
 * Lógica pura de los filtros del tablero (probada en filtros.test.ts), con la
 * semántica de FiltrosTableroPai (api-pai.ts), la misma que usa el servidor
 * para GET /admin/exportar.csv:
 * - leerFiltros: de la URL (PARAMETROS_FILTRO_PAI), ignorando valores
 *   desconocidos (ids que no están en el tablero, textos que ningún proceso
 *   tiene, estados o tipos inválidos);
 * - filtrarIndicadores: aplica los filtros (estado en el bimestre abierto; q
 *   sin distinguir mayúsculas ni tildes en el código o en el nombre);
 * - opcionesFiltros: opciones dependientes. La dependencia y el tipo son la
 *   raíz; los procesos, programas, líneas y dimensiones se acotan con los
 *   demás filtros de proceso (cada lista sin contar su propio filtro, para
 *   poder cambiarlo); los riesgos, con todos ellos (elegir un proceso deja
 *   solo sus riesgos);
 * - ajustarFiltros: quita los filtros que dejaron de tener sentido después
 *   de un cambio (p. ej., el proceso de otra dependencia).
 */
import {
  ESTADOS_REPORTE_FILTRO,
  PARAMETROS_FILTRO_PAI,
  TIPOS_PROCESO,
  type DependenciaPai,
  type EstadoReporteFiltro,
  type FiltrosTableroPai,
  type IndicadorTableroPai,
  type ProcesoTableroPai,
  type RiesgoTableroPai,
  type TableroPai,
  type TipoProceso,
} from '../api-pai'
import { parametrosFiltros } from '../rutas'

export type ClaveFiltro = (typeof PARAMETROS_FILTRO_PAI)[number]

/** Largo máximo de la búsqueda que se lee de la URL. */
export const MAX_BUSQUEDA = 200

/** Texto para comparar: sin tildes, en minúsculas y con los espacios colapsados. */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function idDeTexto(texto: string | null): number | null {
  if (!texto || !/^[1-9]\d{0,9}$/.test(texto.trim())) return null
  return Number(texto.trim())
}

function textoDe(texto: string | null): string | null {
  return texto && texto.trim() ? texto : null
}

function sinVacios(filtros: FiltrosTableroPai): FiltrosTableroPai {
  const limpios: FiltrosTableroPai = {}
  for (const clave of PARAMETROS_FILTRO_PAI) {
    const valor = filtros[clave]
    if (valor === null || valor === undefined) continue
    if (typeof valor === 'string' && !valor.trim()) continue
    ;(limpios as Record<string, unknown>)[clave] = valor
  }
  return limpios
}

function sin(filtros: FiltrosTableroPai, clave: ClaveFiltro): FiltrosTableroPai {
  const copia = { ...filtros }
  delete copia[clave]
  return copia
}

/** ¿Hay algún filtro aplicado? */
export function hayFiltros(filtros: FiltrosTableroPai): boolean {
  return Object.keys(sinVacios(filtros)).length > 0
}

/** ¿Los dos filtros son iguales (sin contar los vacíos)? */
export function igualesFiltros(a: FiltrosTableroPai, b: FiltrosTableroPai): boolean {
  return parametrosFiltros(sinVacios(a)).toString() === parametrosFiltros(sinVacios(b)).toString()
}

/**
 * Filtros de la URL. Sin tablero, solo se revisa el formato; con tablero,
 * además se descartan los valores que no existen en él y los que no
 * concuerdan entre sí (ajustarFiltros).
 */
export function leerFiltros(parametros: URLSearchParams, tablero?: TableroPai): FiltrosTableroPai {
  const estado = parametros.get('estado')
  const tipo = parametros.get('tipo')
  const q = textoDe(parametros.get('q'))
  let filtros = sinVacios({
    dependencia: idDeTexto(parametros.get('dependencia')),
    proceso: idDeTexto(parametros.get('proceso')),
    programa: textoDe(parametros.get('programa')),
    riesgo: idDeTexto(parametros.get('riesgo')),
    linea: textoDe(parametros.get('linea')),
    dimension: textoDe(parametros.get('dimension')),
    tipo: tipo && (TIPOS_PROCESO as readonly string[]).includes(tipo) ? (tipo as TipoProceso) : null,
    estado:
      estado && (ESTADOS_REPORTE_FILTRO as readonly string[]).includes(estado) ? (estado as EstadoReporteFiltro) : null,
    q: q ? q.slice(0, MAX_BUSQUEDA) : null,
  })
  if (!tablero) return filtros

  const existe = {
    dependencia: (id: number) => tablero.dependencias.some((d) => d.id === id),
    proceso: (id: number) => tablero.procesos.some((p) => p.id === id),
    riesgo: (id: number) => tablero.riesgos.some((r) => r.id === id),
    programa: (texto: string) => tablero.procesos.some((p) => p.programa === texto),
    linea: (texto: string) => tablero.procesos.some((p) => p.lineaPlanDesarrollo === texto),
    dimension: (texto: string) => tablero.procesos.some((p) => p.dimensionPlanEstrategico === texto),
  }
  for (const clave of ['dependencia', 'proceso', 'riesgo'] as const) {
    const valor = filtros[clave]
    if (valor && !existe[clave](valor)) filtros = sin(filtros, clave)
  }
  for (const clave of ['programa', 'linea', 'dimension'] as const) {
    const valor = filtros[clave]
    if (valor && !existe[clave](valor)) filtros = sin(filtros, clave)
  }
  // Sin bimestre abierto el filtro de estado no aplica: no se conserva.
  if (filtros.estado && !tablero.vigencia.bimestreAbierto) filtros = sin(filtros, 'estado')
  return ajustarFiltros(tablero, filtros)
}

/**
 * Parámetros de la URL con los filtros: conserva los parámetros que no son
 * filtros (en su orden) y agrega los filtros con valor al final, en el orden
 * de PARAMETROS_FILTRO_PAI.
 */
export function escribirFiltros(filtros: FiltrosTableroPai, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const siguiente = new URLSearchParams(base)
  for (const clave of PARAMETROS_FILTRO_PAI) siguiente.delete(clave)
  for (const [clave, valor] of parametrosFiltros(sinVacios(filtros))) siguiente.append(clave, valor)
  return siguiente
}

type FiltroDeProceso = 'dependencia' | 'proceso' | 'programa' | 'linea' | 'dimension' | 'tipo'

/** ¿El proceso cumple los filtros de proceso (salvo los de `excepto`)? */
function cumpleProceso(proceso: ProcesoTableroPai, filtros: FiltrosTableroPai, excepto: FiltroDeProceso[] = []): boolean {
  const aplica = (clave: FiltroDeProceso) => !excepto.includes(clave) && filtros[clave] !== null && filtros[clave] !== undefined
  if (aplica('dependencia') && proceso.dependenciaId !== filtros.dependencia) return false
  if (aplica('proceso') && proceso.id !== filtros.proceso) return false
  if (aplica('programa') && proceso.programa !== filtros.programa) return false
  if (aplica('linea') && proceso.lineaPlanDesarrollo !== filtros.linea) return false
  if (aplica('dimension') && proceso.dimensionPlanEstrategico !== filtros.dimension) return false
  if (aplica('tipo') && proceso.tipo !== filtros.tipo) return false
  return true
}

const busquedas = new WeakMap<IndicadorTableroPai, { codigo: string; nombre: string }>()

function textosDeBusqueda(indicador: IndicadorTableroPai): { codigo: string; nombre: string } {
  let textos = busquedas.get(indicador)
  if (!textos) {
    textos = { codigo: normalizarBusqueda(indicador.codigo), nombre: normalizarBusqueda(indicador.nombre) }
    busquedas.set(indicador, textos)
  }
  return textos
}

/** Indicadores que cumplen los filtros, en el orden del tablero. */
export function filtrarIndicadores(tablero: TableroPai, filtros: FiltrosTableroPai): IndicadorTableroPai[] {
  const activos = sinVacios(filtros)
  if (!hayFiltros(activos)) return tablero.indicadores
  const procesos = new Map(tablero.procesos.map((p) => [p.id, p]))
  const acciones = new Map(tablero.acciones.map((a) => [a.id, a]))
  const bimestre = tablero.vigencia.bimestreAbierto
  const q = activos.q ? normalizarBusqueda(activos.q) : ''
  const hayFiltroDeProceso = (['dependencia', 'proceso', 'programa', 'linea', 'dimension', 'tipo'] as const).some(
    (clave) => activos[clave] !== undefined,
  )
  return tablero.indicadores.filter((indicador) => {
    if (hayFiltroDeProceso) {
      const proceso = procesos.get(indicador.procesoId)
      if (!proceso || !cumpleProceso(proceso, activos)) return false
    }
    if (activos.riesgo) {
      const accion = acciones.get(indicador.accionId)
      if (!accion || !accion.riesgoIds.includes(activos.riesgo)) return false
    }
    // Sin bimestre abierto, el filtro de estado no aplica.
    if (activos.estado && bimestre && indicador.estados[bimestre - 1] !== activos.estado) return false
    if (q) {
      const textos = textosDeBusqueda(indicador)
      if (!textos.codigo.includes(q) && !textos.nombre.includes(q)) return false
    }
    return true
  })
}

export interface OpcionesFiltrosPai {
  dependencias: DependenciaPai[]
  procesos: ProcesoTableroPai[]
  riesgos: RiesgoTableroPai[]
  programas: string[]
  lineas: string[]
  dimensiones: string[]
}

function distintos(valores: (string | null)[]): string[] {
  const unicos = [...new Set(valores.filter((v): v is string => v !== null && v.trim() !== ''))]
  return unicos.sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
}

/** Opciones de cada select según los demás filtros (ver el comentario del archivo). */
export function opcionesFiltros(tablero: TableroPai, filtros: FiltrosTableroPai): OpcionesFiltrosPai {
  const activos = sinVacios(filtros)
  const procesosCon = (excepto: FiltroDeProceso[]) => tablero.procesos.filter((p) => cumpleProceso(p, activos, excepto))
  const enAlcance = new Set(procesosCon([]).map((p) => p.id))
  return {
    dependencias: tablero.dependencias,
    procesos: procesosCon(['proceso']),
    riesgos: tablero.riesgos.filter((r) => enAlcance.has(r.procesoId)),
    programas: distintos(procesosCon(['programa']).map((p) => p.programa)),
    lineas: distintos(procesosCon(['linea']).map((p) => p.lineaPlanDesarrollo)),
    dimensiones: distintos(procesosCon(['dimension']).map((p) => p.dimensionPlanEstrategico)),
  }
}

/** Filtros que dependen de otros, en el orden en que se revisan. */
const DEPENDIENTES = ['proceso', 'programa', 'linea', 'dimension', 'riesgo'] as const

/**
 * Quita los filtros dependientes que ya no están entre las opciones (p. ej.,
 * al cambiar de dependencia se quita el proceso de la anterior). `cambiado`
 * es el filtro que el usuario acaba de elegir: se conserva (lo eligió entre
 * opciones que ya contaban con los demás) y se quitan los que chocan con él.
 */
export function ajustarFiltros(
  tablero: TableroPai,
  filtros: FiltrosTableroPai,
  cambiado?: ClaveFiltro,
): FiltrosTableroPai {
  let resultado = sinVacios(filtros)
  for (const clave of DEPENDIENTES) {
    if (clave === cambiado) continue
    const valor = resultado[clave]
    if (valor === undefined || valor === null) continue
    const opciones = opcionesFiltros(tablero, resultado)
    const valido =
      clave === 'proceso'
        ? opciones.procesos.some((p) => p.id === valor)
        : clave === 'riesgo'
          ? opciones.riesgos.some((r) => r.id === valor)
          : clave === 'programa'
            ? opciones.programas.includes(String(valor))
            : clave === 'linea'
              ? opciones.lineas.includes(String(valor))
              : opciones.dimensiones.includes(String(valor))
    if (!valido) resultado = sin(resultado, clave)
  }
  return resultado
}
