import type {
  CalculoIndicadorPai,
  ConteoEstadosPai,
  EstadoBimestre,
  NumeroBimestre,
  ReglaTotal,
  ResumenAvancePai,
} from '../api-pai.js';

/**
 * Cálculos del PAI, puros (sin base ni Nest), según las notas 10-18 de
 * datos/pai/2026/pai-2026.json. Pruebas en calculo-pai.spec.ts, que además
 * recalcula los 344 indicadores del JSON y los compara con los totales y
 * porcentajes de los Excel (extras.excel).
 *
 * - % del bimestre = avance_b / meta_b solo si meta_b > 0 y hay avance (si
 *   no, null; si hay avance sin meta, la interfaz lo muestra como "sin
 *   meta").
 * - Tope min(1, x) según calculo.tope100 o, en los mixtos (tope100 null),
 *   según topePorBimestre (por bimestre y en el total).
 * - Meta total: la guardada (meta_total = metas.total del JSON), que la carga
 *   trae ya normalizada según su regla (nota 11); totalSegunRegla la
 *   recalcula y la prueba de los 344 comprueba que coinciden.
 * - Avance total según su regla (ReglaTotal), sobre los avances reportados;
 *   null si no hay ninguno.
 * - % total = avance_total / meta_total (con el tope del total).
 * - Logro de un grupo en un bimestre = promedio de los % de los indicadores
 *   con meta > 0 en ese bimestre que ya se deben reportar (estado distinto
 *   de 'futuro'; nota 18: un indicador sin avance cuenta como 0 %, igual que
 *   en el Excel, también si nadie del grupo reportó); null si no entra
 *   ninguno (sin metas, o un bimestre que todavía no se debe reportar).
 *   Avance anual = promedio de los % totales de los indicadores con meta
 *   total > 0 que ya tienen algún bimestre exigible (sin avance = 0 %), null
 *   si no hay ninguno. Una dependencia promedia sus procesos (los no nulos)
 *   y el total general, las dependencias.
 */

/** Decimales con los que se guardan metas y avances (DECIMAL(24,10); nota 13). */
export const DECIMALES_VALOR = 10;

/** Lo que necesita el cálculo de un indicador (6 valores por bimestre, índice 0 = Bimestre 1). */
export interface EntradaCalculoPai {
  metas: number[];
  /** Valor guardado en meta_total (metas.total del JSON, ya normalizado). */
  metaTotalGuardada: number;
  avances: (number | null)[];
  calculo: CalculoIndicadorPai;
}

export interface ResultadoCalculoPai {
  porcentajes: (number | null)[];
  metaTotal: number;
  avanceTotal: number | null;
  porcentajeTotal: number | null;
}

/** Columnas de pai_indicadores que describen el cálculo. */
export interface ColumnasCalculoPai {
  regla_meta_total: ReglaTotal;
  divisor_meta_total: number | null;
  regla_avance_total: ReglaTotal;
  divisor_avance_total: number | null;
  /** 1 con tope, 0 sin tope, null mixto. */
  tope_100: number | boolean | null;
  /** JSON {"1":true,…,"6":false,"total":false} (solo los mixtos). */
  tope_por_bimestre: string | null;
}

/** CalculoIndicadorPai de las columnas de la base (o de las filas de la carga). */
export function calculoDeColumnas(
  columnas: ColumnasCalculoPai,
): CalculoIndicadorPai {
  const tope100 =
    columnas.tope_100 === null || columnas.tope_100 === undefined
      ? null
      : Boolean(Number(columnas.tope_100));
  let topePorBimestre: CalculoIndicadorPai['topePorBimestre'] = null;
  if (tope100 === null) {
    let mapa: Record<string, unknown> = {};
    try {
      const valor: unknown = JSON.parse(columnas.tope_por_bimestre ?? '{}');
      if (valor && typeof valor === 'object') {
        mapa = valor as Record<string, unknown>;
      }
    } catch {
      // Sin JSON válido: sin tope (la carga no deja guardar uno inválido).
    }
    topePorBimestre = {
      bimestres: ['1', '2', '3', '4', '5', '6'].map((b) => mapa[b] === true),
      total: mapa.total === true,
    };
  }
  return {
    reglaMetaTotal: columnas.regla_meta_total,
    divisorMetaTotal:
      columnas.divisor_meta_total === null
        ? null
        : Number(columnas.divisor_meta_total),
    reglaAvanceTotal: columnas.regla_avance_total,
    divisorAvanceTotal:
      columnas.divisor_avance_total === null
        ? null
        : Number(columnas.divisor_avance_total),
    tope100,
    topePorBimestre,
  };
}

