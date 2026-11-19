import { open } from 'node:fs/promises';

/**
 * Acceso aleatorio a los bytes de un archivo (en disco o en memoria), para
 * leer cabeceras y el directorio central de un ZIP sin cargar todo.
 */
export interface FuenteBytes {
  readonly tamano: number;
  /** Lee hasta `longitud` bytes desde `posicion` (menos si se acaba el archivo). */
  leer(posicion: number, longitud: number): Promise<Buffer>;
}

export function fuenteDeBuffer(datos: Buffer): FuenteBytes {
  return {
    tamano: datos.length,
    leer: (posicion, longitud) =>
      Promise.resolve(
        datos.subarray(
          Math.max(0, posicion),
          Math.min(datos.length, posicion + longitud),
        ),
      ),
  };
}

/** Abre un archivo y entrega la fuente; lo cierra al terminar `accion`. */
export async function conFuenteDeArchivo<T>(
  ruta: string,
  accion: (fuente: FuenteBytes) => Promise<T>,
): Promise<T> {
  const manejador = await open(ruta, 'r');
  try {
    const { size } = await manejador.stat();
    const fuente: FuenteBytes = {
      tamano: size,
      async leer(posicion, longitud) {
        const inicio = Math.max(0, posicion);
        const cantidad = Math.max(0, Math.min(longitud, size - inicio));
        const buffer = Buffer.alloc(cantidad);
        let leidos = 0;
        while (leidos < cantidad) {
          const { bytesRead } = await manejador.read(
            buffer,
            leidos,
            cantidad - leidos,
            inicio + leidos,
          );
          if (bytesRead === 0) break;
          leidos += bytesRead;
        }
        return buffer.subarray(0, leidos);
      },
    };
    return await accion(fuente);
  } finally {
    await manejador.close();
  }
}
