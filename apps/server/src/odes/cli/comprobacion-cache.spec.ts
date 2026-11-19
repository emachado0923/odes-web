import { describe, expect, it } from 'vitest';
import { type ResumenRespuesta, type UsoTokens, usoVacio } from '../chat/motor-ia.js';
import { mensajeCache } from './comprobacion-cache.js';

function resumen(total: Partial<UsoTokens>, primera: Partial<UsoTokens> | null): ResumenRespuesta {
  return {
    resultado: 'completo',
    llamadas: 2,
    herramientas: 1,
    modeloServido: 'claude-opus-5-5',
    respaldo: false,
    uso: { ...usoVacio(), ...total },
    usoPrimeraLlamada: primera ? { ...usoVacio(), ...primera } : null,
  };
}

describe('mensajeCache (odes:probar --dos-veces)', () => {
  it('OK solo si la primera llamada de la segunda pregunta leyó caché', () => {
    const primera = resumen({ cacheLectura: 1867, cacheEscritura: 1867 }, { cacheEscritura: 1867 });
    expect(mensajeCache(primera, resumen({ cacheLectura: 3734 }, { cacheLectura: 1867 }))).toMatch(/OK .*1867 tokens/);
  });

  it('avisa aunque el total de la segunda pregunta haya leído caché (lectura dentro de la misma pregunta)', () => {
    // Prefijo cambiado entre preguntas: la primera llamada vuelve a escribir y
    // solo la segunda llamada (de la misma pregunta) lee.
    const primera = resumen({ cacheLectura: 1867, cacheEscritura: 1867 }, { cacheEscritura: 1867 });
    const segunda = resumen({ cacheLectura: 1900, cacheEscritura: 1900 }, { cacheLectura: 0, cacheEscritura: 1900 });
    expect(mensajeCache(primera, segunda)).toMatch(/^\nAVISO: la primera llamada/);
  });

  it('sin llamadas a la API no se puede comprobar', () => {
    expect(mensajeCache(resumen({}, null), resumen({}, null))).toMatch(/no se pudo comprobar/);
  });
});
