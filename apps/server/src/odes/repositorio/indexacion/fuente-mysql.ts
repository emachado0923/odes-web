import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ArchivoInfo,
  RUTA_API_REPOSITORIO,
} from '../../../repositorio/api-repositorio.js';
import { ErrorRepositorioHttp } from '../../../repositorio/errores-repositorio.js';
import type {
  DocumentoLectura,
  ListadoLectura,
  RecursoArchivo,
} from '../../../repositorio/servicios/lectura-repositorio.js';
import {
  type ArchivoBajoDemanda,
  ErrorArchivoFuente,
  type FuenteRepositorio,
  type LecturaFuente,
  type RegistroFuente,
} from './fuente.js';

/**
 * Fuente: la base de datos de la rama /repositorio (MySQL), a través de la
 * API de solo lectura que exporta RepositorioProductosModule
 * (ServicioLecturaRepositorio). Solo ve documentos PUBLICADOS y nunca las
 * notas internas.
 *
 * - Metadatos: los de cada documento publicado, en el orden "Más recientes".
 * - Enlace ("Ver documento"): la copia propia
 *   (/api/repositorio/documentos/<id>/ver, servida inline: #page=N funciona
 *   en los PDF) o, si el documento no tiene archivo, su URL externa (Power BI,
 *   blog, OneDrive). ODES_URL_DOCUMENTO sigue pudiendo reemplazarlo.
 * - Miniatura: /api/repositorio/documentos/<id>/miniatura?v=<versión>.
 * - Archivos: bajo demanda (ArchivoBajoDemanda). Con la caché de extracción
 *   al día (por sha256) no se descarga nada; si hace falta extraer, el
 *   archivo se copia a una carpeta temporal (verificando el sha256) y se
 *   borra al terminar con ese documento.
 */

/** Lo que FuenteMysql necesita de ServicioLecturaRepositorio (así se prueba con un doble). */
export interface LectorRepositorio {
  listarPublicados(): Promise<ListadoLectura>;
  guardarArchivoEn(
    id: string,
    ruta: string,
    recurso?: RecursoArchivo,
  ): Promise<ArchivoInfo | null>;
}

export interface OpcionesFuenteMysql {
  /** Carpeta bajo la que se crea la temporal de los archivos (por defecto, la del sistema). */
  directorioTemporal?: string;
  /** Texto para la descripción (p. ej. "repositoriobd en 10.0.0.5:3306"). */
  destino?: string;
}

const PATRON_ID = /^[a-z0-9][a-z0-9-]{0,199}$/;

/**
 * Versión de una imagen en su URL (?v=): los primeros 16 hexadecimales del
 * sha256, la misma regla que usa la rama /repositorio en urlPortada y
 * urlMiniatura (con esa versión la imagen se guarda en caché un año). Si la
 * regla cambiara allá, la miniatura seguiría cargando (con caché corta).
 */
export function versionMiniatura(sha256: string): string {
  return sha256.slice(0, 16);
}

/** URL pública de la miniatura de un documento publicado, o null si no tiene. */
export function urlMiniaturaRepositorio(
  documento: Pick<DocumentoLectura, 'id' | 'miniatura'>,
): string | null {
  if (!documento.miniatura) return null;
  return (
    `${RUTA_API_REPOSITORIO}/documentos/${encodeURIComponent(documento.id)}` +
    `/miniatura?v=${versionMiniatura(documento.miniatura.sha256)}`
  );
}

/**
 * Huella de lo que el índice toma de la base: cambia si se publica, retira o
 * edita un documento (metadatos, archivo o miniatura), y no cambia con lo
 * que el índice no usa (notas internas, fechas de edición, descarga). La
 * calculan igual el indexador (meta `huella_fuente`) y la administración
 * (¿cambió el repositorio desde el último índice?).
 */
export function huellaDocumentos(
  documentos: readonly DocumentoLectura[],
): string {
  const relevante = documentos.map((d) => [
    d.id,
    d.orden,
    d.titulo,
    d.subtitulo,
    d.categoria,
    d.numero,
    d.anio,
    d.mes,
    d.idioma,
    d.tipo,
    d.claves,
    d.urlVer,
    d.nota,
    d.equivalenteEnEspanol,
    d.archivo ? [d.archivo.sha256, d.archivo.tipo] : null,
    d.miniatura?.sha256 ?? null,
  ]);
  return createHash('sha256').update(JSON.stringify(relevante)).digest('hex');
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorRepositorioHttp) return error.cuerpo.mensaje;
  return error instanceof Error ? error.message : String(error);
}

export class FuenteMysql implements FuenteRepositorio {
  private temporal: Promise<string> | null = null;

  constructor(
    private readonly lector: LectorRepositorio,
    private readonly opciones: OpcionesFuenteMysql = {},
  ) {}

