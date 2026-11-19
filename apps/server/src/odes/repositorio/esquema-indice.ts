/**
 * Esquema del índice SQLite del repositorio (archivo `indice.sqlite`).
 *
 * Lo escribe `npm run odes:indexar` (src/odes/repositorio/indexacion) y lo lee
 * el servidor en modo solo lectura (RepositorioSqlite). Si cambia el esquema,
 * suba VERSION_ESQUEMA: el servidor rechaza un índice de otra versión (queda
 * "no disponible" con un aviso) hasta que se vuelva a indexar.
 *
 * Columnas opcionales (agregadas sin subir la versión, porque el lector las
 * tolera ausentes y un servidor anterior las ignora):
 * - documentos.url_miniatura: URL de la miniatura servida por la rama
 *   /repositorio (índices generados desde la base de datos).
 *
 * Claves de meta de la fuente: fuente (descripción), fuente_tipo
 * (paquete | mysql), version_fuente y huella_fuente (huella del contenido de
 * la base al indexar: permite saber si el repositorio cambió después).
 *
 * Tablas:
 * - meta:        clave/valor (version_esquema, generado, fuente, conteos…).
 * - categorias:  nombre y orden de presentación.
 * - documentos:  un registro por producto del repositorio (metadatos).
 * - claves:      palabras clave de cada documento (para filtrar por clave).
 * - paginas:     texto limpio de cada página (para `leer`).
 * - fragmentos:  trozos de 1200-1800 caracteres por páginas + una "ficha" de
 *                metadatos por documento (ficha = 1, páginas NULL).
 * - busqueda:    tabla FTS5 sin contenido (content=''), rowid = fragmentos.rid,
 *                con el texto NORMALIZADO (ver normalizacion.ts) en tres
 *                columnas ponderadas: titulo, claves y cuerpo.
 */

export const VERSION_ESQUEMA = 1;

/** Nombre de las columnas de la tabla FTS5, en orden. */
export const COLUMNAS_BUSQUEDA = ['titulo', 'claves', 'cuerpo'] as const;

/**
 * Pesos BM25 por columna (titulo, claves, cuerpo). Ajustados con
 * `npm run odes:evaluar-busqueda` (ver datos/odes/evaluacion-busqueda.json).
 */
export const PESOS_POR_DEFECTO: readonly [number, number, number] = [6, 3, 1];

export const ESQUEMA_SQL = `
CREATE TABLE meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
) STRICT;

CREATE TABLE categorias (
  nombre TEXT PRIMARY KEY,
  orden INTEGER NOT NULL
) STRICT;

CREATE TABLE documentos (
  rid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  categoria TEXT NOT NULL REFERENCES categorias(nombre),
  numero TEXT,
  anio INTEGER,
  mes INTEGER,
  idioma TEXT NOT NULL CHECK (idioma IN ('es', 'en')),
  tipo TEXT NOT NULL CHECK (tipo IN ('pdf', 'tablero', 'entrada', 'imagen', 'otro')),
  claves TEXT NOT NULL,
  url_ver TEXT NOT NULL,
  tiene_archivo INTEGER NOT NULL,
  portada TEXT,
  url_miniatura TEXT,
  nota TEXT,
  equivalente TEXT,
  equivalente_id TEXT,
  texto_indexado INTEGER NOT NULL,
  paginas INTEGER,
  paginas_ocr INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX documentos_orden ON documentos(orden);

CREATE TABLE claves (
  documento INTEGER NOT NULL REFERENCES documentos(rid),
  posicion INTEGER NOT NULL,
  clave TEXT NOT NULL,
  comparacion TEXT NOT NULL,
  PRIMARY KEY (documento, posicion)
) STRICT;
CREATE INDEX claves_comparacion ON claves(comparacion);

CREATE TABLE paginas (
  documento INTEGER NOT NULL REFERENCES documentos(rid),
  numero INTEGER NOT NULL,
  texto TEXT NOT NULL,
  ocr INTEGER NOT NULL,
  PRIMARY KEY (documento, numero)
) STRICT, WITHOUT ROWID;

CREATE TABLE fragmentos (
  rid INTEGER PRIMARY KEY,
  documento INTEGER NOT NULL REFERENCES documentos(rid),
  posicion INTEGER NOT NULL,
  ficha INTEGER NOT NULL,
  pagina_inicio INTEGER,
  pagina_fin INTEGER,
  texto TEXT NOT NULL
) STRICT;
CREATE INDEX fragmentos_documento ON fragmentos(documento, posicion);

CREATE VIRTUAL TABLE busqueda USING fts5(
  titulo, claves, cuerpo,
  content = '',
  tokenize = 'unicode61 remove_diacritics 2'
);
`;
