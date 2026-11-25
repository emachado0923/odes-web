/**
 * Cálculos del tablero de matrícula 2000-2025: filtros, series por año,
 * cortes del año elegido y comparación con Antioquia y Colombia. Funciones
 * puras sobre el JSON del ETL (tipos.ts), probadas en calculos.test.ts.
 */
import type { FilaHistorica, MatriculaHistorica, Territorio } from './tipos'

/* Posiciones dentro de cada fila. */
export const COL = { anio: 0, programa: 1, nivel: 2, modalidad: 3, area: 4, nbc: 5, sector: 6, sexo: 7 } as const

/** Dimensiones por las que se puede filtrar y agrupar (la institución sale del programa). */
export type Campo = 'ies' | 'nivel' | 'modalidad' | 'area' | 'nbc' | 'sector'

export interface FiltrosHistoricos {
  ies: number[]
  sector: number[]
  nivel: number[]
  modalidad: number[]
  area: number[]
}

export const FILTROS_VACIOS: FiltrosHistoricos = { ies: [], sector: [], nivel: [], modalidad: [], area: [] }

export const suma = (valores: readonly number[]): number => valores.reduce((s, v) => s + v, 0)

/** Matriculados de una fila: la suma de los cuatro sexos. */
export const totalFila = (f: FilaHistorica): number => f[7] + f[8] + f[9] + f[10]

/** La posición de la fila en la dimensión del campo. */
export function valorDe(c: MatriculaHistorica, f: FilaHistorica, campo: Campo): number {
  return campo === 'ies' ? c.dim.programa[f[COL.programa]].ies : f[COL[campo]]
}

export function alternar<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}

/** ¿Hay algún filtro aplicado? */
export const conFiltros = (f: FiltrosHistoricos): boolean => Object.values(f).some((v) => v.length > 0)

/** Las filas que pasan los filtros (todos los años). */
export function filtrar(c: MatriculaHistorica, f: FiltrosHistoricos): FilaHistorica[] {
  const campos = (Object.keys(f) as Campo[]).filter((k) => f[k as keyof FiltrosHistoricos].length)
  if (!campos.length) return c.filas
  const conjuntos = campos.map((k) => [k, new Set(f[k as keyof FiltrosHistoricos])] as const)
  return c.filas.filter((fila) => conjuntos.every(([k, s]) => s.has(valorDe(c, fila, k))))
}

/** Matriculados por año. */
export function seriePorAnio(c: MatriculaHistorica, filas: readonly FilaHistorica[]): number[] {
  const serie = c.anios.map(() => 0)
  for (const f of filas) serie[f[COL.anio]] += totalFila(f)
  return serie
}

/** Matriculados por año y por categoría: [categoría][año]. */
export function matrizPorAnio(c: MatriculaHistorica, filas: readonly FilaHistorica[], campo: Campo): number[][] {
  const m = c.dim[campo].map(() => c.anios.map(() => 0))
  for (const f of filas) m[valorDe(c, f, campo)][f[COL.anio]] += totalFila(f)
  return m
}

/** Matriculados por sexo y año: [sexo][año]. */
export function sexoPorAnio(c: MatriculaHistorica, filas: readonly FilaHistorica[]): number[][] {
  const m = c.dim.sexo.map(() => c.anios.map(() => 0))
  for (const f of filas) for (let s = 0; s < 4; s++) m[s][f[COL.anio]] += f[COL.sexo + s]
  return m
}

/** Las filas de un año (su posición en anios). */
export const delAnio = (filas: readonly FilaHistorica[], anio: number): FilaHistorica[] => filas.filter((f) => f[COL.anio] === anio)

/** Matriculados de un año por categoría. */
export function porCategoria(c: MatriculaHistorica, filas: readonly FilaHistorica[], campo: Campo): number[] {
  const v = c.dim[campo].map(() => 0)
  for (const f of filas) v[valorDe(c, f, campo)] += totalFila(f)
  return v
}

/** Matriculados de un año por categoría y sexo: [categoría][sexo]. */
export function porCategoriaYSexo(c: MatriculaHistorica, filas: readonly FilaHistorica[], campo: Campo): number[][] {
  const m = c.dim[campo].map(() => [0, 0, 0, 0])
  for (const f of filas) for (let s = 0; s < 4; s++) m[valorDe(c, f, campo)][s] += f[COL.sexo + s]
  return m
}

/** Posiciones de las categorías con matrícula, de mayor a menor. */
export function ordenPorValor(valores: readonly number[]): number[] {
  return valores
    .map((v, i) => [v, i] as const)
    .filter(([v]) => v > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([, i]) => i)
}

/** Resumen de un año: los indicadores de la cabecera. */
export interface ResumenAnio {
  matriculados: number
  anterior: number | null
  variacion: number | null
  ies: number
  programas: number
  mujeres: number
  pctMujeres: number | null
}

