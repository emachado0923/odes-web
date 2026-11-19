/**
 * Cálculos del tablero de beneficiarios de los fondos (/tableros/fondos-2026):
 * filtran y suman las filas agregadas que entrega la API (ver tipos.ts). Son
 * funciones puras, sin React ni ECharts, para probarlas aparte
 * (calculos.test.ts).
 *
 * Qué filtros usa cada conjunto de filas:
 * - estados: línea, programa y convocatoria (y el periodo en lo que es de un
 *   solo periodo);
 * - giros: línea y programa (y el periodo); el monto no se publica por
 *   convocatoria;
 * - cohortes: línea, programa y convocatoria (estado en el último periodo
 *   registrado, así que el periodo no aplica);
 * - sexo, comunas e ies: línea, programa y periodo (solo beneficios activos);
 * - destinos (Enlaza Mundos): solo la convocatoria.
 *
 * Los resultados son listas por posición de la dimensión (activos[i] es el
 * periodo dim.periodo[i], etc.), con ceros donde no hay filas.
 */
import type { ConjuntoFondos, DimensionesFondos, FilaActivos } from './tipos'

export type CampoFiltro = 'linea' | 'programa' | 'periodo' | 'convocatoria'

export interface FiltrosFondos {
  /** Líneas elegidas (dim.programa[].linea); vacío = todas. */
  linea: string[]
  /** Índices de dim.programa; vacío = todos. */
  programa: number[]
  /** Índice de dim.periodo: siempre hay uno. */
  periodo: number
  /** Índices de dim.convocatoria; vacío = todas. */
  convocatoria: number[]
}

/* ------------------------------------------------------------ periodos */

/** Los intersemestrales («-3») tienen muy pocos registros: no van en el filtro ni en las series. */
export const esPeriodoRegular = (nombre: string): boolean => !nombre.endsWith('-3')

/** Índices de los periodos regulares, en orden cronológico. */
export function periodosRegulares(dim: DimensionesFondos): number[] {
  return dim.periodo.flatMap((nombre, i) => (esPeriodoRegular(nombre) ? [i] : []))
}

/** Filtros con que abre el tablero: todo, en el periodo de meta.periodoActual (o el último regular). */
export function filtrosIniciales(c: ConjuntoFondos): FiltrosFondos {
  const actual = c.dim.periodo.indexOf(c.meta.periodoActual)
  const regulares = periodosRegulares(c.dim)
  const periodo = actual >= 0 ? actual : (regulares.at(-1) ?? c.dim.periodo.length - 1)
  return { linea: [], programa: [], periodo, convocatoria: [] }
}

/* ------------------------------------------------------------- filtros */

/** Líneas en el orden en que aparecen sus programas. */
export function lineasDe(dim: DimensionesFondos): string[] {
  return Array.from(new Set(dim.programa.map((p) => p.linea)))
}

/** Qué programas deja pasar la combinación de línea y programa (uno por programa). */
export function programasElegidos(dim: DimensionesFondos, f: FiltrosFondos): boolean[] {
  return dim.programa.map(
    (p, i) => (f.linea.length === 0 || f.linea.includes(p.linea)) && (f.programa.length === 0 || f.programa.includes(i)),
  )
}

/** Qué convocatorias deja pasar el filtro (uno por convocatoria). */
function convocatoriasElegidas(dim: DimensionesFondos, f: FiltrosFondos): boolean[] {
  return dim.convocatoria.map((_, i) => f.convocatoria.length === 0 || f.convocatoria.includes(i))
}

/** Programas que ofrece el filtro de programa: los de las líneas elegidas, más los ya elegidos. */
export function opcionesPrograma(dim: DimensionesFondos, f: FiltrosFondos): number[] {
  return dim.programa.flatMap((p, i) =>
    f.linea.length === 0 || f.linea.includes(p.linea) || f.programa.includes(i) ? [i] : [],
  )
}

/**
 * Convocatorias que ofrece el filtro: las que tienen beneficios en los
 * programas elegidos, de la más reciente a la más antigua, más las ya
 * elegidas (para poder desmarcarlas).
 */
export function opcionesConvocatoria(c: ConjuntoFondos, f: FiltrosFondos): number[] {
  const programas = programasElegidos(c.dim, f)
  const hay = new Set<number>(f.convocatoria)
  for (const [programa, convocatoria, , beneficios] of c.cohortes) {
    if (programas[programa] && beneficios > 0) hay.add(convocatoria)
  }
  return Array.from(hay).sort((a, b) => b - a)
}

