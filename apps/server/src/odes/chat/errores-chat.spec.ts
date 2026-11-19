import {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  InternalServerError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { clasificarErrorAnthropic, esCancelacion, MENSAJES_ERROR } from './errores-chat.js';

const cabeceras = new Headers();

describe('clasificarErrorAnthropic', () => {
  it.each([
    [APIError.generate(429, { error: { type: 'rate_limit_error' } }, 'x', cabeceras), 'sobrecarga'],
    [APIError.generate(529, { error: { type: 'overloaded_error' } }, 'x', cabeceras), 'sobrecarga'],
    [APIError.generate(503, { error: { type: 'overloaded_error' } }, 'x', cabeceras), 'sobrecarga'],
    [APIError.generate(500, { error: { type: 'api_error' } }, 'x', cabeceras), 'interno'],
    [APIError.generate(401, { error: { type: 'authentication_error' } }, 'x', cabeceras), 'no_disponible'],
    [APIError.generate(403, { error: { type: 'permission_error' } }, 'x', cabeceras), 'no_disponible'],
    [APIError.generate(404, { error: { type: 'not_found_error' } }, 'x', cabeceras), 'no_disponible'],
    [APIError.generate(402, { error: { type: 'billing_error' } }, 'x', cabeceras), 'no_disponible'],
    [APIError.generate(400, { error: { type: 'invalid_request_error' } }, 'x', cabeceras), 'interno'],
    // Evento `error` a mitad del flujo SSE: sin status, con tipo.
    [new APIError(undefined, { error: { type: 'overloaded_error' } }, undefined, cabeceras, 'overloaded_error'), 'sobrecarga'],
    [new APIError(undefined, { error: { type: 'api_error' } }, undefined, cabeceras, 'api_error'), 'interno'],
    [new APIConnectionTimeoutError(), 'sobrecarga'],
    [new APIConnectionError({ message: 'sin red' }), 'no_disponible'],
    [new AnthropicError('JSON ilegible'), 'interno'],
    [new Error('otra cosa'), 'interno'],
  ])('%s -> %s', (error, codigo) => {
    expect(clasificarErrorAnthropic(error).codigo).toBe(codigo);
  });

  it('InternalServerError 529 conserva el status en el detalle', () => {
    const error = APIError.generate(529, { error: { type: 'overloaded_error' } }, 'x', cabeceras);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(clasificarErrorAnthropic(error)).toEqual({ codigo: 'sobrecarga', detalle: 'api_529' });
  });

  it('reconoce las cancelaciones', () => {
    expect(esCancelacion(new APIUserAbortError())).toBe(true);
    expect(esCancelacion(new DOMException('x', 'AbortError'))).toBe(true);
    expect(esCancelacion(new Error('x'))).toBe(false);
  });

  it('los mensajes son en español y no exponen detalles', () => {
    for (const mensaje of Object.values(MENSAJES_ERROR)) {
      expect(mensaje).toMatch(/[áéíóúñ]|Intenta|Espera/);
      expect(mensaje).not.toMatch(/api|anthropic|claude|http/i);
    }
  });
});
