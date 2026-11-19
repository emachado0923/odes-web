/**
 * Cliente de la API de administración (/api/repositorio/admin/*).
 *
 * - Mismo origen, con la cookie de sesión (credentials: 'same-origin'; la
 *   cookie es HttpOnly y solo viaja a /api/repositorio/admin).
 * - Toda petición que cambia algo (POST/PUT/PATCH/DELETE) lleva la cabecera
 *   X-CSRF-Token con el `csrf` de la sesión.
 * - Un 401 en cualquier petición avisa a la sesión (alNoAutenticado), que
 *   muestra el inicio de sesión sin perder la ruta ni lo que se estaba
 *   editando. El inicio de sesión y la verificación inicial manejan su 401.
 * - Los errores llegan como ErrorAdmin con el mensaje del servidor (en
 *   español, apto para mostrar), los errores por campo y Retry-After.
 * - Las subidas de archivos usan XMLHttpRequest para informar el progreso.
 *   En Vercel el servidor no acepta peticiones de más de 4,5 MB, así que un
 *   documento grande nunca va en una sola petición (POST /subidas dice cómo):
 *   con Supabase Storage se sube directo al bucket con una URL firmada; con
 *   los archivos en la base, por partes de `tamanoParte` bytes (POST
 *   /subidas/partes y un PUT por parte). En los dos casos se termina
 *   avisando al servidor con { subida, nombre, tipo }.
 */
import {
  type ArchivoSubidoDirecto,
  CABECERA_CSRF,
  RUTA_API_REPOSITORIO,
  type CambioRegistro,
  type CategoriaAdmin,
  type CredencialesAdmin,
  type DatosDocumento,
  type DocumentoAdmin,
  type PalabraClaveAdmin,
  type SesionAdmin,
} from '../../api-repositorio'
import type { EstadoIndiceAdmin } from '../../../odes/chat/protocolo'
import { ErrorAdmin, MENSAJES, errorDeRespuesta, esAborto, esErrorAdmin } from './errores'
import {
  validarCambios,
  validarEstadoIndice,
  validarCategoria,
  validarCategorias,
  validarDocumentoAdmin,
  validarDocumentosAdmin,
  validarPalabra,
  validarPalabras,
  validarRespuestaSubida,
  validarSesion,
  validarSubidaPorPartes,
} from './validacionAdmin'

export { ErrorAdmin, esAborto, esErrorAdmin, mensajeDe } from './errores'

export const RUTA_ADMIN_API = `${RUTA_API_REPOSITORIO}/admin`

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    throw new ErrorAdmin('datos', MENSAJES.datos)
  }
}

export interface OpcionesCliente {
  /** Se llama con cada 401 (salvo en las peticiones que lo manejan solas). */
  alNoAutenticado: () => void
}

interface OpcionesPeticion {
  cuerpo?: unknown
  formulario?: FormData
  signal?: AbortSignal
  /** No avisar a la sesión de un 401 (inicio de sesión y verificación inicial). */
  manejar401?: boolean
}

const MUTACIONES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Intentos por parte de una subida por partes cuando falla la red. */
const INTENTOS_PARTE = 3

export interface Progreso {
  cargado: number
  total: number
}

export class ClienteAdmin {
  private readonly opciones: OpcionesCliente
  /** Token CSRF de la sesión actual (solo en memoria). */
  private csrf: string | null = null

  constructor(opciones: OpcionesCliente) {
    this.opciones = opciones
  }

  /** Guarda (o borra, con null) el token CSRF que acompaña a cada petición que cambia algo. */
  usarCsrf(token: string | null): void {
    this.csrf = token
  }

  private cabeceras(metodo: string, json: boolean): Record<string, string> {
    const cabeceras: Record<string, string> = { Accept: 'application/json' }
    if (json) cabeceras['Content-Type'] = 'application/json'
    if (MUTACIONES.has(metodo) && this.csrf) cabeceras[CABECERA_CSRF] = this.csrf
    return cabeceras
  }

  private fallo(error: ErrorAdmin, manejar401: boolean | undefined): ErrorAdmin {
    if (error.estado === 401 && !manejar401) this.opciones.alNoAutenticado()
    return error
  }

