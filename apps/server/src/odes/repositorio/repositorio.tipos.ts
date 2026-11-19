/**
 * Contrato entre el índice del repositorio del Observatorio y el chat del
 * Asistente ODES.
 *
 * - La implementación (índice SQLite FTS5 construido por `npm run odes:indexar`)
 *   vive en este mismo directorio y se registra en Nest con el token
 *   `RepositorioOdes`.
 * - El chat (src/odes/chat) solo depende de esta clase abstracta, así que se
 *   puede probar con un doble en memoria.
 *
 * Fuente de los datos, detrás de la interfaz FuenteRepositorio
 * (indexacion/fuente.ts) que lee `npm run odes:indexar`: la base de datos de
 * la rama /repositorio (FuenteMysql: documentos publicados y sus archivos) o
 * el paquete del Repositorio de Productos del Observatorio (FuentePaqueteJson:
 * repositorio.json + documentos/ + portadas/). Los enlaces de los documentos
 * se arman en un solo lugar: url-documento.ts (ODES_URL_DOCUMENTO).
 */

export type IdiomaDocumento = 'es' | 'en';

/**
 * pdf = archivo con texto; tablero = Power BI; entrada = entrada de blog;
 * imagen = infografía en PNG/JPG; otro = cualquier otro formato.
 */
export type TipoDocumento = 'pdf' | 'tablero' | 'entrada' | 'imagen' | 'otro';

export interface DocumentoRepositorio {
  /** Identificador estable y único (slug), igual entre reindexaciones. */
  id: string;
  titulo: string;
  subtitulo?: string;
  /** "Boletín", "Estudio", "Infografía", … tal como en el repositorio. */
  categoria: string;
  numero?: string;
  /** Año tal como lo muestra el repositorio: "2024" o "S. F.". */
  anio: string;
  claves: string[];
  idioma: IdiomaDocumento;
  tipo: TipoDocumento;
  /** URL pública para ver el documento (campo "ver" del repositorio). */
  url: string;
  /** Archivo de la miniatura servida en /odes/portadas/ (solo el nombre). */
  portada?: string;
  /**
   * URL de la miniatura servida por la rama /repositorio
   * (/api/repositorio/documentos/<id>/miniatura?v=…), en los índices
   * generados desde la base de datos. La interfaz la prefiere a `portada`.
   */
  urlMiniatura?: string;
  /** Advertencia corta del repositorio (p. ej. "requiere iniciar sesión"). */
  nota?: string;
  /**
   * true si el texto completo quedó indexado; false si solo hay metadatos
   * (tableros, imágenes, archivos sin capa de texto o inaccesibles).
   */
  textoIndexado: boolean;
  paginas?: number;
}

export interface FragmentoRepositorio {
  documento: DocumentoRepositorio;
  /** Páginas (desde 1) que cubre el fragmento; null en fichas de solo metadatos. */
  paginaInicio: number | null;
  paginaFin: number | null;
  texto: string;
  /** Abre el documento en la página del fragmento (PDF: `${url}#page=N`). */
  url: string;
  /** Mayor = más relevante. Solo comparable dentro de una misma consulta. */
  puntaje: number;
}

export interface FiltrosRepositorio {
  categorias?: string[];
  anioDesde?: number;
  anioHasta?: number;
  idioma?: IdiomaDocumento;
}

export interface CriteriosListado extends FiltrosRepositorio {
  /** Texto libre sobre título, subtítulo y palabras clave. */
  texto?: string;
  palabraClave?: string;
}

export interface EstadoRepositorio {
  /** false si el índice no existe o no se pudo abrir. */
  disponible: boolean;
  documentos: number;
  documentosConTexto: number;
  fragmentos: number;
  /** Fecha ISO en que se generó el índice. */
  generado: string | null;
}

/**
 * Token de inyección y contrato del repositorio. Todas las operaciones son
 * síncronas (node:sqlite) y nunca lanzan por "sin resultados": devuelven
 * listas vacías. Si el índice no está disponible, `estado().disponible` es
 * false y las búsquedas devuelven listas vacías.
 */
export abstract class RepositorioOdes {
  abstract estado(): EstadoRepositorio;

  /** Categorías presentes en el catálogo, en el orden del repositorio. */
  abstract categorias(): string[];

  /**
   * Búsqueda de texto completo (BM25, sin tildes, con raíces en español)
   * sobre el texto de los documentos y sus metadatos.
   * @param limite máximo de fragmentos (por defecto 8; máximo 20).
   */
  abstract buscar(
    consulta: string,
    filtros?: FiltrosRepositorio,
    limite?: number,
  ): FragmentoRepositorio[];

  /** Listado del catálogo (solo metadatos), del más reciente al más antiguo. */
  abstract listar(
    criterios: CriteriosListado,
    limite?: number,
  ): { total: number; documentos: DocumentoRepositorio[] };

  /**
   * Texto de un documento por páginas (desde 1). Devuelve null si el id no
   * existe; una lista vacía si no tiene texto indexado.
   */
  abstract leer(
    id: string,
    paginaDesde?: number,
    paginaHasta?: number,
  ): FragmentoRepositorio[] | null;

  abstract obtener(id: string): DocumentoRepositorio | null;
}
