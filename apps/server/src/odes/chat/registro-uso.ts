import { createHmac, randomBytes } from 'node:crypto';
import type { ModoAsistente } from './protocolo.js';
import type { ResumenRespuesta } from './motor-ia.js';

/**
 * Seudónimo de una IP: HMAC-SHA256 con una sal aleatoria por proceso. Sirve
 * para el registro y como `metadata.user_id` (Anthropic lo usa para detectar
 * abusos) sin guardar ni enviar la IP. Cambia en cada reinicio.
 */
const SAL = randomBytes(32);

export function seudonimoIp(ip: string): string {
  return createHmac('sha256', SAL).update(ip).digest('base64url').slice(0, 16);
}

/**
 * Una línea por pregunta, sin contenido de mensajes ni IP en claro:
 * modo, modelo, llamadas, herramientas, tokens (entrada, salida, lectura y
 * escritura de caché), duración y resultado.
 */
export function lineaRegistro(
  modo: ModoAsistente,
  modelo: string | null,
  resumen: ResumenRespuesta,
  duracionMs: number,
  usuario: string,
): string {
  const campos: Array<[string, string | number]> = [
    ['modo', modo],
    ['resultado', resumen.detalle ? `${resumen.resultado}:${resumen.detalle}` : resumen.resultado],
  ];
  if (modo === 'ia') {
    campos.push(
      ['modelo', modelo ?? '-'],
      ['servido_por', resumen.modeloServido ?? '-'],
      ['respaldo', resumen.respaldo ? 'si' : 'no'],
      ['llamadas', resumen.llamadas],
      ['herramientas', resumen.herramientas],
      ['tokens_entrada', resumen.uso.entrada],
      ['tokens_salida', resumen.uso.salida],
      ['cache_lectura', resumen.uso.cacheLectura],
      ['cache_escritura', resumen.uso.cacheEscritura],
    );
  }
  campos.push(['duracion_ms', Math.round(duracionMs)], ['usuario', usuario]);
  return `chat ${campos.map(([clave, valor]) => `${clave}=${valor}`).join(' ')}`;
}
