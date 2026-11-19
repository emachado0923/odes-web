/**
 * Protocolo HTTP + SSE del chat del Asistente ODES.
 *
 * COPIA IDÉNTICA en:
 *   apps/server/src/odes/chat/protocolo.ts
 *   apps/web/src/sites/odes/chat/protocolo.ts
 * Los dos paquetes son independientes (no hay workspace compartido): si cambias
 * uno, copia el archivo completo al otro.
 *
 * ── Endpoints ──────────────────────────────────────────────────────────────
 * GET  /api/odes/estado  -> EstadoAsistente (JSON)
 * POST /api/odes/chat    <- SolicitudChat (JSON)
 *                        -> text/event-stream con EventoChat
 *
 * Administración del índice (la usa /repositorio/admin; ver el final del
 * archivo). Viven bajo /api/repositorio/admin porque la cookie de sesión de
 * la administración tiene Path=/api/repositorio/admin:
 * GET  /api/repositorio/admin/odes/indice     -> EstadoIndiceAdmin
 * POST /api/repositorio/admin/odes/reindexar  -> 202 EstadoIndiceAdmin
 *      (sin cuerpo; cabecera X-CSRF-Token; 409 si ya hay una en curso)
 *
 * Errores ANTES de abrir el flujo (validación, límite de uso, servicio caído):
 * respuesta JSON normal con status 400 / 413 / 429 / 503 y cuerpo ErrorChat.
 * Errores DURANTE el flujo: un evento { tipo: 'error' } y se cierra el flujo.
 *
 * ── Formato del flujo ──────────────────────────────────────────────────────
 * Cada mensaje SSE es una sola línea `data: <JSON de EventoChat>` seguida de
 * una línea en blanco. Cada ~15 s puede llegar un comentario `: ping` para
 * mantener viva la conexión (ignorarlo). No se usan los campos `event:` ni
 * `id:`; el tipo va dentro del JSON. El cliente usa fetch + ReadableStream
 * (EventSource no admite POST).
 *
 * Orden típico (modo "ia"):
 *   inicio → busqueda* → texto* (intercalado con cita*) → fin
 * Modo "busqueda" (sin clave de API configurada):
 *   inicio → texto (aviso corto) → documentos → fin
 *
 * ── Citas ──────────────────────────────────────────────────────────────────
 * Al recibir { tipo: 'cita', indice: n } el cliente inserta la marca
 * MARCA_CITA(n) (p. ej. "⟦2⟧") al final del texto acumulado de la respuesta,
 * es decir, justo después de la frase citada, y la dibuja como un número
 * volado que enlaza con la fuente n de la lista "Fuentes". El servidor reutiliza
 * el mismo índice cuando vuelve a citar el mismo documento y las mismas páginas,
 * así que la lista de fuentes no tiene duplicados.
 *
 * ── Privacidad ─────────────────────────────────────────────────────────────
 * El nombre que la persona escribe al inicio se queda en el navegador: NO se
 * envía en SolicitudChat.
 */

export const NOMBRE_ASISTENTE = 'Asistente ODES';

export const LIMITES_CHAT = {
  /** Mensajes por solicitud (historial + pregunta actual). */
  maxMensajes: 20,
  maxCaracteresUsuario: 2000,
  maxCaracteresAsistente: 12000,
} as const;

export type RolMensaje = 'usuario' | 'asistente';

export interface MensajeChat {
  rol: RolMensaje;
  /**
   * Texto plano. En los mensajes del asistente el cliente debe quitar las
   * marcas de cita (⟦n⟧) antes de reenviarlos.
   */
  texto: string;
}

export interface SolicitudChat {
  /** Historial en orden; el último mensaje debe ser del usuario. */
  mensajes: MensajeChat[];
}

export type ModoAsistente = 'ia' | 'busqueda';

export interface EstadoAsistente {
  asistente: typeof NOMBRE_ASISTENTE;
  /** 'ia' = Claude responde; 'busqueda' = no hay clave de API, solo se listan documentos. */
  modo: ModoAsistente;
  repositorio: {
    disponible: boolean;
    documentos: number;
    documentosConTexto: number;
    /** Fecha ISO de la última indexación, o null. */
    generado: string | null;
  };
}

export interface DocumentoResumen {
  id: string;
  titulo: string;
  subtitulo?: string;
  categoria: string;
  /** "2024" o "S. F.". */
  anio: string;
  idioma: 'es' | 'en';
  tipo: 'pdf' | 'tablero' | 'entrada' | 'imagen' | 'otro';
  /** URL del documento completo. */
  url: string;
  /** Nombre del archivo en /odes/portadas/, si hay miniatura. */
  portada?: string;
  /**
   * URL de la miniatura servida por la rama /repositorio (ruta del propio
   * sitio, p. ej. /api/repositorio/documentos/<id>/miniatura?v=…), cuando el
   * índice se generó desde la base de datos. El cliente la prefiere a
   * `portada`; si no carga, usa /odes/portadas/<portada> y luego un icono.
   */
  urlMiniatura?: string;
}

