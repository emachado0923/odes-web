import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RegistroFuente } from './fuente.js';
import type { Limitador } from './limitador.js';

/**
 * Miniaturas de las portadas para el chat: WebP cuadrado de 192 px (se ve
 * nítido a 96 px en pantallas 2x), calidad 70, en apps/web/public/odes/portadas
 * con el nombre `<id>.webp`. Las sirve el front-end en /odes/portadas/<id>.webp.
 *
 * Paso de desarrollo (usa `cwebp`, de libwebp): se ejecuta con
 * `npm run odes:indexar -- --miniaturas`. Las miniaturas se versionan con el
 * código; el servidor no necesita cwebp.
 */

const ejecutarArchivo = promisify(execFile);

export const LADO_MINIATURA = 192;
export const CALIDAD_MINIATURA = 70;

export interface ResumenMiniaturas {
  generadas: number;
  /** Miniaturas viejas de documentos que ya no están en la fuente. */
  eliminadas: number;
  fallos: string[];
  archivos: number;
  bytes: number;
}

export function nombreMiniatura(id: string): string {
  return `${id}.webp`;
}

export async function generarMiniaturas(
  registros: readonly RegistroFuente[],
  directorio: string,
  limitador: Limitador,
): Promise<ResumenMiniaturas> {
  await mkdir(directorio, { recursive: true });
  const resumen: ResumenMiniaturas = {
    generadas: 0,
    eliminadas: 0,
    fallos: [],
    archivos: 0,
    bytes: 0,
  };

  await Promise.all(
    registros.map(async ({ metadatos, portada }) => {
      if (!portada) return;
      const destino = join(directorio, nombreMiniatura(metadatos.id));
      const temporal = `${destino}.${process.pid}.tmp.webp`;
      try {
        await limitador.ejecutar(() =>
          ejecutarArchivo(
            'cwebp',
            [
              '-quiet',
              '-mt',
              '-metadata',
              'none',
              '-q',
              String(CALIDAD_MINIATURA),
              '-m',
              '6',
              '-sharp_yuv',
              '-resize',
              String(LADO_MINIATURA),
              String(LADO_MINIATURA),
              portada,
              '-o',
              temporal,
            ],
            { timeout: 60_000 },
          ),
        );
        await rename(temporal, destino);
        resumen.generadas += 1;
      } catch (error) {
        await rm(temporal, { force: true });
        const detalle = error as NodeJS.ErrnoException;
        resumen.fallos.push(
          `${metadatos.id}: ${detalle.code === 'ENOENT' ? 'no se encontró cwebp (instale libwebp)' : detalle.message}`,
        );
      }
    }),
  );

  // Miniaturas huérfanas (documentos quitados de la fuente). Solo *.webp.
  const vigentes = new Set(
    registros.map(({ metadatos }) => nombreMiniatura(metadatos.id)),
  );
  for (const archivo of await readdir(directorio)) {
    if (!archivo.endsWith('.webp')) continue;
    const ruta = join(directorio, archivo);
    if (!vigentes.has(archivo)) {
      await rm(ruta, { force: true });
      resumen.eliminadas += 1;
      continue;
    }
    resumen.archivos += 1;
    resumen.bytes += (await stat(ruta)).size;
  }
  return resumen;
}