  private async listar(): Promise<ListadoLectura> {
    try {
      return await this.lector.listarPublicados();
    } catch (error) {
      throw new ErrorArchivoFuente(
        `No se pudo leer el repositorio en la base de datos: ${mensajeDeError(error)}`,
        { cause: error },
      );
    }
  }

  /** Carpeta temporal de esta lectura (se crea al primer archivo que haga falta). */
  private carpeta(): Promise<string> {
    this.temporal ??= mkdtemp(
      join(this.opciones.directorioTemporal ?? tmpdir(), 'odes-indexar-'),
    );
    return this.temporal;
  }

  private bajoDemanda(
    documento: DocumentoLectura,
    archivo: ArchivoInfo,
  ): ArchivoBajoDemanda {
    const extension = /^[a-z0-9]{1,10}$/.test(archivo.extension)
      ? archivo.extension
      : 'bin';
    const nombre = `${documento.id}.${extension}`;
    let ruta: string | null = null;
    return {
      nombre,
      sha256: archivo.sha256,
      bytes: archivo.bytes,
      obtener: async () => {
        const destino = join(await this.carpeta(), nombre);
        let info: ArchivoInfo | null;
        try {
          info = await this.lector.guardarArchivoEn(documento.id, destino);
        } catch (error) {
          throw new ErrorArchivoFuente(
            `No se pudo copiar el archivo de ${documento.id} desde la base de datos: ${mensajeDeError(error)}`,
            { cause: error },
          );
        }
        // Despublicado (o sin archivo) durante la indexación: no es un error
        // de la fuente; el documento se quita al final (idsVigentes).
        if (!info) {
          throw new Error(
            'el documento dejó de estar publicado (o se quitó su archivo) durante la indexación',
          );
        }
        if (info.sha256 !== archivo.sha256) {
          // Se reemplazó el archivo mientras se indexaba: se indexa el nuevo,
          // pero la caché quedaría con el hash viejo. Mejor no mezclar.
          await rm(destino, { force: true });
          throw new Error(
            'el archivo cambió durante la indexación; vuelva a indexar',
          );
        }
        ruta = destino;
        return destino;
      },
      liberar: async () => {
        if (ruta) await rm(ruta, { force: true }).catch(() => undefined);
        ruta = null;
      },
    };
  }

  async leer(): Promise<LecturaFuente> {
    const listado = await this.listar();
    const avisos: string[] = [];
    const registros: RegistroFuente[] = [];
    const ids = new Set<string>();
    for (const d of listado.documentos) {
      if (!PATRON_ID.test(d.id)) {
        avisos.push(`${d.id}: id con caracteres no admitidos; se omite.`);
        continue;
      }
      if (ids.has(d.id)) {
        avisos.push(`${d.id}: id repetido, se omite la segunda aparición.`);
        continue;
      }
      if (!d.urlVer.trim()) {
        avisos.push(
          `${d.id}: no tiene archivo ni URL externa (sin destino para "Ver"); se omite.`,
        );
        continue;
      }
      ids.add(d.id);
      registros.push({
        metadatos: {
          id: d.id,
          orden: d.orden,
          titulo: d.titulo,
          subtitulo: d.subtitulo,
          categoria: d.categoria,
          numero: d.numero,
          anio: d.anio,
          mes: d.mes,
          idioma: d.idioma,
          tipo: d.tipo,
          claves: [...d.claves],
          urlVer: d.urlVer,
          nota: d.nota,
          equivalenteEnEspanol: d.equivalenteEnEspanol,
          archivoTipo: d.archivo?.tipo ?? null,
          urlMiniatura: urlMiniaturaRepositorio(d),
        },
        archivo: d.archivo ? this.bajoDemanda(d, d.archivo) : null,
        // La portada de 720 px no hace falta: la miniatura ya está en la base.
        portada: null,
      });
    }
    const destino = this.opciones.destino ? ` ${this.opciones.destino}` : '';
    return {
      descripcion:
        `base de datos del repositorio${destino} ` +
        `(versión ${listado.version}, actualizado ${listado.actualizado})`,
      version: String(listado.version),
      registros,
      avisos,
      origen: 'mysql',
      huella: huellaDocumentos(listado.documentos),
    };
  }

  async idsVigentes(): Promise<ReadonlySet<string>> {
    const listado = await this.listar();
    return new Set(listado.documentos.map((d) => d.id));
  }

  async cerrar(): Promise<void> {
    const temporal = this.temporal;
    this.temporal = null;
    if (!temporal) return;
    try {
      await rm(await temporal, { recursive: true, force: true });
    } catch {
      // No se pudo crear o ya no existe: nada que borrar.
    }
  }
}
