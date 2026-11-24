/**
 * Cliente HTTP de /api/crm (contrato en ../api-crm.ts).
 *
 * - pedirJson: fetch del mismo origen (credentials 'same-origin', sin caché).
 *   Manda Content-Type JSON solo si hay cuerpo y X-CSRF-Token solo en las
 *   peticiones que cambian algo y traen `csrf` (las del líder). 204 → undefined.
 * - subirArchivo: XMLHttpRequest multipart con el campo `archivo`, para poder
 *   informar el progreso (0..1) y cancelar. Mismas cabeceras y errores.
 * - Todo error sale como ErrorCrmHttp: el código del servidor (ErrorCrm), el
 *   status (0 si no hubo respuesta), los errores por campo y Retry-After en
 *   segundos. `mensajeDe` da un texto para mostrar; `esNoAutenticado`, si es 401.
 * - `ruta` puede ser completa ('/api/crm/personas') o relativa a /api/crm
 *   ('/personas').
 *
 * apiEquipo no lleva sesión (el equipo entra sin cuenta). crearApiLider(csrf)
 * arma las llamadas del líder con su token CSRF; apiSesionLider abre y consulta
 * la sesión.
 */
import {
  CABECERA_CSRF,
  type ArchivoCrm,
  type CodigoErrorCrm,
  type CorreoCrm,
  type CuentaCorreoCrm,
  type EdicionPersonaCrm,
  type EdicionTareaCrm,
  type EstadoAvisoCrm,
  type EstadoCorreo,
  type EstadoTarea,
  type GuardarCuentaCorreoCrm,
  type NuevaPersonaCrm,
  type NuevaTareaCrm,
  type NuevaTareaPropiaCrm,
  type PersonaAdminCrm,
  type PersonaCrm,
  type PruebaCorreoCrm,
  type ResultadoDevolverCrm,
  type ResultadoPruebaCorreoCrm,
  type ResultadoTerminarCrm,
  type ResumenLiderCrm,
  type SesionLiderCrm,
  type TableroPersonaCrm,
  type TareaCrm,
  type TareaDetalleCrm,
} from '../api-crm'

export const RUTA_API_CRM = '/api/crm'

export type CodigoErrorHttpCrm = CodigoErrorCrm | 'red' | 'abortado'

const CODIGOS_SERVIDOR: readonly CodigoErrorCrm[] = [
  'solicitud_invalida',
  'no_autenticado',
  'prohibido',
  'no_encontrado',
  'conflicto',
  'demasiado_grande',
  'tipo_no_permitido',
  'demasiados_intentos',
  'no_disponible',
  'interno',
]

/** Textos por defecto, cuando el servidor no manda mensaje (o no respondió). */
const MENSAJES: Record<CodigoErrorHttpCrm, string> = {
  solicitud_invalida: 'Revise los datos e intente de nuevo.',
  no_autenticado: 'La sesión no existe o venció. Entre de nuevo con la contraseña.',
  prohibido: 'El servidor rechazó la solicitud. Recargue la página e intente de nuevo.',
  no_encontrado: 'No se encontró lo que buscaba. Puede que la hayan quitado o cambiado.',
  conflicto: 'No se pudo hacer porque la tarea cambió. Recargue la página para ver cómo quedó.',
  demasiado_grande: 'El archivo es demasiado grande.',
  tipo_no_permitido: 'Ese tipo de archivo no se puede subir.',
  demasiados_intentos: 'Demasiados intentos.',
  no_disponible: 'El servicio no está disponible en este momento. Intente de nuevo en unos minutos.',
  interno: 'Ocurrió un error en el servidor. Intente de nuevo en unos minutos.',
  red: 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.',
  abortado: 'Se canceló la operación.',
}

const CODIGO_POR_ESTADO: Readonly<Record<number, CodigoErrorCrm>> = {
  400: 'solicitud_invalida',
  401: 'no_autenticado',
  403: 'prohibido',
  404: 'no_encontrado',
  409: 'conflicto',
  413: 'demasiado_grande',
  415: 'tipo_no_permitido',
  429: 'demasiados_intentos',
  503: 'no_disponible',
}

