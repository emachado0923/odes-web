/**
 * Estado de la conversación del Asistente ODES: tipos, reductor puro,
 * historial que se envía al servidor y guardado en sessionStorage.
 *
 * Flujo (como BelloEduca): saludo → "¿Cuál es tu nombre?" → bienvenida con
 * sugerencias → chat libre. Los mensajes de bienvenida no se guardan como
 * entradas: se dibujan a partir de `saludo`, `etapa` y `nombre`, y por eso
 * nunca forman parte del historial que viaja al servidor.
 */
import type {
  DocumentoEncontrado,
  DocumentoResumen,
  EventoChat,
  MensajeChat,
  ModoAsistente,
} from './protocolo'
import { LIMITES_CHAT, MARCA_CITA, PATRON_MARCA_CITA } from './protocolo'
import { sanitizarNombre } from './nombre'
import type { ErrorSolicitudChat } from './cliente'
import { MENSAJES_POR_DEFECTO } from './cliente'

// ── Tipos ────────────────────────────────────────────────────────────────

export interface Busqueda {
  herramienta: 'buscar' | 'listar' | 'leer'
  descripcion: string
  /**
   * Largo del texto de la respuesta cuando llegó. Si sigue igual, es lo que
   * el asistente está haciendo ahora mismo (ver pasoActual).
   */
  posicion: number
}

export interface Fuente {
  indice: number
  documento: DocumentoResumen
  paginaInicio: number | null
  paginaFin: number | null
  url: string
  textoCitado: string
}

export interface GrupoDocumentos {
  titulo: string
  documentos: DocumentoEncontrado[]
}

/** Códigos del protocolo más dos propios del navegador: red caída y flujo cortado. */
export type CodigoError = ErrorSolicitudChat['codigo'] | 'cortado'

export interface ErrorRespuesta {
  codigo: CodigoError
  mensaje: string
  /** Momento (epoch ms) desde el que se puede reintentar, si el servidor pidió esperar. */
  reintentarDesde: number | null
}

export type EstadoRespuesta =
  | 'esperando' // enviada, sin eventos todavía
  | 'buscando' // consultando el repositorio
  | 'escribiendo' // llegan fragmentos de texto
  | 'completa'
  | 'cortada' // fin por límite de tokens
  | 'rechazada' // el modelo declinó responder
  | 'detenida' // la persona la detuvo (o se recargó la página a mitad)
  | 'error'

export const ESTADOS_EN_CURSO: ReadonlySet<EstadoRespuesta> = new Set(['esperando', 'buscando', 'escribiendo'])

export interface MensajeUsuario {
  tipo: 'usuario'
  id: string
  texto: string
}

export interface RespuestaAsistente {
  tipo: 'asistente'
  id: string
  /** id del MensajeUsuario que contesta. */
  idPregunta: string
  estado: EstadoRespuesta
  modo: ModoAsistente | null
  /** Markdown acumulado, con las marcas de cita (⟦n⟧) donde llegó cada evento `cita`. */
  texto: string
  fuentes: Fuente[]
  busquedas: Busqueda[]
  documentos: GrupoDocumentos[]
  error: ErrorRespuesta | null
}

export type Entrada = MensajeUsuario | RespuestaAsistente

export interface Conversacion {
  version: 1
  /** "¡Buenos días!"…, fijado al empezar para que no cambie al recargar. */
  saludo: string
  etapa: 'nombre' | 'chat'
  /** Nombre ya sanitizado; null si todavía no responde o prefirió no decirlo. */
  nombre: string | null
  entradas: Entrada[]
}

export type Accion =
  /** nombre = null: "Prefiero no decirlo". */
  | { tipo: 'nombre'; nombre: string | null }
  | {
      tipo: 'preguntar'
      idPregunta: string
      idRespuesta: string
      texto: string
      /** Reintento: id de la respuesta fallida que se quita (con su pregunta) antes de agregar la nueva. */
      reemplaza?: string
    }
  | { tipo: 'evento'; idRespuesta: string; evento: EventoChat }
  | { tipo: 'fallo'; idRespuesta: string; error: ErrorRespuesta }
  | { tipo: 'detener'; idRespuesta: string }
  | { tipo: 'reiniciar'; saludo: string }

// ── Creación ─────────────────────────────────────────────────────────────

export function conversacionNueva(saludo: string): Conversacion {
  return { version: 1, saludo, etapa: 'nombre', nombre: null, entradas: [] }
}

