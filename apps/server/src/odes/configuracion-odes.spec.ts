import { describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion } from '../config/configuracion.js';
import { cargarConfiguracionOdes } from './configuracion-odes.js';

describe('cargarConfiguracionOdes', () => {
  it('valores por defecto: modo búsqueda (sin clave), Opus 5.5, esfuerzo medio, 16 000 tokens', () => {
    expect(cargarConfiguracionOdes({})).toEqual({
      claveApi: null,
      urlBaseApi: null,
      modelo: 'claude-opus-5-5',
      esfuerzo: 'medium',
      maxTokens: 16000,
      maxRondasHerramientas: 5,
      fallbacks: true,
      herramientasEstrictas: true,
      limitePorMinuto: 6,
      limitePorDia: 80,
      limiteGlobalDia: 3000,
      timeoutMs: 120_000,
    });
  });

  it('lee y valida las variables', () => {
    const config = cargarConfiguracionOdes({
      ANTHROPIC_API_KEY: ' sk-ant-prueba ',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:4010/',
      ODES_MODELO: 'claude-opus-5',
      ODES_ESFUERZO: 'HIGH',
      ODES_MAX_TOKENS: '8000',
      ODES_MAX_RONDAS_HERRAMIENTAS: '3',
      ODES_FALLBACKS: 'no',
      ODES_HERRAMIENTAS_ESTRICTAS: 'false',
      ODES_LIMITE_POR_MINUTO: '0',
      ODES_LIMITE_POR_DIA: '10',
      ODES_LIMITE_GLOBAL_DIA: '500',
      ODES_TIMEOUT_SEGUNDOS: '60',
    });
    expect(config).toMatchObject({
      claveApi: 'sk-ant-prueba',
      urlBaseApi: 'http://127.0.0.1:4010',
      modelo: 'claude-opus-5',
      esfuerzo: 'high',
      maxTokens: 8000,
      maxRondasHerramientas: 3,
      fallbacks: false,
      herramientasEstrictas: false,
      limitePorMinuto: 0,
      limitePorDia: 10,
      limiteGlobalDia: 500,
      timeoutMs: 60_000,
    });
  });

  it.each([
    [{ ODES_ESFUERZO: 'extremo' }, /ODES_ESFUERZO/],
    [{ ODES_MAX_TOKENS: '500' }, /ODES_MAX_TOKENS/],
    [{ ODES_MAX_TOKENS: '16k' }, /ODES_MAX_TOKENS/],
    [{ ODES_MAX_RONDAS_HERRAMIENTAS: '0' }, /ODES_MAX_RONDAS_HERRAMIENTAS/],
    [{ ODES_FALLBACKS: 'quizás' }, /ODES_FALLBACKS/],
    [{ ODES_HERRAMIENTAS_ESTRICTAS: 'a veces' }, /ODES_HERRAMIENTAS_ESTRICTAS/],
    [{ ODES_MODELO: 'claude opus' }, /ODES_MODELO/],
    [{ ANTHROPIC_BASE_URL: 'ftp://x' }, /ANTHROPIC_BASE_URL/],
    [{ ANTHROPIC_BASE_URL: 'no es url' }, /ANTHROPIC_BASE_URL/],
    [{ ANTHROPIC_API_KEY: '“sk-ant”' }, /ANTHROPIC_API_KEY/],
    [{ ODES_TIMEOUT_SEGUNDOS: '5' }, /ODES_TIMEOUT_SEGUNDOS/],
  ])('rechaza %o con un mensaje claro', (env, patron) => {
    expect(() => cargarConfiguracionOdes(env)).toThrow(ErrorDeConfiguracion);
    expect(() => cargarConfiguracionOdes(env)).toThrow(patron);
  });

  it('el mensaje de error nunca incluye la clave de API', () => {
    let mensaje = '';
    try {
      cargarConfiguracionOdes({ ANTHROPIC_API_KEY: 'sk-ant secreta' });
    } catch (error) {
      mensaje = String(error);
    }
    expect(mensaje).toContain('ANTHROPIC_API_KEY');
    expect(mensaje).not.toContain('secreta');
  });
});
