import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITES_PAI } from '../api-pai'
import { sesionPrueba, vigenciaPrueba } from '../pruebas/datosPrueba'
import { ClientePai, ErrorPai, problemaEvidencia } from './clientePai'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Pedido = { url: string; opciones: RequestInit }

function json(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  })
}

/** fetch simulado que responde en orden; registra cada petición. */
function simular(...respuestas: Response[]) {
  const pedidos: Pedido[] = []
  const pedir = vi.fn<(url: string, opciones?: RequestInit) => Promise<Response>>(async (url, opciones = {}) => {
    pedidos.push({ url, opciones })
    const respuesta = respuestas.shift()
    if (!respuesta) throw new Error(`Petición inesperada: ${url}`)
    return respuesta
  })
  vi.stubGlobal('fetch', pedir)
  return pedidos
}

function cliente(alNoAutenticado = vi.fn<() => void>()) {
  const esperar = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
  return { api: new ClientePai({ alNoAutenticado, esperar }), alNoAutenticado, esperar }
}

async function errorDe(promesa: Promise<unknown>): Promise<ErrorPai> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof ErrorPai) return error
    throw error
  }
  throw new Error('Se esperaba un ErrorPai')
}

describe('ClientePai', () => {
  it('inicia sesión y manda el CSRF (en memoria) solo en las peticiones que cambian algo', async () => {
    const sesion = sesionPrueba('responsable', { csrf: 'token-csrf' })
    const pedidos = simular(json(200, sesion), json(200, vigenciaPrueba()), json(204, undefined))
    const { api } = cliente()
    expect(await api.iniciarSesion({ usuario: 'responsable.saf', contrasena: 'x' })).toEqual(sesion)
    await api.obtenerVigencia(2026)
    await api.borrarEvidencia(9)
    expect(pedidos.map((p) => [p.opciones.method, p.url])).toEqual([
      ['POST', '/api/pai/sesion'],
      ['GET', '/api/pai/vigencia?vigencia=2026'],
      ['DELETE', '/api/pai/evidencias/9'],
    ])
    const cabeceras = pedidos.map((p) => p.opciones.headers as Record<string, string>)
    expect(cabeceras[1]['X-CSRF-Token']).toBeUndefined()
    expect(cabeceras[2]['X-CSRF-Token']).toBe('token-csrf')
    expect(pedidos.every((p) => p.opciones.credentials === 'same-origin')).toBe(true)
  })

  it('un 401 avisa a la sesión, salvo en la verificación inicial (que devuelve null)', async () => {
    simular(json(401, { codigo: 'no_autenticado', mensaje: 'x' }), json(401, { codigo: 'no_autenticado', mensaje: 'Venció.' }))
    const { api, alNoAutenticado } = cliente()
    expect(await api.obtenerSesion()).toBeNull()
    expect(alNoAutenticado).not.toHaveBeenCalled()
    const error = await errorDe(api.obtenerTablero())
    expect(error).toMatchObject({ codigo: 'no_autenticado', estado: 401, message: 'Venció.' })
    expect(alNoAutenticado).toHaveBeenCalledTimes(1)
  })

  it('una consulta con 503 se reintenta (Retry-After con máximo 3 s) y luego carga', async () => {
    const pedidos = simular(
      json(503, { codigo: 'no_disponible', mensaje: 'x' }, { 'Retry-After': '30' }),
      json(503, { codigo: 'no_disponible', mensaje: 'x' }, { 'Retry-After': '1' }),
      json(200, vigenciaPrueba({ bimestreAbierto: 5 })),
    )
    const { api, esperar } = cliente()
    expect((await api.obtenerVigencia()).bimestreAbierto).toBe(5)
    expect(pedidos).toHaveLength(3)
    expect(esperar.mock.calls.map(([ms]) => ms)).toEqual([3000, 1000])
  })

  it('después de 2 reintentos el 503 llega como error; las escrituras no se reintentan', async () => {
    const no = () => json(503, { codigo: 'no_disponible', mensaje: 'El PAI no está disponible.' }, { 'Retry-After': '0' })
    simular(no(), no(), no(), no())
    const { api } = cliente()
    expect(await errorDe(api.obtenerTablero())).toMatchObject({ codigo: 'no_disponible', reintentarEn: 0 })
    expect(await errorDe(api.guardarReporte(1, 4, { avance: 3 }))).toMatchObject({ codigo: 'no_disponible' })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('errores con campos (400), conflicto (409) y bloqueo (429 con minutos)', async () => {
    simular(
      json(400, { codigo: 'solicitud_invalida', mensaje: 'Revise el reporte.', campos: { avance: 'Máximo 6 decimales.' } }),
      json(409, { codigo: 'conflicto', mensaje: 'Otra persona cambió este reporte.' }),
      json(429, { codigo: 'demasiados_intentos', mensaje: 'Espere.' }, { 'Retry-After': '600' }),
    )
    const { api } = cliente()
    expect(await errorDe(api.guardarReporte(1, 4, { avance: 1.1234567 }))).toMatchObject({
      codigo: 'solicitud_invalida',
      campos: { avance: 'Máximo 6 decimales.' },
    })
    expect(await errorDe(api.guardarReporte(1, 4, { avance: 2, actualizadoEn: null }))).toMatchObject({ codigo: 'conflicto', estado: 409 })
    expect(await errorDe(api.iniciarSesion({ usuario: 'a', contrasena: 'b' }))).toMatchObject({
      codigo: 'demasiados_intentos',
      reintentarEn: 600,
    })
  })

  it('una respuesta con otra forma es un error de datos', async () => {
    simular(json(200, { anio: '2026' }))
    const { api } = cliente()
    expect(await errorDe(api.obtenerVigencia())).toMatchObject({ codigo: 'datos' })
  })

  it('subida directa: rechaza en el cliente un archivo mayor que maxBytes', async () => {
    simular(json(200, { directa: true, ruta: 'subidas/x', url: 'https://bucket.example/firmada', maxBytes: 10 }))
    const { api } = cliente()
    const archivo = new File(['01234567890123456789'], 'acta.pdf', { type: 'application/pdf' })
    expect(await errorDe(api.subirEvidencia(1, 4, archivo))).toMatchObject({ codigo: 'demasiado_grande' })
  })

  it('sin Supabase, una evidencia de más de una parte va por partes (Vercel: 4,5 MB por petición)', async () => {
    const ruta = 'partes/00000000-1111-2222-3333-444444444444'
    const evidencia = {
      id: 7,
      nombre: 'acta.pdf',
      tipo: 'application/pdf',
      bytes: 10,
      subidoEn: '2026-11-09T00:00:00.000Z',
      subidoPor: 'Ana',
      urlDescarga: '/api/pai/evidencias/7',
    }
    const pedidos = simular(
      json(200, { directa: false, tamanoParte: 4, maxBytes: 100 }),
      json(201, { ruta, tamanoParte: 4 }),
      json(201, evidencia),
    )
    const enviados: { metodo: string; url: string; cabeceras: Record<string, string>; cuerpo: unknown }[] = []
    class XhrFalso {
      status = 0
      responseText = ''
      responseType = ''
      upload = { addEventListener: () => undefined }
      private metodo = ''
      private url = ''
      private cabeceras: Record<string, string> = {}
      private alCargar: (() => void)[] = []
      open(metodo: string, url: string) {
        this.metodo = metodo
        this.url = url
      }
      setRequestHeader(nombre: string, valor: string) {
        this.cabeceras[nombre.toLowerCase()] = valor
      }
      getResponseHeader() {
        return null
      }
      addEventListener(tipo: string, f: () => void) {
        if (tipo === 'load') this.alCargar.push(f)
      }
      send(cuerpo: unknown) {
        enviados.push({ metodo: this.metodo, url: this.url, cabeceras: this.cabeceras, cuerpo })
        this.status = 204
        setTimeout(() => this.alCargar.forEach((f) => f()), 0)
      }
    }
    vi.stubGlobal('XMLHttpRequest', XhrFalso)
    const { api } = cliente()
    const progreso = vi.fn<(p: { cargado: number; total: number }) => void>()
    const archivo = new File(['%PDF-1.7 x'], 'acta.pdf', { type: 'application/pdf' })
    expect(await api.subirEvidencia(1, 4, archivo, progreso)).toMatchObject({ id: 7, bytes: 10 })
    expect(pedidos.map((p) => [p.opciones.method, p.url])).toEqual([
      ['POST', '/api/pai/indicadores/1/bimestres/4/evidencias/subidas'],
      ['POST', '/api/pai/indicadores/1/bimestres/4/evidencias/subidas/partes'],
      ['POST', '/api/pai/indicadores/1/bimestres/4/evidencias'],
    ])
    expect(JSON.parse(String(pedidos[1].opciones.body))).toEqual({ bytes: 10 })
    expect(JSON.parse(String(pedidos[2].opciones.body))).toEqual({ subida: ruta, nombre: 'acta.pdf', tipo: 'application/pdf' })
    expect(enviados.map((e) => [e.metodo, e.url, (e.cuerpo as Blob).size, e.cabeceras['content-type']])).toEqual([
      ['PUT', `/api/pai/subidas/${ruta}/0`, 4, 'application/octet-stream'],
      ['PUT', `/api/pai/subidas/${ruta}/1`, 4, 'application/octet-stream'],
      ['PUT', `/api/pai/subidas/${ruta}/2`, 2, 'application/octet-stream'],
    ])
    expect(progreso).toHaveBeenLastCalledWith({ cargado: 10, total: 10 })
  })

  it('URL de la exportación con los filtros del tablero y el bimestre', () => {
    const { api } = cliente()
    expect(api.urlExportarCsv({ dependencia: 2, estado: 'pendiente' }, 4)).toBe(
      '/api/pai/admin/exportar.csv?dependencia=2&estado=pendiente&bimestre=4',
    )
    expect(api.urlExportarCsv()).toBe('/api/pai/admin/exportar.csv')
    expect(api.urlEvidencia(7)).toBe('/api/pai/evidencias/7')
  })
})

describe('problemaEvidencia', () => {
  it('acepta los tipos del PAI hasta 25 MB y rechaza lo demás', () => {
    expect(problemaEvidencia({ name: 'Acta.PDF', size: 1000, type: 'application/pdf' })).toBeNull()
    expect(
      problemaEvidencia({ name: 'datos.xlsx', size: 1000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    ).toBeNull()
    expect(problemaEvidencia({ name: 'foto.jpg', size: 1000, type: '' })).toBeNull()
    expect(problemaEvidencia({ name: 'virus.exe', size: 1000, type: 'application/x-msdownload' })).toMatch(/no está permitido/)
    expect(problemaEvidencia({ name: 'falso.pdf', size: 1000, type: 'text/html' })).toMatch(/no está permitido/)
    expect(problemaEvidencia({ name: 'vacio.pdf', size: 0, type: 'application/pdf' })).toMatch(/vacío/)
    expect(problemaEvidencia({ name: 'grande.pdf', size: LIMITES_PAI.maxBytesEvidencia + 1, type: 'application/pdf' })).toMatch(
      /25 MB/,
    )
  })
})

describe('validación: escala de los porcentajes', () => {
  it('conserva `escala` si viene (y rechaza un valor desconocido); sin ella, no la agrega', async () => {
    const { validarIndicadorTablero } = await import('./validacionPai')
    const { indicadorPrueba } = await import('../tablero/datosPruebaTablero')
    const base = indicadorPrueba({ id: 9, codigo: 'GEP-EDI-01', tipoMeta: 'porcentaje' })
    expect('escala' in validarIndicadorTablero(base)).toBe(false)
    expect(validarIndicadorTablero({ ...base, escala: '0-1' })).toMatchObject({ escala: '0-1' })
    expect(validarIndicadorTablero({ ...base, escala: null })).toMatchObject({ escala: null })
    expect(() => validarIndicadorTablero({ ...base, escala: '0-10' })).toThrow(/forma esperada/)
  })
})