function respuestaNueva(id: string, idPregunta: string): RespuestaAsistente {
  return {
    tipo: 'asistente',
    id,
    idPregunta,
    estado: 'esperando',
    modo: null,
    texto: '',
    fuentes: [],
    busquedas: [],
    documentos: [],
    error: null,
  }
}

let contadorIds = 0

/**
 * Identificador corto y único en la pestaña. No usa crypto.randomUUID porque
 * solo existe en contextos seguros (https o localhost) y el sitio también
 * puede servirse por http plano en la red interna.
 */
export function nuevoId(): string {
  contadorIds += 1
  return `m${Date.now().toString(36)}${contadorIds.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ── Reductor ─────────────────────────────────────────────────────────────

export function estaEnCurso(respuesta: RespuestaAsistente): boolean {
  return ESTADOS_EN_CURSO.has(respuesta.estado)
}

/**
 * Lo que el asistente hace en este momento, para mostrarlo en vivo (una sola
 * línea que cambia, no la lista de pasos):
 * - la última consulta al repositorio, si después no llegó más texto;
 * - `{ numero: 0, busqueda: null }` mientras prepara la respuesta sin haber
 *   consultado nada todavía;
 * - null si ya está escribiendo o si la respuesta terminó.
 */
export function pasoActual(respuesta: RespuestaAsistente): { numero: number; busqueda: Busqueda | null } | null {
  if (!estaEnCurso(respuesta)) return null
  const ultima = respuesta.busquedas.at(-1)
  if (ultima && ultima.posicion === respuesta.texto.length) return { numero: respuesta.busquedas.length, busqueda: ultima }
  return respuesta.texto === '' ? { numero: 0, busqueda: null } : null
}

/** Aplica un evento del flujo a una respuesta. Las respuestas ya terminadas no cambian. */
export function aplicarEvento(respuesta: RespuestaAsistente, evento: EventoChat): RespuestaAsistente {
  if (!estaEnCurso(respuesta)) return respuesta

  switch (evento.tipo) {
    case 'inicio':
      return { ...respuesta, modo: evento.modo }

    case 'busqueda':
      return {
        ...respuesta,
        estado: respuesta.texto === '' ? 'buscando' : respuesta.estado,
        busquedas: [
          ...respuesta.busquedas,
          { herramienta: evento.herramienta, descripcion: evento.descripcion, posicion: respuesta.texto.length },
        ],
      }

    case 'texto':
      if (evento.delta === '') return respuesta
      return { ...respuesta, estado: 'escribiendo', texto: respuesta.texto + evento.delta }

    case 'cita': {
      const marca = MARCA_CITA(evento.indice)
      const conocida = respuesta.fuentes.some((f) => f.indice === evento.indice)
      const fuentes = conocida
        ? respuesta.fuentes
        : [
            ...respuesta.fuentes,
            {
              indice: evento.indice,
              documento: evento.documento,
              paginaInicio: evento.paginaInicio,
              paginaFin: evento.paginaFin,
              url: evento.url,
              textoCitado: evento.textoCitado,
            },
          ].sort((a, b) => a.indice - b.indice)
      // La misma fuente citada dos veces seguidas en el mismo punto: una sola marca.
      const texto = respuesta.texto.endsWith(marca) ? respuesta.texto : respuesta.texto + marca
      return { ...respuesta, fuentes, texto }
    }

    case 'documentos':
      return {
        ...respuesta,
        documentos: [...respuesta.documentos, { titulo: evento.titulo, documentos: evento.documentos }],
      }

    case 'fin':
      // Rechazo a mitad del flujo: lo que ya llegó se descarta (la guía de la
      // API pide no tratar esa salida parcial como completa). Así en pantalla
      // queda un solo aviso (MENSAJE_RECHAZO, no también el texto del
      // servidor) y el intercambio no vuelve a viajar en el historial.
      if (evento.motivo === 'rechazo') return { ...respuesta, estado: 'rechazada', texto: '', fuentes: [] }
      return { ...respuesta, estado: evento.motivo === 'limite_tokens' ? 'cortada' : 'completa' }

    case 'error':
      return {
        ...respuesta,
        estado: 'error',
        error: {
          codigo: evento.codigo,
          mensaje: evento.mensaje || MENSAJES_POR_DEFECTO[evento.codigo],
          reintentarDesde: null,
        },
      }
  }
}

function actualizarRespuesta(
  conversacion: Conversacion,
  id: string,
  cambio: (respuesta: RespuestaAsistente) => RespuestaAsistente,
): Conversacion {
  let cambiada = false
  const entradas = conversacion.entradas.map((entrada) => {
    if (entrada.tipo !== 'asistente' || entrada.id !== id) return entrada
    const nueva = cambio(entrada)
    if (nueva !== entrada) cambiada = true
    return nueva
  })
  return cambiada ? { ...conversacion, entradas } : conversacion
}

/** Quita una respuesta y la pregunta que contesta. */
export function quitarIntercambio(entradas: Entrada[], idRespuesta: string): Entrada[] {
  const respuesta = entradas.find((e): e is RespuestaAsistente => e.tipo === 'asistente' && e.id === idRespuesta)
  if (!respuesta) return entradas
  return entradas.filter((e) => e.id !== idRespuesta && e.id !== respuesta.idPregunta)
}

export function reducirConversacion(conversacion: Conversacion, accion: Accion): Conversacion {
  switch (accion.tipo) {
    case 'nombre': {
      if (conversacion.etapa !== 'nombre') return conversacion
      const nombre = accion.nombre === null ? null : sanitizarNombre(accion.nombre) || null
      return { ...conversacion, etapa: 'chat', nombre }
    }

    case 'preguntar': {
      const base = accion.reemplaza
        ? quitarIntercambio(conversacion.entradas, accion.reemplaza)
        : conversacion.entradas
      return {
        ...conversacion,
        etapa: 'chat',
        entradas: [
          ...base,
          { tipo: 'usuario', id: accion.idPregunta, texto: accion.texto },
          respuestaNueva(accion.idRespuesta, accion.idPregunta),
        ],
      }
    }

    case 'evento':
      return actualizarRespuesta(conversacion, accion.idRespuesta, (r) => aplicarEvento(r, accion.evento))

    case 'fallo':
      return actualizarRespuesta(conversacion, accion.idRespuesta, (r) =>
        estaEnCurso(r) ? { ...r, estado: 'error', error: accion.error } : r,
      )

    case 'detener':
      return actualizarRespuesta(conversacion, accion.idRespuesta, (r) =>
        estaEnCurso(r) ? { ...r, estado: 'detenida' } : r,
      )

    case 'reiniciar':
      return conversacionNueva(accion.saludo)
  }
}

// ── Historial que se envía ───────────────────────────────────────────────

export function quitarMarcas(texto: string): string {
  return texto.replace(PATRON_MARCA_CITA, '')
}

/**
 * Historial de texto para POST /api/odes/chat: pares pregunta/respuesta
 * anteriores (sin marcas de cita) y la pregunta nueva al final.
 *
 * - Solo viajan preguntas y respuestas: nunca los mensajes de bienvenida,
 *   así que el nombre de la persona no sale del navegador.
 * - Una pregunta sin respuesta útil (error, detenida sin texto) se omite con
 *   su respuesta, para que los roles sigan alternándose.
 * - Una pregunta que el modelo rechazó tampoco viaja (ni lo que alcanzó a
 *   escribir antes): repetirla en cada petición haría que se declinaran
 *   también las preguntas siguientes.
 * - Respeta LIMITES_CHAT: recorta cada texto a su máximo y descarta los
 *   pares más antiguos hasta caber en maxMensajes.
 */
export function construirHistorial(entradas: Entrada[], pregunta: string): MensajeChat[] {
  const preguntas = new Map<string, string>()
  const pares: [MensajeChat, MensajeChat][] = []

  for (const entrada of entradas) {
    if (entrada.tipo === 'usuario') {
      preguntas.set(entrada.id, entrada.texto)
      continue
    }
    // Las rechazadas ya no tienen texto (ver aplicarEvento y entradaValida);
    // esto lo garantiza aunque cambie cómo se guardan.
    if (entrada.estado === 'rechazada') continue
    const textoPregunta = preguntas.get(entrada.idPregunta)
    const textoRespuesta = quitarMarcas(entrada.texto).trim()
    if (textoPregunta === undefined || textoRespuesta === '') continue
    pares.push([
      { rol: 'usuario', texto: textoPregunta.slice(0, LIMITES_CHAT.maxCaracteresUsuario) },
      { rol: 'asistente', texto: textoRespuesta.slice(0, LIMITES_CHAT.maxCaracteresAsistente) },
    ])
  }

  const maxPares = Math.floor((LIMITES_CHAT.maxMensajes - 1) / 2)
  return [
    ...pares.slice(Math.max(0, pares.length - maxPares)).flat(),
    { rol: 'usuario', texto: pregunta.slice(0, LIMITES_CHAT.maxCaracteresUsuario) },
  ]
}

// ── Markdown a medio llegar ──────────────────────────────────────────────

/**
 * Mientras llega la respuesta, el último fragmento puede dejar Markdown sin
 * cerrar ("- **"), que se vería como asteriscos sueltos o una viñeta vacía.
 * Se ocultan esos restos del final hasta que llegue el texto que los completa.
 */
export function suavizarMarkdownParcial(texto: string): string {
  return texto
    .replace(/[*_~`]+$/, '')
    .replace(/(^|\n)[ \t]*(?:[-*+]|\d+[.)]|#{1,6}|>)?[ \t]*$/, '$1')
    .trimEnd()
}