export function resumenAnio(c: MatriculaHistorica, filas: readonly FilaHistorica[], anio: number, serie: readonly number[]): ResumenAnio {
  const ies = new Set<number>()
  const programas = new Set<number>()
  let mujeres = 0
  let matriculados = 0
  for (const f of filas) {
    if (f[COL.anio] !== anio) continue
    const t = totalFila(f)
    if (!t) continue
    matriculados += t
    mujeres += f[COL.sexo]
    programas.add(f[COL.programa])
    ies.add(c.dim.programa[f[COL.programa]].ies)
  }
  const anterior = anio > 0 ? serie[anio - 1] : null
  return {
    matriculados,
    anterior,
    variacion: variacion(serie, anio),
    ies: ies.size,
    programas: programas.size,
    mujeres,
    pctMujeres: matriculados ? (mujeres * 100) / matriculados : null,
  }
}

/** Cambio porcentual frente al año anterior (null en el primero o si el anterior es cero). */
export function variacion(serie: readonly number[], i: number): number | null {
  if (i <= 0 || !serie[i - 1]) return null
  return ((serie[i] - serie[i - 1]) * 100) / serie[i - 1]
}

/** Índice con base en la posición `base` (= 100); null donde la base es cero. */
export function indice(serie: readonly number[], base = 0): Array<number | null> {
  const b = serie[base]
  return serie.map((v) => (b ? (v * 100) / b : null))
}

/** Participación de `parte` en `todo`, año por año (en %). */
export function participacion(parte: readonly number[], todo: readonly number[]): Array<number | null> {
  return parte.map((v, i) => (todo[i] ? (v * 100) / todo[i] : null))
}

/**
 * La referencia (Antioquia o Colombia) con los mismos filtros de nivel y
 * sector: el cubo trae esos cortes. Con filtros de institución, modalidad o
 * área no hay referencia comparable: devuelve null.
 */
export function referenciaFiltrada(c: MatriculaHistorica, territorio: Territorio, f: FiltrosHistoricos): number[] | null {
  if (f.ies.length || f.modalidad.length || f.area.length) return null
  const ref = c.referencia[territorio]
  if (!f.nivel.length && !f.sector.length) return ref.total.slice()
  const niveles = f.nivel.length ? f.nivel : c.dim.nivel.map((_, i) => i)
  const sectores = f.sector.length ? f.sector : c.dim.sector.map((_, i) => i)
  const serie = c.anios.map(() => 0)
  for (const n of niveles) for (const s of sectores) for (const porSexo of ref.cubo[n][s]) porSexo.forEach((v, a) => (serie[a] += v))
  return serie
}

/** La referencia por sexo y año, con los filtros de nivel y sector (null como arriba). */
export function referenciaSexo(c: MatriculaHistorica, territorio: Territorio, f: FiltrosHistoricos): number[][] | null {
  if (f.ies.length || f.modalidad.length || f.area.length) return null
  const ref = c.referencia[territorio]
  const niveles = f.nivel.length ? f.nivel : c.dim.nivel.map((_, i) => i)
  const sectores = f.sector.length ? f.sector : c.dim.sector.map((_, i) => i)
  const m = c.dim.sexo.map(() => c.anios.map(() => 0))
  for (const n of niveles) for (const s of sectores) ref.cubo[n][s].forEach((porAnio, x) => porAnio.forEach((v, a) => (m[x][a] += v)))
  return m
}

/** Fila de la tabla de programas de un año. */
export interface FilaPrograma {
  programa: number
  nivel: number
  modalidad: number
  area: number
  sector: number
  matriculados: number
  mujeres: number
}

/** Los programas de un año con su matrícula (un programa puede venir en varias filas si cambió de atributos). */
export function programasDelAnio(filas: readonly FilaHistorica[], anio: number): FilaPrograma[] {
  const porPrograma = new Map<number, FilaPrograma>()
  for (const f of filas) {
    if (f[COL.anio] !== anio) continue
    const t = totalFila(f)
    if (!t) continue
    const p = porPrograma.get(f[COL.programa])
    if (p) {
      p.matriculados += t
      p.mujeres += f[COL.sexo]
    } else {
      porPrograma.set(f[COL.programa], {
        programa: f[COL.programa],
        nivel: f[COL.nivel],
        modalidad: f[COL.modalidad],
        area: f[COL.area],
        sector: f[COL.sector],
        matriculados: t,
        mujeres: f[COL.sexo],
      })
    }
  }
  return [...porPrograma.values()].sort((a, b) => b.matriculados - a.matriculados)
}

/** Las opciones de un filtro que tienen matrícula con los demás filtros aplicados (las elegidas siempre quedan). */
export function opcionesDisponibles(c: MatriculaHistorica, f: FiltrosHistoricos, campo: Campo): number[] {
  const sin = { ...f, [campo]: [] }
  const presentes = new Set<number>()
  for (const fila of filtrar(c, sin)) if (totalFila(fila)) presentes.add(valorDe(c, fila, campo))
  for (const v of f[campo as keyof FiltrosHistoricos] ?? []) presentes.add(v)
  return [...presentes]
}
