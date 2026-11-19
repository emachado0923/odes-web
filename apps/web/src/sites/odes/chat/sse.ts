/**
 * Lector de Server-Sent Events para el flujo de POST /api/odes/chat.
 *
 * EventSource no admite POST, así que el cliente lee el cuerpo con fetch +
 * ReadableStream y le pasa aquí el texto ya decodificado, trozo a trozo. Los
 * trozos llegan cortados en cualquier parte (a mitad de una línea, entre "\r"
 * y "\n", o con varios eventos juntos), así que el lector guarda lo pendiente
 * entre llamadas.
 *
 * Sigue el formato de la especificación de SSE (HTML Living Standard,
 * "Interpreting an event stream"), reducido a lo que usa el protocolo:
 * - Las líneas terminan en "\n", "\r\n" o "\r".
 * - Una línea vacía cierra el evento en curso.
 * - Las líneas que empiezan por ":" son comentarios (el ": ping" del servidor).
 * - Varias líneas `data:` de un mismo evento se unen con "\n".
 * - `event:`, `id:`, `retry:` y cualquier otro campo se ignoran: el tipo va
 *   dentro del JSON.
 */
export class LectorSSE {
  /** Texto recibido que todavía no termina en fin de línea. */
  private pendiente = ''
  /** Líneas `data:` del evento en curso. */
  private datos: string[] = []
  /** El trozo anterior terminó en "\r": si el siguiente empieza por "\n", es el mismo salto. */
  private crPendiente = false
  private readonly alMensaje: (datos: string) => void
  private readonly longitudMaxima: number

  /**
   * @param alMensaje recibe el contenido de cada evento completo (las líneas
   *   `data:` unidas). Un evento sin `data:` no se entrega.
   * @param longitudMaxima tope de una línea sin terminar; si se supera (un
   *   servidor roto que nunca manda "\n"), se descarta para no crecer sin fin.
   */
  constructor(alMensaje: (datos: string) => void, longitudMaxima = 1_000_000) {
    this.alMensaje = alMensaje
    this.longitudMaxima = longitudMaxima
  }

  /** Agrega un trozo de texto del flujo. */
  agregar(trozo: string): void {
    let texto = trozo
    if (this.crPendiente) {
      this.crPendiente = false
      if (texto.startsWith('\n')) texto = texto.slice(1)
    }
    texto = this.pendiente + texto
    this.pendiente = ''

    let inicio = 0
    for (let i = 0; i < texto.length; i++) {
      const codigo = texto.charCodeAt(i)
      if (codigo !== 10 && codigo !== 13) continue
      this.procesarLinea(texto.slice(inicio, i))
      if (codigo === 13) {
        if (i + 1 < texto.length) {
          if (texto.charCodeAt(i + 1) === 10) i++
        } else {
          this.crPendiente = true
        }
      }
      inicio = i + 1
    }

    const resto = texto.slice(inicio)
    this.pendiente = resto.length > this.longitudMaxima ? '' : resto
  }

  /**
   * Fin del flujo. La especificación descarta un evento al que le falta la
   * línea vacía final; aquí se entrega igual (si su JSON está completo sirve,
   * y si quedó cortado, el intérprete lo ignora).
   */
  terminar(): void {
    if (this.pendiente !== '') {
      this.procesarLinea(this.pendiente)
      this.pendiente = ''
    }
    this.crPendiente = false
    this.despachar()
  }

  private procesarLinea(linea: string): void {
    if (linea === '') {
      this.despachar()
      return
    }
    if (linea.startsWith(':')) return

    const dosPuntos = linea.indexOf(':')
    const campo = dosPuntos === -1 ? linea : linea.slice(0, dosPuntos)
    if (campo !== 'data') return

    let valor = dosPuntos === -1 ? '' : linea.slice(dosPuntos + 1)
    if (valor.startsWith(' ')) valor = valor.slice(1)
    this.datos.push(valor)
  }

  private despachar(): void {
    if (this.datos.length === 0) return
    const datos = this.datos.join('\n')
    this.datos = []
    this.alMensaje(datos)
  }
}