/** Redondea a `decimales` cifras (quita el ruido de la suma en coma flotante: 0.1 + 0.2). */
export function redondear(valor: number, decimales = DECIMALES_VALOR): number {
  if (!Number.isFinite(valor)) return valor;
  const redondeado = Number(valor.toFixed(decimales));
  // -0 -> 0
  return redondeado === 0 ? 0 : redondeado;
}

/** avance / meta (fracción) con tope opcional; null si meta <= 0 o avance null. */
export function porcentajeBimestre(
  avance: number | null,
  meta: number,
  conTope: boolean,
): number | null {
  if (avance === null || !Number.isFinite(avance)) return null;
  if (!Number.isFinite(meta) || meta <= 0) return null;
  const fraccion = avance / meta;
  return conTope ? Math.min(1, fraccion) : fraccion;
}

/** ¿Lleva tope de 100 % el bimestre `b` (1-6)? */
export function topeBimestre(
  calculo: CalculoIndicadorPai,
  bimestre: NumeroBimestre,
): boolean {
  if (calculo.tope100 !== null) return calculo.tope100;
  return calculo.topePorBimestre?.bimestres[bimestre - 1] ?? false;
}

/** ¿Lleva tope de 100 % el porcentaje total? */
export function topeTotal(calculo: CalculoIndicadorPai): boolean {
  if (calculo.tope100 !== null) return calculo.tope100;
  return calculo.topePorBimestre?.total ?? false;
}

/**
 * Total de 6 valores según la regla (ver ReglaTotal en api-pai.ts). Los null
 * cuentan como 0 (como SUM en Excel). 'constante' devuelve `guardado`.
 * El resultado se redondea a DECIMALES_VALOR cifras.
 */
export function totalSegunRegla(
  regla: ReglaTotal,
  divisor: number | null,
  valores: readonly (number | null)[],
  guardado: number,
): number {
  if (regla === 'constante') return guardado;
  const suma = valores.reduce<number>((total, v) => total + (v ?? 0), 0);
  switch (regla) {
    case 'suma':
      return redondear(suma);
    case 'suma_dividida':
      // Sin divisor válido no se divide (la carga no lo permite: CHECK > 0).
      return redondear(divisor && divisor > 0 ? suma / divisor : suma);
    case 'si_suma_mayor_99_entonces_100':
      return suma > 99 ? 100 : 0;
  }
}

/**
 * Avance total: la regla del avance sobre los avances reportados (null si
 * no hay ninguno). La regla 'constante' no existe para el avance (no hay un
 * avance total guardado): se trata como 'suma'.
 */
export function avanceTotal(
  avances: readonly (number | null)[],
  calculo: CalculoIndicadorPai,
): number | null {
  if (avances.every((v) => v === null)) return null;
  const regla =
    calculo.reglaAvanceTotal === 'constante'
      ? 'suma'
      : calculo.reglaAvanceTotal;
  return totalSegunRegla(regla, calculo.divisorAvanceTotal, avances, 0);
}

export function calcularIndicador(
  entrada: EntradaCalculoPai,
): ResultadoCalculoPai {
  const { calculo } = entrada;
  const porcentajes = [0, 1, 2, 3, 4, 5].map((i) =>
    porcentajeBimestre(
      entrada.avances[i] ?? null,
      entrada.metas[i] ?? 0,
      topeBimestre(calculo, (i + 1) as NumeroBimestre),
    ),
  );
  const metaTotal = entrada.metaTotalGuardada;
  const total = avanceTotal(entrada.avances, calculo);
  return {
    porcentajes,
    metaTotal,
    avanceTotal: total,
    porcentajeTotal: porcentajeBimestre(total, metaTotal, topeTotal(calculo)),
  };
}

/** Promedio de los valores no nulos (null si no hay ninguno). */
export function promedio(valores: readonly (number | null)[]): number | null {
  let suma = 0;
  let cuantos = 0;
  for (const valor of valores) {
    if (valor === null || !Number.isFinite(valor)) continue;
    suma += valor;
    cuantos++;
  }
  return cuantos === 0 ? null : suma / cuantos;
}

/** Lo que el resumen necesita de cada indicador. */
export interface IndicadorParaResumen {
  metas: number[];
  porcentajes: (number | null)[];
  metaTotal: number;
  porcentajeTotal: number | null;
  /** Estado de cada bimestre ('futuro' = todavía no se debe reportar). */
  estados: readonly EstadoBimestre[];
}

/**
 * Promedio "como el Excel" de un grupo: entran los que tienen meta > 0 y ya
 * se deben reportar; los que no tienen % (nadie reportó) cuentan como 0.
 * null si no entra ninguno.
 */
