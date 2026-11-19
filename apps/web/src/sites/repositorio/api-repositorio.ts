/**
 * Contrato HTTP de la rama /repositorio (Repositorio de productos del
 * Observatorio de Sapiencia).
 *
 * COPIA IDÉNTICA en:
 *   apps/server/src/repositorio/api-repositorio.ts
 *   apps/web/src/sites/repositorio/api-repositorio.ts
 * Los dos paquetes son independientes: si cambias uno, copia el archivo
 * completo al otro. Cambios solo compatibles hacia atrás.
 *
 * ── Fuente de verdad ───────────────────────────────────────────────────────
 * MySQL (Cloud SQL de la entidad en producción). Los archivos (documento,
 * portada 720 px y miniatura 192 px) también viven en la base, en binario,
 * partidos en trozos de ~1 MB. La carga inicial sale del paquete
 * Septiembre/observatorio/repositorio-datos (repositorio.json + archivos).
 *
 * ── API pública (sin sesión) ───────────────────────────────────────────────
 * GET  /api/repositorio/documentos                 -> ListadoPublico (solo publicados; ETag)
 * GET  /api/repositorio/documentos/:id/ver         -> archivo inline (admite Range; ETag por sha256)
 * GET  /api/repositorio/documentos/:id/descargar   -> archivo como attachment con NombreDescarga
 * GET  /api/repositorio/documentos/:id/portada     -> image/jpeg 720×720 (ETag, caché larga)
 * GET  /api/repositorio/documentos/:id/miniatura   -> image/webp 192×192 (ETag, caché larga)
 * Un documento despublicado o inexistente responde 404 en todas.
 * urlPortada / urlMiniatura llevan `?v=<16 hex del sha256>`: con esa versión la
 * imagen se guarda un año (immutable) y la URL cambia si se reemplaza.
 * /descargar responde 404 si el documento no permite descarga.
 *
 * ── API de administración (con sesión) ─────────────────────────────────────
 * Sesión: cookie `repositorio_sesion` (HttpOnly, SameSite=Strict, Secure en
 * producción, Path=/api/repositorio/admin). CSRF: toda petición que cambia
 * algo (POST/PUT/PATCH/DELETE) envía la cabecera `X-CSRF-Token` con el valor
 * `csrf` de SesionAdmin; además se rechazan peticiones de otro sitio
 * (Sec-Fetch-Site / Origin). Sin sesión: 401. CSRF inválido: 403.
 *
 * POST   /api/repositorio/admin/sesion              <- CredencialesAdmin -> SesionAdmin (pone la cookie)
 * GET    /api/repositorio/admin/sesion              -> SesionAdmin | 401
 * DELETE /api/repositorio/admin/sesion              -> 204 (cierra la sesión)
 *
 * GET    /api/repositorio/admin/documentos          -> { documentos: DocumentoAdmin[] } (todos, también despublicados)
 * GET    /api/repositorio/admin/documentos/:id      -> DocumentoAdmin
 * POST   /api/repositorio/admin/documentos          <- DatosDocumento -> DocumentoAdmin (201; despublicado por defecto)
 * PUT    /api/repositorio/admin/documentos/:id      <- DatosDocumento -> DocumentoAdmin
 * POST   /api/repositorio/admin/documentos/:id/publicar     -> DocumentoAdmin
 * POST   /api/repositorio/admin/documentos/:id/despublicar  -> DocumentoAdmin
 * DELETE /api/repositorio/admin/documentos/:id      <- { confirmarId: string } -> 204
 *        (borrado definitivo, incluye archivo, portada y miniatura; exige que
 *        esté despublicado y que confirmarId === id)
 * PUT    /api/repositorio/admin/documentos/:id/archivo  multipart, campo "archivo" -> DocumentoAdmin
 *        (o JSON ArchivoSubidoDirecto después de una subida directa o por partes)
 * POST   /api/repositorio/admin/subidas             -> RespuestaSubida
 * POST   /api/repositorio/admin/subidas/partes      <- InicioSubidaPorPartes -> SubidaPorPartes (201)
 * PUT    /api/repositorio/admin/subidas/partes/:uuid/:n  application/octet-stream -> 204
 * DELETE /api/repositorio/admin/documentos/:id/archivo  -> DocumentoAdmin
 * PUT    /api/repositorio/admin/documentos/:id/portada  multipart, campos "portada" (JPEG) y
 *        "miniatura" (WebP, opcional; si falta, el documento queda sin miniatura) -> DocumentoAdmin
 *        (portada de exactamente 720×720 y miniatura de 192×192; la miniatura
 *        también se acepta en PNG para navegadores que no codifican WebP)
 * GET    /api/repositorio/admin/documentos/:id/ver | descargar | portada | miniatura
 *        -> el archivo de CUALQUIER documento (también despublicado), con
 *        Cache-Control: private, no-cache. Las URL propias de DocumentoAdmin
 *        (urlVer, urlDescarga, urlPortada, urlMiniatura) apuntan aquí.
 *
 * GET    /api/repositorio/admin/categorias          -> { categorias: CategoriaAdmin[] }
 * POST   /api/repositorio/admin/categorias          <- { nombre } -> CategoriaAdmin
 * PUT    /api/repositorio/admin/categorias/:id      <- { nombre?, orden? } -> CategoriaAdmin
 * DELETE /api/repositorio/admin/categorias/:id      -> 204 (409 si tiene documentos)
 *
 * GET    /api/repositorio/admin/palabras-clave      -> { palabras: PalabraClaveAdmin[] }
 * PUT    /api/repositorio/admin/palabras-clave/:id  <- { texto } -> PalabraClaveAdmin
 *        (renombrar; si ya existe otra igual sin tildes/mayúsculas, se fusionan)
 * DELETE /api/repositorio/admin/palabras-clave/:id  -> 204 (409 si está en uso)
 *
 * GET    /api/repositorio/admin/cambios?limite=50   -> { cambios: CambioRegistro[] }
 *        (limite 1-500; &documento=<id> = solo los cambios de ese documento)
 *
 * Errores: JSON ErrorRepositorio con status 400 / 401 / 403 / 404 / 409 / 413 / 415 / 429 / 503.
 * 429 (inicio de sesión bloqueado por intentos fallidos) y 503 (base no
 * disponible, también en el inicio de sesión) traen la cabecera Retry-After.
 * Un cuerpo JSON mal formado responde 400 con el cuerpo estándar de Nest
 * ({ statusCode, message }), porque se rechaza antes de llegar a la API.
 */

