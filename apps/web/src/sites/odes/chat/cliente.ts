/**
 * Cliente HTTP del Asistente ODES (ver protocolo.ts).
 *
 * - GET  /api/odes/estado: modo del asistente y estado del repositorio.
 * - POST /api/odes/chat:   respuesta en streaming (text/event-stream).
 *
 * Rutas relativas, como pide el README: en desarrollo Vite reenvía /api a
 * Nest y en producción es el mismo origen. La protección CSRF de Nest 12 se
 * basa en Sec-Fetch-Site/Origin, así que un fetch del mismo origen no
 * necesita ninguna cabecera extra.
 */
import { LectorSSE } from './sse'
import type { CodigoErrorChat, ErrorChat, EstadoAsistente, EventoChat, SolicitudChat } from './protocolo'
import { interpretarEvento, validarErrorChat, validarEstado } from './validacion'

export const RUTA_ESTADO = '/api/odes/estado'
export const RUTA_CHAT = '/api/odes/chat'

/** Tope de espera que se respeta de un Retry-After (más que esto se trata como "más tarde"). */
const ESPERA_MAXIMA_MS = 60 * 60 * 1000

/** Error de la solicitud antes de que empiece el flujo (HTTP 4xx/5xx, red caída...). */
export class ErrorSolicitudChat extends Error {
  /** 'conexion' no viene del servidor: es un fallo de red del navegador. */
  readonly codigo: CodigoErrorChat | 'conexion'
  /** Milisegundos que pide esperar el servidor (cabecera Retry-After), si los indicó. */
  readonly esperaMs: number | null
  readonly status: number | null

  constructor(
    codigo: CodigoErrorChat | 'conexion',
    mensaje: string,
    esperaMs: number | null = null,
    status: number | null = null,
    opciones?: ErrorOptions,
  ) {
    super(mensaje, opciones)
    this.name = 'ErrorSolicitudChat'
    this.codigo = codigo
    this.esperaMs = esperaMs
    this.status = status
  }
}

/** Cómo terminó una solicitud de chat que abrió el flujo. */
export type FinFlujo =
  /** Llegó el evento `fin` o un evento `error` (ambos ya se entregaron con alEvento). */
  | 'terminado'
  /** El flujo se cerró sin `fin` ni `error` (conexión cortada a mitad de la respuesta). */
  | 'cortado'
  /** La persona detuvo la respuesta (AbortController). */
  | 'abortado'

export interface OpcionesChat {
  signal: AbortSignal
  alEvento: (evento: EventoChat) => void
}

/**
 * Interpreta la cabecera Retry-After: segundos ("120") o fecha HTTP. Devuelve
 * milisegundos (≥ 0) o null si no hay cabecera o no se entiende.
 */
export function interpretarRetryAfter(valor: string | null, ahora = Date.now()): number | null {
  if (!valor) return null
  const texto = valor.trim()
  if (/^\d+$/.test(texto)) return Math.min(Number(texto) * 1000, ESPERA_MAXIMA_MS)
  const fecha = Date.parse(texto)
  if (Number.isNaN(fecha)) return null
  return Math.min(Math.max(0, fecha - ahora), ESPERA_MAXIMA_MS)
}

/** Código de error por status HTTP, cuando el cuerpo no trae un ErrorChat (p. ej. un 502 de nginx). */
function codigoPorStatus(status: number): CodigoErrorChat {
  if (status === 429) return 'limite_uso'
  if (status === 400 || status === 413 || status === 422) return 'solicitud_invalida'
  if (status === 503 || status === 502 || status === 504) return 'no_disponible'
  return 'interno'
}

/** Mensajes por defecto si el servidor no mandó uno (o no se pudo leer). */
export const MENSAJES_POR_DEFECTO: Readonly<Record<CodigoErrorChat | 'conexion', string>> = {
  solicitud_invalida: 'No pude procesar tu pregunta. Revisa que no sea demasiado larga e intenta de nuevo.',
  limite_uso: 'Has hecho muchas preguntas en poco tiempo. Espera un momento e intenta de nuevo.',
  no_disponible: 'El asistente no está disponible en este momento. Intenta de nuevo más tarde.',
  sobrecarga: 'El asistente está recibiendo muchas consultas. Intenta de nuevo en unos minutos.',
  interno: 'Ocurrió un error inesperado al preparar la respuesta. Intenta de nuevo.',
  conexion: 'No pude conectarme con el asistente. Revisa tu conexión a internet e intenta de nuevo.',
}

