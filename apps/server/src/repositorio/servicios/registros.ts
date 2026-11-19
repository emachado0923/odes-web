import type { RowDataPacket } from 'mysql2/promise';
import {
  type ArchivoInfo,
  type DocumentoAdmin,
  type DocumentoPublico,
  type IdiomaProducto,
  RUTA_API_REPOSITORIO,
  type TipoProducto,
} from '../api-repositorio.js';
import type { ReferenciaArchivo } from '../archivos/almacen-archivos.js';
import { extensionDeMime } from '../archivos/tipos-archivo.js';
import type { Conexion } from '../bd/base-datos.js';

/**
 * Lectura de documentos desde MySQL (con categoría, archivos y palabras
 * clave) y su conversión a las formas del contrato (DocumentoPublico,
 * DocumentoAdmin) y a la de lectura para otros módulos (DocumentoLectura).
 */

export interface RegistroDocumento {
  id: string;
  orden: number;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  categoriaId: number;
  categoria: string;
  numero: string | null;
  anio: number | null;
  mes: number | null;
  idioma: IdiomaProducto;
  tipo: TipoProducto;
  claves: string[];
  urlVerExterna: string | null;
  urlEntradaBlog: string | null;
  nota: string | null;
  permiteDescarga: boolean;
  equivalenteEnEspanol: string | null;
  notasInternas: string | null;
  publicado: boolean;
  urlOriginal: string | null;
  archivo: ReferenciaArchivo | null;
  portada: ReferenciaArchivo | null;
  miniatura: ReferenciaArchivo | null;
  creadoEn: Date;
  actualizadoEn: Date;
  actualizadoPor: string | null;
}

type FilaDocumento = RowDataPacket & Record<string, unknown>;

function columnasArchivo(alias: string, prefijo: string): string {
  return ['id', 'sha256', 'mime', 'bytes', 'trozos', 'tamano_trozo', 'creado_en']
    .map((columna) => `${alias}.${columna} AS ${prefijo}_${columna}`)
    .join(', ');
}

const CONSULTA_DOCUMENTOS = `
  SELECT d.id, d.orden, d.titulo, d.subtitulo, d.descripcion, d.categoria_id, c.nombre AS categoria,
         d.numero, d.anio, d.mes, d.idioma, d.tipo, d.url_ver_externa, d.url_entrada_blog,
         d.nota, d.permite_descarga, d.equivalente_en_espanol, d.notas_internas, d.publicado,
         d.url_original, d.creado_en, d.actualizado_en, d.actualizado_por,
         ${columnasArchivo('a', 'archivo')},
         ${columnasArchivo('p', 'portada')},
         ${columnasArchivo('m', 'miniatura')}
    FROM repositorio_documentos d
    JOIN repositorio_categorias c ON c.id = d.categoria_id
    LEFT JOIN repositorio_almacen_archivos a ON a.id = d.archivo_id
    LEFT JOIN repositorio_almacen_archivos p ON p.id = d.portada_id
    LEFT JOIN repositorio_almacen_archivos m ON m.id = d.miniatura_id`;

function referencia(fila: FilaDocumento, prefijo: string): ReferenciaArchivo | null {
  const id = fila[`${prefijo}_id`];
  if (id === null || id === undefined) return null;
  return {
    id: Number(id),
    sha256: String(fila[`${prefijo}_sha256`]),
    mime: String(fila[`${prefijo}_mime`]),
    bytes: Number(fila[`${prefijo}_bytes`]),
    trozos: Number(fila[`${prefijo}_trozos`]),
    tamanoTrozo: Number(fila[`${prefijo}_tamano_trozo`]),
    creadoEn: fila[`${prefijo}_creado_en`] as Date,
  };
}

function textoONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function numeroONulo(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

function aRegistro(fila: FilaDocumento, claves: string[]): RegistroDocumento {
  return {
    id: String(fila.id),
    orden: Number(fila.orden),
    titulo: String(fila.titulo),
    subtitulo: textoONulo(fila.subtitulo),
    descripcion: textoONulo(fila.descripcion),
    categoriaId: Number(fila.categoria_id),
    categoria: String(fila.categoria),
    numero: textoONulo(fila.numero),
    anio: numeroONulo(fila.anio),
    mes: numeroONulo(fila.mes),
    idioma: fila.idioma as IdiomaProducto,
    tipo: fila.tipo as TipoProducto,
    claves,
    urlVerExterna: textoONulo(fila.url_ver_externa),
    urlEntradaBlog: textoONulo(fila.url_entrada_blog),
    nota: textoONulo(fila.nota),
    permiteDescarga: Number(fila.permite_descarga) === 1,
    equivalenteEnEspanol: textoONulo(fila.equivalente_en_espanol),
    notasInternas: textoONulo(fila.notas_internas),
    publicado: Number(fila.publicado) === 1,
    urlOriginal: textoONulo(fila.url_original),
    archivo: referencia(fila, 'archivo'),
    portada: referencia(fila, 'portada'),
    miniatura: referencia(fila, 'miniatura'),
    creadoEn: fila.creado_en as Date,
    actualizadoEn: fila.actualizado_en as Date,
    actualizadoPor: textoONulo(fila.actualizado_por),
  };
}

type Consultable = Pick<Conexion, 'query'>;

/**
 * Documentos con sus palabras clave, en el orden "Más recientes". `filtro`
 * es una condición SQL fija (nunca datos del usuario: esos van en `valores`).
 */
export async function leerDocumentos(
  conexion: Consultable,
  filtro: { condicion?: string; valores?: unknown[] } = {},
): Promise<RegistroDocumento[]> {
  const donde = filtro.condicion ? ` WHERE ${filtro.condicion}` : '';
  const [filas] = await conexion.query<FilaDocumento[]>(
    `${CONSULTA_DOCUMENTOS}${donde} ORDER BY d.orden, d.id`,
    filtro.valores ?? [],
  );
  if (filas.length === 0) return [];
  const ids = filas.map((fila) => String(fila.id));
  // Con todos (o casi) se leen todas las relaciones de una vez.
  const [relaciones] = await conexion.query<FilaDocumento[]>(
    `SELECT dp.documento_id, p.texto
       FROM repositorio_documento_palabras_clave dp
       JOIN repositorio_palabras_clave p ON p.id = dp.palabra_id
      ${ids.length > 50 ? '' : 'WHERE dp.documento_id IN (?)'}
      ORDER BY dp.documento_id, dp.posicion`,
    ids.length > 50 ? [] : [ids],
  );
  const clavesPorDocumento = new Map<string, string[]>();
  for (const relacion of relaciones) {
    const id = String(relacion.documento_id);
    const lista = clavesPorDocumento.get(id) ?? [];
    lista.push(String(relacion.texto));
    clavesPorDocumento.set(id, lista);
  }
  return filas.map((fila) =>
    aRegistro(fila, clavesPorDocumento.get(String(fila.id)) ?? []),
  );
}

export async function leerDocumento(
  conexion: Consultable,
  id: string,
): Promise<RegistroDocumento | null> {
  const [registro] = await leerDocumentos(conexion, {
    condicion: 'd.id = ?',
    valores: [id],
  });
  return registro ?? null;
}

// ── Conversión a las formas del contrato ────────────────────────────────

export function archivoInfo(archivo: ReferenciaArchivo | null): ArchivoInfo | null {
  if (!archivo) return null;
  return {
    tipo: archivo.mime,
    bytes: archivo.bytes,
    extension: extensionDeMime(archivo.mime),
    sha256: archivo.sha256,
  };
}

/** Parámetro de versión de las imágenes: cambia cuando se reemplazan. */
export function versionImagen(archivo: ReferenciaArchivo): string {
  return archivo.sha256.slice(0, 16);
}

export type TipoRecurso = 'ver' | 'descargar' | 'portada' | 'miniatura';

/** Base de las URL propias: la pública o la de administración. */
function urlRecurso(
  ambito: 'publico' | 'admin',
  id: string,
  recurso: TipoRecurso,
  version?: string,
): string {
  const base =
    ambito === 'publico'
      ? `${RUTA_API_REPOSITORIO}/documentos`
      : `${RUTA_API_REPOSITORIO}/admin/documentos`;
  const consulta = version ? `?v=${version}` : '';
  return `${base}/${encodeURIComponent(id)}/${recurso}${consulta}`;
}

function aDocumento(
  r: RegistroDocumento,
  ambito: 'publico' | 'admin',
): DocumentoPublico {
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
    claves: r.claves,
    descripcion: r.descripcion,
    // En el sitio público, tableros y entradas abren siempre su URL externa
    // (como la vista previa del editor), aunque conserven un archivo de
    // cuando eran «Documento». La administración sigue apuntando al archivo.
    urlVer:
      ambito === 'publico' && r.tipo !== 'documento' && r.urlVerExterna
        ? r.urlVerExterna
        : r.archivo
          ? urlRecurso(ambito, r.id, 'ver')
          : (r.urlVerExterna ?? ''),
    urlDescarga:
      r.archivo && r.permiteDescarga
        ? urlRecurso(ambito, r.id, 'descargar')
        : null,
    urlEntradaBlog: r.urlEntradaBlog,
    nota: r.nota,
    urlPortada: r.portada
      ? urlRecurso(ambito, r.id, 'portada', versionImagen(r.portada))
      : null,
    urlMiniatura: r.miniatura
      ? urlRecurso(ambito, r.id, 'miniatura', versionImagen(r.miniatura))
      : null,
    archivo: archivoInfo(r.archivo),
    equivalenteEnEspanol: r.equivalenteEnEspanol,
  };
}

export function aDocumentoPublico(r: RegistroDocumento): DocumentoPublico {
  return aDocumento(r, 'publico');
}

/**
 * En la administración, las URL propias (ver, descargar, portada, miniatura)
 * apuntan a /api/repositorio/admin/documentos/:id/... para que también
 * funcionen con documentos despublicados.
 */
export function aDocumentoAdmin(r: RegistroDocumento): DocumentoAdmin {
  return {
    ...aDocumento(r, 'admin'),
    publicado: r.publicado,
    permiteDescarga: r.permiteDescarga,
    urlVerExterna: r.urlVerExterna,
    notasInternas: r.notasInternas,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString(),
    actualizadoPor: r.actualizadoPor,
  };
}

/** ¿Tiene destino "Ver documento"? Sin archivo ni URL externa no se puede publicar. */
export function tieneDestino(r: Pick<RegistroDocumento, 'archivo' | 'urlVerExterna'>): boolean {
  return r.archivo !== null || r.urlVerExterna !== null;
}
