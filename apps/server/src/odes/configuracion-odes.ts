import { ErrorDeConfiguracion } from '../config/configuracion.js';

/**
 * Configuración del Asistente ODES (chat con Claude), leída una sola vez de
 * las variables de entorno al crear el módulo (ver `.env.example`, sección
 * "Asistente ODES"). Si algo no es válido el servidor no arranca y explica
 * el error, igual que src/config/configuracion.ts.
 */

export const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Esfuerzo = (typeof ESFUERZOS)[number];

export interface ConfiguracionOdes {
  /** ANTHROPIC_API_KEY. null = modo "busqueda" (sin IA, solo se listan documentos). */
  readonly claveApi: string | null;
  /** ANTHROPIC_BASE_URL (p. ej. el simulador local). null = la API real. */
  readonly urlBaseApi: string | null;
  /** ODES_MODELO (por defecto claude-opus-5-5). */
  readonly modelo: string;
  /** ODES_ESFUERZO: output_config.effort (por defecto medium). */
  readonly esfuerzo: Esfuerzo;
  /** ODES_MAX_TOKENS: tope de salida por llamada (pensamiento + respuesta). */
  readonly maxTokens: number;
  /** ODES_MAX_RONDAS_HERRAMIENTAS: rondas con herramientas antes de exigir la respuesta. */
  readonly maxRondasHerramientas: number;
  /** ODES_FALLBACKS: reintento en otro modelo del lado de Anthropic si el modelo declina. */
  readonly fallbacks: boolean;
  /**
   * ODES_HERRAMIENTAS_ESTRICTAS: `strict: true` en las herramientas. Interruptor
   * de seguridad: la guía de la API lista las citas como incompatibles con
   * las salidas estructuradas y esa combinación (strict + search_result con
   * citas) no se ha probado contra la API real. Si la API la rechaza con un
   * 400, false la desactiva sin tocar el código (la entrada se sigue
   * validando con zod).
   */
  readonly herramientasEstrictas: boolean;
  /** ODES_LIMITE_POR_MINUTO: preguntas por IP en 60 s (0 = sin límite). */
  readonly limitePorMinuto: number;
  /** ODES_LIMITE_POR_DIA: preguntas por IP por día de Colombia (0 = sin límite). */
  readonly limitePorDia: number;
  /** ODES_LIMITE_GLOBAL_DIA: preguntas con IA por día para todo el sitio (0 = sin límite). */
  readonly limiteGlobalDia: number;
  /** ODES_TIMEOUT_SEGUNDOS en milisegundos: duración máxima de una respuesta. */
  readonly timeoutMs: number;
}

export const MODELO_POR_DEFECTO = 'claude-opus-5-5';

/**
 * 16 000 tokens de salida por llamada es un tope de COSTO deliberado para un
 * endpoint público: alcanza de sobra para el pensamiento adaptativo (que
 * cuenta dentro de max_tokens) más una respuesta de chat de varios párrafos,
 * y acota lo que puede gastar una sola pregunta (hasta 6 llamadas por
 * pregunta con el límite de rondas por defecto).
 */
export const MAX_TOKENS_POR_DEFECTO = 16000;

/** Token de inyección de Nest para la configuración. */
export const CONFIGURACION_ODES = Symbol('CONFIGURACION_ODES');

function leer(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const valor = env[nombre]?.trim();
  return valor ? valor : undefined;
}

function leerEntero(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: number,
  minimo: number,
  maximo: number,
): number {
  const valor = leer(env, nombre);
  if (valor === undefined) return porDefecto;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < minimo || numero > maximo) {
    throw new ErrorDeConfiguracion(
      `${nombre} debe ser un entero entre ${minimo} y ${maximo} (recibido: "${valor}").`,
    );
  }
  return numero;
}

