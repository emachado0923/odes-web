import { AnthropicError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import type {
  BetaCitationSearchResultLocation,
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  BetaUsage,
  MessageCreateParamsBase,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ConfiguracionOdes } from '../configuracion-odes.js';
import type { RepositorioOdes } from '../repositorio/repositorio.tipos.js';
import type { ClienteAnthropic } from './cliente-anthropic.js';
import { clasificarErrorAnthropic, errorChat, esCancelacion } from './errores-chat.js';
import { type EventoCita, RegistroFuentes } from './fuentes.js';
import {
  caracteresContenido,
  ejecutarHerramienta,
  MAX_HERRAMIENTAS_POR_RONDA,
  type ResultadoHerramienta,
} from './herramientas.js';
import type { ContextoModelo, FuenteContextoModelo } from './prompt-sistema.js';
import type { EventoChat, MensajeChat } from './protocolo.js';

/** Encabezado beta del parámetro `fallbacks: "default"` (la forma de arreglo usa otro). */
export const BETA_FALLBACKS = 'server-side-fallback-2026-07-01';

/** Aviso que acompaña los últimos resultados cuando se agotan las rondas de herramientas. */
export const AVISO_ULTIMA_RONDA =
  'Ya no puedes hacer más consultas al repositorio para esta pregunta. Responde ahora con la ' +
  'información que obtuviste; si no alcanza, dilo y sugiere cómo seguir buscando.';

/**
 * Presupuesto de texto de resultados por pregunta (≈ 45 000 tokens): al
 * llegar a él no se ejecutan más herramientas y la llamada siguiente es la
 * última (tool_choice none). Junto con MAX_HERRAMIENTAS_POR_RONDA y
 * MAX_CARACTERES_RESULTADO acota lo que se reenvía en cada llamada: como
 * mucho este presupuesto más un resultado (≈ 200 000 caracteres).
 */
export const MAX_CARACTERES_RESULTADOS_PREGUNTA = 160_000;

/** tool_result de las herramientas pedidas de más en una misma respuesta. */
export const TEXTO_DEMASIADAS_HERRAMIENTAS = `Demasiadas consultas a la vez: haz como máximo ${MAX_HERRAMIENTAS_POR_RONDA} por turno.`;

/** tool_result de las herramientas pedidas cuando ya se agotó el presupuesto de la pregunta. */
export const TEXTO_PRESUPUESTO_AGOTADO =
  'No se ejecutó: ya se alcanzó el máximo de texto consultado para esta pregunta.';

export type Emisor = (evento: EventoChat) => void;

export interface UsoTokens {
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
}

export type ResultadoRespuesta =
  | 'completo'
  | 'limite_tokens'
  | 'rechazo'
  | 'cancelado'
  | 'tiempo_agotado'
  | 'error';

export interface ResumenRespuesta {
  resultado: ResultadoRespuesta;
  /** Detalle técnico corto para el registro (p. ej. "api_529"); nunca contenido. */
  detalle?: string;
  /** Llamadas a la API de Claude. */
  llamadas: number;
  /** Herramientas ejecutadas. */
  herramientas: number;
  /** Modelo que produjo la última respuesta (distinto si actuó el respaldo). */
  modeloServido: string | null;
  respaldo: boolean;
  uso: UsoTokens;
  /**
   * Uso de la PRIMERA llamada de la pregunta (null si no hubo). Es la única
   * que solo puede leer caché escrita por una petición anterior: mide la
   * reutilización del prefijo entre preguntas (odes:probar --dos-veces).
   */
  usoPrimeraLlamada: UsoTokens | null;
}

export function usoVacio(): UsoTokens {
  return { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 };
}

/**
 * Suma el uso de una respuesta. Con respaldo (fallback) el `usage` de primer
 * nivel cubre solo el intento que produjo el mensaje; `usage.iterations` es
 * la fuente de verdad por intento.
 */
export function sumarUso(acumulado: UsoTokens, uso: BetaUsage): void {
  const iteraciones = (uso.iterations ?? []).filter(
    (iteracion) => iteracion.type === 'message' || iteracion.type === 'fallback_message',
  );
  const partes =
    iteraciones.length > 0
      ? iteraciones.map((iteracion) => ({
          entrada: iteracion.input_tokens,
          salida: iteracion.output_tokens,
          cacheLectura: iteracion.cache_read_input_tokens,
          cacheEscritura: iteracion.cache_creation_input_tokens,
        }))
      : [
          {
            entrada: uso.input_tokens,
            salida: uso.output_tokens,
            cacheLectura: uso.cache_read_input_tokens ?? 0,
            cacheEscritura: uso.cache_creation_input_tokens ?? 0,
          },
        ];
  for (const parte of partes) {
    acumulado.entrada += parte.entrada ?? 0;
    acumulado.salida += parte.salida ?? 0;
    acumulado.cacheLectura += parte.cacheLectura ?? 0;
    acumulado.cacheEscritura += parte.cacheEscritura ?? 0;
  }
}

/** Historial del cliente -> mensajes de la API. Solo texto: nunca se reenvían bloques de pensamiento ni de herramientas. */
export function mensajesParaApi(mensajes: readonly MensajeChat[]): BetaMessageParam[] {
  return mensajes.map((mensaje) => ({
    role: mensaje.rol === 'usuario' ? 'user' : 'assistant',
    content: mensaje.texto,
  }));
}

/**
 * Contenido del asistente para reenviar dentro del bucle de herramientas: tal
 * cual (append-only), salvo tras un respaldo a mitad de respuesta, donde la
 * API pide omitir los bloques de pensamiento y de herramientas anteriores al
 * último bloque `fallback` (el texto y el propio bloque se conservan).
 */
export function contenidoParaReenviar(contenido: readonly BetaContentBlock[]): BetaContentBlockParam[] {
  const ultimoRespaldo = contenido.findLastIndex((bloque) => bloque.type === 'fallback');
  const conservados =
    ultimoRespaldo < 0
      ? contenido
      : contenido.filter(
          (bloque, indice) =>
            indice >= ultimoRespaldo || bloque.type === 'text' || bloque.type === 'fallback',
        );
  // Los bloques de respuesta y de petición coinciden en forma para estos
  // tipos; el SDK hace la misma conversión en BetaMessageStream.
  return conservados as unknown as BetaContentBlockParam[];
}

/** Bloques tool_use que hay que ejecutar: los posteriores al último respaldo. */
export function herramientasPedidas(contenido: readonly BetaContentBlock[]): BetaToolUseBlock[] {
  const ultimoRespaldo = contenido.findLastIndex((bloque) => bloque.type === 'fallback');
  return contenido.filter(
    (bloque, indice): bloque is BetaToolUseBlock =>
      bloque.type === 'tool_use' && indice > ultimoRespaldo,
  );
}

/** Versión sin `strict` de cada lista de herramientas, memorizada: sigue idéntica byte a byte entre peticiones. */
const herramientasSinEstricto = new WeakMap<readonly BetaTool[], BetaTool[]>();

/** Herramientas para la API según ODES_HERRAMIENTAS_ESTRICTAS (ver configuracion-odes.ts). */
export function herramientasParaApi(herramientas: BetaTool[], estrictas: boolean): BetaTool[] {
  if (estrictas) return herramientas;
  let lista = herramientasSinEstricto.get(herramientas);
  if (!lista) {
    lista = herramientas.map((herramienta) => {
      const copia = { ...herramienta };
      delete copia.strict;
      return copia;
    });
    herramientasSinEstricto.set(herramientas, lista);
  }
  return lista;
}

export interface DependenciasMotorIa {
  readonly cliente: ClienteAnthropic;
  readonly config: ConfiguracionOdes;
  readonly repositorio: RepositorioOdes;
  readonly contexto: FuenteContextoModelo;
  /** Registro de errores internos (sin contenido de mensajes). */
  readonly registrarError?: (mensaje: string) => void;
}

class ErrorJsonHerramienta extends Error {}

/**
 * Motor del modo "ia": bucle manual de herramientas con streaming sobre
 * `client.beta.messages.stream` (por el parámetro beta `fallbacks`).
 *
 * Por cada pregunta: hasta `maxRondasHerramientas` rondas con herramientas
 * (como mucho MAX_HERRAMIENTAS_POR_RONDA ejecutadas por ronda y
 * MAX_CARACTERES_RESULTADOS_PREGUNTA de resultados en total); después, una
 * última llamada con `tool_choice: none` para exigir la respuesta. Los deltas de texto se reenvían al instante; las citas se
 * acumulan por bloque de texto y se emiten al cerrarse el bloque.
 */
export class MotorIa {
  constructor(private readonly dependencias: DependenciasMotorIa) {}

  /** Parámetros de una llamada. Orden de caché: tools -> system -> messages. */
  construirParametros(
    contexto: ContextoModelo,
    mensajes: BetaMessageParam[],
    ultimaRonda: boolean,
    idUsuario: string,
  ): MessageCreateParamsBase {
    const { config } = this.dependencias;
    return {
      model: config.modelo,
      max_tokens: config.maxTokens,
      // `thinking` se omite a propósito: en Claude Opus 5.5 el pensamiento
      // adaptativo está siempre activo (disabled o budget_tokens dan 400) y
      // la profundidad se controla con el esfuerzo.
      output_config: { effort: config.esfuerzo },
      // Punto de caché explícito al final del prompt de sistema: cubre
      // herramientas + sistema, la parte cara y compartida por todos.
      system: [{ type: 'text', text: contexto.sistema, cache_control: { type: 'ephemeral' } }],
      tools: herramientasParaApi(contexto.herramientas, config.herramientasEstrictas),
      // Forzar una herramienta (any/tool) da 400 en Opus 5.5: se usa auto
      // (por defecto) y, en la última ronda, none para exigir la respuesta.
      ...(ultimaRonda ? { tool_choice: { type: 'none' as const } } : {}),
      messages: mensajes,
      // Caché automática para la cola de la conversación (crece por ronda).
      cache_control: { type: 'ephemeral' },
      metadata: { user_id: idUsuario },
      ...(config.fallbacks ? { betas: [BETA_FALLBACKS], fallbacks: 'default' as const } : {}),
    };
  }

  async responder(
    historial: readonly MensajeChat[],
    emitir: Emisor,
    senal: AbortSignal,
    idUsuario: string,
  ): Promise<ResumenRespuesta> {
    const { config } = this.dependencias;
    const resumen: ResumenRespuesta = {
      resultado: 'completo',
      llamadas: 0,
      herramientas: 0,
      modeloServido: null,
      respaldo: false,
      uso: usoVacio(),
      usoPrimeraLlamada: null,
    };
    const contexto = this.dependencias.contexto.obtener();
    const registro = new RegistroFuentes();
    const mensajes = mensajesParaApi(historial);
    const texto = { emitido: false, terminaEnSalto: false };
    let rondasHerramientas = 0;
    let reintentosJson = 0;
    /** Caracteres de resultados enviados en esta pregunta (MAX_CARACTERES_RESULTADOS_PREGUNTA). */
    const consultado = { caracteres: 0 };

    try {
      for (;;) {
        if (senal.aborted) throw new APIUserAbortError();
        const ultimaRonda =
          rondasHerramientas >= config.maxRondasHerramientas ||
          consultado.caracteres >= MAX_CARACTERES_RESULTADOS_PREGUNTA;
        const parametros = this.construirParametros(contexto, mensajes, ultimaRonda, idUsuario);
        let mensaje: BetaMessage;
        try {
          mensaje = await this.#ronda(parametros, senal, emitir, registro, texto, resumen);
        } catch (error) {
          // El SDK no pudo leer el JSON de una herramienta (streaming ansioso).
          // Se repite la llamada una vez si todavía no se mostró texto de ella.
          if (error instanceof ErrorJsonHerramienta && reintentosJson < 1) {
            reintentosJson++;
            continue;
          }
          throw error instanceof ErrorJsonHerramienta ? error.cause : error;
        }
        reintentosJson = 0;

        switch (mensaje.stop_reason) {
          case 'refusal':
            // Solo el fin: la interfaz descarta el texto parcial (la guía pide
            // no tratarlo como respuesta) y muestra su propio mensaje.
            emitir({ tipo: 'fin', motivo: 'rechazo' });
            resumen.resultado = 'rechazo';
            return resumen;
          case 'max_tokens':
          case 'model_context_window_exceeded':
            // Si había una herramienta a medias, su entrada podría estar
            // truncada: no se ejecuta.
            emitir({ tipo: 'fin', motivo: 'limite_tokens' });
            resumen.resultado = 'limite_tokens';
            return resumen;
          case 'pause_turn':
            // No hay herramientas de servidor, pero si llegara: se reenvía tal cual.
            mensajes.push({ role: 'assistant', content: contenidoParaReenviar(mensaje.content) });
            rondasHerramientas++;
            continue;
          case 'tool_use': {
            const pedidas = herramientasPedidas(mensaje.content);
            if (pedidas.length === 0 || ultimaRonda) break;
            const resultados = this.#ejecutar(pedidas, contexto, registro, emitir, senal, resumen, consultado);
            rondasHerramientas++;
            mensajes.push({ role: 'assistant', content: contenidoParaReenviar(mensaje.content) });
            const contenidoUsuario: BetaContentBlockParam[] = [...resultados];
            if (
              rondasHerramientas >= config.maxRondasHerramientas ||
              consultado.caracteres >= MAX_CARACTERES_RESULTADOS_PREGUNTA
            ) {
              contenidoUsuario.push({ type: 'text', text: AVISO_ULTIMA_RONDA });
            }
            mensajes.push({ role: 'user', content: contenidoUsuario });
            continue;
          }
          default:
            break;
        }
        emitir({ tipo: 'fin', motivo: 'completo' });
        resumen.resultado = 'completo';
        return resumen;
      }
    } catch (error) {
      if (senal.aborted || esCancelacion(error)) {
        resumen.resultado = 'cancelado';
        return resumen;
      }
      const { codigo, detalle } = clasificarErrorAnthropic(error);
      if (detalle === 'desconocido' || detalle === 'sdk' || detalle === 'api_400') {
        const mensajeError = error instanceof Error ? error.message : String(error);
        // Pista para quien opera el servidor si la API rechaza strict + citas.
        const pista =
          detalle === 'api_400' && config.herramientasEstrictas && /strict|structured|citation/i.test(mensajeError)
            ? ' Si el error se repite, ponga ODES_HERRAMIENTAS_ESTRICTAS=false en apps/server/.env y reinicie.'
            : '';
        this.dependencias.registrarError?.(`Error en el motor IA (${detalle}): ${mensajeError}${pista}`);
      }
      emitir({ tipo: 'error', ...errorChat(codigo) });
      resumen.resultado = 'error';
      resumen.detalle = detalle;
      return resumen;
    }
  }

  /** Una llamada a la API con streaming. Devuelve el mensaje final completo. */
  async #ronda(
    parametros: MessageCreateParamsBase,
    senal: AbortSignal,
    emitir: Emisor,
    registro: RegistroFuentes,
    texto: { emitido: boolean; terminaEnSalto: boolean },
    resumen: ResumenRespuesta,
  ): Promise<BetaMessage> {
    resumen.llamadas++;
    const flujo = this.dependencias.cliente.beta.messages.stream(parametros, { signal: senal });
    const citasPorBloque = new Map<number, BetaCitationSearchResultLocation[]>();
    let textoEnEstaRonda = false;
    const emitirDelta = (delta: string): void => {
      if (!delta) return;
      // Entre rondas (texto antes y después de una herramienta) se separa
      // con un párrafo para que las palabras no queden pegadas.
      const prefijo = !textoEnEstaRonda && texto.emitido && !texto.terminaEnSalto ? '\n\n' : '';
      textoEnEstaRonda = true;
      emitirTexto(emitir, texto, prefijo + delta);
    };
    try {
      for await (const evento of flujo) {
        if (evento.type === 'content_block_start') {
          const bloque = evento.content_block;
          if (bloque.type === 'fallback') resumen.respaldo = true;
          if (bloque.type === 'text' && bloque.text) emitirDelta(bloque.text);
        } else if (evento.type === 'content_block_delta') {
          const delta = evento.delta;
          if (delta.type === 'text_delta') {
            emitirDelta(delta.text);
          } else if (delta.type === 'citations_delta' && delta.citation.type === 'search_result_location') {
            const lista = citasPorBloque.get(evento.index) ?? [];
            lista.push(delta.citation);
            citasPorBloque.set(evento.index, lista);
          }
        } else if (evento.type === 'content_block_stop') {
          const citas = citasPorBloque.get(evento.index);
          if (citas) {
            citasPorBloque.delete(evento.index);
            emitirCitas(emitir, registro, citas);
          }
        }
      }
      const mensaje = await flujo.finalMessage();
      sumarUso(resumen.uso, mensaje.usage);
      if (resumen.usoPrimeraLlamada === null) {
        resumen.usoPrimeraLlamada = usoVacio();
        sumarUso(resumen.usoPrimeraLlamada, mensaje.usage);
      }
      resumen.modeloServido = mensaje.model;
      return mensaje;
    } catch (error) {
      if (
        error instanceof AnthropicError &&
        !(error instanceof APIError) &&
        !textoEnEstaRonda &&
        !senal.aborted
      ) {
        throw new ErrorJsonHerramienta('JSON de herramienta ilegible', { cause: error });
      }
      throw error;
    }
  }

  /**
   * Ejecuta las herramientas pedidas (síncronas: node:sqlite) y arma los
   * tool_result. Solo las MAX_HERRAMIENTAS_POR_RONDA primeras y mientras no
   * se agote el presupuesto de la pregunta; las demás reciben un tool_result
   * de error (la API exige uno por cada tool_use), sin cambiar tool_choice
   * (que invalidaría la caché de la conversación).
   */
  #ejecutar(
    pedidas: readonly BetaToolUseBlock[],
    contexto: ContextoModelo,
    registro: RegistroFuentes,
    emitir: Emisor,
    senal: AbortSignal,
    resumen: ResumenRespuesta,
    consultado: { caracteres: number },
  ): BetaToolResultBlockParam[] {
    const resultados: BetaToolResultBlockParam[] = [];
    for (const [posicion, pedida] of pedidas.entries()) {
      if (senal.aborted) throw new APIUserAbortError();
      const omitida =
        posicion >= MAX_HERRAMIENTAS_POR_RONDA
          ? TEXTO_DEMASIADAS_HERRAMIENTAS
          : consultado.caracteres >= MAX_CARACTERES_RESULTADOS_PREGUNTA
            ? TEXTO_PRESUPUESTO_AGOTADO
            : null;
      if (omitida) {
        resultados.push({
          type: 'tool_result',
          tool_use_id: pedida.id,
          content: [{ type: 'text', text: omitida }],
          is_error: true,
        });
        continue;
      }
      let resultado: ResultadoHerramienta;
      try {
        resultado = ejecutarHerramienta(pedida.name, pedida.input, {
          repositorio: this.dependencias.repositorio,
          categorias: contexto.categorias,
        });
      } catch (error) {
        this.dependencias.registrarError?.(
          `Error del repositorio en ${pedida.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
        resultado = {
          herramienta: null,
          descripcion: null,
          contenido: [{ type: 'text', text: 'Error interno al consultar el repositorio. Intenta con otra consulta.' }],
          esError: true,
          fuentes: [],
        };
      }
      resumen.herramientas++;
      consultado.caracteres += caracteresContenido(resultado.contenido);
      if (resultado.herramienta && resultado.descripcion) {
        emitir({ tipo: 'busqueda', herramienta: resultado.herramienta, descripcion: resultado.descripcion });
      }
      for (const fuente of resultado.fuentes) registro.registrar(fuente);
      resultados.push({
        type: 'tool_result',
        tool_use_id: pedida.id,
        content: resultado.contenido,
        ...(resultado.esError ? { is_error: true } : {}),
      });
    }
    return resultados;
  }
}

function emitirTexto(
  emitir: Emisor,
  estado: { emitido: boolean; terminaEnSalto: boolean },
  delta: string,
): void {
  if (!delta) return;
  emitir({ tipo: 'texto', delta });
  estado.emitido = true;
  estado.terminaEnSalto = delta.endsWith('\n');
}

/** Emite las citas de un bloque de texto, sin repetir el mismo índice dentro del bloque. */
function emitirCitas(
  emitir: Emisor,
  registro: RegistroFuentes,
  citas: readonly BetaCitationSearchResultLocation[],
): void {
  const emitidos = new Set<number>();
  for (const cita of citas) {
    const evento: EventoCita | null = registro.citar(cita);
    if (!evento || emitidos.has(evento.indice)) continue;
    emitidos.add(evento.indice);
    emitir(evento);
  }
}
