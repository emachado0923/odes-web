/**
 * Validación de las respuestas de la API de administración: no se confía en
 * la forma del JSON. Los campos públicos del documento se validan con el
 * mismo código que la página pública (validarDocumento).
 */
import type {
  AccionCambio,
  CambioRegistro,
  CategoriaAdmin,
  DocumentoAdmin,
  PalabraClaveAdmin,
  RespuestaSubida,
  SesionAdmin,
  SubidaPorPartes,
} from '../../api-repositorio'
import type { EstadoIndiceAdmin, EstadoReindexacion } from '../../../odes/chat/protocolo'
import { validarDocumento } from '../../datos/cliente'
import { ErrorAdmin } from './errores'

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

function invalida(que: string): never {
  throw new ErrorAdmin('datos', `La respuesta del servidor no tiene ${que} con la forma esperada.`)
}

export function validarSesion(valor: unknown): SesionAdmin {
  if (!esObjeto(valor)) invalida('la sesión')
  const usuario = texto(valor.usuario)
  const csrf = texto(valor.csrf)
  if (!usuario || !csrf) invalida('la sesión')
  return { usuario, nombre: texto(valor.nombre), csrf, expira: texto(valor.expira) ?? '' }
}

/** RespuestaSubida de POST /admin/subidas (URL firmada solo con https o del propio sitio). */
/** Número entero positivo, o undefined si falta (un servidor anterior no lo manda). */
function enteroOpcional(valor: unknown, que: string): number | undefined {
  if (valor === undefined || valor === null) return undefined
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1) invalida(que)
  return valor
}

export function validarRespuestaSubida(valor: unknown): RespuestaSubida {
  if (!esObjeto(valor) || typeof valor.directa !== 'boolean') invalida('la subida')
  if (!valor.directa) {
    const tamanoParte = enteroOpcional(valor.tamanoParte, 'la subida')
    const maxBytes = enteroOpcional(valor.maxBytes, 'la subida')
    return {
      directa: false,
      ...(tamanoParte === undefined ? {} : { tamanoParte }),
      ...(maxBytes === undefined ? {} : { maxBytes }),
    }
  }
  const ruta = texto(valor.ruta)
  const url = texto(valor.url)
  const maxBytes = valor.maxBytes
  if (!ruta || !url || typeof maxBytes !== 'number' || !Number.isFinite(maxBytes)) invalida('la subida')
  let destino: URL
  try {
    destino = new URL(url, window.location.href)
  } catch {
    invalida('la subida')
  }
  if (destino.protocol !== 'https:' && destino.origin !== window.location.origin) invalida('la subida')
  return { directa: true, ruta, url: destino.href, maxBytes }
}

/** Respuesta de POST /subidas/partes: la ruta partes/<uuid> y el tamaño de cada parte. */
export function validarSubidaPorPartes(valor: unknown): SubidaPorPartes {
  if (!esObjeto(valor)) invalida('la subida')
  const ruta = texto(valor.ruta)
  const tamanoParte = enteroOpcional(valor.tamanoParte, 'la subida')
  if (!ruta || !/^partes\/[0-9a-f-]{36}$/.test(ruta) || tamanoParte === undefined) invalida('la subida')
  return { ruta, tamanoParte }
}

export function validarDocumentoAdmin(valor: unknown): DocumentoAdmin {
  const publico = validarDocumento(valor, 0)
  if (!publico || !esObjeto(valor)) invalida('el documento')
  return {
    ...publico,
    publicado: valor.publicado === true,
    permiteDescarga: valor.permiteDescarga === true,
    urlVerExterna: texto(valor.urlVerExterna),
    notasInternas: typeof valor.notasInternas === 'string' ? valor.notasInternas : null,
    creadoEn: texto(valor.creadoEn) ?? '',
    actualizadoEn: texto(valor.actualizadoEn) ?? '',
    actualizadoPor: texto(valor.actualizadoPor),
  }
}

export function validarDocumentosAdmin(valor: unknown): DocumentoAdmin[] {
  if (!esObjeto(valor) || !Array.isArray(valor.documentos)) invalida('la lista de documentos')
  const documentos: DocumentoAdmin[] = []
  for (const d of valor.documentos) {
    try {
      documentos.push(validarDocumentoAdmin(d))
    } catch {
      // Un registro mal formado no tumba la lista entera.
    }
  }
  return documentos
}

