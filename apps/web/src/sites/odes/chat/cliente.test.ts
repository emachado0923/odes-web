import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorSolicitudChat, consultarEstado, enviarChat, interpretarRetryAfter } from './cliente'
import type { EventoChat } from './protocolo'
import { interpretarEvento } from './validacion'
import { DOCUMENTO, ESTADO_IA, respuestaJson, respuestaSSE, sse } from './pruebas-utiles'

afterEach(() => {
  vi.unstubAllGlobals()
})

function simularFetch(respuesta: Response | (() => Response | Promise<Response>)) {
  const fetchSimulado = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    typeof respuesta === 'function' ? respuesta() : respuesta,
  )
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

async function enviar(signal = new AbortController().signal) {
  const eventos: EventoChat[] = []
  const fin = await enviarChat(
    { mensajes: [{ rol: 'usuario', texto: '¿Qué es Matrícula Cero?' }] },
    { signal, alEvento: (e) => eventos.push(e) },
  )
  return { fin, eventos }
}

describe('interpretarEvento', () => {
  it('ignora JSON roto, tipos desconocidos y eventos con la forma equivocada', () => {
    expect(interpretarEvento('{"tipo":"texto","delta":')).toBeNull()
    expect(interpretarEvento('"texto"')).toBeNull()
    expect(interpretarEvento('{"tipo":"nuevo_tipo"}')).toBeNull()
    expect(interpretarEvento('{"tipo":"texto","delta":5}')).toBeNull()
    expect(interpretarEvento('{"tipo":"cita","indice":0,"documento":{}}')).toBeNull()
    expect(interpretarEvento('{"tipo":"busqueda","herramienta":"borrar","descripcion":"x"}')).toBeNull()
  })

  it('normaliza una cita: páginas inválidas a null y url por defecto la del documento', () => {
    const evento = interpretarEvento(
      JSON.stringify({ tipo: 'cita', indice: 2, documento: DOCUMENTO, paginaInicio: 0, paginaFin: 'x', textoCitado: 'abc' }),
    )
    expect(evento).toEqual({
      tipo: 'cita',
      indice: 2,
      documento: DOCUMENTO,
      paginaInicio: null,
      paginaFin: null,
      url: DOCUMENTO.url,
      textoCitado: 'abc',
    })
  })

  it('conserva la miniatura de la base (urlMiniatura) y descarta una vacía', () => {
    const urlMiniatura = '/api/repositorio/documentos/x/miniatura?v=0123456789abcdef'
    const conMiniatura = interpretarEvento(
      JSON.stringify({ tipo: 'cita', indice: 1, documento: { ...DOCUMENTO, urlMiniatura }, url: DOCUMENTO.url }),
    )
    expect(conMiniatura?.tipo === 'cita' && conMiniatura.documento.urlMiniatura).toBe(urlMiniatura)
    const vacia = interpretarEvento(
      JSON.stringify({ tipo: 'documentos', titulo: 'T', documentos: [{ ...DOCUMENTO, urlMiniatura: ' ' }] }),
    )
    expect(vacia?.tipo === 'documentos' && vacia.documentos[0]?.urlMiniatura).toBeUndefined()
  })

  it('descarta los documentos inválidos de un evento documentos', () => {
    const evento = interpretarEvento(
      JSON.stringify({ tipo: 'documentos', titulo: 'T', documentos: [{ ...DOCUMENTO, urlFragmento: 'u#page=2' }, { id: 1 }] }),
    )
    expect(evento?.tipo === 'documentos' && evento.documentos.map((d) => d.id)).toEqual([DOCUMENTO.id])
  })

  it('un error con código desconocido pasa a interno', () => {
    expect(interpretarEvento('{"tipo":"error","codigo":"raro","mensaje":"Algo"}')).toEqual({
      tipo: 'error',
      codigo: 'interno',
      mensaje: 'Algo',
    })
  })
})

describe('interpretarRetryAfter', () => {
  it('entiende segundos y fechas HTTP', () => {
    expect(interpretarRetryAfter('30')).toBe(30_000)
    const ahora = Date.parse('2026-10-08T12:00:00Z')
    expect(interpretarRetryAfter('Thu, 08 Oct 2026 12:01:30 GMT', ahora)).toBe(90_000)
    expect(interpretarRetryAfter('Thu, 08 Oct 2026 11:00:00 GMT', ahora)).toBe(0)
  })

  it('devuelve null si no hay cabecera o no se entiende', () => {
    expect(interpretarRetryAfter(null)).toBeNull()
    expect(interpretarRetryAfter('pronto')).toBeNull()
  })
})

