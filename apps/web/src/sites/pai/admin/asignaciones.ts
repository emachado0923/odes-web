/**
 * Árbol de asignaciones (dependencia -> proceso -> indicador) de la página de
 * usuarios. Puro; probado en asignaciones.test.ts.
 *
 * Semántica (AsignacionesPai): asignar un proceso cubre todos sus
 * indicadores; un indicador suelto se asigna solo. En el árbol:
 * - marcar un proceso lo asigna completo (y quita sus indicadores sueltos);
 * - marcar todos los indicadores de un proceso uno por uno equivale a
 *   asignar el proceso (se guarda como proceso);
 * - desmarcar un indicador de un proceso asignado completo deja asignados
 *   sueltos los demás indicadores de ese proceso;
 * - una dependencia marca o desmarca todos sus procesos;
 * - los padres muestran tres estados: marcado, parcial o vacío;
 * - con una búsqueda, las casillas de dependencia y de proceso actúan solo
 *   sobre lo que se ve (y su estado se calcula con lo que se ve): marcar una
 *   dependencia no asigna procesos ocultos, y marcar un proceso del que solo
 *   se ven algunos indicadores asigna solo esos (…Visible).
 * Los ids que no están en el árbol (p. ej., de otra vigencia) se conservan
 * tal cual al guardar.
 */
import type { AsignacionesPai, DependenciaPai, IndicadorTableroPai, ProcesoTableroPai } from '../api-pai'

export interface NodoIndicador {
  id: number
  codigo: string
  nombre: string
}

export interface NodoProceso {
  id: number
  codigo: string
  nombre: string
  indicadores: NodoIndicador[]
}

export interface NodoDependencia {
  id: number
  sigla: string
  nombre: string
  procesos: NodoProceso[]
}

export type Marca = 'marcado' | 'parcial' | 'vacio'

export interface Seleccion {
  procesos: ReadonlySet<number>
  indicadores: ReadonlySet<number>
}

export interface DatosArbol {
  dependencias: DependenciaPai[]
  procesos: ProcesoTableroPai[]
  indicadores: Pick<IndicadorTableroPai, 'id' | 'codigo' | 'nombre' | 'procesoId'>[]
}

/** Árbol en el orden del tablero (dependencias, procesos por orden, indicadores como llegan). */
export function arbolAsignaciones(datos: DatosArbol): NodoDependencia[] {
  const indicadoresPorProceso = new Map<number, NodoIndicador[]>()
  for (const indicador of datos.indicadores) {
    const lista = indicadoresPorProceso.get(indicador.procesoId) ?? []
    lista.push({ id: indicador.id, codigo: indicador.codigo, nombre: indicador.nombre })
    indicadoresPorProceso.set(indicador.procesoId, lista)
  }
  return datos.dependencias
    .map((dependencia) => ({
      id: dependencia.id,
      sigla: dependencia.sigla,
      nombre: dependencia.nombre,
      procesos: datos.procesos
        .filter((proceso) => proceso.dependenciaId === dependencia.id)
        .sort((a, b) => a.orden - b.orden)
        .map((proceso) => ({
          id: proceso.id,
          codigo: proceso.codigo,
          nombre: proceso.nombre,
          indicadores: indicadoresPorProceso.get(proceso.id) ?? [],
        })),
    }))
    .filter((dependencia) => dependencia.procesos.length > 0)
}

export function seleccionDe(asignaciones: AsignacionesPai): Seleccion {
  return { procesos: new Set(asignaciones.procesos), indicadores: new Set(asignaciones.indicadores) }
}

function todosSueltos(proceso: NodoProceso, seleccion: Seleccion): boolean {
  return proceso.indicadores.length > 0 && proceso.indicadores.every((i) => seleccion.indicadores.has(i.id))
}

export function marcaProceso(proceso: NodoProceso, seleccion: Seleccion): Marca {
  if (seleccion.procesos.has(proceso.id) || todosSueltos(proceso, seleccion)) return 'marcado'
  return proceso.indicadores.some((i) => seleccion.indicadores.has(i.id)) ? 'parcial' : 'vacio'
}

export function marcaDependencia(dependencia: NodoDependencia, seleccion: Seleccion): Marca {
  const marcas = dependencia.procesos.map((p) => marcaProceso(p, seleccion))
  if (marcas.length > 0 && marcas.every((m) => m === 'marcado')) return 'marcado'
  return marcas.some((m) => m !== 'vacio') ? 'parcial' : 'vacio'
}

/** ¿El indicador está asignado (suelto o por su proceso)? */
export function indicadorMarcado(proceso: NodoProceso, indicadorId: number, seleccion: Seleccion): boolean {
  return seleccion.procesos.has(proceso.id) || seleccion.indicadores.has(indicadorId)
}

