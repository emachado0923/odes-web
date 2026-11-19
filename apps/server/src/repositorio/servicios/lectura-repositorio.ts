import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  ArchivoInfo,
  DocumentoPublico,
  IdiomaProducto,
  ListadoPublico,
  TipoProducto,
} from '../api-repositorio.js';
import {
  type AlmacenArchivos,
  type ReferenciaArchivo,
} from '../archivos/almacen-archivos.js';
import { crearAlmacenArchivos } from '../archivos/crear-almacen.js';
import {
  BaseDatosRepositorio,
  type EstadoBaseDatos,
} from '../bd/base-datos.js';
import { ErrorRepositorioHttp } from '../errores-repositorio.js';
import {
  aDocumentoPublico,
  archivoInfo,
  leerDocumentos,
  type RegistroDocumento,
} from './registros.js';

/**
 * Lectura del repositorio publicado: el listado público (con caché en
 * memoria) y el acceso a los archivos de los documentos publicados.
 *
 * Es también la API de SOLO LECTURA para otros módulos (p. ej. el índice del
 * Asistente ODES): `listarPublicados`, `versionContenido`, `abrirArchivo`,
 * `guardarArchivoEn`. Nunca expone notas internas ni documentos
 * despublicados.
 */

/** Documento publicado para otros módulos (sin notas internas). */
export interface DocumentoLectura {
  id: string;
  /** 1 = más reciente. */
  orden: number;
  titulo: string;
  subtitulo: string | null;
  categoria: string;
  numero: string | null;
  anio: number | null;
  mes: number | null;
  idioma: IdiomaProducto;
  tipo: TipoProducto;
  claves: string[];
  /** Destino público de "Ver": /api/repositorio/documentos/:id/ver o la URL externa. */
  urlVer: string;
  /** /api/repositorio/documentos/:id/descargar, o null si no se permite. */
  urlDescarga: string | null;
  /** URL externa (Power BI, blog, OneDrive...), si la tiene. */
  urlVerExterna: string | null;
  /** Referencia histórica de la carga inicial (url_ver del paquete), o null. */
  urlOriginal: string | null;
  urlEntradaBlog: string | null;
  nota: string | null;
  equivalenteEnEspanol: string | null;
  /** Archivo propio (tipo MIME, bytes, extensión, sha256), o null. */
  archivo: ArchivoInfo | null;
  portada: ArchivoInfo | null;
  miniatura: ArchivoInfo | null;
  /** ISO de la última edición del documento. */
  actualizadoEn: string;
}

export interface ListadoLectura {
  /** Contador de cambios del contenido (sube con cada escritura). */
  version: number;
  /** ISO de la última modificación del repositorio. */
  actualizado: string;
  documentos: DocumentoLectura[];
}

export type RecursoArchivo = 'archivo' | 'portada' | 'miniatura';

export interface ArchivoAbierto {
  info: ArchivoInfo;
  /** Contenido completo, trozo a trozo desde la base. */
  flujo: Readable;
}

interface CachePublica {
  generacion: number;
  version: number;
  actualizado: Date;
  revisadaEn: number;
  registros: RegistroDocumento[];
  porId: Map<string, RegistroDocumento>;
  cuerpo: Buffer;
  etag: string;
}

/** Cada cuánto se consulta la versión en la base (otros procesos, CLI). */
const REVISION_MS = 2000;

@Injectable()
export class ServicioLecturaRepositorio {
  private cache: CachePublica | null = null;
  private construccion: { generacion: number; promesa: Promise<CachePublica> } | null = null;
  private generacion = 0;
  private readonly almacen: AlmacenArchivos;

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {
    this.almacen = crearAlmacenArchivos(bd);
  }

  /** Estado de la base: 'disponible' cuando se puede leer. */
  get estado(): EstadoBaseDatos {
    return this.bd.estado;
  }

  /** Descarta la caché (lo llaman los servicios después de cada escritura). */
  invalidar(): void {
    this.generacion++;
  }

  // ── Listado público ─────────────────────────────────────────────────

  /** JSON de ListadoPublico ya serializado, con su ETag y fecha. */
  async listadoPublico(): Promise<{ cuerpo: Buffer; etag: string; actualizado: Date }> {
    const cache = await this.obtenerCache();
    return { cuerpo: cache.cuerpo, etag: cache.etag, actualizado: cache.actualizado };
  }

  /** Documento publicado (o null si no existe o está despublicado). */
  async documentoPublicado(id: string): Promise<RegistroDocumento | null> {
    return (await this.obtenerCache()).porId.get(id) ?? null;
  }

  // ── API de lectura para otros módulos ───────────────────────────────

  /** Documentos publicados con sus metadatos, en orden "Más recientes". */
  async listarPublicados(): Promise<ListadoLectura> {
    const cache = await this.obtenerCache();
    return {
      version: cache.version,
      actualizado: cache.actualizado.toISOString(),
      documentos: cache.registros.map(aLectura),
    };
  }

  /** Versión del contenido (consulta barata para saber si algo cambió). */
  async versionContenido(): Promise<number> {
    return (await this.obtenerCache()).version;
  }

  /**
   * Abre el archivo propio (o la portada / miniatura) de un documento
   * publicado. null si el documento no está publicado o no tiene ese archivo.
   */
  async abrirArchivo(
    id: string,
    recurso: RecursoArchivo = 'archivo',
  ): Promise<ArchivoAbierto | null> {
    const referencia = await this.referencia(id, recurso);
    if (!referencia) return null;
    return {
      info: archivoInfo(referencia) as ArchivoInfo,
      flujo: await this.almacen.abrirFlujo(referencia),
    };
  }