/** Agrega o quita un valor de una selección múltiple. */
export function alternar<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}

/**
 * Filtros que están aplicados pero que no le sirven a una sección. El
 * periodo siempre está aplicado; línea, programa y convocatoria, cuando
 * tienen algo elegido.
 */
export function filtrosQueNoAplican(usa: readonly CampoFiltro[], f: FiltrosFondos): CampoFiltro[] {
  const aplicados: CampoFiltro[] = ['periodo']
  if (f.linea.length) aplicados.push('linea')
  if (f.programa.length) aplicados.push('programa')
  if (f.convocatoria.length) aplicados.push('convocatoria')
  const orden: CampoFiltro[] = ['linea', 'programa', 'periodo', 'convocatoria']
  return orden.filter((campo) => aplicados.includes(campo) && !usa.includes(campo))
}

const NOMBRE_FILTRO: Record<CampoFiltro, string> = {
  linea: 'línea',
  programa: 'programa',
  periodo: 'periodo',
  convocatoria: 'convocatoria',
}

/** Enumera en español: «a», «a y b», «a, b y c». */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('')
  return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1]
}

/** «No se aplica el filtro de periodo.» / «No se aplican los filtros de línea y periodo.» */
export function textoNoAplican(campos: readonly CampoFiltro[]): string {
  if (!campos.length) return ''
  const nombres = enumerar(campos.map((c) => NOMBRE_FILTRO[c]))
  return campos.length === 1 ? `No se aplica el filtro de ${nombres}.` : `No se aplican los filtros de ${nombres}.`
}

/* ---------------------------------------------------------- utilidades */

const ceros = (n: number): number[] => new Array<number>(n).fill(0)

export const suma = (valores: readonly number[]): number => valores.reduce((s, v) => s + v, 0)

/** Índices con valor, en su orden. */
export function conValor(valores: readonly number[]): number[] {
  return valores.flatMap((v, i) => (v > 0 ? [i] : []))
}

/** Índices con valor, de mayor a menor (los empates conservan su orden). */
export function ordenPorValor(valores: readonly number[]): number[] {
  return conValor(valores).sort((a, b) => valores[b] - valores[a] || a - b)
}

/** Índice del estado «Activo» (-1 si no está). */
export const indiceActivo = (dim: DimensionesFondos): number => dim.estado.indexOf('Activo')

/* -------------------------------------------------------------- estados */

/**
 * Beneficios por periodo (todos los periodos, también los «-3»), con línea,
 * programa y convocatoria. Con `soloActivos`, solo los del estado Activo; si
 * no, los que tienen registro en el periodo en cualquier estado.
 */
export function beneficiosPorPeriodo(c: ConjuntoFondos, f: FiltrosFondos, soloActivos: boolean): number[] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const activo = indiceActivo(c.dim)
  const total = ceros(c.dim.periodo.length)
  for (const [programa, convocatoria, periodo, estado, beneficios] of c.estados) {
    if (!programas[programa] || !convocatorias[convocatoria]) continue
    if (soloActivos && estado !== activo) continue
    total[periodo] += beneficios
  }
  return total
}

/** Beneficios en cada estado (orden de dim.estado) en el periodo elegido. */
export function estadosDelPeriodo(c: ConjuntoFondos, f: FiltrosFondos): number[] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const total = ceros(c.dim.estado.length)
  for (const [programa, convocatoria, periodo, estado, beneficios] of c.estados) {
    if (periodo === f.periodo && programas[programa] && convocatorias[convocatoria]) total[estado] += beneficios
  }
  return total
}

/** Matriz [periodo][estado] con línea, programa y convocatoria. */
export function estadosPorPeriodo(c: ConjuntoFondos, f: FiltrosFondos): number[][] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const matriz = c.dim.periodo.map(() => ceros(c.dim.estado.length))
  for (const [programa, convocatoria, periodo, estado, beneficios] of c.estados) {
    if (programas[programa] && convocatorias[convocatoria]) matriz[periodo][estado] += beneficios
  }
  return matriz
}

/** Matriz [programa][estado] en el periodo elegido (los programas fuera del filtro quedan en cero). */
export function estadosPorPrograma(c: ConjuntoFondos, f: FiltrosFondos): number[][] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const matriz = c.dim.programa.map(() => ceros(c.dim.estado.length))
  for (const [programa, convocatoria, periodo, estado, beneficios] of c.estados) {
    if (periodo === f.periodo && programas[programa] && convocatorias[convocatoria]) {
      matriz[programa][estado] += beneficios
    }
  }
  return matriz
}