export class ErrorCrmHttp extends Error {
  readonly codigo: CodigoErrorHttpCrm
  /** Status HTTP; 0 si no hubo respuesta (red o cancelada). */
  readonly estado: number
  /** Errores por campo (formularios): { titulo: 'Escriba el título.' }. */
  readonly campos?: Record<string, string>
  /** Segundos que pide esperar el servidor (Retry-After), si los dijo. */
  readonly reintentarEn?: number

  constructor(
    codigo: CodigoErrorHttpCrm,
    mensaje: string,
    opciones: { estado?: number; campos?: Record<string, string>; reintentarEn?: number } = {},
  ) {
    super(mensaje)
    this.name = 'ErrorCrmHttp'
    this.codigo = codigo
    this.estado = opciones.estado ?? 0
    if (opciones.campos && Object.keys(opciones.campos).length > 0) this.campos = opciones.campos
    if (opciones.reintentarEn !== undefined) this.reintentarEn = opciones.reintentarEn
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Retry-After en segundos: un entero o una fecha HTTP. */
function leerReintentar(valor: string | null): number | undefined {
  if (!valor) return undefined
  const texto = valor.trim()
  if (/^\d+$/.test(texto)) return Number(texto)
  const fecha = Date.parse(texto)
  return Number.isNaN(fecha) ? undefined : Math.max(0, Math.ceil((fecha - Date.now()) / 1000))
}

/** ErrorCrmHttp a partir del status, el cuerpo (texto, ErrorCrm si es JSON) y Retry-After. */
function errorDeRespuesta(estado: number, texto: string, reintentar: string | null): ErrorCrmHttp {
  let cuerpo: unknown = null
  try {
    cuerpo = texto ? JSON.parse(texto) : null
  } catch {
    cuerpo = null // un proxy puede responder HTML
  }
  const delServidor =
    esObjeto(cuerpo) && typeof cuerpo.codigo === 'string' && (CODIGOS_SERVIDOR as readonly string[]).includes(cuerpo.codigo)
      ? (cuerpo.codigo as CodigoErrorCrm)
      : null
  const codigo = delServidor ?? CODIGO_POR_ESTADO[estado] ?? 'interno'
  const mensaje =
    esObjeto(cuerpo) && typeof cuerpo.mensaje === 'string' && cuerpo.mensaje.trim() ? cuerpo.mensaje.trim() : MENSAJES[codigo]
  const campos: Record<string, string> = {}
  if (esObjeto(cuerpo) && esObjeto(cuerpo.campos)) {
    for (const [campo, valor] of Object.entries(cuerpo.campos)) if (typeof valor === 'string') campos[campo] = valor
  }
  return new ErrorCrmHttp(codigo, mensaje, { estado, campos, reintentarEn: leerReintentar(reintentar) })
}

function errorRed(): ErrorCrmHttp {
  return new ErrorCrmHttp('red', MENSAJES.red)
}

function errorAbortado(): ErrorCrmHttp {
  return new ErrorCrmHttp('abortado', MENSAJES.abortado)
}

function esAborto(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError')
}

function leerJson<T>(texto: string, estado: number): T {
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new ErrorCrmHttp('interno', 'La respuesta del servidor no se pudo leer. Intente de nuevo.', { estado })
  }
}

/** Espera legible en español: «45 segundos», «15 minutos», «2 horas». */
function esperaLegible(segundos: number): string {
  if (segundos < 60) return segundos === 1 ? '1 segundo' : `${segundos} segundos`
  if (segundos < 3600) {
    const minutos = Math.ceil(segundos / 60)
    return minutos === 1 ? '1 minuto' : `${minutos} minutos`
  }
  const horas = Math.ceil(segundos / 3600)
  return horas === 1 ? '1 hora' : `${horas} horas`
}

/** Texto para mostrarle a la persona, sea cual sea el error. */
export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorCrmHttp) {
    const base = error.message || MENSAJES[error.codigo]
    if (error.reintentarEn !== undefined && error.reintentarEn > 0 && !/segundo|minuto|hora/i.test(base)) {
      return `${base} Puede intentar de nuevo en ${esperaLegible(error.reintentarEn)}.`
    }
    return base
  }
  return 'Ocurrió un error inesperado. Recargue la página e intente de nuevo.'
}

/** ¿Es un 401 (la sesión del líder no existe o venció)? */
export function esNoAutenticado(error: unknown): boolean {
  return error instanceof ErrorCrmHttp && error.estado === 401
}