function asignarProceso(procesos: Set<number>, indicadores: Set<number>, proceso: NodoProceso): void {
  procesos.add(proceso.id)
  for (const indicador of proceso.indicadores) indicadores.delete(indicador.id)
}

function quitarProceso(procesos: Set<number>, indicadores: Set<number>, proceso: NodoProceso): void {
  procesos.delete(proceso.id)
  for (const indicador of proceso.indicadores) indicadores.delete(indicador.id)
}

export function alternarProceso(seleccion: Seleccion, proceso: NodoProceso): Seleccion {
  const procesos = new Set(seleccion.procesos)
  const indicadores = new Set(seleccion.indicadores)
  if (marcaProceso(proceso, seleccion) === 'marcado') quitarProceso(procesos, indicadores, proceso)
  else asignarProceso(procesos, indicadores, proceso)
  return { procesos, indicadores }
}

export function alternarDependencia(seleccion: Seleccion, dependencia: NodoDependencia): Seleccion {
  const procesos = new Set(seleccion.procesos)
  const indicadores = new Set(seleccion.indicadores)
  const marcar = marcaDependencia(dependencia, seleccion) !== 'marcado'
  for (const proceso of dependencia.procesos) {
    if (marcar) asignarProceso(procesos, indicadores, proceso)
    else quitarProceso(procesos, indicadores, proceso)
  }
  return { procesos, indicadores }
}

export function alternarIndicador(seleccion: Seleccion, proceso: NodoProceso, indicadorId: number): Seleccion {
  const procesos = new Set(seleccion.procesos)
  const indicadores = new Set(seleccion.indicadores)
  if (marcaProceso(proceso, seleccion) === 'marcado') {
    // El proceso estaba completo: quedan sueltos los demás indicadores.
    procesos.delete(proceso.id)
    for (const indicador of proceso.indicadores) {
      if (indicador.id === indicadorId) indicadores.delete(indicador.id)
      else indicadores.add(indicador.id)
    }
    return { procesos, indicadores }
  }
  if (indicadores.has(indicadorId)) indicadores.delete(indicadorId)
  else indicadores.add(indicadorId)
  const resultado = { procesos, indicadores }
  // Todos marcados uno por uno: se asigna el proceso completo.
  if (todosSueltos(proceso, resultado)) asignarProceso(procesos, indicadores, proceso)
  return resultado
}

/**
 * AsignacionesPai para guardar: ids ordenados, y los procesos con todos sus
 * indicadores sueltos marcados pasan a asignarse como proceso.
 */
export function asignacionesDe(seleccion: Seleccion, arbol: NodoDependencia[]): AsignacionesPai {
  const procesos = new Set(seleccion.procesos)
  const indicadores = new Set(seleccion.indicadores)
  for (const dependencia of arbol) {
    for (const proceso of dependencia.procesos) {
      if (!procesos.has(proceso.id) && todosSueltos(proceso, seleccion)) asignarProceso(procesos, indicadores, proceso)
      else if (procesos.has(proceso.id)) for (const indicador of proceso.indicadores) indicadores.delete(indicador.id)
    }
  }
  const ordenar = (ids: Set<number>) => [...ids].sort((a, b) => a - b)
  return { procesos: ordenar(procesos), indicadores: ordenar(indicadores) }
}

/** ¿Cambió la selección respecto a lo guardado? */
export function mismasAsignaciones(a: AsignacionesPai, b: AsignacionesPai): boolean {
  const igual = (x: number[], y: number[]) => {
    const ordenX = [...x].sort((m, n) => m - n)
    const ordenY = [...y].sort((m, n) => m - n)
    return ordenX.length === ordenY.length && ordenX.every((v, i) => v === ordenY[i])
  }
  return igual(a.procesos, b.procesos) && igual(a.indicadores, b.indicadores)
}

