import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Caché del texto crudo extraído, por hash SHA-256 del contenido del archivo
 * (datos/odes/cache/<sha256>.json, ignorada por git). Guarda la salida de
 * pdftotext / del XML de Office por página y el OCR de cada página, así que
 * reindexar sin cambios no vuelve a ejecutar pdftotext ni tesseract, y cambiar
 * la limpieza o la fragmentación no obliga a repetir el OCR.
 *
 * Suba VERSION_CACHE si cambia la forma de extraer (opciones de pdftotext,
 * resolución del OCR…): las entradas viejas se descartan solas.
 */
export const VERSION_CACHE = 1;

export interface EntradaCache {
  readonly hash: string;
  /** Texto de cada página según la herramienta nativa (pdftotext, XML), o null. */
  nativas: string[] | null;
  /** Texto del OCR por número de página (desde 1). */
  ocr: Record<number, string>;
}

interface ArchivoCache {
  version: number;
  idiomasOcr: string;
  nativas: string[] | null;
  ocr: Record<string, string>;
}

export async function hashDeArchivo(ruta: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const trozo of createReadStream(ruta))
    hash.update(trozo as Buffer);
  return hash.digest('hex');
}

export class CacheExtraccion {
  private readonly originales = new Map<string, string>();

  /**
   * @param directorio carpeta de la caché, o null para no guardar nada.
   * @param reutilizar false = ignora lo guardado (pero lo reescribe).
   */
  constructor(
    private readonly directorio: string | null,
    private readonly idiomasOcr: string,
    private readonly reutilizar = true,
  ) {}

  private ruta(hash: string): string {
    return join(this.directorio!, `${hash}.json`);
  }

  async abrir(rutaArchivo: string): Promise<EntradaCache> {
    return this.abrirPorHash(await hashDeArchivo(rutaArchivo));
  }

  /**
   * Entrada de un contenido cuyo sha256 ya se conoce (p. ej. un archivo de la
   * base de datos del repositorio): no hace falta tener el archivo en disco
   * para saber si la caché ya tiene su texto.
   */
  async abrirPorHash(sha256: string): Promise<EntradaCache> {
    const hash = sha256.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`sha256 inválido para la caché de extracción: ${sha256}`);
    }
    const entrada: EntradaCache = { hash, nativas: null, ocr: {} };
    if (!this.directorio || !this.reutilizar) return entrada;
    try {
      const texto = await readFile(this.ruta(hash), 'utf8');
      const guardado = JSON.parse(texto) as Partial<ArchivoCache>;
      if (guardado.version === VERSION_CACHE) {
        if (Array.isArray(guardado.nativas)) entrada.nativas = guardado.nativas;
        if (guardado.idiomasOcr === this.idiomasOcr && guardado.ocr) {
          for (const [pagina, ocr] of Object.entries(guardado.ocr)) {
            if (typeof ocr === 'string') entrada.ocr[Number(pagina)] = ocr;
          }
        }
        this.originales.set(hash, this.serializar(entrada));
      }
    } catch {
      // Sin caché (o ilegible): se extrae de nuevo.
    }
    return entrada;
  }

  private serializar(entrada: EntradaCache): string {
    const archivo: ArchivoCache = {
      version: VERSION_CACHE,
      idiomasOcr: this.idiomasOcr,
      nativas: entrada.nativas,
      ocr: entrada.ocr,
    };
    return JSON.stringify(archivo);
  }

  /** Guarda la entrada si cambió (escritura atómica: temporal + rename). */
  async guardar(entrada: EntradaCache): Promise<void> {
    if (!this.directorio) return;
    const contenido = this.serializar(entrada);
    if (this.originales.get(entrada.hash) === contenido) return;
    if (entrada.nativas === null && Object.keys(entrada.ocr).length === 0)
      return;
    await mkdir(this.directorio, { recursive: true });
    const destino = this.ruta(entrada.hash);
    const temporal = `${destino}.${process.pid}.tmp`;
    await writeFile(temporal, contenido);
    await rename(temporal, destino);
    this.originales.set(entrada.hash, contenido);
  }
}
