/**
 * Presentación del tablero y de la ficha (lógica pura, probada en
 * presentacion.test.ts): color de cada casilla según su avance, textos de
 * los estados y de los motivos de edición, lectura del avance que escribe el
 * responsable (es-CO) y textos de apoyo.
 *
 * Nada de esto decide permisos: la casilla editable y su motivo llegan del
 * servidor (editables / motivos) y aquí solo se describen.
 */
import {
  LIMITES_PAI,
  infoBimestre,
  type CalculoIndicadorPai,
  type EstadoBimestre,
  type EstadoReporteFiltro,
  type IndicadorTableroPai,
  type MotivoEdicion,
  type NumeroBimestre,
  type ReglaTotal,
  type RolPai,
  type TipoMeta,
  type TipoProceso,
  type VigenciaPai,
} from '../api-pai'
import { formatoNumero, formatoPorcentaje } from '../datos/formatos'

// ── Color de las casillas ──────────────────────────────────────────────────

/**
 * Clase de color de una casilla (o del total):
 *   completo: 100 % o más de la meta;
 *   parcial:  más de 0 % y menos de 100 %;
 *   cero:     con meta y sin avance (0 % o nada reportado) en un bimestre que
 *             ya se debía reportar;
 *   sin_meta: la meta es 0 (aunque haya avance);
 *   futuro:   aún no se reporta (estado 'futuro' del servidor: viene después
 *             del bimestre de referencia, el abierto o, sin abierto, el último
 *             ya terminado, y no tiene nada reportado). Neutro: nunca cuenta
 *             como incumplimiento.
 */
export type ClaseAvance = 'completo' | 'parcial' | 'cero' | 'sin_meta' | 'futuro'

export const CLASES_AVANCE: readonly ClaseAvance[] = ['completo', 'parcial', 'cero', 'sin_meta', 'futuro']

/** Tolerancia para comparar el % con 100 % (los decimales de Excel llegan redondeados a 10 cifras). */
const TOLERANCIA = 1e-9

function claseDePorcentaje(meta: number, porcentaje: number | null): ClaseAvance {
  if (!(meta > 0)) return 'sin_meta'
  if (porcentaje === null || porcentaje <= TOLERANCIA) return 'cero'
  return porcentaje >= 1 - TOLERANCIA ? 'completo' : 'parcial'
}

/** Clase de la casilla del bimestre `bimestre` (usa el % que calculó el servidor, con su tope). */
export function claseCasilla(
  indicador: Pick<IndicadorTableroPai, 'estados' | 'metas' | 'porcentajes'>,
  bimestre: NumeroBimestre,
): ClaseAvance {
  const i = bimestre - 1
  if (indicador.estados[i] === 'futuro') return 'futuro'
  return claseDePorcentaje(indicador.metas[i], indicador.porcentajes[i])
}

/** Clase del total anual del indicador. */
export function claseTotal(indicador: Pick<IndicadorTableroPai, 'metaTotal' | 'porcentajeTotal'>): ClaseAvance {
  return claseDePorcentaje(indicador.metaTotal, indicador.porcentajeTotal)
}

/** Clase de un reporte de la ficha (mismas reglas que la casilla). */
export function claseReporte(reporte: { estado: EstadoBimestre; meta: number; porcentaje: number | null }): ClaseAvance {
  if (reporte.estado === 'futuro') return 'futuro'
  return claseDePorcentaje(reporte.meta, reporte.porcentaje)
}

export const NOMBRE_CLASE_AVANCE: Readonly<Record<ClaseAvance, string>> = {
  completo: 'Completo',
  parcial: 'Parcial',
  cero: 'Sin avance',
  sin_meta: 'Sin meta',
  futuro: 'Futuro',
}

/** Leyenda de colores del tablero, en orden. */
export const LEYENDA_AVANCE: readonly { clase: ClaseAvance; nombre: string; descripcion: string }[] = [
  { clase: 'completo', nombre: NOMBRE_CLASE_AVANCE.completo, descripcion: '100 % o más de la meta' },
  { clase: 'parcial', nombre: NOMBRE_CLASE_AVANCE.parcial, descripcion: 'entre 0 % y 100 %' },
  { clase: 'cero', nombre: NOMBRE_CLASE_AVANCE.cero, descripcion: 'con meta, avance 0 o sin reportar' },
  { clase: 'sin_meta', nombre: NOMBRE_CLASE_AVANCE.sin_meta, descripcion: 'meta 0 en el bimestre' },
  { clase: 'futuro', nombre: NOMBRE_CLASE_AVANCE.futuro, descripcion: 'aún no se reporta (todavía no se abre)' },
]

/** Texto del %: "67 %", "Sin meta" o "—". */
export function textoPorcentaje(clase: ClaseAvance, porcentaje: number | null): string {
  if (clase === 'sin_meta') return 'Sin meta'
  return formatoPorcentaje(porcentaje)
}

/**
 * Descripción de una casilla para lectores de pantalla:
 * "Bimestre 4, julio–agosto: meta 3, avance 2, 66,7 %, parcial."
 * "Bimestre 5, septiembre–octubre: meta 3, aún no se reporta."
 */
