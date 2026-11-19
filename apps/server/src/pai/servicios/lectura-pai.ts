import type { RowDataPacket } from 'mysql2/promise';
import {
  BIMESTRES_PAI,
  type CalculoIndicadorPai,
  type EscalaPorcentajePai,
  type EstadoBimestre,
  type EvidenciaPai,
  type IndicadorTableroPai,
  NUMEROS_BIMESTRE,
  type NumeroBimestre,
  type OrigenReporte,
  type ReglaTotal,
  type ReporteBimestrePai,
  type RiesgoMaterializado,
  RUTA_API_PAI,
  RUTAS_API_PAI,
  type TipoMeta,
  type VigenciaPai,
} from '../api-pai.js';
import type { DecisionEdicionPai } from '../compartido/tipos-servidor.js';
import {
  calcularIndicador,
  calculoDeColumnas,
  type ResultadoCalculoPai,
} from '../dominio/calculo-pai.js';
import { estadoBimestre } from '../dominio/reglas-edicion.js';
import { noEncontrado } from '../errores-pai.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';

/**
 * Lecturas de la base que comparten los servicios del dominio (vigencia,
 * tablero, ficha, reportes, exportación) y la construcción, pura, de las
 * piezas del contrato (VigenciaPai, IndicadorTableroPai, ReporteBimestrePai).
 * Las consultas llevan `?` y alias en snake_case (sirven igual en MySQL y en
 * Postgres).
 */

/** Ejecuta una lectura en la base o en la conexión de una transacción. */
export type ConsultorPai = <T extends RowDataPacket>(
  sql: string,
  valores?: unknown[],
) => Promise<T[]>;

export function consultorDe(
  bd: BaseDatosRepositorio,
  conexion?: Pick<Conexion, 'query'>,
): ConsultorPai {
  if (conexion) {
    return async <T extends RowDataPacket>(
      sql: string,
      valores: unknown[] = [],
    ) => {
      const [filas] = await conexion.query<T[]>(sql, valores);
      return filas;
    };
  }
  return <T extends RowDataPacket>(sql: string, valores: unknown[] = []) =>
    bd.filas<T>(sql, valores);
}

