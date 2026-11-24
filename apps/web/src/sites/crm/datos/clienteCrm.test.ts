import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../api-crm'
import { apiEquipo, apiSesionLider, crearApiLider, ErrorCrmHttp, esNoAutenticado, mensajeDe, pedirJson, subirArchivo } from './clienteCrm'

const fetchSimulado = vi.fn<typeof fetch>()

function respuesta(estado: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Response {
  const texto = cuerpo === undefined ? null : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  return new Response(texto, { status: estado, headers: { 'Content-Type': 'application/json', ...cabeceras } })
}

/** La petición número `i` que llegó a fetch: URL, método, cabeceras y cuerpo. */
function peticion(i = 0) {
  const [url, init] = fetchSimulado.mock.calls[i]
  return {
    url: String(url),
    init: init ?? {},
    metodo: init?.method,
    cabeceras: (init?.headers ?? {}) as Record<string, string>,
    cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body,
  }
}

/** El ErrorCrmHttp con que se rechaza la promesa (falla si se resuelve o si es otro error). */
async function errorDe(promesa: Promise<unknown>): Promise<ErrorCrmHttp> {
  const resultado = await promesa.then(
    () => new Error('Se esperaba un error'),
    (error: unknown) => error,
  )
  if (!(resultado instanceof ErrorCrmHttp)) throw resultado instanceof Error ? resultado : new Error(String(resultado))
  return resultado
}

beforeEach(() => {
  fetchSimulado.mockReset()
  vi.stubGlobal('fetch', fetchSimulado)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pedirJson: cabeceras', () => {
  it('pide al mismo origen, con la cookie y sin caché; en un GET no manda CSRF ni Content-Type aunque haya csrf', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, []))
    await pedirJson('GET', '/lider/correos', undefined, { csrf: 'token-1' })
    const { url, init, cabeceras } = peticion()
    expect(url).toBe('/api/crm/lider/correos')
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    expect(init.body).toBeUndefined()
    expect(cabeceras[CABECERA_CSRF]).toBeUndefined()
    expect(cabeceras['Content-Type']).toBeUndefined()
  })

  it('manda X-CSRF-Token solo en las mutaciones que traen csrf, y Content-Type JSON solo si hay cuerpo', async () => {
    fetchSimulado.mockImplementation(async () => respuesta(200, { ok: true }))
    await pedirJson('POST', '/lider/tareas', { titulo: 'Informe' }, { csrf: 'token-1' })
    await pedirJson('POST', '/lider/tareas/7/avisar', undefined, { csrf: 'token-1' })
    await pedirJson('POST', '/personas/2/tareas/9/estado', { estado: 'en_proceso' })
    await pedirJson('PATCH', '/lider/tareas/7', { titulo: 'Otro' }, { csrf: null })

    const [crear, avisar, equipo, sinToken] = [0, 1, 2, 3].map(peticion)
    expect(crear.cabeceras[CABECERA_CSRF]).toBe('token-1')
    expect(crear.cabeceras['Content-Type']).toBe('application/json')
    expect(crear.cuerpo).toEqual({ titulo: 'Informe' })
    expect(avisar.cabeceras[CABECERA_CSRF]).toBe('token-1')
    expect(avisar.cabeceras['Content-Type']).toBeUndefined()
    expect(avisar.init.body).toBeUndefined()
    expect(equipo.cabeceras[CABECERA_CSRF]).toBeUndefined()
    expect(equipo.cabeceras['Content-Type']).toBe('application/json')
    expect(sinToken.cabeceras[CABECERA_CSRF]).toBeUndefined()
  })

  it('acepta la ruta completa o relativa a /api/crm', async () => {
    fetchSimulado.mockImplementation(async () => respuesta(200, []))
    await pedirJson('GET', '/api/crm/personas')
    await pedirJson('GET', 'personas')
    expect(peticion(0).url).toBe('/api/crm/personas')
    expect(peticion(1).url).toBe('/api/crm/personas')
  })

  it('un 204 devuelve undefined', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(crearApiLider('token-1').eliminarTarea(7)).resolves.toBeUndefined()
    expect(peticion()).toMatchObject({ url: '/api/crm/lider/tareas/7', metodo: 'DELETE' })
    expect(peticion().cabeceras[CABECERA_CSRF]).toBe('token-1')
  })
})

