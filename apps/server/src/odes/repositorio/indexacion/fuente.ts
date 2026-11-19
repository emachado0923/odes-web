/**
 * Entrada del indexador, detrás de una interfaz pequeña.
 *
 * Dos implementaciones:
 * - FuentePaqueteJson: el paquete de datos del repositorio (repositorio.json +
 *   documentos/ + portadas/). Los archivos ya están en disco.
 * - FuenteMysql: la base de datos de la rama /repositorio (documentos
 *   PUBLICADOS y sus archivos guardados en MySQL). Los archivos se copian a
 *   un temporal solo si hay que extraerles el texto (ArchivoBajoDemanda): con
 *   la caché de extracción al día, reindexar no descarga nada.
 *
 * Las notas internas de curaduría NO forman parte de esta interfaz: el
 * indexador nunca las ve, así que no pueden terminar en el índice.
 */

export type IdiomaFuente = 'es' | 'en';

/** Tipo de producto tal como lo publica el repositorio. */
export type TipoFuente = 'documento' | 'tablero' | 'entrada';

/** De dónde salió el índice (se guarda en su tabla meta). */
export type OrigenFuente = 'paquete' | 'mysql';

export interface MetadatosFuente {
  /** Identificador estable (slug). */
  id: string;
  /** Posición en el orden "Más recientes" (1 = el más reciente). */
  orden: number;
  titulo: string;
  subtitulo: string | null;
  categoria: string;
  numero: string | null;
  /** null = sin fecha ("S. F."). */
  anio: number | null;
  mes: number | null;
  idioma: IdiomaFuente;
  tipo: TipoFuente;
  claves: string[];
  /**
   * Destino de "Ver documento" según la fuente: en el paquete, la URL pública
   * original (url_ver); en la base, la copia propia
   * (/api/repositorio/documentos/<id>/ver) o, sin archivo, la URL externa.
   * El enlace final se arma al leer el índice (url-documento.ts).
   */
  urlVer: string;
  /** Advertencia corta visible en la tarjeta. */
  nota: string | null;
  /** En las traducciones: título, categoría y año del original en español. */
  equivalenteEnEspanol: string | null;
  /** Tipo MIME real del archivo, si hay archivo. */
  archivoTipo: string | null;
  /**
   * URL de la miniatura servida por la propia fuente (solo la base:
   * /api/repositorio/documentos/<id>/miniatura?v=…), o null/ausente.
   */
  urlMiniatura?: string | null;
}

/**
 * Archivo que la fuente copia a disco solo cuando el indexador lo necesita
 * (p. ej. desde MySQL). El indexador consulta primero la caché de extracción
 * con `sha256`; si falta algo, llama a `obtener()` y, al terminar con ese
 * documento, a `liberar()`.
 */
export interface ArchivoBajoDemanda {
  /** Nombre con extensión (p. ej. "boletin-19.pdf"): sirve para reconocer el formato. */
  readonly nombre: string;
  /** sha256 del contenido (hex). */
  readonly sha256: string;
  readonly bytes: number;
  /**
   * Copia el archivo a una ruta local y la devuelve. Si el problema es de la
   * fuente (base caída, archivo corrupto) debe lanzar ErrorArchivoFuente: la
   * indexación se detiene y el índice anterior queda intacto. Cualquier otro
   * error deja solo ese documento sin texto.
   */
  obtener(): Promise<string>;
  /** Borra la copia local, si se hizo. Nunca lanza. */
  liberar(): Promise<void>;
}

export interface RegistroFuente {
  metadatos: MetadatosFuente;
  /**
   * Archivo del documento: ruta absoluta de una copia local (paquete), un
   * ArchivoBajoDemanda (base de datos) o null si no hay archivo.
   */
  archivo: string | ArchivoBajoDemanda | null;
  /** Ruta absoluta de la portada (imagen) para generar miniaturas, o null. */
  portada: string | null;
}

export interface LecturaFuente {
  /** Descripción para el registro y la tabla meta (p. ej. "paquete JSON v4.2 (2026-10-08)"). */
  descripcion: string;
  version: string | null;
  registros: RegistroFuente[];
  /** Registros omitidos o corregidos, con el motivo. */
  avisos: string[];
  /** Tipo de fuente (meta `fuente_tipo`). */
  origen?: OrigenFuente;
  /**
   * Huella del contenido de la fuente (meta `huella_fuente`): permite saber
   * después si la fuente cambió desde que se generó el índice.
   */
  huella?: string | null;
}

export interface FuenteRepositorio {
  leer(): Promise<LecturaFuente>;
  /**
   * Opcional: ids que siguen vigentes (publicados) justo antes de escribir el
   * índice. Los documentos que ya no estén se quitan (p. ej. se despublicaron
   * durante la indexación).
   */
  idsVigentes?(): Promise<ReadonlySet<string>>;
  /** Opcional: libera recursos (carpetas temporales). Nunca lanza. */
  cerrar?(): Promise<void>;
}

/**
 * Error de la FUENTE (no del documento): detiene la indexación sin tocar el
 * índice vigente. Lo lanzan, por ejemplo, FuenteMysql cuando la base deja de
 * responder o ArchivoBajoDemanda.obtener() cuando un archivo no se puede copiar.
 */
export class ErrorArchivoFuente extends Error {
  constructor(mensaje: string, options?: { cause?: unknown }) {
    super(mensaje, options);
    this.name = 'ErrorArchivoFuente';
  }
}
