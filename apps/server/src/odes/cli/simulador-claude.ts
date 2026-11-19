/**
 * Simulador local de la API de Claude (POST /v1/messages con streaming SSE)
 * para probar el Asistente ODES de punta a punta SIN clave de API y con el
 * SDK real de Anthropic.
 *
 * Uso (después de `npm run build` en apps/server):
 *
 *   node dist/odes/cli/simulador-claude.js --puerto 4010
 *
 *   # en otra terminal: el servidor real apuntando al simulador
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=simulado \
 *     node dist/main.js
 *
 * Guion por defecto (imita la forma real de los eventos):
 * - Primera llamada de una pregunta: un bloque `thinking` vacío (como
 *   display "omitted") y un `tool_use` de buscar_documentos con una consulta
 *   sacada de la pregunta, enviado por partes con `input_json_delta`.
 * - Llamada que trae el `tool_result`: respuesta en español en 2-3 bloques
 *   de texto que citan (`citations_delta` con `search_result_location`) los
 *   resultados de ese tool_result por su posición real en la petición.
 * - Comandos en la pregunta para probar casos raros: [simular:rechazo],
 *   [simular:max_tokens], [simular:sobrecarga] (HTTP 529),
 *   [simular:error-flujo] (evento `error` a mitad del flujo),
 *   [simular:respaldo] (bloque `fallback` a mitad de la respuesta),
 *   [simular:siempre-herramienta] (pide herramientas hasta que tool_choice
 *   sea none) y [simular:lento] (pausa de 1,5 s entre eventos).
 *
 * También se puede importar en pruebas: iniciarSimuladorClaude() levanta el
 * servidor HTTP y crearFetchSimulado() da un `fetch` en memoria para pasarlo
 * al cliente del SDK (`new Anthropic({ fetch })`).
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type {
  BetaCitationSearchResultLocation,
  BetaRawMessageStreamEvent,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

// ── Tipos ─────────────────────────────────────────────────────────────────

/** Cuerpo JSON recibido (forma de MessageCreateParams, sin validar). */
export type CuerpoSolicitud = Record<string, unknown> & {
  model?: string;
  messages?: Array<{ role: string; content: unknown }>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: { type?: string };
  system?: unknown;
  stream?: boolean;
};

export interface SolicitudRecibida {
  readonly cuerpo: CuerpoSolicitud;
  readonly cabeceras: Readonly<Record<string, string>>;
  /** true si el cliente cortó la conexión antes de terminar el flujo. */
  cancelada: boolean;
  /** true cuando el simulador terminó de enviar la respuesta. */
  completada: boolean;
}

export type EventoSimulado = BetaRawMessageStreamEvent | { type: 'ping' } | { type: 'error'; error: { type: string; message: string } };

export type Turno =
  | { readonly tipo: 'flujo'; readonly eventos: EventoSimulado[]; readonly pausaMs?: number }
  | { readonly tipo: 'error'; readonly status: number; readonly tipoError: string; readonly mensaje: string };

/** Decide la respuesta a una solicitud. `numero` empieza en 1. */
export type Guion = (cuerpo: CuerpoSolicitud, numero: number, simulador: EstadoSimulador) => Turno;

export interface EstadoSimulador {
  /** Huellas de prefijos (tools + system) ya vistos: simula la caché de prompts. */
  readonly prefijosVistos: Set<string>;
}

/** Resultado de búsqueda encontrado en la petición, con su índice global. */
export interface ResultadoEnSolicitud {
  readonly indice: number;
  readonly source: string;
  readonly title: string;
  readonly bloques: readonly string[];
  /** true si está en el último mensaje (el tool_result de la ronda actual). */
  readonly enUltimoMensaje: boolean;
}

// ── Lectura de la solicitud ───────────────────────────────────────────────

type Bloque = Record<string, unknown> & { type?: string };

function bloquesDe(contenido: unknown): Bloque[] {
  return Array.isArray(contenido) ? (contenido as Bloque[]) : [];
}