describe('pedirJson: errores', () => {
  it('lee el ErrorCrm del servidor: código, status, mensaje y errores por campo', async () => {
    fetchSimulado.mockResolvedValueOnce(
      respuesta(400, {
        codigo: 'solicitud_invalida',
        mensaje: 'Suba el entregable antes de terminar.',
        campos: { entregable: 'Falta el entregable.' },
      }),
    )
    const error = await errorDe(apiEquipo.terminar(2, 9, '  '))
    expect(error).toMatchObject({ codigo: 'solicitud_invalida', estado: 400, message: 'Suba el entregable antes de terminar.' })
    expect(error.campos).toEqual({ entregable: 'Falta el entregable.' })
    expect(mensajeDe(error)).toBe('Suba el entregable antes de terminar.')
    // La nota en blanco no se manda.
    expect(peticion().cuerpo).toEqual({})
  })

  it('sin cuerpo legible usa el código del status y un mensaje en español', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(409, '<html>Conflict</html>'))
    const conflicto = await errorDe(apiEquipo.cambiarEstado(2, 9, 'pendiente'))
    expect(conflicto).toMatchObject({ codigo: 'conflicto', estado: 409 })
    expect(conflicto.campos).toBeUndefined()
    expect(mensajeDe(conflicto)).toMatch(/la tarea cambió/)

    fetchSimulado.mockResolvedValueOnce(respuesta(502, 'Bad gateway'))
    const caido = await errorDe(apiEquipo.personas())
    expect(caido).toMatchObject({ codigo: 'interno', estado: 502 })
  })

  it('un 401 se reconoce con esNoAutenticado; apiSesionLider.obtener lo convierte en null', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(401, { codigo: 'no_autenticado', mensaje: 'Inicie sesión para continuar.' }))
    const error = await errorDe(crearApiLider('token-1').resumen())
    expect(esNoAutenticado(error)).toBe(true)
    expect(esNoAutenticado(new Error('otro'))).toBe(false)

    fetchSimulado.mockResolvedValueOnce(respuesta(401, { codigo: 'no_autenticado', mensaje: 'Inicie sesión para continuar.' }))
    await expect(apiSesionLider.obtener()).resolves.toBeNull()

    fetchSimulado.mockResolvedValueOnce(respuesta(200, { nombre: 'Martha', csrf: 'abc', expira: '2026-11-25T00:00:00Z' }))
    await expect(apiSesionLider.obtener()).resolves.toMatchObject({ csrf: 'abc' })
  })

  it('un 429 trae Retry-After en segundos y el mensaje dice cuánto esperar', async () => {
    fetchSimulado.mockResolvedValueOnce(
      respuesta(429, { codigo: 'demasiados_intentos', mensaje: 'Demasiados intentos con la contraseña.' }, { 'Retry-After': '840' }),
    )
    const error = await errorDe(apiSesionLider.iniciar('clave-equivocada'))
    expect(error).toMatchObject({ codigo: 'demasiados_intentos', estado: 429, reintentarEn: 840 })
    expect(mensajeDe(error)).toBe('Demasiados intentos con la contraseña. Puede intentar de nuevo en 14 minutos.')
    expect(peticion().cuerpo).toEqual({ contrasena: 'clave-equivocada' })
    expect(peticion().cabeceras[CABECERA_CSRF]).toBeUndefined()
  })

  it('sin conexión: error «red» con estado 0 y un mensaje que dice qué hacer', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const error = await errorDe(apiEquipo.personas())
    expect(error).toMatchObject({ codigo: 'red', estado: 0 })
    expect(mensajeDe(error)).toMatch(/No hay conexión con el servidor/)
  })

  it('una petición cancelada sale como «abortado»', async () => {
    const control = new AbortController()
    fetchSimulado.mockImplementationOnce(async (_url, init) => {
      control.abort()
      expect(init?.signal).toBe(control.signal)
      throw new DOMException('Aborted', 'AbortError')
    })
    const error = await errorDe(apiEquipo.tablero(2, false, control.signal))
    expect(error).toMatchObject({ codigo: 'abortado', estado: 0 })
  })

  it('cualquier otro error tiene un mensaje genérico', () => {
    expect(mensajeDe(new Error('x'))).toMatch(/error inesperado/)
    expect(mensajeDe('texto')).toMatch(/error inesperado/)
  })
})