/** Beneficios activos de cada programa en el periodo elegido. */
export function activosPorPrograma(c: ConjuntoFondos, f: FiltrosFondos): number[] {
  const activo = indiceActivo(c.dim)
  return estadosPorPrograma(c, f).map((fila) => (activo >= 0 ? fila[activo] : 0))
}

export interface FilaDetalle {
  programa: number
  convocatoria: number
  periodo: number
  estado: number
  beneficios: number
}

/** Filas de estados con línea, programa y convocatoria, en todos los periodos (también los «-3»). */
export function filasDetalle(c: ConjuntoFondos, f: FiltrosFondos): FilaDetalle[] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  return c.estados
    .filter(([programa, convocatoria]) => programas[programa] && convocatorias[convocatoria])
    .map(([programa, convocatoria, periodo, estado, beneficios]) => ({ programa, convocatoria, periodo, estado, beneficios }))
}

/* ---------------------------------------------------------------- giros */

export interface GirosPorPeriodo {
  /** Pesos girados en el periodo. */
  monto: number[]
  /** Beneficios que recibieron giro. */
  conGiro: number[]
  /** Solo los programas que separan matrícula y sostenimiento (Línea Pregrado). */
  matricula: number[]
  sostenimiento: number[]
}

/** Giros por periodo (todos los periodos) con línea y programa. */
export function girosPorPeriodo(c: ConjuntoFondos, f: FiltrosFondos): GirosPorPeriodo {
  const programas = programasElegidos(c.dim, f)
  const n = c.dim.periodo.length
  const r: GirosPorPeriodo = { monto: ceros(n), conGiro: ceros(n), matricula: ceros(n), sostenimiento: ceros(n) }
  for (const [programa, periodo, monto, matricula, sostenimiento, conGiro] of c.giros) {
    if (!programas[programa]) continue
    r.monto[periodo] += monto
    r.conGiro[periodo] += conGiro
    if (matricula !== null) r.matricula[periodo] += matricula
    if (sostenimiento !== null) r.sostenimiento[periodo] += sostenimiento
  }
  return r
}

/** Monto y beneficios con giro de cada programa en el periodo elegido. */
export function girosPorPrograma(c: ConjuntoFondos, f: FiltrosFondos): { monto: number[]; conGiro: number[] } {
  const programas = programasElegidos(c.dim, f)
  const monto = ceros(c.dim.programa.length)
  const conGiro = ceros(c.dim.programa.length)
  for (const [programa, periodo, m, , , g] of c.giros) {
    if (periodo !== f.periodo || !programas[programa]) continue
    monto[programa] += m
    conGiro[programa] += g
  }
  return { monto, conGiro }
}

/** Programas con matrícula y sostenimiento por separado (los fondos de la Línea Pregrado). */
export function programasConDesglose(c: ConjuntoFondos): number[] {
  const con = new Set<number>()
  for (const [programa, , , matricula, sostenimiento] of c.giros) {
    if (matricula !== null || sostenimiento !== null) con.add(programa)
  }
  return Array.from(con).sort((a, b) => a - b)
}

/* ------------------------------------------------------------- cohortes */

/** Matriz [convocatoria][estado actual] con línea, programa y convocatoria. */
export function cohortesPorConvocatoria(c: ConjuntoFondos, f: FiltrosFondos): number[][] {
  const programas = programasElegidos(c.dim, f)
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const matriz = c.dim.convocatoria.map(() => ceros(c.dim.estado.length))
  for (const [programa, convocatoria, estado, beneficios] of c.cohortes) {
    if (programas[programa] && convocatorias[convocatoria]) matriz[convocatoria][estado] += beneficios
  }
  return matriz
}

/* --------------------------------------------- sexo, comunas e instituciones */

export interface ActivosPorCategoria {
  /** Beneficios activos en cada categoría. */
  beneficios: number[]
  /** Cuántos programas tienen activos en cada categoría. */
  programas: number[]
}

/**
 * Beneficios activos por categoría (sexo, comuna o institución) en el periodo
 * elegido, con línea y programa. Estas filas no traen convocatoria.
 */