/** Texto del último mensaje del usuario que no sea solo tool_result. */
export function ultimaPregunta(cuerpo: CuerpoSolicitud): string {
  const mensajes = cuerpo.messages ?? [];
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const mensaje = mensajes[i];
    if (mensaje?.role !== 'user') continue;
    if (typeof mensaje.content === 'string') return mensaje.content;
    const textos = bloquesDe(mensaje.content)
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => String(bloque.text ?? ''));
    const soloResultados = bloquesDe(mensaje.content).every(
      (bloque) => bloque.type === 'tool_result' || bloque.type === 'text',
    ) && bloquesDe(mensaje.content).some((bloque) => bloque.type === 'tool_result');
    if (!soloResultados && textos.length > 0) return textos.join('\n');
  }
  return '';
}

/** Todos los search_result de la petición en orden (mensajes y tool_result), como los cuenta la API. */
export function resultadosEnSolicitud(cuerpo: CuerpoSolicitud): ResultadoEnSolicitud[] {
  const mensajes = cuerpo.messages ?? [];
  const resultados: ResultadoEnSolicitud[] = [];
  mensajes.forEach((mensaje, posicion) => {
    const enUltimoMensaje = posicion === mensajes.length - 1;
    const agregar = (bloque: Bloque): void => {
      if (bloque.type !== 'search_result') return;
      resultados.push({
        indice: resultados.length,
        source: String(bloque.source ?? ''),
        title: String(bloque.title ?? ''),
        bloques: bloquesDe(bloque.content).map((parte) => String(parte.text ?? '')),
        enUltimoMensaje,
      });
    };
    for (const bloque of bloquesDe(mensaje.content)) {
      agregar(bloque);
      if (bloque.type === 'tool_result') bloquesDe(bloque.content).forEach(agregar);
    }
  });
  return resultados;
}

function ultimoMensajeTraeResultados(cuerpo: CuerpoSolicitud): boolean {
  const ultimo = cuerpo.messages?.at(-1);
  return bloquesDe(ultimo?.content).some((bloque) => bloque.type === 'tool_result');
}

const PALABRAS_VACIAS = new Set(
  'que cual cuales como cuando donde quien quienes cuanto cuantos cuantas para sobre entre desde hasta este esta estos estas ese esa esos esas del las los una unos unas por con sin hay hubo fue fueron ser son esta estan tiene tienen dice dicen puedes podrias quiero saber dime the and what which how'.split(' '),
);

/** Consulta para buscar_documentos sacada de la pregunta (palabras con contenido). */
export function consultaDesdePregunta(pregunta: string): string {
  const limpia = pregunta.replace(/\[simular:[^\]]*\]/g, ' ');
  const palabras = limpia
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (palabra) =>
        palabra.length > 2 && !PALABRAS_VACIAS.has(palabra.normalize('NFD').replace(/\p{Mn}/gu, '')),
    );
  const consulta = palabras.slice(0, 6).join(' ');
  return consulta || limpia.trim().slice(0, 80) || 'educación';
}

function comandos(cuerpo: CuerpoSolicitud): Set<string> {
  const encontrados = new Set<string>();
  for (const mensaje of cuerpo.messages ?? []) {
    if (mensaje.role !== 'user') continue;
    const texto =
      typeof mensaje.content === 'string'
        ? mensaje.content
        : bloquesDe(mensaje.content)
            .filter((bloque) => bloque.type === 'text')
            .map((bloque) => String(bloque.text ?? ''))
            .join(' ');
    for (const coincidencia of texto.matchAll(/\[simular:([a-z_-]+)\]/g)) {
      if (coincidencia[1]) encontrados.add(coincidencia[1]);
    }
  }
  return encontrados;
}

// ── Construcción de eventos ───────────────────────────────────────────────

let contadorIds = 0;
function nuevoId(prefijo: string): string {
  contadorIds++;
  return `${prefijo}_sim${Date.now().toString(36)}${contadorIds.toString(36)}`;
}

export interface UsoSimulado {
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
}

function usoCompleto(uso: UsoSimulado) {
  return {
    input_tokens: uso.entrada,
    output_tokens: uso.salida,
    cache_creation_input_tokens: uso.cacheEscritura,
    cache_read_input_tokens: uso.cacheLectura,
    cache_creation: {
      ephemeral_5m_input_tokens: uso.cacheEscritura,
      ephemeral_1h_input_tokens: 0,
    },
    server_tool_use: null,
    service_tier: 'standard' as const,
    inference_geo: null,
    iterations: null,
    fallback_credit: null,
    output_tokens_details: null,
    speed: null,
  };
}