/** Fecha de la base (Date en los dos motores; texto por si acaso). */
export function fecha(valor: unknown): Date | null {
  if (valor === null || valor === undefined) return null;
  const resultado = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function iso(valor: unknown): string | null {
  return fecha(valor)?.toISOString() ?? null;
}

/** Número de la base (DECIMAL ya llega como número; null se conserva). */
export function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function bimestreONulo(valor: unknown): NumeroBimestre | null {
  const n = numero(valor);
  return n !== null && n >= 1 && n <= 6 ? (n as NumeroBimestre) : null;
}

// ── Vigencia ───────────────────────────────────────────────────────────────

export interface FilaVigenciaPai {
  id: number;
  anio: number;
  bimestreAbierto: NumeroBimestre | null;
  abiertoHasta: Date | null;
  actualizadoEn: Date | null;
  actualizadoPor: string | null;
}

interface FilaVigenciaBd extends RowDataPacket {
  id: number;
  anio: number;
  bimestre_abierto: number | null;
  abierto_hasta: Date | null;
  actualizado_en: Date | null;
  actualizado_por_nombre: string | null;
}

const SQL_VIGENCIA =
  'SELECT v.id, v.anio, v.bimestre_abierto, v.abierto_hasta, v.actualizado_en, u.nombre AS actualizado_por_nombre ' +
  'FROM pai_vigencias v LEFT JOIN pai_usuarios u ON u.id = v.actualizado_por';

const SQL_VIGENCIA_BLOQUEO =
  'SELECT v.id, v.anio, v.bimestre_abierto, v.abierto_hasta, v.actualizado_en, NULL AS actualizado_por_nombre FROM pai_vigencias v';

/**
 * Fila de la vigencia `anio` (null = la más reciente). 404 si no existe.
 * `bloquear` la lee con FOR UPDATE (dentro de una transacción).
 */
export async function leerVigencia(
  consultar: ConsultorPai,
  anio: number | null,
  { bloquear = false } = {},
): Promise<FilaVigenciaPai> {
  // Para bloquear se lee solo pai_vigencias (Postgres no bloquea el lado
  // nulo de un LEFT JOIN); el nombre de quien la actualizó no hace falta ahí.
  const base = bloquear ? SQL_VIGENCIA_BLOQUEO : SQL_VIGENCIA;
  let sql =
    anio === null
      ? `${base} ORDER BY v.anio DESC LIMIT 1`
      : `${base} WHERE v.anio = ?`;
  if (bloquear) sql += ' FOR UPDATE';
  const filas = await consultar<FilaVigenciaBd>(
    sql,
    anio === null ? [] : [anio],
  );
  const fila = filas[0];
  if (!fila) {
    throw noEncontrado(
      anio === null
        ? 'Todavía no se ha cargado el Plan de Acción Institucional de ninguna vigencia.'
        : `La vigencia ${anio} no existe en el Plan de Acción Institucional.`,
    );
  }
  return {
    id: Number(fila.id),
    anio: Number(fila.anio),
    bimestreAbierto: bimestreONulo(fila.bimestre_abierto),
    abiertoHasta: fecha(fila.abierto_hasta),
    actualizadoEn: fecha(fila.actualizado_en),
    actualizadoPor: fila.actualizado_por_nombre ?? null,
  };
}

interface FilaAnio extends RowDataPacket {
  anio: number;
}

/** Años con vigencia, del más reciente al más antiguo. */
export async function aniosVigencias(
  consultar: ConsultorPai,
): Promise<number[]> {
  const filas = await consultar<FilaAnio>(
    'SELECT anio FROM pai_vigencias ORDER BY anio DESC',
  );
  return filas.map((fila) => Number(fila.anio));
}

export function aVigenciaPai(
  fila: FilaVigenciaPai,
  anios: number[],
  ahora: Date,
  abiertoAhora: boolean,
): VigenciaPai {
  return {
    anio: fila.anio,
    bimestreAbierto: fila.bimestreAbierto,
    abiertoHasta: fila.abiertoHasta?.toISOString() ?? null,
    abiertoAhora,
    bimestres: BIMESTRES_PAI.map((b) => ({ ...b })),
    vigencias: anios,
    ahora: ahora.toISOString(),
    actualizadoEn: fila.actualizadoEn?.toISOString() ?? null,
    actualizadoPor: fila.actualizadoPor,
  };
}

// ── Indicadores ────────────────────────────────────────────────────────────

export interface IndicadorBasePai {
  id: number;
  vigenciaId: number;
  procesoId: number;
  accionId: number;
  codigo: string;
  orden: number;
  nombre: string;
  tipoMeta: TipoMeta;
  metas: number[];
  metaTotal: number;
  calculo: CalculoIndicadorPai;
  /** Solo los de porcentaje: '0-100' (lo normal) o '0-1' (extras.escala). */
  escala: EscalaPorcentajePai | null;
}

export interface FilaIndicadorBd extends RowDataPacket {
  id: number;
  vigencia_id: number;
  proceso_id: number;
  accion_id: number;
  codigo: string;
  orden: number;
  nombre: string;
  tipo_meta: TipoMeta;
  meta_1: number;
  meta_2: number;
  meta_3: number;
  meta_4: number;
  meta_5: number;
  meta_6: number;
  meta_total: number;
  regla_meta_total: ReglaTotal;
  divisor_meta_total: number | null;
  regla_avance_total: ReglaTotal;
  divisor_avance_total: number | null;
  tope_100: number | null;
  tope_por_bimestre: string | null;
  /** 1 si extras trae "escala":"0-1" (la carga guarda extras con JSON.stringify, sin espacios). */
  escala_fraccion: number;
}

/**
 * Columnas de pai_indicadores (alias i) que lee indicadorDeFila. La escala
 * se calcula en la consulta (un LIKE sobre extras) para no traer el texto
 * JSON completo de cada indicador.
 */
export const COLUMNAS_INDICADOR =
  'i.id, i.vigencia_id, i.proceso_id, i.accion_id, i.codigo, i.orden, i.nombre, i.tipo_meta, ' +
  'i.meta_1, i.meta_2, i.meta_3, i.meta_4, i.meta_5, i.meta_6, i.meta_total, ' +
  'i.regla_meta_total, i.divisor_meta_total, i.regla_avance_total, i.divisor_avance_total, ' +
  'i.tope_100, i.tope_por_bimestre, ' +
  `CASE WHEN i.extras LIKE '%"escala":"0-1"%' THEN 1 ELSE 0 END AS escala_fraccion`;

/** Escala de un indicador según su tipo de meta y extras.escala (null si no es de porcentaje). */
export function escalaIndicador(
  tipoMeta: TipoMeta,
  fraccion: boolean,
): EscalaPorcentajePai | null {
  if (tipoMeta !== 'porcentaje') return null;
  return fraccion ? '0-1' : '0-100';
}

export function indicadorDeFila(fila: FilaIndicadorBd): IndicadorBasePai {
  return {
    id: Number(fila.id),
    vigenciaId: Number(fila.vigencia_id),
    procesoId: Number(fila.proceso_id),
    accionId: Number(fila.accion_id),
    codigo: fila.codigo,
    orden: Number(fila.orden),
    nombre: fila.nombre,
    tipoMeta: fila.tipo_meta,
    metas: [
      fila.meta_1,
      fila.meta_2,
      fila.meta_3,
      fila.meta_4,
      fila.meta_5,
      fila.meta_6,
    ].map((m) => numero(m) ?? 0),
    metaTotal: numero(fila.meta_total) ?? 0,
    calculo: calculoDeColumnas(fila),
    escala: escalaIndicador(fila.tipo_meta, Number(fila.escala_fraccion) === 1),
  };
}

/**
 * Condición SQL "el indicador i es visible para el usuario ?" de un
 * responsable: asignado directamente o por su proceso.
 */
export const SQL_ASIGNADO =
  'EXISTS (SELECT 1 FROM pai_asignaciones a WHERE a.usuario_id = ? AND (a.indicador_id = i.id OR a.proceso_id = i.proceso_id))';

// ── Reportes ───────────────────────────────────────────────────────────────

/** Lo que el tablero necesita de un reporte (sin textos). */
export interface ResumenReportePai {
  id: number;
  indicadorId: number;
  bimestre: NumeroBimestre;
  avance: number | null;
  tieneTextos: boolean;
  actualizadoEn: Date | null;
  evidencias: number;
}

interface FilaResumenReporteBd extends RowDataPacket {
  id: number;
  indicador_id: number;
  bimestre: number;
  avance: number | null;
  tiene_textos: number;
  actualizado_en: Date;
  evidencias: number;
}

const SQL_TIENE_TEXTOS =
  'CASE WHEN r.logros IS NULL AND r.observaciones IS NULL AND r.riesgo_materializado IS NULL ' +
  'AND r.numeral_riesgo IS NULL AND r.descripcion_riesgo IS NULL AND r.fuentes_verificacion IS NULL THEN 0 ELSE 1 END';

/**
 * Reportes (sin textos) de una vigencia o de un indicador, con el conteo de
 * evidencias. `usuarioAsignado`: solo los de indicadores asignados a ese
 * responsable.
 */
export async function leerResumenReportes(
  consultar: ConsultorPai,
  donde: { vigenciaId: number } | { indicadorId: number },
  usuarioAsignado: number | null = null,
): Promise<ResumenReportePai[]> {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if ('vigenciaId' in donde) {
    condiciones.push('i.vigencia_id = ?');
    valores.push(donde.vigenciaId);
  } else {
    condiciones.push('r.indicador_id = ?');
    valores.push(donde.indicadorId);
  }
  if (usuarioAsignado !== null) {
    condiciones.push(SQL_ASIGNADO);
    valores.push(usuarioAsignado);
  }
  const filas = await consultar<FilaResumenReporteBd>(
    `SELECT r.id, r.indicador_id, r.bimestre, r.avance, ${SQL_TIENE_TEXTOS} AS tiene_textos, r.actualizado_en, ` +
      '(SELECT COUNT(*) FROM pai_evidencias e WHERE e.reporte_id = r.id) AS evidencias ' +
      'FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id ' +
      `WHERE ${condiciones.join(' AND ')}`,
    valores,
  );
  return filas.map((fila) => ({
    id: Number(fila.id),
    indicadorId: Number(fila.indicador_id),
    bimestre: Number(fila.bimestre) as NumeroBimestre,
    avance: numero(fila.avance),
    tieneTextos: Number(fila.tiene_textos) === 1,
    actualizadoEn: fecha(fila.actualizado_en),
    evidencias: Number(fila.evidencias) || 0,
  }));
}

/** Reportes agrupados por indicador: 6 posiciones (índice 0 = Bimestre 1). */
export function reportesPorIndicador(
  reportes: readonly ResumenReportePai[],
): Map<number, (ResumenReportePai | undefined)[]> {
  const mapa = new Map<number, (ResumenReportePai | undefined)[]>();
  for (const reporte of reportes) {
    let lista = mapa.get(reporte.indicadorId);
    if (!lista) {
      lista = [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ];
      mapa.set(reporte.indicadorId, lista);
    }
    lista[reporte.bimestre - 1] = reporte;
  }
  return mapa;
}

/** Reporte completo de un bimestre (ficha y respuesta del PUT). */
export interface ReporteCompletoPai {
  id: number;
  bimestre: NumeroBimestre;
  avance: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgoMaterializado: RiesgoMaterializado | null;
  numeralRiesgo: string | null;
  descripcionRiesgo: string | null;
  fuentesVerificacion: string | null;
  origen: OrigenReporte;
  actualizadoEn: Date | null;
  actualizadoPor: string | null;
}

interface FilaReporteCompletoBd extends RowDataPacket {
  id: number;
  bimestre: number;
  avance: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgo_materializado: RiesgoMaterializado | null;
  numeral_riesgo: string | null;
  descripcion_riesgo: string | null;
  fuentes_verificacion: string | null;
  origen: OrigenReporte;
  actualizado_en: Date;
  actualizado_por_nombre: string | null;
}

export async function leerReportesCompletos(
  consultar: ConsultorPai,
  indicadorId: number,
): Promise<ReporteCompletoPai[]> {
  const filas = await consultar<FilaReporteCompletoBd>(
    'SELECT r.id, r.bimestre, r.avance, r.logros, r.observaciones, r.riesgo_materializado, r.numeral_riesgo, ' +
      'r.descripcion_riesgo, r.fuentes_verificacion, r.origen, r.actualizado_en, u.nombre AS actualizado_por_nombre ' +
      'FROM pai_reportes r LEFT JOIN pai_usuarios u ON u.id = r.actualizado_por WHERE r.indicador_id = ? ORDER BY r.bimestre',
    [indicadorId],
  );
  return filas.map((fila) => ({
    id: Number(fila.id),
    bimestre: Number(fila.bimestre) as NumeroBimestre,
    avance: numero(fila.avance),
    logros: fila.logros ?? null,
    observaciones: fila.observaciones ?? null,
    riesgoMaterializado: fila.riesgo_materializado ?? null,
    numeralRiesgo: fila.numeral_riesgo ?? null,
    descripcionRiesgo: fila.descripcion_riesgo ?? null,
    fuentesVerificacion: fila.fuentes_verificacion ?? null,
    origen: fila.origen,
    actualizadoEn: fecha(fila.actualizado_en),
    actualizadoPor: fila.actualizado_por_nombre ?? null,
  }));
}

export interface EvidenciaLeidaPai extends EvidenciaPai {
  bimestre: NumeroBimestre;
}

interface FilaEvidenciaBd extends RowDataPacket {
  id: number;
  bimestre: number;
  nombre: string;
  tipo: string;
  bytes: number;
  subido_en: Date;
  subido_por_nombre: string | null;
}

export function urlEvidencia(id: number): string {
  return `${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(id)}`;
}

/** Evidencias de un indicador (de uno o de todos sus bimestres), en orden de subida. */
export async function leerEvidencias(
  consultar: ConsultorPai,
  indicadorId: number,
  bimestre: NumeroBimestre | null = null,
): Promise<EvidenciaLeidaPai[]> {
  const filas = await consultar<FilaEvidenciaBd>(
    'SELECT e.id, r.bimestre, e.nombre, e.tipo, e.bytes, e.subido_en, u.nombre AS subido_por_nombre ' +
      'FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id LEFT JOIN pai_usuarios u ON u.id = e.subido_por ' +
      `WHERE r.indicador_id = ?${bimestre === null ? '' : ' AND r.bimestre = ?'} ORDER BY e.subido_en, e.id`,
    bimestre === null ? [indicadorId] : [indicadorId, bimestre],
  );
  return filas.map((fila) => ({
    id: Number(fila.id),
    bimestre: Number(fila.bimestre) as NumeroBimestre,
    nombre: fila.nombre,
    tipo: fila.tipo,
    bytes: Number(fila.bytes),
    subidoEn: iso(fila.subido_en) ?? '',
    subidoPor: fila.subido_por_nombre ?? null,
    urlDescarga: urlEvidencia(Number(fila.id)),
  }));
}

// ── Construcción de las piezas del contrato ────────────────────────────────

export interface ContextoFilasPai {
  anio: number;
  bimestreAbierto: NumeroBimestre | null;
  ahora: Date;
}

/** Decimales de los porcentajes en las respuestas (fracción: 6 = 0,0001 %). */
const DECIMALES_PORCENTAJE = 6;

/** Porcentaje redondeado para la respuesta (evita 0.33333333333333337). */
export function porcentajeRespuesta(valor: number | null): number | null {
  if (valor === null) return null;
  return Number(valor.toFixed(DECIMALES_PORCENTAJE));
}

/** ¿Reportado? (avance, aunque sea 0, o algún texto). */
function estaReportado(
  reporte: { avance: number | null; tieneTextos: boolean } | undefined,
): boolean {
  return Boolean(reporte && (reporte.avance !== null || reporte.tieneTextos));
}

/** Avances (6) de los reportes de un indicador. */
export function avancesDe(
  reportes: readonly ({ avance: number | null } | undefined)[],
): (number | null)[] {
  return NUMEROS_BIMESTRE.map((b) => reportes[b - 1]?.avance ?? null);
}

export function calcularBase(
  indicador: IndicadorBasePai,
  reportes: readonly ({ avance: number | null } | undefined)[],
): ResultadoCalculoPai {
  return calcularIndicador({
    metas: indicador.metas,
    metaTotalGuardada: indicador.metaTotal,
    avances: avancesDe(reportes),
    calculo: indicador.calculo,
  });
}

export function estadosDe(
  indicador: IndicadorBasePai,
  reportes: readonly (
    { avance: number | null; tieneTextos: boolean } | undefined
  )[],
  contexto: ContextoFilasPai,
): EstadoBimestre[] {
  return NUMEROS_BIMESTRE.map((b) =>
    estadoBimestre({
      meta: indicador.metas[b - 1] ?? 0,
      reportado: estaReportado(reportes[b - 1]),
      bimestre: b,
      bimestreAbierto: contexto.bimestreAbierto,
      anioVigencia: contexto.anio,
      ahora: contexto.ahora,
    }),
  );
}

/** Fila del tablero de un indicador (6 posiciones por lista). */
export function filaTablero(
  indicador: IndicadorBasePai,
  reportes: readonly (ResumenReportePai | undefined)[],
  decisiones: readonly DecisionEdicionPai[],
  contexto: ContextoFilasPai,
  calculo: ResultadoCalculoPai = calcularBase(indicador, reportes),
): IndicadorTableroPai {
  return {
    id: indicador.id,
    codigo: indicador.codigo,
    nombre: indicador.nombre,
    procesoId: indicador.procesoId,
    accionId: indicador.accionId,
    orden: indicador.orden,
    tipoMeta: indicador.tipoMeta,
    escala: indicador.escala,
    metas: indicador.metas,
    metaTotal: calculo.metaTotal,
    avances: avancesDe(reportes),
    avanceTotal: calculo.avanceTotal,
    porcentajes: calculo.porcentajes.map(porcentajeRespuesta),
    porcentajeTotal: porcentajeRespuesta(calculo.porcentajeTotal),
    estados: estadosDe(indicador, reportes, contexto),
    editables: decisiones.map((d) => d.editable),
    motivos: decisiones.map((d) => d.motivo),
    tieneTextos: NUMEROS_BIMESTRE.map(
      (b) => reportes[b - 1]?.tieneTextos ?? false,
    ),
    evidencias: NUMEROS_BIMESTRE.map((b) => reportes[b - 1]?.evidencias ?? 0),
    actualizadoEn: NUMEROS_BIMESTRE.map(
      (b) => reportes[b - 1]?.actualizadoEn?.toISOString() ?? null,
    ),
  };
}

/** Resumen (sin textos) de un reporte completo, para filaTablero. */
export function resumenDeCompleto(
  reporte: ReporteCompletoPai,
  indicadorId: number,
  evidencias: number,
): ResumenReportePai {
  return {
    id: reporte.id,
    indicadorId,
    bimestre: reporte.bimestre,
    avance: reporte.avance,
    tieneTextos:
      reporte.logros !== null ||
      reporte.observaciones !== null ||
      reporte.riesgoMaterializado !== null ||
      reporte.numeralRiesgo !== null ||
      reporte.descripcionRiesgo !== null ||
      reporte.fuentesVerificacion !== null,
    actualizadoEn: reporte.actualizadoEn,
    evidencias,
  };
}

/** ReporteBimestrePai de un bimestre (vacío si no hay reporte). */
export function reporteBimestre(
  indicador: IndicadorBasePai,
  bimestre: NumeroBimestre,
  reporte: ReporteCompletoPai | undefined,
  evidencias: readonly EvidenciaPai[],
  decision: DecisionEdicionPai,
  estado: EstadoBimestre,
  porcentaje: number | null,
): ReporteBimestrePai {
  return {
    bimestre,
    meta: indicador.metas[bimestre - 1] ?? 0,
    avance: reporte?.avance ?? null,
    porcentaje: porcentajeRespuesta(porcentaje),
    estado,
    logros: reporte?.logros ?? null,
    observaciones: reporte?.observaciones ?? null,
    riesgoMaterializado: reporte?.riesgoMaterializado ?? null,
    numeralRiesgo: reporte?.numeralRiesgo ?? null,
    descripcionRiesgo: reporte?.descripcionRiesgo ?? null,
    fuentesVerificacion: reporte?.fuentesVerificacion ?? null,
    evidencias: evidencias.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      tipo: e.tipo,
      bytes: e.bytes,
      subidoEn: e.subidoEn,
      subidoPor: e.subidoPor,
      urlDescarga: e.urlDescarga,
    })),
    origen: reporte?.origen ?? null,
    actualizadoEn: reporte?.actualizadoEn?.toISOString() ?? null,
    actualizadoPor: reporte?.actualizadoPor ?? null,
    editable: decision.editable,
    motivo: decision.motivo,
  };
}
