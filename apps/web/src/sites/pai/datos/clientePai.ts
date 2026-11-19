/**
 * Cliente de la API del PAI (/api/pai/*): un método tipado por endpoint del
 * contrato (api-pai.ts).
 *
 * - Mismo origen, con la cookie de sesión (credentials: 'same-origin'; la
 *   cookie pai_sesion es HttpOnly y solo viaja a /api/pai).
 * - Toda petición que cambia algo (POST/PUT/PATCH/DELETE) lleva la cabecera
 *   X-CSRF-Token con el `csrf` de la sesión, guardado SOLO en memoria
 *   (usarCsrf; nunca en localStorage).
 * - Un 401 en cualquier petición avisa a la sesión (alNoAutenticado), que
 *   muestra el ingreso sin perder la página. El inicio de sesión y la
 *   verificación inicial manejan su propio 401.
 * - Un 403 `prohibido` también avisa (alProhibido): puede ser que en otra
 *   pestaña se cerró la sesión o entró otra persona (la cookie es de todo el
 *   navegador y este CSRF ya no le sirve); la sesión lo comprueba.
 * - Un 503 en una consulta (GET) se reintenta hasta 2 veces, esperando lo que
 *   diga Retry-After con un máximo de 3 s (la base se estaba conectando). Las
 *   escrituras no se reintentan solas.
 * - Las respuestas se validan a mano (validacionPai.ts); los errores llegan
 *   como ErrorPai con el mensaje del servidor (en español), los errores por
 *   campo y Retry-After.
 * - Evidencias: si el servidor guarda los archivos en Supabase Storage, se
 *   suben directo al bucket privado con una URL firmada (Vercel no acepta
 *   peticiones de más de 4,5 MB); si no, multipart. Las dos con progreso
 *   (XMLHttpRequest).
 */
import {
  CABECERA_CSRF,
  EXTENSIONES_EVIDENCIA,
  LIMITES_PAI,
  PARAMETRO_BIMESTRE_EXPORTACION,
  PARAMETRO_VIGENCIA,
  RUTA_API_PAI,
  RUTAS_API_PAI,
  TIPOS_EVIDENCIA,
  type AsignacionesPai,
  type AutorizacionPai,
  type CambioContrasenaPai,
  type CambiosUsuarioPai,
  type ConsultaRegistroPai,
  type CredencialesPai,
  type DatosAutorizacionPai,
  type DatosReportePai,
  type DatosUsuarioNuevoPai,
  type DatosVigenciaPai,
  type EvidenciaPai,
  type EvidenciaSubidaDirecta,
  type FichaIndicadorPai,
  type FiltrosTableroPai,
  type ListaAutorizacionesPai,
  type ListaUsuariosPai,
  type NumeroBimestre,
  type PaginaRegistroPai,
  type RespuestaReportePai,
  type RespuestaSubidaPai,
  type SesionPai,
  type TableroPai,
  type UsuarioPai,
  type VigenciaPai,
} from '../api-pai'
import { parametrosFiltros } from '../rutas'
import { ErrorPai, MENSAJES, errorDeRespuesta, esAborto, esErrorPai } from './errores'
import {
  validarAutorizacion,
  validarAutorizaciones,
  validarEvidencia,
  validarFicha,
  validarPaginaRegistro,
  validarRespuestaReporte,
  validarRespuestaSubida,
  validarSesion,
  validarSubidaPorPartes,
  validarTablero,
  validarUsuario,
  validarUsuarios,
  validarVigencia,
} from './validacionPai'

export { ErrorPai, esAborto, esErrorPai, mensajeDe } from './errores'

/** Reintentos de una consulta que responde 503. */
export const REINTENTOS_503 = 2
/** Espera máxima entre reintentos (s), aunque Retry-After pida más. */
export const ESPERA_MAXIMA_503 = 3

export interface Progreso {
  cargado: number
  total: number
}

export interface OpcionesClientePai {
  /** Se llama con cada 401 (salvo en las peticiones que lo manejan solas). */
  alNoAutenticado: () => void
  /** Se llama con cada 403 `prohibido` (CSRF que ya no corresponde, otra persona en otra pestaña…). */
  alProhibido?: () => void
  /** Espera entre reintentos (las pruebas la reemplazan). */
  esperar?: (ms: number, signal?: AbortSignal) => Promise<void>
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

function esperarPorDefecto(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (signal?.aborted) {
      rechazar(new DOMException('Petición cancelada', 'AbortError'))
      return
    }
    const temporizador = setTimeout(() => {
      signal?.removeEventListener('abort', cancelar)
      resolver()
    }, ms)
    function cancelar() {
      clearTimeout(temporizador)
      rechazar(new DOMException('Petición cancelada', 'AbortError'))
    }
    signal?.addEventListener('abort', cancelar, { once: true })
  })
}

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    throw new ErrorPai('datos', MENSAJES.datos)
  }
}