function promedioConMeta(
  pares: readonly {
    meta: number;
    porcentaje: number | null;
    exigible: boolean;
  }[],
): number | null {
  const entran = pares.filter((par) => par.meta > 0 && par.exigible);
  if (entran.length === 0) return null;
  return promedio(entran.map((par) => par.porcentaje ?? 0));
}

/**
 * ¿Cuenta ya el indicador para el avance anual? Si tiene %, o si alguno de
 * sus bimestres con meta (todos, si ninguno tiene) ya no es 'futuro'. Así un
 * indicador cuyas metas son todas de bimestres que no han llegado no baja el
 * promedio con un 0 %.
 */
function exigibleEnElAnio(indicador: IndicadorParaResumen): boolean {
  if (indicador.porcentajeTotal !== null) return true;
  const indices = [0, 1, 2, 3, 4, 5];
  const conMeta = indices.filter((i) => (indicador.metas[i] ?? 0) > 0);
  return (conMeta.length > 0 ? conMeta : indices).some(
    (i) => (indicador.estados[i] ?? 'futuro') !== 'futuro',
  );
}

/**
 * Logros por bimestre y avance anual de un grupo de indicadores (sin
 * conteo). En cada bimestre entran los indicadores con meta > 0 que no
 * están 'futuro': el que no reportó cuenta como 0 % (nota 18 y hoja
 * Consolidado del Excel), y el bimestre que todavía no se debe reportar
 * queda null en vez de parecer un incumplimiento.
 */
export function resumirIndicadores(
  indicadores: readonly IndicadorParaResumen[],
): Omit<ResumenAvancePai, 'conteo'> {
  const logros = [0, 1, 2, 3, 4, 5].map((i) =>
    promedioConMeta(
      indicadores.map((indicador) => ({
        meta: indicador.metas[i] ?? 0,
        porcentaje: indicador.porcentajes[i] ?? null,
        exigible: (indicador.estados[i] ?? 'futuro') !== 'futuro',
      })),
    ),
  );
  const avanceAnual = promedioConMeta(
    indicadores.map((indicador) => ({
      meta: indicador.metaTotal,
      porcentaje: indicador.porcentajeTotal,
      exigible: exigibleEnElAnio(indicador),
    })),
  );
  return { logros, avanceAnual, indicadores: indicadores.length };
}

/**
 * Resumen de un grupo de grupos (procesos de una dependencia, dependencias
 * del total): promedio simple de sus logros y de sus avances anuales (como
 * la hoja "Consolidado" de Planeación), suma de indicadores y de conteos.
 */
export function combinarResumenes(
  resumenes: readonly ResumenAvancePai[],
): ResumenAvancePai {
  return {
    logros: [0, 1, 2, 3, 4, 5].map((i) =>
      promedio(resumenes.map((r) => r.logros[i] ?? null)),
    ),
    avanceAnual: promedio(resumenes.map((r) => r.avanceAnual)),
    indicadores: resumenes.reduce((total, r) => total + r.indicadores, 0),
    conteo: sumarConteos(resumenes.map((r) => r.conteo)),
  };
}

/** Estados del bimestre abierto de un grupo (null si no hay bimestre abierto). */
export function contarEstados(
  estados: readonly EstadoBimestre[][],
  bimestreAbierto: NumeroBimestre | null,
): ConteoEstadosPai | null {
  if (bimestreAbierto === null) return null;
  const conteo: ConteoEstadosPai = {
    bimestre: bimestreAbierto,
    reportados: 0,
    pendientes: 0,
    sinMeta: 0,
  };
  for (const lista of estados) {
    const estado = lista[bimestreAbierto - 1];
    if (estado === 'reportado') conteo.reportados++;
    else if (estado === 'pendiente') conteo.pendientes++;
    else if (estado === 'sin_meta') conteo.sinMeta++;
  }
  return conteo;
}

/** Suma de conteos del mismo bimestre (null si no hay ninguno). */
export function sumarConteos(
  conteos: readonly (ConteoEstadosPai | null)[],
): ConteoEstadosPai | null {
  let resultado: ConteoEstadosPai | null = null;
  for (const conteo of conteos) {
    if (!conteo) continue;
    resultado ??= {
      bimestre: conteo.bimestre,
      reportados: 0,
      pendientes: 0,
      sinMeta: 0,
    };
    resultado.reportados += conteo.reportados;
    resultado.pendientes += conteo.pendientes;
    resultado.sinMeta += conteo.sinMeta;
  }
  return resultado;
}