function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`
}

// ── Con búsqueda: solo lo que se ve ──────────────────────────────────────

export type Visibles = { procesos: ReadonlySet<number>; indicadores: ReadonlySet<number> } | null

/** Indicadores del proceso que se ven con la búsqueda (todos sin búsqueda). */
export function indicadoresVisibles(proceso: NodoProceso, visibles: Visibles): NodoIndicador[] {
  return visibles ? proceso.indicadores.filter((i) => visibles.indicadores.has(i.id)) : proceso.indicadores
}

/** ¿La búsqueda deja ver solo parte de los indicadores del proceso? */
export function procesoParcial(proceso: NodoProceso, visibles: Visibles): boolean {
  return visibles !== null && indicadoresVisibles(proceso, visibles).length < proceso.indicadores.length
}

function procesosVisibles(dependencia: NodoDependencia, visibles: Visibles): NodoProceso[] {
  return visibles ? dependencia.procesos.filter((p) => visibles.procesos.has(p.id)) : dependencia.procesos
}

export function marcaProcesoVisible(proceso: NodoProceso, seleccion: Seleccion, visibles: Visibles): Marca {
  if (!procesoParcial(proceso, visibles)) return marcaProceso(proceso, seleccion)
  const marcados = indicadoresVisibles(proceso, visibles).filter((i) => indicadorMarcado(proceso, i.id, seleccion)).length
  if (marcados === 0) return 'vacio'
  return marcados === indicadoresVisibles(proceso, visibles).length ? 'marcado' : 'parcial'
}

export function marcaDependenciaVisible(dependencia: NodoDependencia, seleccion: Seleccion, visibles: Visibles): Marca {
  const marcas = procesosVisibles(dependencia, visibles).map((p) => marcaProcesoVisible(p, seleccion, visibles))
  if (marcas.length > 0 && marcas.every((m) => m === 'marcado')) return 'marcado'
  return marcas.some((m) => m !== 'vacio') ? 'parcial' : 'vacio'
}

/** Marca (o desmarca) lo que se ve del proceso: completo, o solo sus indicadores visibles. */
function fijarProcesoVisible(seleccion: Seleccion, proceso: NodoProceso, visibles: Visibles, marcar: boolean): Seleccion {
  const procesos = new Set(seleccion.procesos)
  const indicadores = new Set(seleccion.indicadores)
  if (!procesoParcial(proceso, visibles)) {
    if (marcar) asignarProceso(procesos, indicadores, proceso)
    else quitarProceso(procesos, indicadores, proceso)
    return { procesos, indicadores }
  }
  if (procesos.has(proceso.id)) {
    // Estaba completo: sus indicadores pasan a sueltos para poder quitar solo los visibles.
    procesos.delete(proceso.id)
    for (const indicador of proceso.indicadores) indicadores.add(indicador.id)
  }
  for (const indicador of indicadoresVisibles(proceso, visibles)) {
    if (marcar) indicadores.add(indicador.id)
    else indicadores.delete(indicador.id)
  }
  const resultado = { procesos, indicadores }
  if (todosSueltos(proceso, resultado)) asignarProceso(procesos, indicadores, proceso)
  return resultado
}

export function alternarProcesoVisible(seleccion: Seleccion, proceso: NodoProceso, visibles: Visibles): Seleccion {
  return fijarProcesoVisible(seleccion, proceso, visibles, marcaProcesoVisible(proceso, seleccion, visibles) !== 'marcado')
}

export function alternarDependenciaVisible(seleccion: Seleccion, dependencia: NodoDependencia, visibles: Visibles): Seleccion {
  const marcar = marcaDependenciaVisible(dependencia, seleccion, visibles) !== 'marcado'
  return procesosVisibles(dependencia, visibles).reduce(
    (actual, proceso) => fijarProcesoVisible(actual, proceso, visibles, marcar),
    seleccion,
  )
}

/** "2 procesos completos y 5 indicadores sueltos", "1 proceso completo", "Sin asignaciones". */
export function resumenAsignaciones(asignaciones: AsignacionesPai): string {
  const partes: string[] = []
  if (asignaciones.procesos.length > 0) {
    partes.push(plural(asignaciones.procesos.length, 'proceso completo', 'procesos completos'))
  }
  if (asignaciones.indicadores.length > 0) {
    partes.push(plural(asignaciones.indicadores.length, 'indicador suelto', 'indicadores sueltos'))
  }
  return partes.length > 0 ? partes.join(' y ') : 'Sin asignaciones'
}

/** Texto en minúsculas y sin tildes, para buscar. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Qué se ve del árbol con una búsqueda: los procesos que coinciden (con todos
 * sus indicadores), los indicadores que coinciden (con su proceso) y las
 * dependencias que coinciden (con todo). null = sin búsqueda (se ve todo).
 */
export function visiblesConBusqueda(
  arbol: NodoDependencia[],
  busqueda: string,
): { procesos: Set<number>; indicadores: Set<number> } | null {
  const texto = normalizar(busqueda)
  if (!texto) return null
  const procesos = new Set<number>()
  const indicadores = new Set<number>()
  const coincide = (...campos: string[]) => campos.some((c) => normalizar(c).includes(texto))
  for (const dependencia of arbol) {
    const toda = coincide(dependencia.sigla, dependencia.nombre)
    for (const proceso of dependencia.procesos) {
      const todo = toda || coincide(proceso.codigo, proceso.nombre)
      for (const indicador of proceso.indicadores) {
        if (todo || coincide(indicador.codigo, indicador.nombre)) indicadores.add(indicador.id)
      }
      if (todo || proceso.indicadores.some((i) => indicadores.has(i.id))) procesos.add(proceso.id)
    }
  }
  return { procesos, indicadores }
}