/** Bloque de contenido que el guion quiere emitir. */
export type BloqueSimulado =
  | { readonly tipo: 'pensamiento' }
  | { readonly tipo: 'texto'; readonly texto: string; readonly citas?: readonly BetaCitationSearchResultLocation[] }
  | { readonly tipo: 'herramienta'; readonly nombre: string; readonly entrada: unknown; readonly id?: string }
  | { readonly tipo: 'respaldo'; readonly de: string; readonly a: string };

/** Parte un texto en trozos de ~n caracteres (como llegan los deltas reales). */
function trozos(texto: string, tamano: number): string[] {
  const partes: string[] = [];
  for (let i = 0; i < texto.length; i += tamano) partes.push(texto.slice(i, i + tamano));
  return partes.length > 0 ? partes : [''];
}

/** Convierte bloques en la secuencia de eventos SSE de un mensaje completo. */
export function eventosMensaje(
  modelo: string,
  bloques: readonly BloqueSimulado[],
  stopReason: BetaStopReason,
  uso: UsoSimulado,
  stopDetails: Record<string, unknown> | null = null,
): EventoSimulado[] {
  const eventos: EventoSimulado[] = [];
  eventos.push({
    type: 'message_start',
    message: {
      id: nuevoId('msg'),
      type: 'message',
      role: 'assistant',
      model: modelo,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      container: null,
      context_management: null,
      diagnostics: null,
      usage: usoCompleto({ ...uso, salida: 1 }),
    },
  } as BetaRawMessageStreamEvent);
  eventos.push({ type: 'ping' });
  bloques.forEach((bloque, index) => {
    switch (bloque.tipo) {
      case 'pensamiento':
        eventos.push(
          { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
          { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `firma-simulada-${index}` } },
          { type: 'content_block_stop', index },
        );
        break;
      case 'texto':
        eventos.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } });
        for (const parte of trozos(bloque.texto, 24)) {
          eventos.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: parte } });
        }
        for (const cita of bloque.citas ?? []) {
          eventos.push({ type: 'content_block_delta', index, delta: { type: 'citations_delta', citation: cita } });
        }
        eventos.push({ type: 'content_block_stop', index });
        break;
      case 'herramienta': {
        const json = JSON.stringify(bloque.entrada);
        eventos.push({
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: bloque.id ?? nuevoId('toolu'), name: bloque.nombre, input: {} },
        });
        for (const parte of trozos(json, Math.max(4, Math.ceil(json.length / 3)))) {
          eventos.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: parte } });
        }
        eventos.push({ type: 'content_block_stop', index });
        break;
      }
      case 'respaldo':
        eventos.push(
          {
            type: 'content_block_start',
            index,
            content_block: {
              type: 'fallback',
              from: { model: bloque.de },
              to: { model: bloque.a },
              trigger: { type: 'refusal', category: 'cyber' },
            },
          } as unknown as BetaRawMessageStreamEvent,
          { type: 'content_block_stop', index },
        );
        break;
    }
  });
  eventos.push({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails, container: null },
    usage: {
      output_tokens: uso.salida,
      input_tokens: uso.entrada,
      cache_creation_input_tokens: uso.cacheEscritura,
      cache_read_input_tokens: uso.cacheLectura,
      server_tool_use: null,
      iterations: null,
      fallback_credit: null,
      output_tokens_details: null,
    },
    context_management: null,
  } as BetaRawMessageStreamEvent);
  eventos.push({ type: 'message_stop' });
  return eventos;
}

/** Cita `search_result_location` a un resultado (por defecto su primer bloque de contenido). */
export function citaA(resultado: ResultadoEnSolicitud, bloque = Math.min(1, resultado.bloques.length - 1)): BetaCitationSearchResultLocation {
  return {
    type: 'search_result_location',
    cited_text: resultado.bloques[bloque] ?? '',
    source: resultado.source,
    title: resultado.title || null,
    search_result_index: resultado.indice,
    start_block_index: bloque,
    end_block_index: bloque + 1,
  };
}