export function descripcionCasilla(indicador: IndicadorTableroPai, bimestre: NumeroBimestre): string {
  const i = bimestre - 1
  const info = infoBimestre(bimestre)
  const clase = claseCasilla(indicador, bimestre)
  const avance = indicador.avances[i]
  if (clase === 'futuro') return `${info.nombre}, ${info.meses}: meta ${formatoNumero(indicador.metas[i])}, aún no se reporta.`
  const partes = [`meta ${formatoNumero(indicador.metas[i])}`, `avance ${avance === null ? 'sin reportar' : formatoNumero(avance)}`]
  if (clase !== 'sin_meta' && indicador.porcentajes[i] !== null) partes.push(formatoPorcentaje(indicador.porcentajes[i]))
  return `${info.nombre}, ${info.meses}: ${partes.join(', ')}, ${NOMBRE_CLASE_AVANCE[clase].toLowerCase()}.`
}

// ── Estados, motivos y nombres ─────────────────────────────────────────────

export const TEXTO_ESTADO_BIMESTRE: Readonly<Record<EstadoBimestre, string>> = {
  reportado: 'Reportado',
  pendiente: 'Pendiente',
  sin_meta: 'Sin meta',
  futuro: 'Futuro',
}

/** Opciones del filtro de estado (en el bimestre abierto). */
export const TEXTO_ESTADO_FILTRO: Readonly<Record<EstadoReporteFiltro, string>> = {
  reportado: 'Reportado',
  pendiente: 'Pendiente (con meta, sin reportar)',
  sin_meta: 'Sin meta (meta 0, sin reportar)',
}

export const NOMBRE_TIPO_PROCESO: Readonly<Record<TipoProceso, string>> = {
  proceso: 'Proceso',
  proyecto: 'Proyecto',
}

export const NOMBRE_TIPO_META: Readonly<Record<TipoMeta, string>> = {
  numero: 'Número',
  porcentaje: 'Porcentaje',
  a_demanda: 'A demanda',
}

/** Escala de las metas y los avances de un indicador de tipo porcentaje (EscalaPorcentajePai). */
export type EscalaPorcentaje = '0-100' | '0-1'

/**
 * Escala del indicador (campo `escala` del contrato): '0-1' en los pocos que
 * vienen así de su Excel (1 = 100 %, p. ej. GEP-EDI-01); null si no viene o
 * no es de porcentaje. Se lee sin depender de la copia del contrato.
 */
export function escalaDe(indicador: object): EscalaPorcentaje | null {
  const valor = (indicador as { escala?: unknown }).escala
  return valor === '0-1' || valor === '0-100' ? valor : null
}

/** "Número", "Porcentaje", "Porcentaje (de 0 a 1)" o "A demanda". */
export function nombreTipoMeta(indicador: { tipoMeta: TipoMeta }): string {
  if (indicador.tipoMeta === 'porcentaje' && escalaDe(indicador) === '0-1') return 'Porcentaje (de 0 a 1)'
  return NOMBRE_TIPO_META[indicador.tipoMeta]
}

/**
 * Por qué un bimestre se puede o no editar, para los modales y la ficha
 * (el motivo lo calcula el servidor).
 */
export function textoMotivo(motivo: MotivoEdicion, rol: RolPai): string {
  switch (motivo) {
    case 'abierto':
      return 'Es el bimestre abierto: puede editarlo.'
    case 'autorizado':
      return 'Puede editar este bimestre por una autorización de Planeación.'
    case 'cerrado':
      return 'Este bimestre no está abierto para reportar: se muestra en solo lectura.'
    case 'sin_permiso':
      return rol === 'administrador'
        ? 'Planeación ve los reportes en solo lectura: los diligencian los responsables.'
        : 'No tiene permiso para editar este indicador: se muestra en solo lectura.'
  }
}

/**
 * Bimestre con el que se abren los modales de un indicador: el primero que
 * el usuario puede editar; si no, el abierto; si no hay, el último
 * reportado; si no, el 1.
 */
export function bimestreInicial(
  indicador: Pick<IndicadorTableroPai, 'editables' | 'estados'>,
  vigencia: Pick<VigenciaPai, 'bimestreAbierto'> | null,
): NumeroBimestre {
  const editable = indicador.editables.findIndex(Boolean)
  if (editable >= 0) return (editable + 1) as NumeroBimestre
  if (vigencia?.bimestreAbierto) return vigencia.bimestreAbierto
  const reportado = indicador.estados.lastIndexOf('reportado')
  return (reportado >= 0 ? reportado + 1 : 1) as NumeroBimestre
}

/** Bimestres con algún texto (insignia del botón Observaciones). */
export function conteoTextos(indicador: Pick<IndicadorTableroPai, 'tieneTextos'>): number {
  return indicador.tieneTextos.filter(Boolean).length
}