export const RUTA_API_REPOSITORIO = '/api/repositorio';
export const CABECERA_CSRF = 'X-CSRF-Token';
export const COOKIE_SESION = 'repositorio_sesion';

export const LIMITES_REPOSITORIO = {
  /** Palabras clave de un documento: hasta 6, y exactamente 6 para publicarlo. */
  maxClaves: 6,
  clavesParaPublicar: 6,
  maxTitulo: 300,
  maxSubtitulo: 400,
  /** Descripción (caracteres) y su largo en palabras para publicar (se pide 30). */
  maxDescripcion: 700,
  palabrasDescripcion: { minimo: 25, recomendado: 30, maximo: 35 },
  maxNota: 300,
  /** Tamaño máximo de un archivo subido (bytes). */
  maxBytesArchivo: 80 * 1024 * 1024,
  maxBytesPortada: 5 * 1024 * 1024,
  /** Lado exacto (px) de la portada JPEG y de la miniatura WebP. */
  ladoPortada: 720,
  ladoMiniatura: 192,
} as const;

/** Tipos MIME aceptados para el archivo del documento. */
export const TIPOS_ARCHIVO_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type TipoProducto = 'documento' | 'tablero' | 'entrada';
export type IdiomaProducto = 'es' | 'en';

export interface ArchivoInfo {
  tipo: string;
  bytes: number;
  /** "pdf", "png", "docx"… */
  extension: string;
  sha256: string;
}