function leerBooleano(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: boolean,
): boolean {
  const valor = leer(env, nombre)?.toLowerCase();
  if (valor === undefined) return porDefecto;
  if (['1', 'true', 'si', 'sí', 'on', 'yes'].includes(valor)) return true;
  if (['0', 'false', 'no', 'off'].includes(valor)) return false;
  throw new ErrorDeConfiguracion(
    `${nombre} debe ser true o false (recibido: "${valor}").`,
  );
}

function leerClaveApi(env: NodeJS.ProcessEnv): string | null {
  const valor = leer(env, 'ANTHROPIC_API_KEY');
  if (valor === undefined) return null;
  // Una comilla tipográfica o un espacio pegado al copiar la clave haría
  // fallar cada petición con 401; mejor avisarlo al arrancar.
  if (!/^[\x21-\x7e]+$/.test(valor)) {
    throw new ErrorDeConfiguracion(
      'ANTHROPIC_API_KEY tiene caracteres no válidos (espacios o comillas ' +
        'tipográficas). Cópiela de nuevo desde la consola de Anthropic.',
    );
  }
  return valor;
}

function leerUrlBase(env: NodeJS.ProcessEnv): string | null {
  const valor = leer(env, 'ANTHROPIC_BASE_URL');
  if (valor === undefined) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErrorDeConfiguracion(
      `ANTHROPIC_BASE_URL no es una URL válida (recibido: "${valor}").`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ErrorDeConfiguracion(
      'ANTHROPIC_BASE_URL debe empezar por http:// o https://.',
    );
  }
  return valor.replace(/\/+$/, '');
}

function leerModelo(env: NodeJS.ProcessEnv): string {
  const valor = leer(env, 'ODES_MODELO') ?? MODELO_POR_DEFECTO;
  if (!/^[a-z0-9][a-z0-9._:@-]{0,99}$/i.test(valor)) {
    throw new ErrorDeConfiguracion(
      `ODES_MODELO no es un identificador de modelo válido (recibido: "${valor}").`,
    );
  }
  return valor;
}

function leerEsfuerzo(env: NodeJS.ProcessEnv): Esfuerzo {
  const valor = leer(env, 'ODES_ESFUERZO')?.toLowerCase() ?? 'medium';
  if (!(ESFUERZOS as readonly string[]).includes(valor)) {
    throw new ErrorDeConfiguracion(
      `ODES_ESFUERZO debe ser uno de ${ESFUERZOS.join(', ')} (recibido: "${valor}").`,
    );
  }
  return valor as Esfuerzo;
}

/** Lee y valida la configuración del asistente. Lanza ErrorDeConfiguracion. */
export function cargarConfiguracionOdes(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracionOdes {
  return Object.freeze({
    claveApi: leerClaveApi(env),
    urlBaseApi: leerUrlBase(env),
    modelo: leerModelo(env),
    esfuerzo: leerEsfuerzo(env),
    maxTokens: leerEntero(
      env,
      'ODES_MAX_TOKENS',
      MAX_TOKENS_POR_DEFECTO,
      1024,
      128000,
    ),
    maxRondasHerramientas: leerEntero(
      env,
      'ODES_MAX_RONDAS_HERRAMIENTAS',
      5,
      1,
      10,
    ),
    fallbacks: leerBooleano(env, 'ODES_FALLBACKS', true),
    herramientasEstrictas: leerBooleano(env, 'ODES_HERRAMIENTAS_ESTRICTAS', true),
    limitePorMinuto: leerEntero(env, 'ODES_LIMITE_POR_MINUTO', 6, 0, 10000),
    limitePorDia: leerEntero(env, 'ODES_LIMITE_POR_DIA', 80, 0, 1000000),
    limiteGlobalDia: leerEntero(
      env,
      'ODES_LIMITE_GLOBAL_DIA',
      3000,
      0,
      10000000,
    ),
    timeoutMs:
      leerEntero(env, 'ODES_TIMEOUT_SEGUNDOS', 120, 10, 900) * 1000,
  });
}