  /** Petición JSON. Devuelve el cuerpo ya parseado (undefined en 204). */
  async pedir(metodo: string, ruta: string, opciones: OpcionesPeticion = {}): Promise<unknown> {
    const conJson = opciones.cuerpo !== undefined
    let respuesta: Response
    try {
      respuesta = await fetch(`${RUTA_ADMIN_API}${ruta}`, {
        method: metodo,
        headers: this.cabeceras(metodo, conJson),
        body: conJson ? JSON.stringify(opciones.cuerpo) : opciones.formulario,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: opciones.signal,
      })
    } catch (error) {
      if (esAborto(error) || opciones.signal?.aborted) throw error
      throw new ErrorAdmin('red', MENSAJES.red)
    }
    const texto = await respuesta.text().catch(() => '')
    if (!respuesta.ok) {
      throw this.fallo(
        errorDeRespuesta(respuesta.status, texto, respuesta.headers.get('Retry-After')),
        opciones.manejar401,
      )
    }
    if (respuesta.status === 204 || !texto) return undefined
    return leerJson(texto)
  }

  /** Subida multipart (o binaria, con un Blob) con progreso (XMLHttpRequest). */
  subir(
    metodo: 'PUT' | 'POST',
    ruta: string,
    formulario: FormData | Blob,
    alProgreso?: (p: Progreso) => void,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return new Promise((resolver, rechazar) => {
      if (signal?.aborted) {
        rechazar(new DOMException('Subida cancelada', 'AbortError'))
        return
      }
      const xhr = new XMLHttpRequest()
      xhr.open(metodo, `${RUTA_ADMIN_API}${ruta}`)
      for (const [nombre, valor] of Object.entries(this.cabeceras(metodo, false))) xhr.setRequestHeader(nombre, valor)
      if (!(formulario instanceof FormData)) xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.responseType = 'text'
      if (alProgreso) {
        xhr.upload.addEventListener('progress', (evento) => {
          if (evento.lengthComputable) alProgreso({ cargado: evento.loaded, total: evento.total })
        })
      }
      const abortar = () => xhr.abort()
      signal?.addEventListener('abort', abortar, { once: true })
      xhr.addEventListener('load', () => {
        signal?.removeEventListener('abort', abortar)
        const texto = typeof xhr.responseText === 'string' ? xhr.responseText : ''
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolver(texto ? leerJson(texto) : undefined)
          } catch (error) {
            rechazar(error)
          }
          return
        }
        rechazar(this.fallo(errorDeRespuesta(xhr.status, texto, xhr.getResponseHeader('Retry-After')), false))
      })
      xhr.addEventListener('error', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new ErrorAdmin('red', MENSAJES.red))
      })
      xhr.addEventListener('abort', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new DOMException('Subida cancelada', 'AbortError'))
      })
      xhr.send(formulario)
    })
  }

  /**
   * PUT directo al bucket con la URL firmada (otro origen: sin cookie ni
   * CSRF). Informa el progreso igual que `subir`.
   */
  subirDirecto(url: string, archivo: File, alProgreso?: (p: Progreso) => void, signal?: AbortSignal): Promise<void> {
    return new Promise((resolver, rechazar) => {
      if (signal?.aborted) {
        rechazar(new DOMException('Subida cancelada', 'AbortError'))
        return
      }
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream')
      xhr.setRequestHeader('x-upsert', 'false')
      if (alProgreso) {
        xhr.upload.addEventListener('progress', (evento) => {
          if (evento.lengthComputable) alProgreso({ cargado: evento.loaded, total: evento.total })
        })
      }
      const abortar = () => xhr.abort()
      signal?.addEventListener('abort', abortar, { once: true })
      xhr.addEventListener('load', () => {
        signal?.removeEventListener('abort', abortar)
        if (xhr.status >= 200 && xhr.status < 300) {
          resolver()
          return
        }
        rechazar(
          xhr.status === 413
            ? new ErrorAdmin('demasiado_grande', MENSAJES.demasiado_grande, { estado: 413 })
            : new ErrorAdmin('interno', 'El almacenamiento rechazó el archivo. Intente de nuevo en unos minutos.', {
                estado: xhr.status,
              }),
        )
      })
      xhr.addEventListener('error', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new ErrorAdmin('red', MENSAJES.red))
      })
      xhr.addEventListener('abort', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new DOMException('Subida cancelada', 'AbortError'))
      })
      xhr.send(archivo)
    })
  }

  // ── Sesión ──────────────────────────────────────────────────────────────

  /** SesionAdmin, o null si no hay sesión (401). */
  async obtenerSesion(signal?: AbortSignal): Promise<SesionAdmin | null> {
    try {
      return validarSesion(await this.pedir('GET', '/sesion', { signal, manejar401: true }))
    } catch (error) {
      if (esErrorAdmin(error) && error.estado === 401) return null
      throw error
    }
  }

  async iniciarSesion(credenciales: CredencialesAdmin): Promise<SesionAdmin> {
    return validarSesion(await this.pedir('POST', '/sesion', { cuerpo: credenciales, manejar401: true }))
  }

  async cerrarSesion(): Promise<void> {
    await this.pedir('DELETE', '/sesion', { manejar401: true })
  }

  // ── Documentos ──────────────────────────────────────────────────────────

  async listarDocumentos(signal?: AbortSignal): Promise<DocumentoAdmin[]> {
    return validarDocumentosAdmin(await this.pedir('GET', '/documentos', { signal }))
  }

  async obtenerDocumento(id: string, signal?: AbortSignal): Promise<DocumentoAdmin> {
    return validarDocumentoAdmin(await this.pedir('GET', `/documentos/${encodeURIComponent(id)}`, { signal }))
  }

  async crearDocumento(datos: DatosDocumento): Promise<DocumentoAdmin> {
    return validarDocumentoAdmin(await this.pedir('POST', '/documentos', { cuerpo: datos }))
  }

  async actualizarDocumento(id: string, datos: DatosDocumento): Promise<DocumentoAdmin> {
    return validarDocumentoAdmin(await this.pedir('PUT', `/documentos/${encodeURIComponent(id)}`, { cuerpo: datos }))
  }

  async publicar(id: string, publicar: boolean): Promise<DocumentoAdmin> {
    const accion = publicar ? 'publicar' : 'despublicar'
    return validarDocumentoAdmin(await this.pedir('POST', `/documentos/${encodeURIComponent(id)}/${accion}`))
  }

  async borrarDocumento(id: string, confirmarId: string): Promise<void> {
    await this.pedir('DELETE', `/documentos/${encodeURIComponent(id)}`, { cuerpo: { confirmarId } })
  }

  async subirArchivo(
    id: string,
    archivo: File,
    alProgreso?: (p: Progreso) => void,
    signal?: AbortSignal,
  ): Promise<DocumentoAdmin> {
    const ruta = `/documentos/${encodeURIComponent(id)}/archivo`
    const subida = validarRespuestaSubida(await this.pedir('POST', '/subidas', { signal }))
    const maxBytes = subida.maxBytes
    if (maxBytes !== undefined && archivo.size > maxBytes) {
      throw new ErrorAdmin('demasiado_grande', MENSAJES.demasiado_grande, {
        estado: 413,
        campos: { archivo: MENSAJES.demasiado_grande },
      })
    }
    let rutaSubida: string
    if (subida.directa) {
      await this.subirDirecto(subida.url, archivo, alProgreso, signal)
      rutaSubida = subida.ruta
    } else if (subida.tamanoParte !== undefined && archivo.size > subida.tamanoParte) {
      rutaSubida = await this.subirPorPartes(archivo, alProgreso, signal)
    } else {
      const formulario = new FormData()
      formulario.append('archivo', archivo, archivo.name)
      return validarDocumentoAdmin(await this.subir('PUT', ruta, formulario, alProgreso, signal))
    }
    const cuerpo: ArchivoSubidoDirecto = { subida: rutaSubida, nombre: archivo.name, tipo: archivo.type }
    return validarDocumentoAdmin(await this.pedir('PUT', ruta, { cuerpo, signal }))
  }

  /**
   * Sube `archivo` por partes (archivos en la base) y devuelve la ruta de la
   * subida para terminarla. Las partes van en orden, una a la vez; una parte
   * que falla por la red se reintenta hasta INTENTOS_PARTE veces.
   */
  private async subirPorPartes(
    archivo: File,
    alProgreso?: (p: Progreso) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const { ruta, tamanoParte } = validarSubidaPorPartes(
      await this.pedir('POST', '/subidas/partes', { cuerpo: { bytes: archivo.size }, signal }),
    )
    const total = Math.ceil(archivo.size / tamanoParte)
    for (let n = 0; n < total; n++) {
      const desde = n * tamanoParte
      const parte = archivo.slice(desde, Math.min(archivo.size, desde + tamanoParte))
      const progreso = alProgreso
        ? (p: Progreso) => alProgreso({ cargado: desde + p.cargado, total: archivo.size })
        : undefined
      for (let intento = 1; ; intento++) {
        try {
          await this.subir('PUT', `/subidas/${ruta}/${n}`, parte, progreso, signal)
          break
        } catch (error) {
          if (!esErrorAdmin(error) || error.codigo !== 'red' || intento >= INTENTOS_PARTE) throw error
        }
      }
    }
    alProgreso?.({ cargado: archivo.size, total: archivo.size })
    return ruta
  }

  async quitarArchivo(id: string): Promise<DocumentoAdmin> {
    return validarDocumentoAdmin(await this.pedir('DELETE', `/documentos/${encodeURIComponent(id)}/archivo`))
  }

  async subirPortada(
    id: string,
    portada: Blob,
    miniatura: { datos: Blob; nombre: string } | null,
    alProgreso?: (p: Progreso) => void,
  ): Promise<DocumentoAdmin> {
    const formulario = new FormData()
    formulario.append('portada', portada, 'portada.jpg')
    if (miniatura) formulario.append('miniatura', miniatura.datos, miniatura.nombre)
    return validarDocumentoAdmin(
      await this.subir('PUT', `/documentos/${encodeURIComponent(id)}/portada`, formulario, alProgreso),
    )
  }

  // ── Categorías, palabras clave y cambios ────────────────────────────────

  async listarCategorias(signal?: AbortSignal): Promise<CategoriaAdmin[]> {
    return validarCategorias(await this.pedir('GET', '/categorias', { signal }))
  }

  async crearCategoria(nombre: string): Promise<CategoriaAdmin> {
    return validarCategoria(await this.pedir('POST', '/categorias', { cuerpo: { nombre } }))
  }

  async actualizarCategoria(id: number, cambios: { nombre?: string; orden?: number }): Promise<CategoriaAdmin> {
    return validarCategoria(await this.pedir('PUT', `/categorias/${id}`, { cuerpo: cambios }))
  }

  async borrarCategoria(id: number): Promise<void> {
    await this.pedir('DELETE', `/categorias/${id}`)
  }

  async listarPalabras(signal?: AbortSignal): Promise<PalabraClaveAdmin[]> {
    return validarPalabras(await this.pedir('GET', '/palabras-clave', { signal }))
  }

  async renombrarPalabra(id: number, texto: string): Promise<PalabraClaveAdmin> {
    return validarPalabra(await this.pedir('PUT', `/palabras-clave/${id}`, { cuerpo: { texto } }))
  }

  async borrarPalabra(id: number): Promise<void> {
    await this.pedir('DELETE', `/palabras-clave/${id}`)
  }

  // ── Índice del Asistente ODES (contrato en sites/odes/chat/protocolo.ts) ──

  async estadoIndiceOdes(signal?: AbortSignal): Promise<EstadoIndiceAdmin> {
    return validarEstadoIndice(await this.pedir('GET', '/odes/indice', { signal }))
  }

  /** Inicia la reindexación (202); 409 si ya hay una en curso. */
  async reindexarOdes(): Promise<EstadoIndiceAdmin> {
    return validarEstadoIndice(await this.pedir('POST', '/odes/reindexar'))
  }

  async listarCambios(limite: number, documento: string | null, signal?: AbortSignal): Promise<CambioRegistro[]> {
    const parametros = new URLSearchParams({ limite: String(limite) })
    if (documento) parametros.set('documento', documento)
    return validarCambios(await this.pedir('GET', `/cambios?${parametros}`, { signal }))
  }
}