describe('rutas', () => {
  it('del equipo: tablero con todas las terminadas, tarea y entregables', async () => {
    fetchSimulado.mockImplementation(async () => respuesta(200, {}))
    await apiEquipo.tablero(3)
    await apiEquipo.tablero(3, true)
    await apiEquipo.tarea(3, 12)
    await apiEquipo.quitarEntregable(3, 12, 40)
    expect([0, 1, 2, 3].map((i) => `${peticion(i).metodo} ${peticion(i).url}`)).toEqual([
      'GET /api/crm/personas/3/tareas',
      'GET /api/crm/personas/3/tareas?terminadas=todas',
      'GET /api/crm/personas/3/tareas/12',
      'DELETE /api/crm/personas/3/tareas/12/entregables/40',
    ])
  })

  it('del líder: filtros de tareas y de correos en la consulta, sin los vacíos', async () => {
    fetchSimulado.mockImplementation(async () => respuesta(200, []))
    const api = crearApiLider('token-1')
    await api.tareas({ responsable: 4, estado: 'en_proceso', q: '  informe  ', terminadas: 'todas' })
    await api.tareas({ q: '' })
    await api.correos('error')
    await api.reintentarCorreo(8)
    expect(peticion(0).url).toBe('/api/crm/lider/tareas?responsable=4&estado=en_proceso&q=informe&terminadas=todas')
    expect(peticion(1).url).toBe('/api/crm/lider/tareas')
    expect(peticion(2).url).toBe('/api/crm/lider/correos?estado=error')
    expect(peticion(3)).toMatchObject({ url: '/api/crm/lider/correos/8/reintentar', metodo: 'POST' })
    expect(peticion(3).cabeceras[CABECERA_CSRF]).toBe('token-1')
  })
})

// ── Subidas (XMLHttpRequest) ────────────────────────────────────────────────

class XhrSimulado {
  static ultimo: XhrSimulado | null = null
  metodo = ''
  url = ''
  cabeceras: Record<string, string> = {}
  cuerpo: unknown = null
  status = 0
  responseText = ''
  responseType = ''
  respuestaCabeceras: Record<string, string> = {}
  readonly upload = new EventTarget()
  private readonly eventos = new EventTarget()

  constructor() {
    XhrSimulado.ultimo = this
  }

  open(metodo: string, url: string) {
    this.metodo = metodo
    this.url = url
  }

  setRequestHeader(nombre: string, valor: string) {
    this.cabeceras[nombre] = valor
  }

  getResponseHeader(nombre: string): string | null {
    return this.respuestaCabeceras[nombre] ?? null
  }

  addEventListener(tipo: string, oyente: EventListener) {
    this.eventos.addEventListener(tipo, oyente)
  }

  send(cuerpo: unknown) {
    this.cuerpo = cuerpo
  }

  abort() {
    this.eventos.dispatchEvent(new Event('abort'))
  }