/**
 * Uso simulado: tokens ~ caracteres / 4. La primera vez que ve un prefijo
 * (tools + system) lo "escribe" en caché y las siguientes lo "lee", para
 * poder comprobar en las pruebas y en el registro que el prefijo es estable.
 */
export function usoParaSolicitud(cuerpo: CuerpoSolicitud, estado: EstadoSimulador, salida: number): UsoSimulado {
  const prefijo = JSON.stringify([cuerpo.tools ?? null, cuerpo.system ?? null]);
  const huella = createHash('sha256').update(prefijo).digest('hex');
  const tokensPrefijo = Math.ceil(prefijo.length / 4);
  const tokensMensajes = Math.ceil(JSON.stringify(cuerpo.messages ?? []).length / 4);
  const visto = estado.prefijosVistos.has(huella);
  estado.prefijosVistos.add(huella);
  return {
    entrada: tokensMensajes,
    salida,
    cacheLectura: visto ? tokensPrefijo : 0,
    cacheEscritura: visto ? 0 : tokensPrefijo,
  };
}

function recortarTitulo(titulo: string): string {
  const base = titulo.split(' — ')[1] ?? titulo;
  return base.replace(/,\s*págs?\..*$/, '').slice(0, 90);
}

/** Guion por defecto: buscar y luego responder citando lo encontrado. */
export const guionPorDefecto: Guion = (cuerpo, _numero, estado) => {
  const modelo = cuerpo.model ?? 'claude-opus-5-5';
  const pedidos = comandos(cuerpo);
  const hayHerramientas = (cuerpo.tools?.length ?? 0) > 0 && cuerpo.tool_choice?.type !== 'none';
  const traeResultados = ultimoMensajeTraeResultados(cuerpo);
  const pausaMs = pedidos.has('lento') ? 1500 : undefined;

  if (pedidos.has('sobrecarga')) {
    return { tipo: 'error', status: 529, tipoError: 'overloaded_error', mensaje: 'Overloaded (simulado)' };
  }
  if (pedidos.has('rechazo')) {
    return {
      tipo: 'flujo',
      eventos: eventosMensaje(
        modelo,
        [{ tipo: 'texto', texto: 'Respuesta parcial antes del rechazo.' }],
        'refusal',
        usoParaSolicitud(cuerpo, estado, 8),
        { type: 'refusal', category: 'cyber', explanation: null, fallback_credit_token: null, fallback_has_prefill_claim: null, recommended_model: null },
      ),
    };
  }

  const pedirHerramienta = hayHerramientas && (!traeResultados || pedidos.has('siempre-herramienta'));
  if (pedirHerramienta) {
    const consulta = consultaDesdePregunta(ultimaPregunta(cuerpo));
    return {
      tipo: 'flujo',
      pausaMs,
      eventos: eventosMensaje(
        modelo,
        [{ tipo: 'pensamiento' }, { tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta } }],
        'tool_use',
        usoParaSolicitud(cuerpo, estado, 40),
      ),
    };
  }

  const candidatos = resultadosEnSolicitud(cuerpo).filter(
    (resultado) => resultado.enUltimoMensaje && !resultado.source.startsWith('odes:'),
  );
  const elegidos: ResultadoEnSolicitud[] = [];
  for (const candidato of candidatos) {
    if (!elegidos.some((elegido) => elegido.source === candidato.source)) elegidos.push(candidato);
    if (elegidos.length === 2) break;
  }
  const bloques: BloqueSimulado[] = [{ tipo: 'pensamiento' }];
  if (pedidos.has('respaldo')) {
    bloques.push({ tipo: 'texto', texto: 'Inicio antes del respaldo. ' }, { tipo: 'respaldo', de: modelo, a: 'claude-opus-5' });
  }
  const [primero, segundo] = elegidos;
  if (!primero) {
    bloques.push({
      tipo: 'texto',
      texto: 'No encontré información sobre eso en el repositorio del Observatorio. Prueba con otras palabras.',
    });
  } else {
    bloques.push(
      { tipo: 'texto', texto: 'Según los documentos del repositorio del Observatorio, ' },
      { tipo: 'texto', texto: `«${recortarTitulo(primero.title)}» trata este tema.`, citas: [citaA(primero)] },
    );
    if (segundo) {
      bloques.push({
        tipo: 'texto',
        texto: `\n\nTambién hay información relacionada en «${recortarTitulo(segundo.title)}».`,
        citas: [citaA(segundo), citaA(primero)],
      });
    }
  }
  const textoTotal = bloques.reduce((total, bloque) => total + (bloque.tipo === 'texto' ? bloque.texto.length : 0), 0);
  return {
    tipo: 'flujo',
    pausaMs,
    eventos: eventosMensaje(
      modelo,
      bloques,
      pedidos.has('max_tokens') ? 'max_tokens' : 'end_turn',
      usoParaSolicitud(cuerpo, estado, Math.ceil(textoTotal / 4) + 30),
    ).flatMap((evento, posicion, todos) =>
      // [simular:error-flujo]: un evento `error` justo antes del final.
      pedidos.has('error-flujo') && posicion === todos.length - 2
        ? [{ type: 'error' as const, error: { type: 'overloaded_error', message: 'Overloaded (simulado)' } }]
        : pedidos.has('error-flujo') && posicion > todos.length - 2
          ? []
          : [evento],
    ),
  };
};

