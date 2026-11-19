/**
 * Validación de lo que llega del servidor (eventos del flujo, estado y
 * errores). El servidor es nuestro, pero un proxy, un despliegue a medias o
 * una versión nueva del protocolo pueden mandar algo inesperado: lo que no
 * cumple la forma se ignora en lugar de romper la interfaz.
 */
import type {
  CodigoErrorChat,
  DocumentoEncontrado,
  DocumentoResumen,
  ErrorChat,
  EstadoAsistente,
  EventoChat,
} from './protocolo'

type Objeto = Record<string, unknown>

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const esTexto = (valor: unknown): valor is string => typeof valor === 'string'

const textoOpcional = (valor: unknown): string | undefined =>
  esTexto(valor) && valor.trim() !== '' ? valor : undefined

/** Número de página válido (entero ≥ 1) o null. */
const pagina = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? valor : null

const CODIGOS_ERROR: ReadonlySet<string> = new Set<CodigoErrorChat>([
  'solicitud_invalida',
  'limite_uso',
  'no_disponible',
  'sobrecarga',
  'interno',
])

const TIPOS_DOCUMENTO: ReadonlySet<string> = new Set<DocumentoResumen['tipo']>([
  'pdf',
  'tablero',
  'entrada',
  'imagen',
  'otro',
])

export function validarDocumento(valor: unknown): DocumentoResumen | null {
  if (!esObjeto(valor)) return null
  const { id, titulo, categoria, anio, idioma, tipo, url } = valor
  if (!esTexto(id) || !esTexto(titulo) || !esTexto(url)) return null
  return {
    id,
    titulo,
    subtitulo: textoOpcional(valor.subtitulo),
    categoria: esTexto(categoria) ? categoria : '',
    anio: esTexto(anio) ? anio : typeof anio === 'number' ? String(anio) : 'S. F.',
    idioma: idioma === 'en' ? 'en' : 'es',
    tipo: esTexto(tipo) && TIPOS_DOCUMENTO.has(tipo) ? (tipo as DocumentoResumen['tipo']) : 'otro',
    url,
    portada: textoOpcional(valor.portada),
    urlMiniatura: textoOpcional(valor.urlMiniatura),
  }
}

export function validarDocumentoEncontrado(valor: unknown): DocumentoEncontrado | null {
  const documento = validarDocumento(valor)
  if (!documento || !esObjeto(valor)) return null
  return {
    ...documento,
    urlFragmento: esTexto(valor.urlFragmento) && valor.urlFragmento !== '' ? valor.urlFragmento : documento.url,
    paginaInicio: pagina(valor.paginaInicio),
    paginaFin: pagina(valor.paginaFin),
    extracto: textoOpcional(valor.extracto),
  }
}

/** Cuerpo ErrorChat de una respuesta HTTP de error, o null si no tiene esa forma. */
export function validarErrorChat(valor: unknown): ErrorChat | null {
  if (!esObjeto(valor) || !esTexto(valor.mensaje) || valor.mensaje.trim() === '') return null
  const codigo = esTexto(valor.codigo) && CODIGOS_ERROR.has(valor.codigo) ? valor.codigo : 'interno'
  return { codigo: codigo as CodigoErrorChat, mensaje: valor.mensaje }
}

export function validarEstado(valor: unknown): EstadoAsistente | null {
  if (!esObjeto(valor) || !esObjeto(valor.repositorio)) return null
  const { modo, repositorio } = valor
  if (modo !== 'ia' && modo !== 'busqueda') return null
  const numero = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
  return {
    asistente: 'Asistente ODES',
    modo,
    repositorio: {
      disponible: repositorio.disponible === true,
      documentos: numero(repositorio.documentos),
      documentosConTexto: numero(repositorio.documentosConTexto),
      generado: esTexto(repositorio.generado) ? repositorio.generado : null,
    },
  }
}

/**
 * Interpreta el contenido de un evento SSE. Devuelve null si no es JSON, si
 * no tiene la forma de un EventoChat o si es de un tipo desconocido (una
 * versión más nueva del servidor puede agregar tipos; se ignoran).
 */
export function interpretarEvento(datos: string): EventoChat | null {
  let valor: unknown
  try {
    valor = JSON.parse(datos)
  } catch {
    return null
  }
  if (!esObjeto(valor) || !esTexto(valor.tipo)) return null

  switch (valor.tipo) {
    case 'inicio':
      return valor.modo === 'ia' || valor.modo === 'busqueda' ? { tipo: 'inicio', modo: valor.modo } : null

    case 'busqueda': {
      const { herramienta } = valor
      if (herramienta !== 'buscar' && herramienta !== 'listar' && herramienta !== 'leer') return null
      return { tipo: 'busqueda', herramienta, descripcion: esTexto(valor.descripcion) ? valor.descripcion : '' }
    }

    case 'texto':
      return esTexto(valor.delta) ? { tipo: 'texto', delta: valor.delta } : null

    case 'cita': {
      const { indice } = valor
      const documento = validarDocumento(valor.documento)
      if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 1 || !documento) return null
      return {
        tipo: 'cita',
        indice,
        documento,
        paginaInicio: pagina(valor.paginaInicio),
        paginaFin: pagina(valor.paginaFin),
        url: esTexto(valor.url) && valor.url !== '' ? valor.url : documento.url,
        textoCitado: esTexto(valor.textoCitado) ? valor.textoCitado : '',
      }
    }

    case 'documentos': {
      if (!Array.isArray(valor.documentos)) return null
      const documentos = valor.documentos
        .map(validarDocumentoEncontrado)
        .filter((d): d is DocumentoEncontrado => d !== null)
      return { tipo: 'documentos', titulo: esTexto(valor.titulo) ? valor.titulo : '', documentos }
    }

    case 'fin': {
      const { motivo } = valor
      return motivo === 'completo' || motivo === 'limite_tokens' || motivo === 'rechazo'
        ? { tipo: 'fin', motivo }
        : { tipo: 'fin', motivo: 'completo' }
    }

    case 'error': {
      const error = validarErrorChat(valor)
      return error ? { tipo: 'error', ...error } : { tipo: 'error', codigo: 'interno', mensaje: '' }
    }

    default:
      return null
  }
}