/** Documento tal como lo consume la interfaz pública. */
export interface DocumentoPublico {
  id: string;
  /** 1 = más reciente (orden "Más recientes"). */
  orden: number;
  titulo: string;
  subtitulo: string | null;
  categoria: string;
  numero: string | null;
  /** null = "S. F." */
  anio: number | null;
  mes: number | null;
  idioma: IdiomaProducto;
  tipo: TipoProducto;
  /** Máximo 6 (exactamente 6 en los publicados), en el orden del documento. */
  claves: string[];
  /** Descripción del producto (unas 30 palabras, en tercera persona), o null. */
  descripcion: string | null;
  /**
   * Destino de "Ver documento" / "Abrir tablero" / "Ver entrada": la copia
   * propia (/api/repositorio/documentos/:id/ver) si hay archivo; si no, la
   * URL externa (Power BI, blog, OneDrive…). Los tableros y las entradas con
   * URL externa abren siempre esa URL, aunque conserven un archivo propio
   * (en DocumentoAdmin, urlVer sigue apuntando al archivo si lo hay).
   */
  urlVer: string;
  /** Descarga propia (/descargar) o null si no se permite. */
  urlDescarga: string | null;
  urlEntradaBlog: string | null;
  nota: string | null;
  urlPortada: string | null;
  urlMiniatura: string | null;
  archivo: ArchivoInfo | null;
  /** En las versiones en inglés: título, categoría y año del original. */
  equivalenteEnEspanol: string | null;
}

export interface ListadoPublico {
  /** ISO de la última modificación del repositorio. */
  actualizado: string;
  total: number;
  /** Categorías en su orden configurado (solo las que tienen publicados). */
  categorias: string[];
  documentos: DocumentoPublico[];
}

/** Campos editables de un documento (crear / editar). */
export interface DatosDocumento {
  /** Solo al crear; si falta se genera un slug a partir de categoría, número, título y año. */
  id?: string;
  titulo: string;
  subtitulo?: string | null;
  categoria: string;
  numero?: string | null;
  anio?: number | null;
  mes?: number | null;
  idioma: IdiomaProducto;
  tipo: TipoProducto;
  claves: string[];
  /** Descripción (unas 30 palabras). Obligatoria, con 25 a 35 palabras, para publicar. */
  descripcion?: string | null;
  /** URL externa (obligatoria para tableros y entradas, opcional si hay archivo). */
  urlVerExterna?: string | null;
  urlEntradaBlog?: string | null;
  nota?: string | null;
  permiteDescarga: boolean;
  /** Posición en "Más recientes"; si falta se calcula por año/mes. */
  orden?: number | null;
  equivalenteEnEspanol?: string | null;
  notasInternas?: string | null;
}

export interface DocumentoAdmin extends DocumentoPublico {
  publicado: boolean;
  permiteDescarga: boolean;
  urlVerExterna: string | null;
  notasInternas: string | null;
  creadoEn: string;
  actualizadoEn: string;
  actualizadoPor: string | null;
}

export interface CredencialesAdmin {
  usuario: string;
  contrasena: string;
}

export interface SesionAdmin {
  usuario: string;
  nombre: string | null;
  /** Token para la cabecera X-CSRF-Token. */
  csrf: string;
  /** ISO de vencimiento de la sesión. */
  expira: string;
}

/**
 * POST /api/repositorio/admin/subidas: dónde subir un archivo grande.
 *
 * - `directa: true` (archivos en Supabase Storage): el navegador sube el
 *   archivo con PUT a `url` (URL firmada, sin pasar por el servidor) y luego
 *   envía `{ subida: ruta, nombre, tipo }` en JSON a PUT .../documentos/:id/archivo.
 * - `directa: false` (archivos en la base): si el archivo pesa hasta
 *   `tamanoParte`, multipart al mismo PUT .../archivo, como siempre. Si pesa
 *   más, por partes (en Vercel una petición no puede llevar más de 4,5 MB):
 *   POST .../subidas/partes con InicioSubidaPorPartes -> SubidaPorPartes;
 *   PUT .../subidas/{ruta}/{n} con cada parte (application/octet-stream,
 *   exactamente `tamanoParte` bytes salvo la última, n desde 0) -> 204; y
 *   luego `{ subida: ruta, nombre, tipo }` en JSON a PUT .../documentos/:id/archivo,
 *   igual que en la subida directa. Una subida sin terminar vence a las 2 horas.
 *   (Un servidor anterior no manda `tamanoParte`: todo va en multipart.)
 */
