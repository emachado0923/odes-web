import type { Response } from 'express';
import type { EventoChat } from './protocolo.js';

/** Cada cuánto se envía el comentario `: ping` para que proxies y navegadores no corten la conexión. */
export const INTERVALO_PING_MS = 15_000;

/**
 * Flujo Server-Sent Events sobre una respuesta de Express.
 *
 * - `Cache-Control: no-cache, no-transform`: el middleware `compression` NO
 *   comprime respuestas con `no-transform` (ver shouldTransform en
 *   compression), así que cada evento sale en cuanto se escribe en lugar de
 *   quedarse en el búfer de gzip. nginx y otros proxies tampoco lo tocan.
 * - `X-Accel-Buffering: no`: nginx no acumula la respuesta.
 * - Las cabeceras se envían de inmediato (flushHeaders).
 * - Si el cliente se va, `senal` se aborta y no se escribe nada más.
 */
export class EscritorSse {
  readonly #res: Response;
  readonly #control = new AbortController();
  #temporizador: NodeJS.Timeout | null = null;
  #terminado = false;

  constructor(res: Response, intervaloPingMs = INTERVALO_PING_MS) {
    this.#res = res;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // Sin Nagle: cada evento sale en su propio paquete, sin esperar.
    res.socket?.setNoDelay(true);
    res.on('close', () => {
      // 'close' llega también tras un end() normal; solo cuenta como
      // desconexión si la respuesta no había terminado.
      if (!this.#terminado) this.#control.abort('cliente_desconectado');
      this.#detenerPing();
      this.#terminado = true;
    });
    this.#temporizador = setInterval(() => this.#escribir(': ping\n\n'), intervaloPingMs);
    this.#temporizador.unref();
  }

  /** Se aborta si el cliente cierra la conexión antes de terminar. */
  get senal(): AbortSignal {
    return this.#control.signal;
  }

  /** true si el cliente se fue o el flujo ya terminó. */
  get cerrado(): boolean {
    return this.#terminado || this.#res.destroyed || this.#res.writableEnded;
  }

  /** Envía un evento. Devuelve false (y no escribe) si el flujo ya está cerrado. */
  enviar(evento: EventoChat): boolean {
    return this.#escribir(`data: ${JSON.stringify(evento)}\n\n`);
  }

  terminar(): void {
    this.#detenerPing();
    if (this.cerrado) return;
    this.#terminado = true;
    this.#res.end();
  }

  #escribir(texto: string): boolean {
    if (this.cerrado) return false;
    this.#res.write(texto);
    return true;
  }

  #detenerPing(): void {
    if (this.#temporizador) clearInterval(this.#temporizador);
    this.#temporizador = null;
  }
}
