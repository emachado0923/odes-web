import type {
  BetaCitationSearchResultLocation,
  BetaSearchResultBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { DocumentoRepositorio } from '../repositorio/repositorio.tipos.js';
import { resumenDocumento, tituloFragmento } from './catalogo.js';
import type { EventoChat } from './protocolo.js';

export type EventoCita = Extract<EventoChat, { tipo: 'cita' }>;

/**
 * Una fuente enviada a Claude como bloque `search_result` dentro de un
 * `tool_result`. Las citas que devuelve la API (`search_result_location`)
 * apuntan a la fuente por su posición entre TODOS los `search_result` de la
 * petición (`search_result_index`), en orden de aparición, y a un rango de
 * sus bloques de texto (`start_block_index`..`end_block_index`).
 */
export interface Fuente {
  /** Campo `source` del bloque (la URL del fragmento). */
  readonly source: string;
  readonly titulo: string;
  /** null en entradas auxiliares (p. ej. el total de un listado). */
  readonly documento: DocumentoRepositorio | null;
  readonly paginaInicio: number | null;
  readonly paginaFin: number | null;
  /** URL que abre el documento en la página del fragmento. */
  readonly url: string;
  /** Bloques de texto tal como se enviaron; el 0 es el encabezado con el id. */
  readonly bloques: readonly string[];
}

/** Tamaño objetivo de cada bloque citable: la API cita bloques enteros. */
const MAX_CARACTERES_BLOQUE = 700;
const MIN_CARACTERES_BLOQUE = 160;
const MAX_BLOQUES_POR_FUENTE = 14;

/**
 * Divide el texto de un fragmento en bloques citables (párrafos de ~160 a
 * ~700 caracteres). Así la cita (`cited_text`) es un pasaje concreto y no la
 * página entera.
 */
export function dividirEnBloques(texto: string): string[] {
  const parrafos = texto
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((parrafo) => parrafo.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const piezas: string[] = [];
  for (const parrafo of parrafos) {
    if (parrafo.length <= MAX_CARACTERES_BLOQUE) {
      piezas.push(parrafo);
      continue;
    }
    // Párrafo largo: se corta por oraciones.
    let actual = '';
    for (const oracion of parrafo.split(/(?<=[.!?;:])\s+/)) {
      if (actual && actual.length + oracion.length + 1 > MAX_CARACTERES_BLOQUE) {
        piezas.push(actual);
        actual = '';
      }
      if (oracion.length > MAX_CARACTERES_BLOQUE) {
        for (let i = 0; i < oracion.length; i += MAX_CARACTERES_BLOQUE) {
          piezas.push(oracion.slice(i, i + MAX_CARACTERES_BLOQUE));
        }
        continue;
      }
      actual = actual ? `${actual} ${oracion}` : oracion;
    }
    if (actual) piezas.push(actual);
  }
  // Se unen las piezas cortas con la siguiente (títulos, viñetas, cifras sueltas).
  const bloques: string[] = [];
  for (const pieza of piezas) {
    const ultimo = bloques.at(-1);
    if (
      ultimo !== undefined &&
      (ultimo.length < MIN_CARACTERES_BLOQUE || pieza.length < MIN_CARACTERES_BLOQUE / 2) &&
      ultimo.length + pieza.length + 1 <= MAX_CARACTERES_BLOQUE
    ) {
      bloques[bloques.length - 1] = `${ultimo}\n${pieza}`;
    } else {
      bloques.push(pieza);
    }
  }
  if (bloques.length > MAX_BLOQUES_POR_FUENTE) {
    const resto = bloques.splice(MAX_BLOQUES_POR_FUENTE - 1);
    bloques.push(resto.join('\n'));
  }
  return bloques;
}

/** Encabezado (bloque 0) de cada fuente: el id para leer_documento y los datos básicos. */
export function encabezadoFuente(
  doc: DocumentoRepositorio,
  paginaInicio: number | null,
  paginaFin: number | null,
): string {
  const idioma = doc.idioma === 'en' ? 'inglés' : 'español';
  const paginas =
    paginaInicio === null
      ? 'ficha del catálogo'
      : paginaFin === null || paginaFin === paginaInicio
        ? `página ${paginaInicio}`
        : `páginas ${paginaInicio} a ${paginaFin}`;
  return `[id: ${doc.id}] ${tituloFragmento(doc, null, null)} · ${idioma} · ${paginas}`;
}

export function fuenteDeDocumento(
  doc: DocumentoRepositorio,
  paginaInicio: number | null,
  paginaFin: number | null,
  url: string,
  texto: string,
): Fuente {
  const cuerpo = dividirEnBloques(texto);
  return {
    source: url,
    titulo: tituloFragmento(doc, paginaInicio, paginaFin),
    documento: doc,
    paginaInicio,
    paginaFin,
    url,
    bloques: [
      encabezadoFuente(doc, paginaInicio, paginaFin),
      ...(cuerpo.length > 0 ? cuerpo : ['(sin texto)']),
    ],
  };
}

/** Fuente auxiliar sin documento (p. ej. el total de un listado). */
export function fuenteAuxiliar(source: string, titulo: string, texto: string): Fuente {
  return {
    source,
    titulo,
    documento: null,
    paginaInicio: null,
    paginaFin: null,
    url: source,
    bloques: [texto],
  };
}

export function bloqueSearchResult(fuente: Fuente): BetaSearchResultBlockParam {
  return {
    type: 'search_result',
    source: fuente.source,
    title: fuente.titulo,
    content: fuente.bloques.map((texto) => ({ type: 'text', text: texto })),
    // Todo o nada: todas las fuentes de una petición llevan citas activadas.
    citations: { enabled: true },
  };
}

export function caracteresFuente(fuente: Fuente): number {
  return fuente.bloques.reduce((total, bloque) => total + bloque.length, 0);
}

const MAX_CARACTERES_CITADOS = 1200;

/**
 * Registro de las fuentes de UNA petición al chat (todas sus rondas) y de los
 * índices de cita mostrados al usuario. El historial entre preguntas viaja
 * solo como texto, así que los `search_result` de la petición son
 * exactamente los registrados aquí, en el mismo orden.
 */
export class RegistroFuentes {
  readonly #fuentes: Fuente[] = [];
  readonly #indices = new Map<string, number>();

  get cantidad(): number {
    return this.#fuentes.length;
  }

  /** Se llama en el mismo orden en que los bloques se agregan a la conversación. */
  registrar(fuente: Fuente): void {
    this.#fuentes.push(fuente);
  }

  /**
   * Convierte una cita de la API en el evento 'cita' del protocolo. Reutiliza
   * el índice si el mismo documento y las mismas páginas ya se citaron.
   * Devuelve null si la cita no corresponde a un documento (fuente auxiliar o
   * índice desconocido).
   */
  citar(cita: BetaCitationSearchResultLocation): EventoCita | null {
    let fuente: Fuente | undefined = this.#fuentes[cita.search_result_index];
    if (!fuente || fuente.source !== cita.source) {
      // Defensa: si el índice no cuadra, se busca por la URL.
      fuente = this.#fuentes.find((candidata) => candidata.source === cita.source);
    }
    if (!fuente?.documento) return null;
    const clave = `${fuente.documento.id}|${fuente.paginaInicio ?? ''}|${fuente.paginaFin ?? ''}`;
    let indice = this.#indices.get(clave);
    if (indice === undefined) {
      indice = this.#indices.size + 1;
      this.#indices.set(clave, indice);
    }
    return {
      tipo: 'cita',
      indice,
      documento: resumenDocumento(fuente.documento),
      paginaInicio: fuente.paginaInicio,
      paginaFin: fuente.paginaFin,
      url: fuente.url,
      textoCitado: textoCitado(fuente, cita),
    };
  }
}

/** Texto citado sin el encabezado técnico (bloque 0), salvo que sea lo único citado. */
function textoCitado(fuente: Fuente, cita: BetaCitationSearchResultLocation): string {
  const inicio = Math.max(1, cita.start_block_index);
  const fin = Math.min(fuente.bloques.length, cita.end_block_index);
  const texto =
    fin > inicio ? fuente.bloques.slice(inicio, fin).join('\n') : cita.cited_text.replace(/^\[id: [^\]]*\]\s*/, '');
  const limpio = texto.trim();
  return limpio.length > MAX_CARACTERES_CITADOS
    ? `${limpio.slice(0, MAX_CARACTERES_CITADOS - 1).trimEnd()}…`
    : limpio;
}