// ── Codificación SSE ──────────────────────────────────────────────────────

export function codificarEventoSse(evento: EventoSimulado): string {
  return `event: ${evento.type}\ndata: ${JSON.stringify(evento)}\n\n`;
}

function cuerpoError(tipo: string, mensaje: string): string {
  return JSON.stringify({ type: 'error', error: { type: tipo, message: mensaje }, request_id: nuevoId('req') });
}

const esperar = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

// ── fetch en memoria (para pruebas unitarias con el SDK real) ─────────────

export interface FetchSimulado {
  readonly fetch: (entrada: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly solicitudes: SolicitudRecibida[];
}

export function crearFetchSimulado(guion: Guion = guionPorDefecto, pausaMs = 0): FetchSimulado {
  const solicitudes: SolicitudRecibida[] = [];
  const estado: EstadoSimulador = { prefijosVistos: new Set() };
  const fetchSimulado = async (_entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}')) as CuerpoSolicitud;
    const cabeceras: Record<string, string> = {};
    new Headers(init?.headers).forEach((valor, clave) => {
      cabeceras[clave] = valor;
    });
    const solicitud: SolicitudRecibida = { cuerpo, cabeceras, cancelada: false, completada: false };
    solicitudes.push(solicitud);
    const turno = guion(cuerpo, solicitudes.length, estado);
    if (turno.tipo === 'error') {
      solicitud.completada = true;
      return new Response(cuerpoError(turno.tipoError, turno.mensaje), {
        status: turno.status,
        headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
      });
    }
    const senal = init?.signal ?? undefined;
    const codificador = new TextEncoder();
    const pausa = turno.pausaMs ?? pausaMs;
    const flujo = new ReadableStream<Uint8Array>({
      async start(controlador) {
        const alAbortar = (): void => {
          solicitud.cancelada = true;
          try {
            controlador.error(new DOMException('La solicitud se canceló.', 'AbortError'));
          } catch {
            // ya cerrado
          }
        };
        senal?.addEventListener('abort', alAbortar, { once: true });
        for (const evento of turno.eventos) {
          if (senal?.aborted) return;
          if (pausa > 0) await esperar(pausa);
          if (senal?.aborted) return;
          controlador.enqueue(codificador.encode(codificarEventoSse(evento)));
        }
        senal?.removeEventListener('abort', alAbortar);
        solicitud.completada = true;
        controlador.close();
      },
    });
    return new Response(flujo, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'request-id': nuevoId('req') },
    });
  };
  return { fetch: fetchSimulado, solicitudes };
}

// ── Servidor HTTP ─────────────────────────────────────────────────────────

export interface OpcionesSimulador {
  /** 0 = puerto libre elegido por el sistema. */
  readonly puerto?: number;
  readonly host?: string;
  readonly guion?: Guion;
  /** Pausa entre eventos SSE (ms), salvo que el turno indique otra. */
  readonly pausaMs?: number;
}