/** ¿Se canceló la petición (AbortSignal)? Esos errores no se muestran. */
export function esCancelacion(error: unknown): boolean {
  return error instanceof ErrorCrmHttp ? error.codigo === 'abortado' : error instanceof Error && error.name === 'AbortError'
}

function urlDe(ruta: string): string {
  return ruta.startsWith('/api/') ? ruta : `${RUTA_API_CRM}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}

/** Agrega la consulta (?a=1&b=2) sin los valores vacíos. */
function conConsulta(ruta: string, consulta: Record<string, string | number | undefined | null>): string {
  const parametros = new URLSearchParams()
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor === undefined || valor === null || valor === '') continue
    parametros.set(clave, String(valor))
  }
  const texto = parametros.toString()
  return texto ? `${ruta}?${texto}` : ruta
}

export interface OpcionesPeticion {
  /** Token CSRF de la sesión del líder: va solo en las peticiones que cambian algo. */
  csrf?: string | null
  signal?: AbortSignal
}

export async function pedirJson<T>(
  metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  ruta: string,
  cuerpo?: unknown,
  opciones: OpcionesPeticion = {},
): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' }
  const conCuerpo = cuerpo !== undefined && metodo !== 'GET'
  if (conCuerpo) cabeceras['Content-Type'] = 'application/json'
  if (metodo !== 'GET' && opciones.csrf) cabeceras[CABECERA_CSRF] = opciones.csrf

  let respuesta: Response
  let texto: string
  try {
    respuesta = await fetch(urlDe(ruta), {
      method: metodo,
      headers: cabeceras,
      body: conCuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opciones.signal,
    })
    texto = respuesta.status === 204 ? '' : await respuesta.text()
  } catch (error) {
    throw esAborto(error, opciones.signal) ? errorAbortado() : errorRed()
  }

  if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, texto, respuesta.headers.get('Retry-After'))
  if (respuesta.status === 204 || !texto) return undefined as T
  return leerJson<T>(texto, respuesta.status)
}

export interface OpcionesSubida {
  /** POST (por defecto) o PUT (la foto de una persona). */
  metodo?: 'POST' | 'PUT'
  csrf?: string | null
  /** Fracción subida, de 0 a 1. */
  alProgreso?: (fraccion: number) => void
  signal?: AbortSignal
}

export function subirArchivo<T>(ruta: string, archivo: File, opciones: OpcionesSubida = {}): Promise<T> {
  const { metodo = 'POST', csrf, alProgreso, signal } = opciones
  return new Promise<T>((resolver, rechazar) => {
    if (signal?.aborted) {
      rechazar(errorAbortado())
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open(metodo, urlDe(ruta))
    xhr.setRequestHeader('Accept', 'application/json')
    if (csrf) xhr.setRequestHeader(CABECERA_CSRF, csrf)
    xhr.responseType = 'text'

    if (alProgreso) {
      xhr.upload.addEventListener('progress', (evento) => {
        if (evento.lengthComputable && evento.total > 0) alProgreso(Math.min(1, evento.loaded / evento.total))
      })
    }
    const abortar = () => xhr.abort()
    signal?.addEventListener('abort', abortar, { once: true })
    const soltar = () => signal?.removeEventListener('abort', abortar)

    xhr.addEventListener('load', () => {
      soltar()
      const texto = typeof xhr.responseText === 'string' ? xhr.responseText : ''
      if (xhr.status >= 200 && xhr.status < 300) {
        alProgreso?.(1)
        if (xhr.status === 204 || !texto) {
          resolver(undefined as T)
          return
        }
        try {
          resolver(leerJson<T>(texto, xhr.status))
        } catch (error) {
          rechazar(error)
        }
        return
      }
      rechazar(errorDeRespuesta(xhr.status, texto, xhr.getResponseHeader('Retry-After')))
    })
    xhr.addEventListener('error', () => {
      soltar()
      rechazar(errorRed())
    })
    xhr.addEventListener('abort', () => {
      soltar()
      rechazar(errorAbortado())
    })

    const datos = new FormData()
    datos.append('archivo', archivo, archivo.name)
    xhr.send(datos)
  })
}

// ── Equipo (sin sesión) ──────────────────────────────────────────────────────

const deTarea = (personaId: number, tareaId: number) => `/personas/${personaId}/tareas/${tareaId}`

export const apiEquipo = {
  personas(signal?: AbortSignal): Promise<PersonaCrm[]> {
    return pedirJson<PersonaCrm[]>('GET', '/personas', undefined, { signal })
  },
  /** Por defecto, de las terminadas solo las recientes; `todas` las trae todas. */
  tablero(personaId: number, todas = false, signal?: AbortSignal): Promise<TableroPersonaCrm> {
    const ruta = conConsulta(`/personas/${personaId}/tareas`, { terminadas: todas ? 'todas' : undefined })
    return pedirJson<TableroPersonaCrm>('GET', ruta, undefined, { signal })
  },
  tarea(personaId: number, tareaId: number, signal?: AbortSignal): Promise<TareaDetalleCrm> {
    return pedirJson<TareaDetalleCrm>('GET', deTarea(personaId, tareaId), undefined, { signal })
  },
  /** La persona se crea una tarea a sí misma (solo con el permiso puedeCrearTareas; si no, 403). */
  crearTareaPropia(personaId: number, datos: NuevaTareaPropiaCrm): Promise<TareaDetalleCrm> {
    return pedirJson<TareaDetalleCrm>('POST', `/personas/${personaId}/tareas`, datos)
  },
  cambiarEstado(personaId: number, tareaId: number, estado: 'pendiente' | 'en_proceso'): Promise<TareaDetalleCrm> {
    return pedirJson<TareaDetalleCrm>('POST', `${deTarea(personaId, tareaId)}/estado`, { estado })
  },
  subirEntregable(personaId: number, tareaId: number, archivo: File, opciones: OpcionesSubida = {}): Promise<ArchivoCrm> {
    return subirArchivo<ArchivoCrm>(`${deTarea(personaId, tareaId)}/entregables`, archivo, { ...opciones, metodo: 'POST' })
  },
  quitarEntregable(personaId: number, tareaId: number, archivoId: number): Promise<void> {
    return pedirJson<void>('DELETE', `${deTarea(personaId, tareaId)}/entregables/${archivoId}`)
  },
  /** La nota es opcional: vacía no se manda. */
  terminar(personaId: number, tareaId: number, nota: string): Promise<ResultadoTerminarCrm> {
    const limpia = nota.trim()
    return pedirJson<ResultadoTerminarCrm>('POST', `${deTarea(personaId, tareaId)}/terminar`, limpia ? { nota: limpia } : {})
  },
}

// ── Líder ────────────────────────────────────────────────────────────────────

export const apiSesionLider = {
  /** La sesión abierta, o null si no hay (401). */
  async obtener(): Promise<SesionLiderCrm | null> {
    try {
      return await pedirJson<SesionLiderCrm>('GET', '/lider/sesion')
    } catch (error) {
      if (esNoAutenticado(error)) return null
      throw error
    }
  },
  iniciar(contrasena: string): Promise<SesionLiderCrm> {
    return pedirJson<SesionLiderCrm>('POST', '/lider/sesion', { contrasena })
  },
}

export interface FiltroTareasLider {
  responsable?: number
  estado?: EstadoTarea
  q?: string
  terminadas?: 'recientes' | 'todas'
}

export type ApiLider = ReturnType<typeof crearApiLider>

/** Llamadas del líder con el token CSRF de su sesión (SesionLiderCrm.csrf). */
export function crearApiLider(csrf: string) {
  const op = { csrf }
  return {
    cerrarSesion(): Promise<void> {
      return pedirJson<void>('DELETE', '/lider/sesion', undefined, op)
    },
    resumen(signal?: AbortSignal): Promise<ResumenLiderCrm> {
      return pedirJson<ResumenLiderCrm>('GET', '/lider/resumen', undefined, { signal })
    },
    tareas(filtro: FiltroTareasLider = {}, signal?: AbortSignal): Promise<TareaCrm[]> {
      const ruta = conConsulta('/lider/tareas', {
        responsable: filtro.responsable,
        estado: filtro.estado,
        q: filtro.q?.trim(),
        terminadas: filtro.terminadas,
      })
      return pedirJson<TareaCrm[]>('GET', ruta, undefined, { signal })
    },
    crearTarea(datos: NuevaTareaCrm): Promise<TareaDetalleCrm> {
      return pedirJson<TareaDetalleCrm>('POST', '/lider/tareas', datos, op)
    },
    tarea(id: number, signal?: AbortSignal): Promise<TareaDetalleCrm> {
      return pedirJson<TareaDetalleCrm>('GET', `/lider/tareas/${id}`, undefined, { signal })
    },
    editarTarea(id: number, datos: EdicionTareaCrm): Promise<TareaDetalleCrm> {
      return pedirJson<TareaDetalleCrm>('PATCH', `/lider/tareas/${id}`, datos, op)
    },
    eliminarTarea(id: number): Promise<void> {
      return pedirJson<void>('DELETE', `/lider/tareas/${id}`, undefined, op)
    },
    subirAdjunto(id: number, archivo: File, opciones: OpcionesSubida = {}): Promise<ArchivoCrm> {
      return subirArchivo<ArchivoCrm>(`/lider/tareas/${id}/adjuntos`, archivo, { ...opciones, metodo: 'POST', csrf })
    },
    quitarAdjunto(id: number, archivoId: number): Promise<void> {
      return pedirJson<void>('DELETE', `/lider/tareas/${id}/adjuntos/${archivoId}`, undefined, op)
    },
    avisar(id: number): Promise<EstadoAvisoCrm> {
      return pedirJson<EstadoAvisoCrm>('POST', `/lider/tareas/${id}/avisar`, undefined, op)
    },
    devolver(id: number, observacion: string): Promise<ResultadoDevolverCrm> {
      return pedirJson<ResultadoDevolverCrm>('POST', `/lider/tareas/${id}/devolver`, { observacion: observacion.trim() }, op)
    },
    correos(estado?: EstadoCorreo, signal?: AbortSignal): Promise<CorreoCrm[]> {
      return pedirJson<CorreoCrm[]>('GET', conConsulta('/lider/correos', { estado }), undefined, { signal })
    },
    reintentarCorreo(id: number): Promise<CorreoCrm> {
      return pedirJson<CorreoCrm>('POST', `/lider/correos/${id}/reintentar`, undefined, op)
    },
    /** La cuenta desde la que salen los avisos (nunca trae la contraseña). */
    correoCuenta(signal?: AbortSignal): Promise<CuentaCorreoCrm> {
      return pedirJson<CuentaCorreoCrm>('GET', '/lider/correo/cuenta', undefined, { signal })
    },
    /** Sin `clave` (o vacía), el servidor conserva la guardada. */
    guardarCorreoCuenta(datos: GuardarCuentaCorreoCrm): Promise<CuentaCorreoCrm> {
      return pedirJson<CuentaCorreoCrm>('PUT', '/lider/correo/cuenta', datos, op)
    },
    borrarCorreoCuenta(): Promise<CuentaCorreoCrm> {
      return pedirJson<CuentaCorreoCrm>('DELETE', '/lider/correo/cuenta', undefined, op)
    },
    /** Correo de prueba con la cuenta efectiva: a `para` o, vacío, al líder. */
    probarCorreo(para?: string): Promise<ResultadoPruebaCorreoCrm> {
      const destino = para?.trim()
      const cuerpo: PruebaCorreoCrm = destino ? { para: destino } : {}
      return pedirJson<ResultadoPruebaCorreoCrm>('POST', '/lider/correo/prueba', cuerpo, op)
    },
    personas(signal?: AbortSignal): Promise<PersonaAdminCrm[]> {
      return pedirJson<PersonaAdminCrm[]>('GET', '/lider/personas', undefined, { signal })
    },
    crearPersona(datos: NuevaPersonaCrm): Promise<PersonaAdminCrm> {
      return pedirJson<PersonaAdminCrm>('POST', '/lider/personas', datos, op)
    },
    editarPersona(id: number, datos: EdicionPersonaCrm): Promise<PersonaAdminCrm> {
      return pedirJson<PersonaAdminCrm>('PATCH', `/lider/personas/${id}`, datos, op)
    },
    subirFoto(id: number, archivo: File, opciones: OpcionesSubida = {}): Promise<PersonaAdminCrm> {
      return subirArchivo<PersonaAdminCrm>(`/lider/personas/${id}/foto`, archivo, { ...opciones, metodo: 'PUT', csrf })
    },
    quitarFoto(id: number): Promise<PersonaAdminCrm> {
      return pedirJson<PersonaAdminCrm>('DELETE', `/lider/personas/${id}/foto`, undefined, op)
    },
  }
}
