/**
 * Cliente de la API pública del repositorio: GET /api/repositorio/documentos.
 *
 * Valida la forma de la respuesta sin confiar en ella: descarta documentos
 * sin id o sin título y normaliza los campos opcionales, para que un dato
 * mal cargado en la base no rompa la página entera.
 */
import {
  RUTA_API_REPOSITORIO,
  type ArchivoInfo,
  type CodigoErrorRepositorio,
  type DocumentoPublico,
  type ListadoPublico,
} from '../api-repositorio'

export const URL_LISTADO = `${RUTA_API_REPOSITORIO}/documentos`

/** Por qué no se pudo cargar el listado. */
export type TipoFallo = 'no_disponible' | 'red' | 'servidor' | 'datos'

export class FalloListado extends Error {
  readonly tipo: TipoFallo
  readonly estado: number | null
  readonly codigo: CodigoErrorRepositorio | null

  constructor(tipo: TipoFallo, mensaje: string, estado: number | null = null, codigo: CodigoErrorRepositorio | null = null) {
    super(mensaje)
    this.name = 'FalloListado'
    this.tipo = tipo
    this.estado = estado
    this.codigo = codigo
  }
}

type Objeto = Record<string, unknown>

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null
}

function entero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : null
}

function archivo(valor: unknown): ArchivoInfo | null {
  if (!esObjeto(valor)) return null
  const extension = texto(valor.extension)
  if (!extension) return null
  return {
    tipo: texto(valor.tipo) ?? '',
    bytes: entero(valor.bytes) ?? 0,
    extension,
    sha256: texto(valor.sha256) ?? '',
  }
}

/** Un documento con la forma del contrato, o null si le falta lo indispensable (id y título). */
export function validarDocumento(valor: unknown, posicion: number): DocumentoPublico | null {
  if (!esObjeto(valor)) return null
  const id = texto(valor.id)
  const titulo = texto(valor.titulo)
  if (!id || !titulo) return null
  return {
    id,
    orden: entero(valor.orden) ?? posicion + 1,
    titulo,
    subtitulo: texto(valor.subtitulo),
    categoria: texto(valor.categoria) ?? 'Sin categoría',
    numero: texto(valor.numero) ?? (entero(valor.numero) !== null ? String(valor.numero) : null),
    anio: entero(valor.anio),
    mes: entero(valor.mes),
    idioma: valor.idioma === 'en' ? 'en' : 'es',
    tipo: valor.tipo === 'tablero' || valor.tipo === 'entrada' ? valor.tipo : 'documento',
    claves: Array.isArray(valor.claves) ? valor.claves.filter((c): c is string => typeof c === 'string') : [],
    // Un servidor anterior a la versión 6 del esquema no la manda: queda sin descripción.
    descripcion: texto(valor.descripcion),
    urlVer: texto(valor.urlVer) ?? '',
    urlDescarga: texto(valor.urlDescarga),
    urlEntradaBlog: texto(valor.urlEntradaBlog),
    nota: texto(valor.nota),
    urlPortada: texto(valor.urlPortada),
    urlMiniatura: texto(valor.urlMiniatura),
    archivo: archivo(valor.archivo),
    equivalenteEnEspanol: texto(valor.equivalenteEnEspanol),
  }
}

export function validarListado(valor: unknown): ListadoPublico {
  if (!esObjeto(valor) || !Array.isArray(valor.documentos)) {
    throw new FalloListado('datos', 'La respuesta del servidor no tiene la lista de documentos.')
  }
  const documentos = valor.documentos
    .map((d, i) => validarDocumento(d, i))
    .filter((d): d is DocumentoPublico => d !== null)
  const categorias = Array.isArray(valor.categorias)
    ? valor.categorias.filter((c): c is string => typeof c === 'string')
    : []
  return {
    actualizado: texto(valor.actualizado) ?? '',
    total: documentos.length,
    categorias,
    documentos,
  }
}

async function leerError(respuesta: Response): Promise<CodigoErrorRepositorio | null> {
  try {
    const cuerpo: unknown = await respuesta.json()
    return esObjeto(cuerpo) && typeof cuerpo.codigo === 'string' ? (cuerpo.codigo as CodigoErrorRepositorio) : null
  } catch {
    return null
  }
}

/** Descarga y valida el listado de documentos publicados. Lanza FalloListado (o AbortError). */
export async function obtenerListado(signal?: AbortSignal): Promise<ListadoPublico> {
  let respuesta: Response
  try {
    respuesta = await fetch(URL_LISTADO, { headers: { Accept: 'application/json' }, signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new FalloListado('red', 'No hay conexión con el servidor.')
  }
  if (!respuesta.ok) {
    const codigo = await leerError(respuesta)
    if (respuesta.status === 503 || codigo === 'no_disponible') {
      throw new FalloListado('no_disponible', 'El repositorio no está disponible.', respuesta.status, codigo)
    }
    throw new FalloListado('servidor', `El servidor respondió ${respuesta.status}.`, respuesta.status, codigo)
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new FalloListado('datos', 'La respuesta del servidor no es JSON.')
  }
  return validarListado(cuerpo)
}