  avanzar(cargado: number, total: number) {
    this.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: cargado, total }))
  }

  responder(status: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
    this.status = status
    this.responseText = cuerpo === undefined ? '' : JSON.stringify(cuerpo)
    this.respuestaCabeceras = cabeceras
    this.eventos.dispatchEvent(new Event('load'))
  }

  fallar() {
    this.eventos.dispatchEvent(new Event('error'))
  }
}

function xhr(): XhrSimulado {
  const ultimo = XhrSimulado.ultimo
  if (!ultimo) throw new Error('No se creó ninguna petición')
  return ultimo
}

describe('subirArchivo', () => {
  beforeEach(() => {
    XhrSimulado.ultimo = null
    vi.stubGlobal('XMLHttpRequest', XhrSimulado)
  })

  const archivo = new File(['%PDF-1.7'], 'informe final.pdf', { type: 'application/pdf' })

  it('sube en multipart con el campo «archivo», informa el progreso (0 a 1) y lleva el CSRF del líder', async () => {
    const progreso = vi.fn<(fraccion: number) => void>()
    const subida = crearApiLider('token-1').subirAdjunto(7, archivo, { alProgreso: progreso })
    const peticionXhr = xhr()
    expect(peticionXhr).toMatchObject({ metodo: 'POST', url: '/api/crm/lider/tareas/7/adjuntos' })
    expect(peticionXhr.cabeceras[CABECERA_CSRF]).toBe('token-1')
    const datos = peticionXhr.cuerpo as FormData
    expect(datos.get('archivo')).toBeInstanceOf(File)
    expect((datos.get('archivo') as File).name).toBe('informe final.pdf')

    peticionXhr.avanzar(25, 100)
    peticionXhr.avanzar(100, 100)
    peticionXhr.responder(201, { id: 5, nombre: 'informe final.pdf' })
    await expect(subida).resolves.toMatchObject({ id: 5 })
    expect(progreso.mock.calls.map(([f]) => f)).toEqual([0.25, 1, 1])
  })

  it('el entregable del equipo va sin CSRF; la foto, con PUT', async () => {
    const entregable = apiEquipo.subirEntregable(2, 9, archivo)
    expect(xhr()).toMatchObject({ metodo: 'POST', url: '/api/crm/personas/2/tareas/9/entregables' })
    expect(xhr().cabeceras[CABECERA_CSRF]).toBeUndefined()
    xhr().responder(201, { id: 6 })
    await entregable

    const foto = crearApiLider('token-1').subirFoto(4, new File(['png'], 'foto.png', { type: 'image/png' }))
    expect(xhr()).toMatchObject({ metodo: 'PUT', url: '/api/crm/lider/personas/4/foto' })
    xhr().responder(200, { id: 4 })
    await expect(foto).resolves.toMatchObject({ id: 4 })
  })

  it('los errores salen igual que en pedirJson', async () => {
    const grande = subirArchivo('/personas/2/tareas/9/entregables', archivo)
    xhr().responder(413, { codigo: 'demasiado_grande', mensaje: 'El archivo pasa de 25 MB.' })
    expect(await errorDe(grande)).toMatchObject({ codigo: 'demasiado_grande', estado: 413, message: 'El archivo pasa de 25 MB.' })

    const sinRed = subirArchivo('/personas/2/tareas/9/entregables', archivo)
    xhr().fallar()
    expect(await errorDe(sinRed)).toMatchObject({ codigo: 'red', estado: 0 })
  })

  it('se cancela con la señal', async () => {
    const control = new AbortController()
    const subida = subirArchivo('/personas/2/tareas/9/entregables', archivo, { signal: control.signal })
    control.abort()
    expect(await errorDe(subida)).toMatchObject({ codigo: 'abortado', estado: 0 })

    // Con la señal ya cancelada ni siquiera empieza.
    XhrSimulado.ultimo = null
    expect(await errorDe(subirArchivo('/x', archivo, { signal: control.signal }))).toMatchObject({ codigo: 'abortado' })
    expect(XhrSimulado.ultimo).toBeNull()
  })
})