/** Evidencias de todos los bimestres (insignia del botón Evidencias). */
export function totalEvidencias(indicador: Pick<IndicadorTableroPai, 'evidencias'>): number {
  return indicador.evidencias.reduce((suma, n) => suma + n, 0)
}

/** "344 indicadores", "1 indicador" o, con filtros, "12 de 344 indicadores". */
export function textoConteo(coinciden: number, total: number): string {
  const nombre = (n: number) => (n === 1 ? 'indicador' : 'indicadores')
  if (coinciden === total) return `${formatoNumero(total)} ${nombre(total)}`
  return `${formatoNumero(coinciden)} de ${formatoNumero(total)} ${nombre(total)}`
}

/** "1 bimestre" / "3 bimestres", "1 evidencia" / "2 evidencias"… */
export function plural(n: number, singular: string, varios: string): string {
  return `${formatoNumero(n)} ${n === 1 ? singular : varios}`
}

// ── Avance que escribe el responsable ──────────────────────────────────────

const AVANCE_EDITABLE = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: LIMITES_PAI.maxDecimalesAvance,
  useGrouping: false,
})

/** Avance como texto del campo: sin separador de miles y con coma decimal ("1234,5"); "" si es null. */
export function textoEditable(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return ''
  return AVANCE_EDITABLE.format(valor).replace(/\s/g, '')
}

export type LecturaAvance = { ok: true; valor: number | null } | { ok: false; mensaje: string }

/**
 * Lee el avance que escribió el responsable. Acepta coma o punto decimal
 * ("12,5" y "12.5"), sin separador de miles. "1.250" o "1,250" son ambiguos
 * (¿mil doscientos cincuenta o uno coma veinticinco?) y se rechazan con una
 * sugerencia. Vacío = borrar el avance (null). Mensajes cortos: se muestran
 * dentro de la casilla.
 */
export function leerAvance(texto: string): LecturaAvance {
  const limpio = texto.replace(/\s+/g, '')
  if (!limpio) return { ok: true, valor: null }
  if (limpio.startsWith('-')) return { ok: false, mensaje: 'El avance no puede ser negativo.' }
  if (!/^\d+(?:[.,]\d+)?$/.test(limpio)) {
    return { ok: false, mensaje: 'Escriba solo el número, sin separador de miles (p. ej., 1250 o 12,5).' }
  }
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(limpio)) {
    const entero = limpio.replace(/[.,]/, '')
    const decimal = textoEditable(Number(limpio.replace(',', '.')))
    return { ok: false, mensaje: `«${limpio}» es ambiguo: escriba ${entero} o ${decimal}.` }
  }
  const decimales = limpio.split(/[.,]/)[1] ?? ''
  if (decimales.length > LIMITES_PAI.maxDecimalesAvance) {
    return { ok: false, mensaje: `Use a lo sumo ${LIMITES_PAI.maxDecimalesAvance} decimales.` }
  }
  const valor = Number(limpio.replace(',', '.'))
  if (!Number.isFinite(valor) || valor > LIMITES_PAI.maxAvance) return { ok: false, mensaje: 'El avance es demasiado grande.' }
  return { ok: true, valor }
}

// ── Ficha: cálculo y evidencias ────────────────────────────────────────────

/** Cómo se calcula un total (meta o avance), en palabras. */
export function textoRegla(regla: ReglaTotal, divisor: number | null): string {
  switch (regla) {
    case 'suma':
      return 'Suma de los seis bimestres'
    case 'suma_dividida':
      return divisor ? `Suma de los bimestres dividida entre ${formatoNumero(divisor)}` : 'Suma de los bimestres dividida'
    case 'si_suma_mayor_99_entonces_100':
      return '100 si la suma de los bimestres supera 99; si no, 0'
    case 'constante':
      return 'Valor fijo (no se recalcula)'
  }
}

/** Tope del %: con tope de 100 %, sin tope o el detalle de los mixtos. */
export function textoTope(calculo: Pick<CalculoIndicadorPai, 'tope100' | 'topePorBimestre'>): string {
  if (calculo.tope100 === true) return 'El % se limita a 100 %'
  if (calculo.tope100 === false || !calculo.topePorBimestre) return 'El % no tiene tope (puede superar 100 %)'
  const con = calculo.topePorBimestre.bimestres.flatMap((tope, i) => (tope ? [String(i + 1)] : []))
  const bimestres = con.length === 0 ? 'ningún bimestre' : con.length === 1 ? `el bimestre ${con[0]}` : `los bimestres ${con.join(', ')}`
  return `Tope de 100 % en ${bimestres}${calculo.topePorBimestre.total ? ' y en el total' : '; el total no tiene tope'}`
}

const NOMBRES_TIPO_EVIDENCIA: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'image/png': 'Imagen PNG',
  'image/jpeg': 'Imagen JPEG',
  'image/webp': 'Imagen WebP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
}

/** "PDF", "Word", "Imagen PNG"… ("Archivo" si el tipo no es conocido). */
export function nombreTipoEvidencia(tipo: string): string {
  return NOMBRES_TIPO_EVIDENCIA[tipo] ?? 'Archivo'
}