export interface DocumentoEncontrado extends DocumentoResumen {
  /** URL que abre la página relevante (PDF: …#page=N). */
  urlFragmento: string;
  paginaInicio: number | null;
  paginaFin: number | null;
  /** Extracto corto (≤ 300 caracteres) del fragmento encontrado. */
  extracto?: string;
}

export type CodigoErrorChat =
  | 'solicitud_invalida'
  | 'limite_uso'
  | 'no_disponible'
  | 'sobrecarga'
  | 'interno';

export interface ErrorChat {
  codigo: CodigoErrorChat;
  /** Mensaje en español apto para mostrar tal cual. */
  mensaje: string;
}

export type EventoChat =
  | { tipo: 'inicio'; modo: ModoAsistente }
  /** El asistente consulta el repositorio (para mostrar "Buscando: …"). */
  | {
      tipo: 'busqueda';
      herramienta: 'buscar' | 'listar' | 'leer';
      descripcion: string;
    }
  | { tipo: 'texto'; delta: string }
  | {
      tipo: 'cita';
      /** Desde 1, estable dentro de una respuesta. */
      indice: number;
      documento: DocumentoResumen;
      paginaInicio: number | null;
      paginaFin: number | null;
      /** Abre el documento en la página citada. */
      url: string;
      /** Fragmento exacto que sustenta la frase (para mostrar al pasar el cursor). */
      textoCitado: string;
    }
  /** Lista de documentos (modo búsqueda, o "documentos relacionados"). */
  | { tipo: 'documentos'; titulo: string; documentos: DocumentoEncontrado[] }
  | {
      tipo: 'fin';
      /** completo | limite_tokens (respuesta cortada) | rechazo (el modelo declinó). */
      motivo: 'completo' | 'limite_tokens' | 'rechazo';
    }
  | ({ tipo: 'error' } & ErrorChat);

/** Marca que el cliente inserta en el texto por cada evento 'cita'. */
export const MARCA_CITA = (indice: number): string => `⟦${indice}⟧`;

/** Expresión para encontrar marcas de cita en un texto (global). */
export const PATRON_MARCA_CITA = /⟦(\d+)⟧/g;

// ── Administración del índice ──────────────────────────────────────────────
// Endpoints protegidos con la sesión de la administración del repositorio
// (cookie repositorio_sesion + X-CSRF-Token en el POST). Los errores son JSON
// { codigo, mensaje } como el resto de /api/repositorio/admin: 401 sin
// sesión, 403 sin token CSRF o desde otro sitio, 409 si ya hay una
// reindexación en curso (o el indexador no está compilado), 503 si la base
// no está disponible.

export type EstadoReindexacion = 'inactiva' | 'en_curso' | 'completada' | 'fallida';

export interface EstadoIndiceAdmin {
  /** El índice que tiene hoy el servidor (archivo ODES_INDICE). */
  indice: {
    disponible: boolean;
    /** Fecha ISO en que se generó, o null. */
    generado: string | null;
    /** De dónde salió: la base de datos o el paquete de datos (null si no hay índice o es antiguo). */
    origen: 'mysql' | 'paquete' | null;
    documentos: number;
    documentosConTexto: number;
    paginas: number;
    paginasOcr: number;
    /** Tamaño del archivo en bytes. */
    bytes: number;
    /** Si no se pudo leer: el motivo, apto para mostrar. */
    error: string | null;
  };
  /** La base de datos del repositorio, comparada con el índice. */
  repositorio: {
    /** Documentos publicados ahora (null si no se pudo consultar). */
    publicados: number | null;
    /** ISO de la última modificación del repositorio, o null. */
    actualizado: string | null;
    /**
     * true si el índice no refleja lo publicado hoy (hubo cambios después de
     * generarlo, se generó desde el paquete o no existe): conviene reindexar.
     * null si no se pudo consultar la base.
     */
    cambiado: boolean | null;
    /** Explicación corta de `cambiado`, apta para mostrar, o null. */
    motivo: string | null;
  };
  /** La última reindexación pedida desde la administración (o la que esté en curso). */
  reindexacion: {
    estado: EstadoReindexacion;
    /** ISO de inicio y fin, o null. */
    inicio: string | null;
    fin: string | null;
    /** Usuario de la administración que la pidió (null si la inició otro proceso). */
    usuario: string | null;
    /** Si falló: el motivo, apto para mostrar (p. ej. faltan herramientas). */
    error: string | null;
    /** Últimas líneas del registro del indexador (progreso), las más recientes al final. */
    registro: string[];
  };
}