// ── Texto plano (para anunciar con el lector de pantalla) ────────────────

/** Versión aproximada en texto plano de un Markdown corto: sin marcas de cita ni sintaxis. */
export function textoPlano(markdown: string): string {
  return quitarMarcas(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Guardado en sessionStorage ───────────────────────────────────────────

export const CLAVE_ALMACEN = 'odes:conversacion'
/** Entradas que se guardan como máximo (las más recientes). */
const MAX_ENTRADAS_GUARDADAS = 60

/** Guarda la conversación. Falla en silencio (modo privado, cuota llena, almacenamiento bloqueado). */
export function guardarConversacion(conversacion: Conversacion, almacen: Storage | undefined = obtenerAlmacen()): void {
  if (!almacen) return
  try {
    let entradas = conversacion.entradas.slice(-MAX_ENTRADAS_GUARDADAS)
    // No empezar con una respuesta huérfana.
    if (entradas[0]?.tipo === 'asistente') entradas = entradas.slice(1)
    almacen.setItem(CLAVE_ALMACEN, JSON.stringify({ ...conversacion, entradas }))
  } catch {
    // Sin almacenamiento la conversación sigue funcionando; solo no sobrevive a una recarga.
  }
}

export function borrarConversacion(almacen: Storage | undefined = obtenerAlmacen()): void {
  try {
    almacen?.removeItem(CLAVE_ALMACEN)
  } catch {
    // Igual que arriba.
  }
}

function obtenerAlmacen(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function entradaValida(valor: unknown): Entrada | null {
  if (!esObjeto(valor) || typeof valor.id !== 'string') return null
  if (valor.tipo === 'usuario') {
    return typeof valor.texto === 'string' ? { tipo: 'usuario', id: valor.id, texto: valor.texto } : null
  }
  if (
    valor.tipo !== 'asistente' ||
    typeof valor.idPregunta !== 'string' ||
    typeof valor.texto !== 'string' ||
    !Array.isArray(valor.fuentes) ||
    !Array.isArray(valor.busquedas) ||
    !Array.isArray(valor.documentos)
  ) {
    return null
  }
  const respuesta = valor as unknown as RespuestaAsistente
  // Una respuesta que estaba llegando cuando se recargó la página ya no va a terminar.
  if (estaEnCurso(respuesta)) return { ...respuesta, estado: 'detenida' }
  // Una versión anterior guardaba lo que alcanzó a llegar antes del rechazo.
  if (respuesta.estado === 'rechazada' && (respuesta.texto || respuesta.fuentes.length)) {
    return { ...respuesta, texto: '', fuentes: [] }
  }
  return respuesta
}

/** Conversación guardada en esta pestaña, o null si no hay o no se puede leer. */
export function cargarConversacion(almacen: Storage | undefined = obtenerAlmacen()): Conversacion | null {
  let valor: unknown
  try {
    const texto = almacen?.getItem(CLAVE_ALMACEN)
    if (!texto) return null
    valor = JSON.parse(texto)
  } catch {
    return null
  }
  if (
    !esObjeto(valor) ||
    valor.version !== 1 ||
    typeof valor.saludo !== 'string' ||
    (valor.etapa !== 'nombre' && valor.etapa !== 'chat') ||
    !Array.isArray(valor.entradas)
  ) {
    return null
  }
  const nombre = typeof valor.nombre === 'string' ? sanitizarNombre(valor.nombre) || null : null
  const entradas = valor.entradas.map(entradaValida).filter((e): e is Entrada => e !== null)
  return { version: 1, saludo: valor.saludo, etapa: valor.etapa, nombre, entradas }
}
