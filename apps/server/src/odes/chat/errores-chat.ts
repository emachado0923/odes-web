import {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { CodigoErrorChat, ErrorChat } from './protocolo.js';

/** Mensajes aptos para mostrar tal cual en la interfaz (nunca detalles internos). */
export const MENSAJES_ERROR: Readonly<Record<CodigoErrorChat, string>> = {
  solicitud_invalida: 'La solicitud no es válida. Recarga la página e intenta de nuevo.',
  limite_uso:
    'Has hecho muchas preguntas en poco tiempo. Espera un momento e intenta de nuevo.',
  no_disponible:
    'El asistente no está disponible en este momento. Intenta de nuevo más tarde.',
  sobrecarga:
    'El asistente está recibiendo muchas consultas. Intenta de nuevo en unos minutos.',
  interno: 'Ocurrió un error inesperado al preparar la respuesta. Intenta de nuevo.',
};

export function errorChat(codigo: CodigoErrorChat, mensaje?: string): ErrorChat {
  return { codigo, mensaje: mensaje ?? MENSAJES_ERROR[codigo] };
}

export const MENSAJE_TIEMPO_AGOTADO =
  'La respuesta tardó demasiado. Intenta de nuevo, si puedes con una pregunta más concreta.';

/** Resultado de clasificar un error del SDK de Anthropic. */
export interface ErrorClasificado {
  codigo: CodigoErrorChat;
  /** Etiqueta corta para el registro (sin contenido de mensajes ni claves). */
  detalle: string;
}

/**
 * Traduce un error del SDK a un código del protocolo. Cadena tipada, de lo
 * más específico a lo más general; nunca se compara el texto del mensaje.
 *
 * - 429, 529 y `overloaded_error` (también si llega como evento `error` a
 *   mitad del flujo, sin status) -> sobrecarga.
 * - 401/403/402 (clave inválida, sin permisos, facturación) y 404 (modelo no
 *   disponible para la organización) -> no_disponible.
 * - Sin conexión -> no_disponible; tiempo agotado -> sobrecarga.
 * - Todo lo demás (400 por un parámetro, 500, JSON ilegible) -> interno.
 */
export function clasificarErrorAnthropic(error: unknown): ErrorClasificado {
  if (error instanceof RateLimitError) {
    return { codigo: 'sobrecarga', detalle: 'api_429' };
  }
  if (error instanceof AuthenticationError) {
    return { codigo: 'no_disponible', detalle: 'api_401' };
  }
  if (error instanceof PermissionDeniedError) {
    return { codigo: 'no_disponible', detalle: 'api_403' };
  }
  if (error instanceof NotFoundError) {
    return { codigo: 'no_disponible', detalle: 'api_404' };
  }
  if (error instanceof BadRequestError) {
    return { codigo: 'interno', detalle: 'api_400' };
  }
  if (error instanceof APIConnectionTimeoutError) {
    return { codigo: 'sobrecarga', detalle: 'api_tiempo' };
  }
  if (error instanceof APIConnectionError) {
    return { codigo: 'no_disponible', detalle: 'api_conexion' };
  }
  if (error instanceof InternalServerError) {
    if (error.status === 529 || error.type === 'overloaded_error') {
      return { codigo: 'sobrecarga', detalle: `api_${error.status}` };
    }
    return { codigo: 'interno', detalle: `api_${error.status}` };
  }
  if (error instanceof APIError) {
    // Errores con status no cubierto (402, 413...) o eventos `error` del SSE.
    const tipo = error.type;
    if (
      error.status === 529 ||
      tipo === 'overloaded_error' ||
      tipo === 'rate_limit_error'
    ) {
      return { codigo: 'sobrecarga', detalle: `api_${tipo ?? error.status}` };
    }
    if (
      error.status === 402 ||
      tipo === 'authentication_error' ||
      tipo === 'permission_error' ||
      tipo === 'billing_error' ||
      tipo === 'not_found_error'
    ) {
      return { codigo: 'no_disponible', detalle: `api_${tipo ?? error.status}` };
    }
    if (tipo === 'timeout_error') {
      return { codigo: 'sobrecarga', detalle: 'api_timeout_error' };
    }
    return {
      codigo: 'interno',
      detalle: `api_${tipo ?? error.status ?? 'error'}`,
    };
  }
  if (error instanceof AnthropicError) {
    // p. ej. JSON de una herramienta que el SDK no pudo leer.
    return { codigo: 'interno', detalle: 'sdk' };
  }
  return { codigo: 'interno', detalle: 'desconocido' };
}

/** true si el error viene de cancelar la petición (cliente desconectado o tiempo agotado). */
export function esCancelacion(error: unknown): boolean {
  return (
    error instanceof APIUserAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