describe('enviarChat', () => {
  it('envía la solicitud y entrega los eventos en orden, aunque los bytes lleguen partidos', async () => {
    const flujo = [
      ': ping\n\n',
      sse({ tipo: 'inicio', modo: 'ia' }),
      sse({ tipo: 'texto', delta: 'La matrícula ' }),
      sse({ tipo: 'texto', delta: 'cero, año ñandú' }),
      sse({ tipo: 'fin', motivo: 'completo' }),
    ].join('')
    // Corta en bytes, también a mitad de caracteres de varios bytes (ñ).
    const fetchSimulado = simularFetch(() => respuestaSSE(flujo, { tamanoTrozo: 3 }))

    const { fin, eventos } = await enviar()

    expect(fin).toBe('terminado')
    expect(eventos).toEqual([
      { tipo: 'inicio', modo: 'ia' },
      { tipo: 'texto', delta: 'La matrícula ' },
      { tipo: 'texto', delta: 'cero, año ñandú' },
      { tipo: 'fin', motivo: 'completo' },
    ])
    const [url, init] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/odes/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ mensajes: [{ rol: 'usuario', texto: '¿Qué es Matrícula Cero?' }] })
  })

  it('después de fin o error ignora lo que siga llegando', async () => {
    simularFetch(() =>
      respuestaSSE(sse({ tipo: 'error', codigo: 'sobrecarga', mensaje: 'Ocupado' }) + sse({ tipo: 'texto', delta: 'tarde' })),
    )
    const { fin, eventos } = await enviar()
    expect(fin).toBe('terminado')
    expect(eventos).toEqual([{ tipo: 'error', codigo: 'sobrecarga', mensaje: 'Ocupado' }])
  })

  it("devuelve 'cortado' si el flujo se cierra sin fin", async () => {
    simularFetch(() => respuestaSSE(sse({ tipo: 'texto', delta: 'Hola' })))
    const { fin, eventos } = await enviar()
    expect(fin).toBe('cortado')
    expect(eventos).toHaveLength(1)
  })

  it('un error HTTP con cuerpo ErrorChat conserva código, mensaje y Retry-After', async () => {
    simularFetch(() =>
      respuestaJson({ codigo: 'limite_uso', mensaje: 'Espera un poco.' }, { status: 429, headers: { 'Retry-After': '20' } }),
    )
    const error = await enviar().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ErrorSolicitudChat)
    expect(error).toMatchObject({ codigo: 'limite_uso', message: 'Espera un poco.', esperaMs: 20_000, status: 429 })
  })

  it('un error HTTP sin JSON (p. ej. 502 de un proxy) usa el código del status y un mensaje por defecto', async () => {
    simularFetch(() => new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }))
    const error = await enviar().catch((e: unknown) => e)
    expect(error).toMatchObject({ codigo: 'no_disponible', status: 502 })
    expect((error as Error).message).toMatch(/no está disponible/)
  })

  it("un fallo de red es 'conexion'", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(enviar()).rejects.toMatchObject({ codigo: 'conexion' })
  })

  it('una respuesta 200 que no es text/event-stream es un error interno', async () => {
    simularFetch(() => respuestaJson({ hola: 1 }))
    await expect(enviar()).rejects.toMatchObject({ codigo: 'interno' })
  })

  it("al abortar a mitad del flujo devuelve 'abortado'", async () => {
    const control = new AbortController()
    let empujar: (texto: string) => void = () => {}
    simularFetch(() =>
      respuestaSSE('', {
        abierto: true,
        alCrear: (fn) => {
          empujar = fn
        },
      }),
    )
    const eventos: EventoChat[] = []
    const promesa = enviarChat({ mensajes: [{ rol: 'usuario', texto: 'x' }] }, { signal: control.signal, alEvento: (e) => eventos.push(e) })
    await vi.waitFor(() => expect(eventos).toHaveLength(0))
    empujar(sse({ tipo: 'texto', delta: 'Hola' }))
    await vi.waitFor(() => expect(eventos).toHaveLength(1))
    control.abort()
    await expect(promesa).resolves.toBe('abortado')
  })

  it("si se aborta antes de responder fetch, devuelve 'abortado'", async () => {
    const control = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')))
          }),
      ),
    )
    const promesa = enviar(control.signal)
    control.abort()
    await expect(promesa).resolves.toMatchObject({ fin: 'abortado' })
  })
})

describe('consultarEstado', () => {
  it('devuelve el estado validado', async () => {
    simularFetch(() => respuestaJson(ESTADO_IA))
    await expect(consultarEstado()).resolves.toEqual(ESTADO_IA)
  })

  it('lanza si el status no es 2xx o el cuerpo no tiene la forma esperada', async () => {
    simularFetch(() => respuestaJson({}, { status: 500 }))
    await expect(consultarEstado()).rejects.toThrow(/respondió 500/)
    simularFetch(() => respuestaJson({ modo: 'otro' }))
    await expect(consultarEstado()).rejects.toThrow(/cuerpo inesperado/)
  })
})
