import type { ResumenRespuesta } from '../chat/motor-ia.js';

/**
 * Veredicto de --dos-veces. Solo cuenta la primera llamada de la segunda
 * pregunta: es la única que no puede leer lo que escribió la misma pregunta.
 */
export function mensajeCache(primera: ResumenRespuesta, segunda: ResumenRespuesta): string {
  const leidos = segunda.usoPrimeraLlamada?.cacheLectura ?? 0;
  if (segunda.usoPrimeraLlamada === null || primera.usoPrimeraLlamada === null) {
    return '\nAVISO: no se pudo comprobar la caché (alguna de las dos preguntas no llegó a llamar a la API).\n';
  }
  if (leidos > 0) {
    return `\nCaché de prompts entre peticiones: OK (la primera llamada de la segunda pregunta leyó ${leidos} tokens de caché).\n`;
  }
  return (
    '\nAVISO: la primera llamada de la segunda pregunta no leyó nada de la caché: el prefijo cambió entre ' +
    'peticiones. Revise que el prompt de sistema y las herramientas sean idénticos byte a byte (y que no hayan ' +
    'pasado más de 5 minutos).\n'
  );
}