  /**
   * Copia el archivo de un documento publicado a `ruta` (escribe primero en
   * `ruta.parcial` y verifica el sha256). Devuelve su información, o null si
   * no hay archivo.
   */
  async guardarArchivoEn(
    id: string,
    ruta: string,
    recurso: RecursoArchivo = 'archivo',
  ): Promise<ArchivoInfo | null> {
    const referencia = await this.referencia(id, recurso);
    if (!referencia) return null;
    const parcial = `${ruta}.parcial`;
    const hash = createHash('sha256');
    const flujo = await this.almacen.abrirFlujo(referencia);
    flujo.on('data', (parte: Buffer) => hash.update(parte));
    try {
      await pipeline(flujo, createWriteStream(parcial));
      if (hash.digest('hex') !== referencia.sha256) {
        throw new Error(`El sha256 del archivo de ${id} no coincide.`);
      }
      await rename(parcial, ruta);
    } catch (error) {
      await rm(parcial, { force: true });
      throw error;
    }
    return archivoInfo(referencia);
  }

  /** Referencia interna de un archivo de un documento publicado. */
  async referencia(
    id: string,
    recurso: RecursoArchivo,
  ): Promise<ReferenciaArchivo | null> {
    const documento = await this.documentoPublicado(id);
    return documento ? documento[recurso] : null;
  }

  get almacenArchivos(): AlmacenArchivos {
    return this.almacen;
  }

  // ── Caché ───────────────────────────────────────────────────────────

  private async obtenerCache(): Promise<CachePublica> {
    const generacion = this.generacion;
    const cache = this.cache;
    if (
      cache &&
      cache.generacion === generacion &&
      Date.now() - cache.revisadaEn < REVISION_MS
    ) {
      return cache;
    }
    if (this.construccion?.generacion === generacion) {
      return this.construccion.promesa;
    }
    const promesa = (async () => {
      try {
        if (cache && cache.generacion === generacion) {
          const version = await this.leerVersion();
          if (version === cache.version) {
            cache.revisadaEn = Date.now();
            return cache;
          }
        }
        const nueva = await this.construir(generacion);
        // Solo se guarda si nadie la invalidó mientras se construía.
        if (generacion === this.generacion) this.cache = nueva;
        return nueva;
      } catch (error) {
        // Base caída: el listado público sigue con la última copia buena
        // (los archivos sí necesitan la base y responden 503).
        const sinBase = error instanceof ErrorRepositorioHttp && error.codigo === 'no_disponible';
        if (sinBase && this.cache) return this.cache;
        throw error;
      }
    })();
    this.construccion = { generacion, promesa };
    try {
      return await promesa;
    } finally {
      if (this.construccion?.promesa === promesa) this.construccion = null;
    }
  }

  private async leerVersion(): Promise<number> {
    const filas = await this.bd.filas<RowDataPacket>(
      'SELECT version FROM repositorio_estado WHERE id = 1',
    );
    return Number(filas[0]?.version ?? 0);
  }

  private construir(generacion: number): Promise<CachePublica> {
    return this.bd.conConexion(async (conexion) => {
      // Una sola foto de la base: versión, documentos y categorías coherentes.
      await conexion.query('START TRANSACTION READ ONLY');
      try {
        const [estado] = await conexion.query<RowDataPacket[]>(
          'SELECT version, actualizado_en FROM repositorio_estado WHERE id = 1',
        );
        const registros = await leerDocumentos(conexion, {
          condicion: 'd.publicado = 1',
        });
        const [categorias] = await conexion.query<RowDataPacket[]>(
          'SELECT nombre FROM repositorio_categorias ORDER BY orden, nombre',
        );
        await conexion.query('COMMIT');
        const actualizado = (estado[0]?.actualizado_en as Date | undefined) ?? new Date(0);
        const conPublicados = new Set(registros.map((r) => r.categoria));
        const documentos: DocumentoPublico[] = registros.map(aDocumentoPublico);
        const listado: ListadoPublico = {
          actualizado: actualizado.toISOString(),
          total: documentos.length,
          categorias: categorias
            .map((fila) => String(fila.nombre))
            .filter((nombre) => conPublicados.has(nombre)),
          documentos,
        };
        const cuerpo = Buffer.from(JSON.stringify(listado), 'utf8');
        const etag = `W/"${createHash('sha256').update(cuerpo).digest('base64url').slice(0, 32)}"`;
        return {
          generacion,
          version: Number(estado[0]?.version ?? 0),
          actualizado,
          revisadaEn: Date.now(),
          registros,
          porId: new Map(registros.map((r) => [r.id, r])),
          cuerpo,
          etag,
        };
      } catch (error) {
        await conexion.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }
}

function aLectura(r: RegistroDocumento): DocumentoLectura {
  const publico = aDocumentoPublico(r);
  return {
    id: r.id,
    orden: r.orden,
    titulo: r.titulo,
    subtitulo: r.subtitulo,
    categoria: r.categoria,
    numero: r.numero,
    anio: r.anio,
    mes: r.mes,
    idioma: r.idioma,
    tipo: r.tipo,
    claves: [...r.claves],
    urlVer: publico.urlVer,
    urlDescarga: publico.urlDescarga,
    urlVerExterna: r.urlVerExterna,
    urlOriginal: r.urlOriginal,
    urlEntradaBlog: r.urlEntradaBlog,
    nota: r.nota,
    equivalenteEnEspanol: r.equivalenteEnEspanol,
    archivo: archivoInfo(r.archivo),
    portada: archivoInfo(r.portada),
    miniatura: archivoInfo(r.miniatura),
    actualizadoEn: r.actualizadoEn.toISOString(),
  };
}
