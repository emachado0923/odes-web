/**
 * Errores de la API del PAI en el navegador: ErrorPai con el mensaje del
 * servidor (en español, apto para mostrar), los errores por campo y
 * Retry-After. Además de los códigos del contrato (CodigoErrorPai), 'red'
 * (sin respuesta) y 'datos' (respuesta con otra forma).
 *
 * Ojo: api-pai.ts también exporta un tipo ErrorPai (el cuerpo JSON). En un
 * archivo que necesite los dos, importe el tipo con otro nombre:
 * `import type { ErrorPai as CuerpoErrorPai } from '../api-pai'`.
 */
import { type CodigoErrorPai, MENSAJES_ERROR_PAI } from '../api-pai'

export type CodigoErrorCliente = CodigoErrorPai | 'red' | 'datos'

export const MENSAJES: Readonly<Record<CodigoErrorCliente, string>> = {
  ...MENSAJES_ERROR_PAI,
  no_autenticado: 'La sesión no existe o venció. Inicie sesión de nuevo.',
  prohibido: 'No tiene permiso para hacer esto. Si cree que es un error, recargue la página.',
  interno: 'Ocurrió un error en el servidor. Intente de nuevo en unos minutos.',
  red: 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.',
  datos: 'La respuesta del servidor no tiene la forma esperada.',
}

const CODIGO_POR_ESTADO: Readonly<Record<number, CodigoErrorPai>> = {
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

export class ErrorPai extends Error {
  /** Status HTTP (null si no hubo respuesta). */
  readonly estado: number | null
  readonly codigo: CodigoErrorCliente
  /** Errores por campo (formularios), con los nombres de los campos del cuerpo. */
  readonly campos: Readonly<Record<string, string>>
  /** Segundos de Retry-After (429 y 503), si vino. */
  readonly reintentarEn: number | null

  constructor(
    codigo: CodigoErrorCliente,
    mensaje: string,
    opciones: { estado?: number | null; campos?: Record<string, string>; reintentarEn?: number | null } = {},
  ) {
    super(mensaje)
    this.name = 'ErrorPai'
    this.codigo = codigo
    this.estado = opciones.estado ?? null
    this.campos = opciones.campos ?? {}
    this.reintentarEn = opciones.reintentarEn ?? null
  }
}

export function esErrorPai(error: unknown): error is ErrorPai {
  return error instanceof ErrorPai
}

export function esAborto(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Texto para mostrar de cualquier error. */
export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorPai) return error.message
  return MENSAJES.interno
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Retry-After en segundos (entero o fecha HTTP). */
export function leerReintentar(valor: string | null, ahora = Date.now()): number | null {
  if (!valor) return null
  const texto = valor.trim()
  if (/^\d+$/.test(texto)) return Number(texto)
  const fecha = Date.parse(texto)
  return Number.isNaN(fecha) ? null : Math.max(0, Math.ceil((fecha - ahora) / 1000))
}

/** ErrorPai a partir del status, el cuerpo (texto) y Retry-After. */
export function errorDeRespuesta(estado: number, texto: string, reintentar: string | null): ErrorPai {
  let cuerpo: unknown = null
  try {
    cuerpo = texto ? JSON.parse(texto) : null
  } catch {
    cuerpo = null
  }
  const codigoServidor = esObjeto(cuerpo) && typeof cuerpo.codigo === 'string' ? cuerpo.codigo : null
  const codigo: CodigoErrorCliente =
    codigoServidor && codigoServidor in MENSAJES_ERROR_PAI
      ? (codigoServidor as CodigoErrorPai)
      : (CODIGO_POR_ESTADO[estado] ?? 'interno')
  const mensaje =
    esObjeto(cuerpo) && typeof cuerpo.mensaje === 'string' && cuerpo.mensaje.trim() ? cuerpo.mensaje : MENSAJES[codigo]
  const campos: Record<string, string> = {}
  if (esObjeto(cuerpo) && esObjeto(cuerpo.campos)) {
    for (const [campo, valor] of Object.entries(cuerpo.campos)) if (typeof valor === 'string') campos[campo] = valor
  }
  return new ErrorPai(codigo, mensaje, { estado, campos, reintentarEn: leerReintentar(reintentar) })
}