export function validarCategoria(valor: unknown): CategoriaAdmin {
  if (!esObjeto(valor)) invalida('la categoría')
  const id = entero(valor.id)
  const nombre = texto(valor.nombre)
  if (id === null || !nombre) invalida('la categoría')
  return { id, nombre, orden: entero(valor.orden) ?? 0, documentos: entero(valor.documentos) ?? 0 }
}

export function validarCategorias(valor: unknown): CategoriaAdmin[] {
  if (!esObjeto(valor) || !Array.isArray(valor.categorias)) invalida('la lista de categorías')
  return valor.categorias.map(validarCategoria).sort((a, b) => a.orden - b.orden || a.id - b.id)
}

export function validarPalabra(valor: unknown): PalabraClaveAdmin {
  if (!esObjeto(valor)) invalida('la palabra clave')
  const id = entero(valor.id)
  const t = texto(valor.texto)
  if (id === null || !t) invalida('la palabra clave')
  return { id, texto: t, documentos: entero(valor.documentos) ?? 0 }
}

export function validarPalabras(valor: unknown): PalabraClaveAdmin[] {
  if (!esObjeto(valor) || !Array.isArray(valor.palabras)) invalida('la lista de palabras clave')
  return valor.palabras.map(validarPalabra)
}

const ACCIONES: ReadonlySet<string> = new Set<AccionCambio>([
  'crear',
  'editar',
  'publicar',
  'despublicar',
  'borrar',
  'subir_archivo',
  'quitar_archivo',
  'subir_portada',
  'categoria',
  'palabra_clave',
  'sesion',
])

export function validarCambios(valor: unknown): CambioRegistro[] {
  if (!esObjeto(valor) || !Array.isArray(valor.cambios)) invalida('el registro de cambios')
  const cambios: CambioRegistro[] = []
  for (const c of valor.cambios) {
    if (!esObjeto(c)) continue
    const id = entero(c.id)
    const fecha = texto(c.fecha)
    if (id === null || !fecha) continue
    const accion = typeof c.accion === 'string' && ACCIONES.has(c.accion) ? (c.accion as AccionCambio) : 'editar'
    cambios.push({
      id,
      fecha,
      usuario: texto(c.usuario),
      accion,
      documentoId: texto(c.documentoId),
      detalle: texto(c.detalle),
    })
  }
  return cambios
}

const ESTADOS_REINDEXACION: ReadonlySet<string> = new Set<EstadoReindexacion>([
  'inactiva',
  'en_curso',
  'completada',
  'fallida',
])

/** Estado del índice del Asistente ODES (GET /admin/odes/indice). */
export function validarEstadoIndice(valor: unknown): EstadoIndiceAdmin {
  if (!esObjeto(valor) || !esObjeto(valor.indice) || !esObjeto(valor.repositorio) || !esObjeto(valor.reindexacion)) {
    invalida('el estado del índice')
  }
  const { indice: i, repositorio: r, reindexacion: x } = valor
  const n = (v: unknown) => entero(v) ?? 0
  const estado = typeof x.estado === 'string' && ESTADOS_REINDEXACION.has(x.estado) ? (x.estado as EstadoReindexacion) : 'inactiva'
  return {
    indice: {
      disponible: i.disponible === true,
      generado: texto(i.generado),
      origen: i.origen === 'mysql' || i.origen === 'paquete' ? i.origen : null,
      documentos: n(i.documentos),
      documentosConTexto: n(i.documentosConTexto),
      paginas: n(i.paginas),
      paginasOcr: n(i.paginasOcr),
      bytes: n(i.bytes),
      error: texto(i.error),
    },
    repositorio: {
      publicados: entero(r.publicados),
      actualizado: texto(r.actualizado),
      cambiado: typeof r.cambiado === 'boolean' ? r.cambiado : null,
      motivo: texto(r.motivo),
    },
    reindexacion: {
      estado,
      inicio: texto(x.inicio),
      fin: texto(x.fin),
      usuario: texto(x.usuario),
      error: texto(x.error),
      registro: Array.isArray(x.registro) ? x.registro.filter((l): l is string => typeof l === 'string') : [],
    },
  }
}
