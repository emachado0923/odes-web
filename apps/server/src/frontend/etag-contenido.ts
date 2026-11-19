import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, type Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * ETag por contenido para los archivos del build que no llevan hash en el
 * nombre (/sivu/edificiofinal.glb, /sivu/draco/*, favicon...).
 *
 * express.static arma el ETag con el tamaño y la fecha de modificación, pero
 * Vite (public/ -> dist/) y copiar-draco.mjs copian los archivos sin conservar
 * esa fecha. Así, cada `npm run build` cambiaba el ETag aunque el contenido
 * fuera idéntico, y después de cada despliegue todos los visitantes volvían a
 * bajar los ~10,7 MB del modelo en vez de recibir un 304. Con un hash del
 * contenido, el ETag solo cambia cuando cambia el archivo.
 *
 * Es un ETag débil (W/) porque compression envía la misma cabecera con gzip y
 * sin gzip (por ejemplo para el .wasm de Draco). If-None-Match compara en modo
 * débil, así que la revalidación con 304 funciona igual.
 *
 * Cada hash se calcula una vez por archivo y versión (ruta + tamaño + mtime) y
 * queda en memoria. `precalcular()` los calcula en segundo plano al arrancar,
 * para que la primera petición no tenga que leer el archivo completo.
 */
export interface EtagPorContenido {
  /**
   * ETag del archivo que send está por enviar, o `undefined` si no se pudo
   * leer (send responderá el error al intentar abrirlo).
   */
  obtener(ruta: string, estado: Stats): string | undefined;
  /**
   * Calcula en segundo plano los ETag de `directorio`, salvo los archivos
   * dentro de las carpetas de primer nivel indicadas en `excluir`. Nunca
   * rechaza: un archivo ilegible se omite y se resuelve al pedirlo.
   */
  precalcular(directorio: string, excluir?: readonly string[]): Promise<void>;
}

export function crearEtagPorContenido(): EtagPorContenido {
  const cache = new Map<string, { version: string; etag: string }>();

  const guardar = (ruta: string, version: string, hash: string): string => {
    const etag = `W/"${hash}"`;
    cache.set(ruta, { version, etag });
    return etag;
  };

  return {
    obtener(ruta, estado) {
      const version = versionDe(estado);
      const guardado = cache.get(ruta);
      if (guardado?.version === version) return guardado.etag;
      try {
        // Solo pasa si precalcular() aún no llegó a este archivo o si se
        // reemplazó sin reiniciar el servidor: una lectura por versión.
        return guardar(ruta, version, hashDe(readFileSync(ruta)));
      } catch {
        return undefined;
      }
    },

    async precalcular(directorio, excluir = []) {
      let entradas;
      try {
        entradas = await readdir(directorio, {
          recursive: true,
          withFileTypes: true,
        });
      } catch {
        return; // sin build: no hay nada que calcular
      }
      for (const entrada of entradas) {
        if (!entrada.isFile()) continue;
        const ruta = join(entrada.parentPath, entrada.name);
        const partes = relative(directorio, ruta).split(sep);
        if (
          excluir.includes(partes[0]) ||
          partes.some((p) => p.startsWith('.'))
        )
          continue;
        try {
          const antes = versionDe(await stat(ruta));
          if (cache.get(ruta)?.version === antes) continue;
          const hash = await hashDeArchivo(ruta);
          // Si cambió mientras se leía, se deja para obtener().
          if (versionDe(await stat(ruta)) === antes) guardar(ruta, antes, hash);
        } catch {
          // Ilegible o borrado: obtener() lo intentará al pedirlo.
        }
      }
    },
  };
}

/** Cambia con cualquier escritura o reemplazo del archivo (ctime incluido). */
function versionDe(estado: Stats): string {
  return `${estado.size}-${estado.mtimeMs}-${estado.ctimeMs}-${estado.ino}`;
}

function hashDe(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('base64url');
}

async function hashDeArchivo(ruta: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const parte of createReadStream(ruta))
    hash.update(parte as Buffer);
  return hash.digest('base64url');
}