export function activosPorCategoria(
  filas: readonly FilaActivos[],
  categorias: number,
  c: ConjuntoFondos,
  f: FiltrosFondos,
): ActivosPorCategoria {
  const elegidos = programasElegidos(c.dim, f)
  const beneficios = ceros(categorias)
  const programas = Array.from({ length: categorias }, () => new Set<number>())
  for (const [programa, periodo, categoria, n] of filas) {
    if (periodo !== f.periodo || !elegidos[programa] || categoria >= categorias) continue
    beneficios[categoria] += n
    if (n > 0) programas[categoria].add(programa)
  }
  return { beneficios, programas: programas.map((s) => s.size) }
}

/* -------------------------------------------------------------- destinos */

/** Beneficios de Enlaza Mundos por país de destino, con la convocatoria. */
export function destinosPorPais(c: ConjuntoFondos, f: FiltrosFondos): number[] {
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const total = ceros(c.dim.pais.length)
  for (const [convocatoria, pais, beneficios] of c.destinos) {
    if (convocatorias[convocatoria]) total[pais] += beneficios
  }
  return total
}

/** Beneficios de Enlaza Mundos con destino por convocatoria, con el filtro de convocatoria. */
export function destinosPorConvocatoria(c: ConjuntoFondos, f: FiltrosFondos): number[] {
  const convocatorias = convocatoriasElegidas(c.dim, f)
  const total = ceros(c.dim.convocatoria.length)
  for (const [convocatoria, , beneficios] of c.destinos) {
    if (convocatorias[convocatoria]) total[convocatoria] += beneficios
  }
  return total
}

/* ----------------------------------------------------------- indicadores */

export interface Resumen {
  /** Beneficios activos en el periodo (estados: con convocatoria). */
  activos: number
  /** Beneficios con registro en el periodo, en cualquier estado. */
  registros: number
  /** Pesos girados en el periodo (sin convocatoria). */
  monto: number
  /** Activas según el conjunto de sexo (sin convocatoria) y el total de ese conjunto. */
  mujeres: number
  activosSexo: number
  /** Programas con beneficios activos en el periodo y programas que deja pasar el filtro. */
  programas: number
  programasElegidos: number
  /** Instituciones con beneficios activos en el periodo (sin convocatoria). */
  instituciones: number
}

export function resumir(c: ConjuntoFondos, f: FiltrosFondos): Resumen {
  const estados = estadosDelPeriodo(c, f)
  const activo = indiceActivo(c.dim)
  const sexo = activosPorCategoria(c.sexo, c.dim.sexo.length, c, f).beneficios
  const mujer = c.dim.sexo.indexOf('Mujer')
  const giros = girosPorPrograma(c, f)
  return {
    activos: activo >= 0 ? estados[activo] : 0,
    registros: suma(estados),
    monto: suma(giros.monto),
    mujeres: mujer >= 0 ? sexo[mujer] : 0,
    activosSexo: suma(sexo),
    programas: conValor(activosPorPrograma(c, f)).length,
    programasElegidos: programasElegidos(c.dim, f).filter(Boolean).length,
    instituciones: conValor(activosPorCategoria(c.ies, c.dim.ies.length, c, f).beneficios).length,
  }
}

/* -------------------------------------------------------------- gráficos */

/**
 * Ventana visible [desde, hasta] de un gráfico con más categorías de las que
 * caben (null si caben todas). Arranca al final (`alFinal`, lo más reciente
 * de una serie cronológica) o al principio; si la categoría resaltada queda
 * fuera, la ventana se corre para dejarla cerca del centro.
 */
export function ventana(total: number, caben: number, resaltar = -1, alFinal = true): [number, number] | null {
  const n = Math.max(1, Math.floor(caben))
  if (total <= n) return null
  let desde = alFinal ? total - n : 0
  if (resaltar >= 0 && resaltar < total && (resaltar < desde || resaltar > desde + n - 1)) {
    desde = Math.min(total - n, Math.max(0, resaltar - Math.floor((n - 1) / 2)))
  }
  return [desde, desde + n - 1]
}

/* -------------------------------------------------------------- formatos */

const fMillones = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Pesos en millones, con un decimal: «19.167,6». */
export const millonesCorto = (pesos: number): string => fMillones.format(pesos / 1e6)

/** Pesos en millones para indicadores y rótulos: «$ 19.167,6 millones». */
export const millones = (pesos: number): string => `$ ${millonesCorto(pesos)} millones`

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** «2026-11-09» → «9 de noviembre de 2026» (el texto tal cual si no es una fecha). */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const mes = m ? MESES[Number(m[2]) - 1] : undefined
  if (!m || !mes) return iso
  return `${Number(m[3])} de ${mes} de ${m[1]}`
}