export interface SimuladorClaude {
  readonly url: string;
  readonly puerto: number;
  readonly solicitudes: SolicitudRecibida[];
  cerrar(): Promise<void>;
}

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => resolver(Buffer.concat(partes).toString('utf8')));
    req.on('error', rechazar);
  });
}

function responderJson(res: ServerResponse, status: number, cuerpo: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-should-retry': 'false' });
  res.end(cuerpo);
}

export async function iniciarSimuladorClaude(opciones: OpcionesSimulador = {}): Promise<SimuladorClaude> {
  const guion = opciones.guion ?? guionPorDefecto;
  const solicitudes: SolicitudRecibida[] = [];
  const estado: EstadoSimulador = { prefijosVistos: new Set() };

  const servidor = createServer((req, res) => {
    void (async () => {
      const ruta = new URL(req.url ?? '/', 'http://simulador').pathname;
      if (req.method !== 'POST' || ruta !== '/v1/messages') {
        responderJson(res, 404, cuerpoError('not_found_error', `El simulador solo atiende POST /v1/messages (pedido: ${req.method} ${ruta}).`));
        return;
      }
      if (!req.headers['x-api-key'] && !req.headers.authorization) {
        responderJson(res, 401, cuerpoError('authentication_error', 'Falta x-api-key.'));
        return;
      }
      let cuerpo: CuerpoSolicitud;
      try {
        cuerpo = JSON.parse(await leerCuerpo(req)) as CuerpoSolicitud;
      } catch {
        responderJson(res, 400, cuerpoError('invalid_request_error', 'JSON inválido.'));
        return;
      }
      const cabeceras: Record<string, string> = {};
      for (const [clave, valor] of Object.entries(req.headers)) {
        if (valor !== undefined) cabeceras[clave] = Array.isArray(valor) ? valor.join(', ') : valor;
      }
      const solicitud: SolicitudRecibida = { cuerpo, cabeceras, cancelada: false, completada: false };
      solicitudes.push(solicitud);
      if (cuerpo.stream !== true) {
        responderJson(res, 400, cuerpoError('invalid_request_error', 'El simulador solo admite stream: true.'));
        return;
      }
      const turno = guion(cuerpo, solicitudes.length, estado);
      if (turno.tipo === 'error') {
        solicitud.completada = true;
        responderJson(res, turno.status, cuerpoError(turno.tipoError, turno.mensaje));
        return;
      }
      res.on('close', () => {
        if (!solicitud.completada) solicitud.cancelada = true;
      });
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'request-id': nuevoId('req'),
      });
      const pausa = turno.pausaMs ?? opciones.pausaMs ?? 0;
      for (const evento of turno.eventos) {
        if (pausa > 0) await esperar(pausa);
        if (solicitud.cancelada || res.destroyed) return;
        res.write(codificarEventoSse(evento));
      }
      solicitud.completada = true;
      res.end();
    })().catch((error: unknown) => {
      if (!res.headersSent) responderJson(res, 500, cuerpoError('api_error', String(error)));
      else res.destroy();
    });
  });

  await new Promise<void>((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(opciones.puerto ?? 0, opciones.host ?? '127.0.0.1', () => resolver());
  });
  const { port } = servidor.address() as AddressInfo;
  const host = opciones.host ?? '127.0.0.1';
  return {
    url: `http://${host}:${port}`,
    puerto: port,
    solicitudes,
    cerrar: () =>
      new Promise<void>((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => resolver());
      }),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      puerto: { type: 'string', default: '4010' },
      host: { type: 'string', default: '127.0.0.1' },
      pausa: { type: 'string', default: '15' },
    },
  });
  const puerto = Number(values.puerto);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
    throw new Error(`--puerto no es válido: ${values.puerto}`);
  }
  const simulador = await iniciarSimuladorClaude({
    puerto,
    host: values.host,
    pausaMs: Number(values.pausa) || 0,
  });
  console.log(`Simulador de Claude escuchando en ${simulador.url} (POST /v1/messages)`);
  console.log(`Arranque el servidor con: ANTHROPIC_BASE_URL=${simulador.url} ANTHROPIC_API_KEY=simulado node dist/main.js`);
  const cerrar = (): void => {
    void simulador.cerrar().then(() => process.exit(0));
  };
  process.once('SIGINT', cerrar);
  process.once('SIGTERM', cerrar);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