async function errorDeRespuesta(respuesta: Response): Promise<ErrorSolicitudChat> {
  let cuerpo: ErrorChat | null = null
  try {
    cuerpo = validarErrorChat(JSON.parse(await respuesta.text()))
  } catch {
    cuerpo = null
  }
  const codigo = cuerpo?.codigo ?? codigoPorStatus(respuesta.status)
  return new ErrorSolicitudChat(
    codigo,
    cuerpo?.mensaje ?? MENSAJES_POR_DEFECTO[codigo],
    interpretarRetryAfter(respuesta.headers.get('Retry-After')),
    respuesta.status,
  )
}

/** Consulta el estado del asistente. Lanza si la respuesta no es válida. */
export async function consultarEstado(signal?: AbortSignal): Promise<EstadoAsistente> {
  const respuesta = await fetch(RUTA_ESTADO, { headers: { Accept: 'application/json' }, signal })
  if (!respuesta.ok) throw new Error(`GET ${RUTA_ESTADO} respondió ${respuesta.status}`)
  const estado = validarEstado(await respuesta.json())
  if (!estado) throw new Error(`GET ${RUTA_ESTADO} devolvió un cuerpo inesperado`)
  return estado
}

/**
 * Envía la conversación y entrega cada evento del flujo con `alEvento`.
 *
 * - Lanza ErrorSolicitudChat si la solicitud falla antes de abrir el flujo.
 * - Resuelve 'terminado' tras el evento `fin` o `error`, 'cortado' si el flujo
 *   se cerró antes, y 'abortado' si se canceló con `signal`.
 */
export async function enviarChat(solicitud: SolicitudChat, { signal, alEvento }: OpcionesChat): Promise<FinFlujo> {
  let respuesta: Response
  try {
    respuesta = await fetch(RUTA_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(solicitud),
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (signal.aborted) return 'abortado'
    throw new ErrorSolicitudChat('conexion', MENSAJES_POR_DEFECTO.conexion, null, null, { cause: error })
  }

  if (!respuesta.ok) throw await errorDeRespuesta(respuesta)

  const tipo = respuesta.headers.get('Content-Type') ?? ''
  if (!tipo.includes('text/event-stream') || !respuesta.body) {
    throw new ErrorSolicitudChat('interno', MENSAJES_POR_DEFECTO.interno, null, respuesta.status)
  }

  let terminado = false
  const lector = new LectorSSE((datos) => {
    if (terminado) return
    const evento = interpretarEvento(datos)
    if (!evento) return
    if (evento.tipo === 'fin' || evento.tipo === 'error') terminado = true
    alEvento(evento)
  })

  const decodificador = new TextDecoder('utf-8')
  const flujo = respuesta.body.getReader()
  // fetch ya corta la lectura al abortar; esto lo garantiza también con cuerpos que no atienden la señal.
  const alAbortar = () => {
    flujo.cancel().catch(() => {})
  }
  signal.addEventListener('abort', alAbortar, { once: true })
  try {
    while (!terminado && !signal.aborted) {
      const { done, value } = await flujo.read()
      if (done) break
      lector.agregar(decodificador.decode(value, { stream: true }))
    }
    if (!terminado && !signal.aborted) {
      lector.agregar(decodificador.decode())
      lector.terminar()
    }
  } catch {
    // Lectura interrumpida: cancelación de la persona o red caída.
    if (signal.aborted) return 'abortado'
  } finally {
    signal.removeEventListener('abort', alAbortar)
    // Tras `fin` el servidor cierra; si no, se suelta el cuerpo para no dejar la conexión abierta.
    flujo.cancel().catch(() => {})
  }

  if (terminado) return 'terminado'
  return signal.aborted ? 'abortado' : 'cortado'
}
