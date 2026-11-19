/**
 * Utilidades para las pruebas del chat (no se usan en la aplicación).
 * Simulan las respuestas del servidor según protocolo.ts.
 */
import type { DocumentoEncontrado, DocumentoResumen, EstadoAsistente, EventoChat } from './protocolo'

export const DOCUMENTO: DocumentoResumen = {
  id: 'estudio-panorama-desercion-2023',
  titulo: 'Panorama de la deserción de personas beneficiarias de los programas de Sapiencia en 2023',
  categoria: 'Estudio',
  anio: '2023',
  idioma: 'es',
  tipo: 'pdf',
  url: 'https://sapiencia.gov.co/wp-content/uploads/panorama-desercion-2023.pdf',
  portada: 'estudio-panorama-desercion-2023.webp',
}

export const DOCUMENTO_EN: DocumentoResumen = {
  id: 'infografia-en-continuity-rate',
  titulo: 'Continuity rate from high school to higher education',
  categoria: 'Infografía',
  anio: 'S. F.',
  idioma: 'en',
  tipo: 'imagen',
  url: 'https://sapiencia.gov.co/wp-content/uploads/continuity-rate.png',
}

export const DOCUMENTO_ENCONTRADO: DocumentoEncontrado = {
  ...DOCUMENTO,
  urlFragmento: `${DOCUMENTO.url}#page=4`,
  paginaInicio: 4,
  paginaFin: 5,
  extracto: 'La deserción anual fue del 9,8 %.',
}

const estado = (modo: EstadoAsistente['modo'], disponible = true): EstadoAsistente => ({
  asistente: 'Asistente ODES',
  modo,
  repositorio: { disponible, documentos: 372, documentosConTexto: 290, generado: '2026-10-08T05:00:00.000Z' },
})

export const ESTADO_IA = estado('ia')
export const ESTADO_BUSQUEDA = estado('busqueda')
export const ESTADO_SIN_REPOSITORIO = estado('ia', false)

/** Línea SSE de un evento. */
export const sse = (evento: EventoChat): string => `data: ${JSON.stringify(evento)}\n\n`

export function respuestaJson(cuerpo: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  })
}

export interface OpcionesSSE {
  /** Parte el cuerpo en trozos de este tamaño en bytes (por defecto, un solo trozo). */
  tamanoTrozo?: number
  /** Deja el flujo abierto; con `alCrear` se recibe una función para seguir enviando texto y otra para cerrarlo. */
  abierto?: boolean
  alCrear?: (empujar: (texto: string) => void, cerrar: () => void) => void
}

/** Respuesta text/event-stream con el texto dado. */
export function respuestaSSE(texto: string, { tamanoTrozo, abierto = false, alCrear }: OpcionesSSE = {}): Response {
  const codificador = new TextEncoder()
  const cuerpo = new ReadableStream<Uint8Array>({
    start(control) {
      const bytes = codificador.encode(texto)
      const paso = tamanoTrozo ?? Math.max(bytes.length, 1)
      for (let i = 0; i < bytes.length; i += paso) control.enqueue(bytes.slice(i, i + paso))
      if (abierto) {
        alCrear?.(
          (mas) => control.enqueue(codificador.encode(mas)),
          () => control.close(),
        )
      } else {
        control.close()
      }
    },
  })
  return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}
