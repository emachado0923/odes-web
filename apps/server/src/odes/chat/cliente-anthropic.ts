import Anthropic from '@anthropic-ai/sdk';
import type { ConfiguracionOdes } from '../configuracion-odes.js';

/**
 * Token de inyección del cliente de la API de Claude. El valor es `null`
 * cuando no hay ANTHROPIC_API_KEY: entonces el chat funciona en modo
 * "busqueda". Las pruebas inyectan un cliente real del SDK con un `fetch`
 * simulado (ver src/odes/cli/simulador-claude.ts).
 */
export const CLIENTE_ANTHROPIC = Symbol('CLIENTE_ANTHROPIC');

export type ClienteAnthropic = Anthropic;

export function crearClienteAnthropic(
  config: ConfiguracionOdes,
): ClienteAnthropic | null {
  if (!config.claveApi) return null;
  return new Anthropic({
    apiKey: config.claveApi,
    // Explícito: si también estuviera ANTHROPIC_AUTH_TOKEN en el entorno, el
    // SDK enviaría las dos credenciales y la API rechazaría la petición.
    authToken: null,
    // null -> el SDK usa ANTHROPIC_BASE_URL o https://api.anthropic.com.
    baseURL: config.urlBaseApi ?? undefined,
    // Reintenta 429/5xx/conexión antes de abrir el flujo (no a mitad).
    maxRetries: 2,
    timeout: config.timeoutMs,
  });
}