function conVigencia(ruta: string, anio?: number | null): string {
  return anio ? `${ruta}?${new URLSearchParams({ [PARAMETRO_VIGENCIA]: String(anio) })}` : ruta
}

/**
 * Problema de un archivo para subirlo como evidencia (validación en el
 * navegador, antes de subir; el servidor vuelve a comprobar el tipo real), o
 * null si se puede subir.
 */
export function problemaEvidencia(archivo: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const nombre = archivo.name.toLowerCase()
  const extension = nombre.includes('.') ? nombre.slice(nombre.lastIndexOf('.')) : ''
  const tipoValido = !archivo.type || (TIPOS_EVIDENCIA as readonly string[]).includes(archivo.type)
  if (!(EXTENSIONES_EVIDENCIA as readonly string[]).includes(extension) || !tipoValido) {
    return MENSAJES.tipo_no_permitido
  }
  if (archivo.size === 0) return 'El archivo está vacío.'
  if (archivo.size > LIMITES_PAI.maxBytesEvidencia) return MENSAJES.demasiado_grande
  return null
}

export class ClientePai {
  private readonly opciones: OpcionesClientePai
  private readonly esperar: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Token CSRF de la sesión actual (solo en memoria). */
  private csrf: string | null = null

  constructor(opciones: OpcionesClientePai) {
    this.opciones = opciones
    this.esperar = opciones.esperar ?? esperarPorDefecto
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

  private fallo(error: ErrorPai, manejar401: boolean | undefined): ErrorPai {
    if (error.estado === 401 && !manejar401) this.opciones.alNoAutenticado()
    if (error.estado === 403 && error.codigo === 'prohibido' && !manejar401) this.opciones.alProhibido?.()
    return error
  }

  /**
   * Petición JSON a RUTA_API_PAI + ruta. Devuelve el cuerpo ya parseado
   * (undefined en 204). Reintenta los 503 de las consultas (GET).
   */
  async pedir(metodo: string, ruta: string, opciones: OpcionesPeticion = {}): Promise<unknown> {
    const conJson = opciones.cuerpo !== undefined
    const reintentos = metodo === 'GET' ? REINTENTOS_503 : 0
    for (let intento = 0; ; intento++) {
      let respuesta: Response
      try {
        respuesta = await fetch(`${RUTA_API_PAI}${ruta}`, {
          method: metodo,
          headers: this.cabeceras(metodo, conJson),
          body: conJson ? JSON.stringify(opciones.cuerpo) : opciones.formulario,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: opciones.signal,
        })
      } catch (error) {
        if (esAborto(error) || opciones.signal?.aborted) throw error
        throw new ErrorPai('red', MENSAJES.red)
      }
      const texto = await respuesta.text().catch(() => '')
      if (respuesta.ok) {
        if (respuesta.status === 204 || !texto) return undefined
        return leerJson(texto)
      }
      const error = errorDeRespuesta(respuesta.status, texto, respuesta.headers.get('Retry-After'))
      if (respuesta.status === 503 && intento < reintentos) {
        const segundos = Math.min(ESPERA_MAXIMA_503, Math.max(0, error.reintentarEn ?? 1))
        await this.esperar(segundos * 1000, opciones.signal)
        continue
      }
      throw this.fallo(error, opciones.manejar401)
    }
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
      xhr.open(metodo, `${RUTA_API_PAI}${ruta}`)
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
        rechazar(new ErrorPai('red', MENSAJES.red))
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
            ? new ErrorPai('demasiado_grande', MENSAJES.demasiado_grande, { estado: 413 })
            : new ErrorPai('interno', 'El almacenamiento rechazó el archivo. Intente de nuevo en unos minutos.', {
                estado: xhr.status,
              }),
        )
      })
      xhr.addEventListener('error', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new ErrorPai('red', MENSAJES.red))
      })
      xhr.addEventListener('abort', () => {
        signal?.removeEventListener('abort', abortar)
        rechazar(new DOMException('Subida cancelada', 'AbortError'))
      })
      xhr.send(archivo)
    })
  }

  // ── Sesión ──────────────────────────────────────────────────────────────

  /** SesionPai, o null si no hay sesión (401). */
  async obtenerSesion(signal?: AbortSignal): Promise<SesionPai | null> {
    try {
      return validarSesion(await this.pedir('GET', RUTAS_API_PAI.sesion, { signal, manejar401: true }))
    } catch (error) {
      if (esErrorPai(error) && error.estado === 401) return null
      throw error
    }
  }

  /** Lanza ErrorPai (401 credenciales, 429 con reintentarEn, 503…). */
  async iniciarSesion(credenciales: CredencialesPai): Promise<SesionPai> {
    const sesion = validarSesion(
      await this.pedir('POST', RUTAS_API_PAI.sesion, { cuerpo: credenciales, manejar401: true }),
    )
    this.usarCsrf(sesion.csrf)
    return sesion
  }

  async cerrarSesion(): Promise<void> {
    try {
      await this.pedir('DELETE', RUTAS_API_PAI.sesion, { manejar401: true })
    } finally {
      this.usarCsrf(null)
    }
  }

  /** PUT /sesion/contrasena: devuelve la sesión actualizada (debeCambiarContrasena: false). */
  async cambiarContrasena(datos: CambioContrasenaPai): Promise<SesionPai> {
    const sesion = validarSesion(await this.pedir('PUT', RUTAS_API_PAI.contrasena, { cuerpo: datos }))
    this.usarCsrf(sesion.csrf)
    return sesion
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  async obtenerVigencia(anio?: number | null, signal?: AbortSignal): Promise<VigenciaPai> {
    return validarVigencia(await this.pedir('GET', conVigencia(RUTAS_API_PAI.vigencia, anio), { signal }))
  }

  async obtenerTablero(anio?: number | null, signal?: AbortSignal): Promise<TableroPai> {
    return validarTablero(await this.pedir('GET', conVigencia(RUTAS_API_PAI.tablero, anio), { signal }))
  }

  /** Ficha completa por id o por código (SAF-TH-02). */
  async obtenerFicha(ref: number | string, signal?: AbortSignal): Promise<FichaIndicadorPai> {
    return validarFicha(await this.pedir('GET', RUTAS_API_PAI.indicador(ref), { signal }))
  }

  // ── Reportes y evidencias ───────────────────────────────────────────────

  /** PUT del reporte (campos ausentes no cambian). 409 si actualizadoEn ya no coincide. */
  async guardarReporte(
    indicadorId: number,
    bimestre: NumeroBimestre,
    datos: DatosReportePai,
    signal?: AbortSignal,
  ): Promise<RespuestaReportePai> {
    return validarRespuestaReporte(
      await this.pedir('PUT', RUTAS_API_PAI.reporte(indicadorId, bimestre), { cuerpo: datos, signal }),
    )
  }

  async prepararSubidaEvidencia(
    indicadorId: number,
    bimestre: NumeroBimestre,
    signal?: AbortSignal,
  ): Promise<RespuestaSubidaPai> {
    return validarRespuestaSubida(
      await this.pedir('POST', RUTAS_API_PAI.subidasEvidencia(indicadorId, bimestre), { signal }),
    )
  }

  /**
   * Sube una evidencia por el camino que indique el servidor (directo al
   * bucket privado, multipart o, si pesa más de una parte, por partes: en
   * Vercel una petición no puede llevar más de 4,5 MB) y devuelve la
   * evidencia creada. Valide antes con problemaEvidencia(archivo).
   */
  async subirEvidencia(
    indicadorId: number,
    bimestre: NumeroBimestre,
    archivo: File,
    alProgreso?: (p: Progreso) => void,
    signal?: AbortSignal,
  ): Promise<EvidenciaPai> {
    const ruta = RUTAS_API_PAI.evidencias(indicadorId, bimestre)
    const subida = await this.prepararSubidaEvidencia(indicadorId, bimestre, signal)
    const maxBytes = subida.maxBytes
    if (maxBytes !== undefined && archivo.size > maxBytes) {
      throw new ErrorPai('demasiado_grande', MENSAJES.demasiado_grande, {
        estado: 413,
        campos: { archivo: MENSAJES.demasiado_grande },
      })
    }
    let rutaSubida: string
    if (subida.directa) {
      await this.subirDirecto(subida.url, archivo, alProgreso, signal)
      rutaSubida = subida.ruta
    } else if (subida.tamanoParte !== undefined && archivo.size > subida.tamanoParte) {
      rutaSubida = await this.subirPorPartes(indicadorId, bimestre, archivo, alProgreso, signal)
    } else {
      const formulario = new FormData()
      formulario.append('archivo', archivo, archivo.name)
      return validarEvidencia(await this.subir('POST', ruta, formulario, alProgreso, signal))
    }
    const cuerpo: EvidenciaSubidaDirecta = { subida: rutaSubida, nombre: archivo.name, tipo: archivo.type }
    return validarEvidencia(await this.pedir('POST', ruta, { cuerpo, signal }))
  }

  /**
   * Sube `archivo` por partes (archivos en la base) y devuelve la ruta de la
   * subida para terminarla. Las partes van en orden, una a la vez; una parte
   * que falla por la red se reintenta hasta INTENTOS_PARTE veces.
   */
  private async subirPorPartes(
    indicadorId: number,
    bimestre: NumeroBimestre,
    archivo: File,
    alProgreso?: (p: Progreso) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const { ruta, tamanoParte } = validarSubidaPorPartes(
      await this.pedir('POST', RUTAS_API_PAI.subidasPorPartesEvidencia(indicadorId, bimestre), {
        cuerpo: { bytes: archivo.size },
        signal,
      }),
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
          await this.subir('PUT', RUTAS_API_PAI.parteSubida(ruta, n), parte, progreso, signal)
          break
        } catch (error) {
          if (!esErrorPai(error) || error.codigo !== 'red' || intento >= INTENTOS_PARTE) throw error
        }
      }
    }
    alProgreso?.({ cargado: archivo.size, total: archivo.size })
    return ruta
  }

  async borrarEvidencia(id: number): Promise<void> {
    await this.pedir('DELETE', RUTAS_API_PAI.evidencia(id))
  }

  /** URL de descarga de una evidencia (para un <a href>: la cookie viaja sola). */
  urlEvidencia(id: number): string {
    return `${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(id)}`
  }

  // ── Administración ──────────────────────────────────────────────────────

  /** Usuarios con sus asignaciones de esa vigencia (por defecto, la más reciente). */
  async listarUsuarios(signal?: AbortSignal, anio?: number | null): Promise<ListaUsuariosPai> {
    return validarUsuarios(await this.pedir('GET', conVigencia(RUTAS_API_PAI.adminUsuarios, anio), { signal }))
  }

  async crearUsuario(datos: DatosUsuarioNuevoPai): Promise<UsuarioPai> {
    return validarUsuario(await this.pedir('POST', RUTAS_API_PAI.adminUsuarios, { cuerpo: datos }))
  }

  async actualizarUsuario(id: number, cambios: CambiosUsuarioPai): Promise<UsuarioPai> {
    return validarUsuario(await this.pedir('PATCH', RUTAS_API_PAI.adminUsuario(id), { cuerpo: cambios }))
  }

  /** Reemplaza las asignaciones del usuario en esa vigencia (por defecto, la más reciente). */
  async asignar(id: number, asignaciones: AsignacionesPai, anio?: number | null): Promise<UsuarioPai> {
    return validarUsuario(
      await this.pedir('PUT', conVigencia(RUTAS_API_PAI.adminAsignaciones(id), anio), { cuerpo: asignaciones }),
    )
  }

  /** Abre (1-6) o cierra (null) el bimestre. */
  async actualizarVigencia(datos: DatosVigenciaPai, anio?: number | null): Promise<VigenciaPai> {
    return validarVigencia(await this.pedir('PUT', conVigencia(RUTAS_API_PAI.adminVigencia, anio), { cuerpo: datos }))
  }

  async listarAutorizaciones(signal?: AbortSignal): Promise<ListaAutorizacionesPai> {
    return validarAutorizaciones(await this.pedir('GET', RUTAS_API_PAI.adminAutorizaciones, { signal }))
  }

  async otorgarAutorizacion(datos: DatosAutorizacionPai): Promise<AutorizacionPai> {
    return validarAutorizacion(await this.pedir('POST', RUTAS_API_PAI.adminAutorizaciones, { cuerpo: datos }))
  }

  async revocarAutorizacion(id: number): Promise<AutorizacionPai> {
    return validarAutorizacion(await this.pedir('DELETE', RUTAS_API_PAI.adminAutorizacion(id)))
  }

  async listarRegistro(consulta: ConsultaRegistroPai = {}, signal?: AbortSignal): Promise<PaginaRegistroPai> {
    const parametros = new URLSearchParams()
    if (consulta.pagina) parametros.set('pagina', String(consulta.pagina))
    if (consulta.usuario) parametros.set('usuario', String(consulta.usuario))
    if (consulta.indicador) parametros.set('indicador', String(consulta.indicador))
    if (consulta.accion) parametros.set('accion', consulta.accion)
    const texto = parametros.toString()
    const ruta = texto ? `${RUTAS_API_PAI.adminRegistro}?${texto}` : RUTAS_API_PAI.adminRegistro
    return validarPaginaRegistro(await this.pedir('GET', ruta, { signal }))
  }

  /**
   * URL de la exportación CSV con los filtros del tablero (para un
   * <a href download>: la cookie viaja sola).
   */
  urlExportarCsv(filtros: FiltrosTableroPai = {}, bimestre?: NumeroBimestre | null, anio?: number | null): string {
    const parametros = parametrosFiltros(filtros)
    if (bimestre) parametros.set(PARAMETRO_BIMESTRE_EXPORTACION, String(bimestre))
    if (anio) parametros.set(PARAMETRO_VIGENCIA, String(anio))
    const texto = parametros.toString()
    return `${RUTA_API_PAI}${RUTAS_API_PAI.adminExportar}${texto ? `?${texto}` : ''}`
  }
}
