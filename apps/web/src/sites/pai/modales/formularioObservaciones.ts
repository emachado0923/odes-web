/**
 * Formulario del modal Observaciones (lógica pura, probada en
 * formularioObservaciones.test.ts): valores del formulario a partir del
 * reporte, comparación para saber si hay cambios sin guardar, validación en
 * el navegador (la definitiva es la del servidor) y el cuerpo del PUT.
 */
import { LIMITES_PAI, type DatosReportePai, type ReporteBimestrePai, type RiesgoMaterializado } from '../api-pai'

export interface ValoresObservaciones {
  logros: string
  observaciones: string
  riesgoMaterializado: RiesgoMaterializado | null
  numeralRiesgo: string
  descripcionRiesgo: string
  fuentesVerificacion: string
}

export type CampoObservaciones = keyof ValoresObservaciones

/** Etiquetas de la ficha F-ES-DE-003 (también para los errores por campo del servidor). */
export const ETIQUETAS_OBSERVACIONES: Readonly<Record<CampoObservaciones, string>> = {
  logros: 'Principales avances (logros)',
  observaciones: 'Observaciones y/o dificultades',
  riesgoMaterializado: '¿Se materializó algún riesgo en el bimestre?',
  numeralRiesgo: 'Numeral del riesgo materializado',
  descripcionRiesgo: 'Descripción del riesgo y controles aplicados',
  fuentesVerificacion: 'Fuentes de verificación',
}

export function valoresDe(
  reporte: Pick<
    ReporteBimestrePai,
    'logros' | 'observaciones' | 'riesgoMaterializado' | 'numeralRiesgo' | 'descripcionRiesgo' | 'fuentesVerificacion'
  >,
): ValoresObservaciones {
  return {
    logros: reporte.logros ?? '',
    observaciones: reporte.observaciones ?? '',
    riesgoMaterializado: reporte.riesgoMaterializado,
    numeralRiesgo: reporte.numeralRiesgo ?? '',
    descripcionRiesgo: reporte.descripcionRiesgo ?? '',
    fuentesVerificacion: reporte.fuentesVerificacion ?? '',
  }
}

/** Texto como lo guardaría el servidor (sin espacios al final, \n) para comparar. */
function comparable(texto: string): string {
  return texto.replace(/\r\n?/g, '\n').trim()
}

/**
 * ¿Hay cambios entre lo escrito y lo guardado? Con riesgo distinto de "SI",
 * el numeral y la descripción no cuentan (no se muestran ni se envían).
 */
export function hayCambios(actual: ValoresObservaciones, base: ValoresObservaciones): boolean {
  if (actual.riesgoMaterializado !== base.riesgoMaterializado) return true
  const campos: CampoObservaciones[] = ['logros', 'observaciones', 'fuentesVerificacion']
  if (actual.riesgoMaterializado === 'SI') campos.push('numeralRiesgo', 'descripcionRiesgo')
  return campos.some((campo) => comparable(String(actual[campo] ?? '')) !== comparable(String(base[campo] ?? '')))
}

/** Errores por campo antes de enviar (vacío = se puede enviar). */
export function validarObservaciones(valores: ValoresObservaciones): Partial<Record<CampoObservaciones, string>> {
  const errores: Partial<Record<CampoObservaciones, string>> = {}
  for (const campo of ['logros', 'observaciones', 'descripcionRiesgo', 'fuentesVerificacion'] as const) {
    if (valores[campo].length > LIMITES_PAI.maxTexto) {
      errores[campo] = `Escriba a lo sumo ${LIMITES_PAI.maxTexto.toLocaleString('es-CO')} caracteres.`
    }
  }
  if (valores.riesgoMaterializado === 'SI') {
    if (!valores.numeralRiesgo.trim()) errores.numeralRiesgo = 'Escriba el numeral del riesgo que se materializó.'
    else if (valores.numeralRiesgo.length > LIMITES_PAI.maxNumeralRiesgo) {
      errores.numeralRiesgo = `Escriba a lo sumo ${LIMITES_PAI.maxNumeralRiesgo} caracteres.`
    }
    if (!valores.descripcionRiesgo.trim()) {
      errores.descripcionRiesgo = 'Describa el riesgo que se materializó y los controles aplicados.'
    }
  }
  return errores
}

function textoONulo(texto: string): string | null {
  return texto.trim() ? texto : null
}

/**
 * Cuerpo del PUT /indicadores/:id/bimestres/:b con los textos (sin el
 * avance, que se edita en la casilla). Con riesgo "NO" se borran el numeral
 * y la descripción; sin respuesta (null) no se tocan.
 */
export function datosObservaciones(valores: ValoresObservaciones, actualizadoEn: string | null): DatosReportePai {
  const datos: DatosReportePai = {
    logros: textoONulo(valores.logros),
    observaciones: textoONulo(valores.observaciones),
    fuentesVerificacion: textoONulo(valores.fuentesVerificacion),
    actualizadoEn,
  }
  if (valores.riesgoMaterializado === 'SI') {
    datos.riesgoMaterializado = 'SI'
    datos.numeralRiesgo = textoONulo(valores.numeralRiesgo)
    datos.descripcionRiesgo = textoONulo(valores.descripcionRiesgo)
  } else if (valores.riesgoMaterializado === 'NO') {
    datos.riesgoMaterializado = 'NO'
    datos.numeralRiesgo = null
    datos.descripcionRiesgo = null
  }
  return datos
}

/** Errores por campo del servidor (400) que corresponden a campos del formulario. */
export function erroresDelServidor(campos: Readonly<Record<string, string>>): Partial<Record<CampoObservaciones, string>> {
  const errores: Partial<Record<CampoObservaciones, string>> = {}
  for (const campo of Object.keys(ETIQUETAS_OBSERVACIONES) as CampoObservaciones[]) {
    if (campos[campo]) errores[campo] = campos[campo]
  }
  return errores
}
