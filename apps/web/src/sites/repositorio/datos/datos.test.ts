import { afterEach, describe, expect, it, vi } from 'vitest'
import { documento, listado } from '../pruebas/datos-prueba'
import { FalloListado, URL_LISTADO, obtenerListado, validarDocumento, validarListado } from './cliente'
import { esExterna, urlSegura } from './enlaces'
import { datosTarjeta, idTituloDocumento } from './presentacion'

afterEach(() => {
  vi.unstubAllGlobals()
})

function responder(cuerpo: unknown, estado = 200) {
  const fetchSimulado = vi.fn<typeof fetch>(
    async () =>
      new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
        status: estado,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

async function falloDe(promesa: Promise<unknown>): Promise<FalloListado> {
  const error: unknown = await promesa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(FalloListado)
  return error as FalloListado
}

describe('obtenerListado', () => {
  it('pide GET /api/repositorio/documentos y devuelve el listado validado', async () => {
    const fetchSimulado = responder(listado([documento()]))
    const r = await obtenerListado()
    expect(fetchSimulado).toHaveBeenCalledWith(URL_LISTADO, expect.objectContaining({ headers: { Accept: 'application/json' } }))
    expect(URL_LISTADO).toBe('/api/repositorio/documentos')
    expect(r.total).toBe(1)
    expect(r.documentos[0]).toEqual(documento())
    expect(r.categorias).toContain('Boletín')
  })

  it('503 (no_disponible) → fallo "no_disponible"', async () => {
    responder({ codigo: 'no_disponible', mensaje: 'La base de datos no responde.' }, 503)
    const fallo = await falloDe(obtenerListado())
    expect(fallo).toMatchObject({ tipo: 'no_disponible', estado: 503, codigo: 'no_disponible' })
  })

  it('500 → fallo "servidor"; JSON roto → "datos"; sin red → "red"', async () => {
    responder({ codigo: 'interno', mensaje: 'x' }, 500)
    expect((await falloDe(obtenerListado())).tipo).toBe('servidor')
    responder('<html>no es JSON</html>')
    expect((await falloDe(obtenerListado())).tipo).toBe('datos')
    responder({ sin: 'documentos' })
    expect((await falloDe(obtenerListado())).tipo).toBe('datos')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect((await falloDe(obtenerListado())).tipo).toBe('red')
  })

  it('al cancelar, propaga el AbortError (no es un fallo que mostrar)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        init?.signal?.throwIfAborted()
        return new Response('{}')
      }),
    )
    const control = new AbortController()
    control.abort()
    await expect(obtenerListado(control.signal)).rejects.toHaveProperty('name', 'AbortError')
  })
})

describe('validación de la respuesta', () => {
  it('descarta documentos sin id o sin título y completa los opcionales', () => {
    const r = validarListado({
      documentos: [{ id: 'a', titulo: 'A' }, { id: '', titulo: 'B' }, { titulo: 'C' }, { id: 'd' }, null, 'x'],
    })
    expect(r.total).toBe(1)
    expect(r.documentos[0]).toMatchObject({
      id: 'a',
      orden: 1,
      categoria: 'Sin categoría',
      idioma: 'es',
      tipo: 'documento',
      claves: [],
      urlVer: '',
      archivo: null,
      anio: null,
    })
    expect(r.categorias).toEqual([])
  })

  it('normaliza tipos inesperados', () => {
    const d = validarDocumento(
      { id: 'x', titulo: 'X', idioma: 'fr', tipo: 'raro', anio: '2020', numero: 5, claves: ['a', 3, null], archivo: { tipo: 'application/pdf' } },
      4,
    )!
    expect(d).toMatchObject({ orden: 5, idioma: 'es', tipo: 'documento', anio: null, numero: '5', claves: ['a'], archivo: null })
  })
})

describe('enlaces', () => {
  it('solo acepta rutas propias y http(s)', () => {
    expect(urlSegura('/api/repositorio/documentos/a/ver')).toBe('/api/repositorio/documentos/a/ver')
    expect(urlSegura(' https://app.powerbi.com/view?r=1 ')).toBe('https://app.powerbi.com/view?r=1')
    expect(urlSegura('http://sapiencia.gov.co/x')).toBe('http://sapiencia.gov.co/x')
    expect(urlSegura('javascript:alert(1)')).toBeNull()
    expect(urlSegura('JAVASCRIPT:alert(1)')).toBeNull()
    expect(urlSegura('data:text/html,x')).toBeNull()
    expect(urlSegura('//otro.example/x')).toBeNull()
    expect(urlSegura('/\\otro.example/x')).toBeNull()
    expect(urlSegura('documento.pdf')).toBeNull()
    expect(urlSegura('')).toBeNull()
    expect(urlSegura(null)).toBeNull()
  })

  it('distingue los enlaces de otro sitio', () => {
    expect(esExterna('/api/repositorio/documentos/a/ver')).toBe(false)
    expect(esExterna(`${window.location.origin}/x`)).toBe(false)
    expect(esExterna('https://app.powerbi.com/view')).toBe(true)
  })
})

describe('presentación', () => {
  it('limpia textos, deja solo los dígitos del número y quita claves repetidas', () => {
    const t = datosTarjeta(
      documento({ titulo: '  Fe   de erratas ', numero: 'N.º 19', anio: null, claves: [' Acceso ', 'acceso', 'ACCESO', '', 'Permanencia'] }),
    )
    expect(t).toMatchObject({ titulo: 'Fe de erratas', numero: '19', anio: 'sf', categoria: 'boletin' })
    expect(t.claves).toEqual([
      { valor: 'acceso', texto: 'Acceso' },
      { valor: 'permanencia', texto: 'Permanencia' },
    ])
  })

  it('id del título válido para el DOM', () => {
    expect(idTituloDocumento('boletin-19')).toBe('rp-doc-boletin-19')
    expect(idTituloDocumento('a b/c')).toBe('rp-doc-a_b_c')
  })
})
