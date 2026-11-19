/**
 * Errores de la API de administración: ErrorAdmin con el mensaje del servidor
 * (en español, apto para mostrar), los errores por campo y Retry-After.
 */
import type { CodigoErrorRepositorio } from '../../api-repositorio'

export type CodigoErrorAdmin = CodigoErrorRepositorio | 'red' | 'datos'

export const MENSAJES: Record<CodigoErrorAdmin, string> = {
  solicitud_invalida: 'Revise los datos enviados.',
  no_autenticado: 'La sesión no existe o venció. Inicie sesión de nuevo.',
  prohibido: 'El servidor rechazó la solicitud. Recargue la página e intente de nuevo.',
  no_encontrado: 'No se encontró lo que buscaba. Puede que otra persona lo haya borrado.',
  conflicto: 'No se pudo completar la acción por un conflicto con los datos actuales.',
  demasiado_grande: 'El archivo es demasiado grande.',
  tipo_no_permitido: 'Tipo de archivo no permitido.',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
  no_disponible: 'El repositorio no está disponible en este momento. Intente de nuevo en unos minutos.',
  interno: 'Ocurrió un error en el servidor. Intente de nuevo en unos minutos.',
  red: 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.',
  datos: 'La respuesta del servidor no tiene la forma esperada.',
}

const CODIGO_POR_ESTADO: Record<number, CodigoErrorRepositorio> = {
  400: 'solicitud_invalida',
  401: 'no_autenticado',
  403: 'prohibido',
  404: 'no_encontrado',
  409: 'conflicto',
  413: 'demasiado_grande',
  415: 'tipo_no_permitido',
  429: 'demasiados_intentos',
  503: 'no_disponible',
}

export class ErrorAdmin extends Error {
  /** Status HTTP (null si no hubo respuesta). */
  readonly estado: number | null
  readonly codigo: CodigoErrorAdmin
  /** Errores por campo (formularios). */
  readonly campos: Readonly<Record<string, string>>
  /** Segundos de Retry-After (429 y 503), si vino. */
  readonly reintentarEn: number | null

  constructor(
    codigo: CodigoErrorAdmin,
    mensaje: string,
    opciones: { estado?: number | null; campos?: Record<string, string>; reintentarEn?: number | null } = {},
  ) {
    super(mensaje)
    this.name = 'ErrorAdmin'
    this.codigo = codigo
    this.estado = opciones.estado ?? null
    this.campos = opciones.campos ?? {}
    this.reintentarEn = opciones.reintentarEn ?? null
  }
}

export function esErrorAdmin(error: unknown): error is ErrorAdmin {
  return error instanceof ErrorAdmin
}

export function esAborto(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Texto para mostrar de cualquier error. */
export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorAdmin) return error.message
  return MENSAJES.interno
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Retry-After en segundos (entero o fecha HTTP). */
export function leerReintentar(valor: string | null, ahora = Date.now()): number | null {
  if (!valor) return null
  const t = valor.trim()
  if (/^\d+$/.test(t)) return Number(t)
  const fecha = Date.parse(t)
  return Number.isNaN(fecha) ? null : Math.max(0, Math.ceil((fecha - ahora) / 1000))
}

/** ErrorAdmin a partir del status, el cuerpo (texto) y Retry-After. */
export function errorDeRespuesta(estado: number, texto: string, reintentar: string | null): ErrorAdmin {
  let cuerpo: unknown = null
  try {
    cuerpo = texto ? JSON.parse(texto) : null
  } catch {
    cuerpo = null
  }
  const codigoServidor =
    esObjeto(cuerpo) && typeof cuerpo.codigo === 'string' ? (cuerpo.codigo as CodigoErrorRepositorio) : null
  const codigo: CodigoErrorAdmin =
    codigoServidor && codigoServidor in MENSAJES ? codigoServidor : (CODIGO_POR_ESTADO[estado] ?? 'interno')
  const mensaje =
    esObjeto(cuerpo) && typeof cuerpo.mensaje === 'string' && cuerpo.mensaje.trim() ? cuerpo.mensaje : MENSAJES[codigo]
  const campos: Record<string, string> = {}
  if (esObjeto(cuerpo) && esObjeto(cuerpo.campos)) {
    for (const [campo, texto] of Object.entries(cuerpo.campos)) if (typeof texto === 'string') campos[campo] = texto
  }
  return new ErrorAdmin(codigo, mensaje, { estado, campos, reintentarEn: leerReintentar(reintentar) })
}