export type RespuestaSubida =
  | { directa: false; tamanoParte?: number; maxBytes?: number }
  | { directa: true; ruta: string; url: string; maxBytes: number };

/** Cuerpo de POST /api/repositorio/admin/subidas/partes. */
export interface InicioSubidaPorPartes {
  /** Tamaño total del archivo (bytes). */
  bytes: number;
}

/** Respuesta de POST /api/repositorio/admin/subidas/partes. */
export interface SubidaPorPartes {
  /** partes/<uuid>: va en la URL de cada parte y en el campo `subida` al terminar. */
  ruta: string;
  tamanoParte: number;
}

/** Cuerpo JSON de PUT .../documentos/:id/archivo después de una subida directa o por partes. */
export interface ArchivoSubidoDirecto {
  /** La `ruta` de RespuestaSubida o de SubidaPorPartes. */
  subida: string;
  /** Nombre original del archivo (para el registro de cambios). */
  nombre: string;
  /** Tipo MIME que declaró el navegador. */
  tipo: string;
}

export interface CategoriaAdmin {
  id: number;
  nombre: string;
  orden: number;
  documentos: number;
}

export interface PalabraClaveAdmin {
  id: number;
  texto: string;
  documentos: number;
}

export type AccionCambio =
  | 'crear'
  | 'editar'
  | 'publicar'
  | 'despublicar'
  | 'borrar'
  | 'subir_archivo'
  | 'quitar_archivo'
  | 'subir_portada'
  | 'categoria'
  | 'palabra_clave'
  | 'sesion';

export interface CambioRegistro {
  id: number;
  fecha: string;
  usuario: string | null;
  accion: AccionCambio;
  documentoId: string | null;
  detalle: string | null;
}

export type CodigoErrorRepositorio =
  | 'solicitud_invalida'
  | 'no_autenticado'
  | 'prohibido'
  | 'no_encontrado'
  | 'conflicto'
  | 'demasiado_grande'
  | 'tipo_no_permitido'
  | 'demasiados_intentos'
  | 'no_disponible'
  | 'interno';

export interface ErrorRepositorio {
  codigo: CodigoErrorRepositorio;
  /** Mensaje en español apto para mostrar tal cual. */
  mensaje: string;
  /** Errores por campo (formularios). */
  campos?: Record<string, string>;
}

/** Caracteres prohibidos en nombres de descarga. */
// oxlint-disable-next-line no-control-regex -- los caracteres de control se quitan a propósito
const PROHIBIDOS_NOMBRE = /[:/\\*?"<>|\u0000-\u001f]/g;

/**
 * Nombre limpio para la descarga: "<Categoría> <N.º> - <Título>.<ext>",
 * sin : / \ * ? " < > |, hasta 120 caracteres (sin contar la extensión).
 * Ej.: "Boletín 19 - Fe de erratas del Boletín N.º 19.pdf".
 */
export function nombreDescarga(
  d: Pick<DocumentoPublico, 'categoria' | 'numero' | 'titulo'>,
  extension: string,
): string {
  const cabeza = [d.categoria, d.numero].filter(Boolean).join(' ');
  const base = `${cabeza} - ${d.titulo}`
    .replace(PROHIBIDOS_NOMBRE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const recortado = base.length > 120 ? base.slice(0, 120).trimEnd() : base;
  return `${recortado}.${extension.replace(/^\./, '')}`;
}
