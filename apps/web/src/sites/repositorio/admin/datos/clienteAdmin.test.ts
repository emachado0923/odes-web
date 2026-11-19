import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import { ApiSimulada, BUCKET_PRUEBA, CLAVE_PRUEBA, CSRF_PRUEBA, USUARIO_PRUEBA, error, instalarApi } from '../pruebas/apiSimulada'
import { ClienteAdmin, ErrorAdmin } from './clienteAdmin'
import { errorDeRespuesta, leerReintentar } from './errores'

let api: ApiSimulada
let alNoAutenticado: ReturnType<typeof vi.fn<() => void>>
let cliente: ClienteAdmin

beforeEach(() => {
  api = new ApiSimulada(10)
  instalarApi(api)
  alNoAutenticado = vi.fn<() => void>()
  cliente = new ClienteAdmin({ alNoAutenticado })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function iniciar() {
  const sesion = await cliente.iniciarSesion({ usuario: USUARIO_PRUEBA, contrasena: CLAVE_PRUEBA })
  cliente.usarCsrf(sesion.csrf)
  return sesion
}

const csrfDe = (i: number) => api.peticiones[i].cabeceras[CABECERA_CSRF.toLowerCase()]

describe('ClienteAdmin', () => {
  it('pide la API del mismo origen, con la cookie (credentials same-origin) y sin caché', async () => {
    await iniciar()
    await cliente.listarDocumentos()
    const llamada = vi.mocked(fetch).mock.calls.at(-1)!
    expect(llamada[0]).toBe('/api/repositorio/admin/documentos')
    expect(llamada[1]).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
  })

  it('envía X-CSRF-Token en toda petición que cambia algo, y no en las lecturas', async () => {
    await iniciar()
    const id = api.documentos[0].id
    await cliente.obtenerDocumento(id)
    await cliente.publicar(id, false)
    await cliente.actualizarDocumento(id, {
      titulo: 'Nuevo título',
      categoria: 'Boletín',
      idioma: 'es',
      tipo: 'documento',
      claves: [],
      permiteDescarga: true,
    })
    await cliente.borrarDocumento(id, id)
    const [, lectura, publicar, editar, borrar] = api.peticiones
    expect(lectura.metodo).toBe('GET')
    expect(lectura.cabeceras[CABECERA_CSRF.toLowerCase()]).toBeUndefined()
    for (const p of [publicar, editar, borrar]) expect(p.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(editar.cabeceras['content-type']).toBe('application/json')
    expect(borrar.cuerpo).toEqual({ confirmarId: id })
  })

  it('las subidas (XMLHttpRequest) también llevan el token e informan el progreso', async () => {
    await iniciar()
    const id = api.documentos[0].id
    const progreso = vi.fn<(p: { cargado: number; total: number }) => void>()
    const archivo = new File(['%PDF-1.7'], 'informe.pdf', { type: 'application/pdf' })
    const doc = await cliente.subirArchivo(id, archivo, progreso)
    expect(doc.archivo?.tipo).toBe('application/pdf')
    const subida = api.peticiones.at(-1)!
    expect(subida).toMatchObject({ metodo: 'PUT', ruta: `/api/repositorio/admin/documentos/${id}/archivo` })
    expect(subida.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect((subida.cuerpo as FormData).get('archivo')).toBeInstanceOf(File)
    expect(progreso).toHaveBeenCalledWith({ cargado: 100, total: 100 })

    await cliente.subirPortada(id, new Blob(['j'], { type: 'image/jpeg' }), {
      datos: new Blob(['w'], { type: 'image/webp' }),
      nombre: 'miniatura.webp',
    })
    const portada = api.peticiones.at(-1)!.cuerpo as FormData
    expect((portada.get('portada') as File).name).toBe('portada.jpg')
    expect((portada.get('miniatura') as File).name).toBe('miniatura.webp')
    expect(csrfDe(api.peticiones.length - 1)).toBe(CSRF_PRUEBA)
  })

  it('con Supabase Storage sube directo al bucket (sin cookie ni CSRF) y luego avisa al servidor', async () => {
    await iniciar()
    api.subidaDirecta = true
    const id = api.documentos[0].id
    const progreso = vi.fn<(p: { cargado: number; total: number }) => void>()
    const archivo = new File(['%PDF-1.7 grande'], 'informe grande.pdf', { type: 'application/pdf' })
    const doc = await cliente.subirArchivo(id, archivo, progreso)
    expect(doc.archivo).toMatchObject({ tipo: 'application/pdf', bytes: archivo.size })
    const [preparar, alBucket, aviso] = api.peticiones.slice(-3)
    expect(preparar).toMatchObject({ metodo: 'POST', ruta: '/api/repositorio/admin/subidas' })
    expect(alBucket.metodo).toBe('PUT')
    expect(alBucket.ruta).toMatch(new RegExp(`^${BUCKET_PRUEBA}/storage/v1/object/upload/sign/repositorio/subidas/`))
    expect(alBucket.cabeceras[CABECERA_CSRF.toLowerCase()]).toBeUndefined()
    expect(alBucket.cabeceras['content-type']).toBe('application/pdf')
    expect(alBucket.cuerpo).toBe(archivo)
    expect(aviso).toMatchObject({
      metodo: 'PUT',
      ruta: `/api/repositorio/admin/documentos/${id}/archivo`,
      cuerpo: { subida: expect.stringMatching(/^subidas\//), nombre: 'informe grande.pdf', tipo: 'application/pdf' },
    })
    expect(aviso.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(progreso).toHaveBeenCalledWith({ cargado: 100, total: 100 })
  })

  it('con los archivos en la base, uno de más de una parte va por partes (Vercel: 4,5 MB por petición)', async () => {
    await iniciar()
    api.tamanoParte = 4
    const id = api.documentos[0].id
    const progreso = vi.fn<(p: { cargado: number; total: number }) => void>()
    const archivo = new File(['%PDF-1.7 x'], 'informe grande.pdf', { type: 'application/pdf' })
    expect(archivo.size).toBe(10)
    const doc = await cliente.subirArchivo(id, archivo, progreso)
    expect(doc.archivo).toMatchObject({ tipo: 'application/pdf', bytes: 10 })
    const [preparar, iniciarPartes, ...resto] = api.peticiones.slice(-6)
    expect(preparar).toMatchObject({ metodo: 'POST', ruta: '/api/repositorio/admin/subidas' })
    expect(iniciarPartes).toMatchObject({ metodo: 'POST', ruta: '/api/repositorio/admin/subidas/partes', cuerpo: { bytes: 10 } })
    const partes = resto.slice(0, 3)
    expect(partes.map((p) => p.ruta)).toEqual([0, 1, 2].map((n) => `/api/repositorio/admin/subidas/partes/00000000-1111-2222-3333-444444444444/${n}`))
    expect(partes.map((p) => (p.cuerpo as Blob).size)).toEqual([4, 4, 2])
    for (const parte of partes) {
      expect(parte.metodo).toBe('PUT')
      expect(parte.cabeceras['content-type']).toBe('application/octet-stream')
      expect(parte.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    }
    expect(resto[3]).toMatchObject({
      metodo: 'PUT',
      ruta: `/api/repositorio/admin/documentos/${id}/archivo`,
      cuerpo: { subida: 'partes/00000000-1111-2222-3333-444444444444', nombre: 'informe grande.pdf', tipo: 'application/pdf' },
    })
    expect(progreso).toHaveBeenLastCalledWith({ cargado: 10, total: 10 })

    // Uno que cabe en una parte sigue yendo en multipart.
    await cliente.subirArchivo(id, new File(['%PDF'], 'chico.pdf', { type: 'application/pdf' }))
    expect(api.peticiones.at(-1)!.cuerpo).toBeInstanceOf(FormData)
  })

  it('por partes: más grande que el máximo no empieza; una ruta que no es partes/<uuid> se rechaza', async () => {
    await iniciar()
    api.forzar('POST', '/api/repositorio/admin/subidas', { estado: 200, cuerpo: { directa: false, tamanoParte: 4, maxBytes: 8 } })
    await expect(
      cliente.subirArchivo(api.documentos[0].id, new File(['%PDF-1.7\n'], 'a.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ codigo: 'demasiado_grande' })
    api.forzar('POST', '/api/repositorio/admin/subidas', { estado: 200, cuerpo: { directa: false, tamanoParte: 4 } })
    api.forzar('POST', '/api/repositorio/admin/subidas/partes', { estado: 201, cuerpo: { ruta: '../otra', tamanoParte: 4 } })
    await expect(
      cliente.subirArchivo(api.documentos[0].id, new File(['%PDF-1.7\n'], 'a.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ codigo: 'datos' })
  })

  it('una URL firmada que no es https ni del propio sitio se rechaza', async () => {
    await iniciar()
    api.forzar('POST', '/api/repositorio/admin/subidas', {
      estado: 200,
      cuerpo: { directa: true, ruta: 'subidas/x', url: 'http://otro.sitio/subir', maxBytes: 10 },
    })
    await expect(
      cliente.subirArchivo(api.documentos[0].id, new File(['x'], 'a.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ codigo: 'datos' })
  })

  it('un 401 avisa a la sesión; en el inicio de sesión y la verificación no', async () => {
    expect(await cliente.obtenerSesion()).toBeNull()
    await expect(cliente.iniciarSesion({ usuario: 'x', contrasena: 'y' })).rejects.toMatchObject({ estado: 401 })
    expect(alNoAutenticado).not.toHaveBeenCalled()
    await expect(cliente.listarDocumentos()).rejects.toBeInstanceOf(ErrorAdmin)
    expect(alNoAutenticado).toHaveBeenCalledTimes(1)
  })

  it('los errores traen el mensaje del servidor, los errores por campo y Retry-After', async () => {
    await iniciar()
    api.forzar('POST', '/api/repositorio/admin/documentos', error(400, 'solicitud_invalida', 'Revise los campos marcados.', { titulo: 'El título es obligatorio.' }))
    const e = await cliente
      .crearDocumento({ titulo: '', categoria: 'Boletín', idioma: 'es', tipo: 'documento', claves: [], permiteDescarga: true })
      .catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErrorAdmin)
    expect(e).toMatchObject({ estado: 400, codigo: 'solicitud_invalida', message: 'Revise los campos marcados.' })
    expect((e as ErrorAdmin).campos).toEqual({ titulo: 'El título es obligatorio.' })

    api.forzar('POST', '/api/repositorio/admin/sesion', { ...error(429, 'demasiados_intentos', 'Espere.'), cabeceras: { 'Retry-After': '900' } })
    await expect(cliente.iniciarSesion({ usuario: 'a', contrasena: 'b' })).rejects.toMatchObject({ estado: 429, reintentarEn: 900 })
  })

  it('sin conexión: error "red" con un mensaje en español', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(cliente.listarCategorias()).rejects.toMatchObject({ codigo: 'red', message: expect.stringMatching(/No hay conexión/) })
  })

  it('una respuesta con otra forma se rechaza', async () => {
    await iniciar()
    api.forzar('GET', '/api/repositorio/admin/categorias', { estado: 200, cuerpo: { otra: 1 } })
    await expect(cliente.listarCategorias()).rejects.toMatchObject({ codigo: 'datos' })
  })
})

describe('errores', () => {
  it('Retry-After en segundos o como fecha HTTP', () => {
    expect(leerReintentar('120')).toBe(120)
    expect(leerReintentar('Thu, 08 Oct 2026 12:10:00 GMT', Date.parse('2026-10-08T12:00:00Z'))).toBe(600)
    expect(leerReintentar(null)).toBeNull()
    expect(leerReintentar('mañana')).toBeNull()
  })

  it('sin cuerpo JSON usa un mensaje por status', () => {
    const e = errorDeRespuesta(503, '<html>', '30')
    expect(e).toMatchObject({ codigo: 'no_disponible', reintentarEn: 30 })
    expect(e.message).toMatch(/no está disponible/)
    // El 400 estándar de Nest (JSON mal formado) no tiene `mensaje`.
    expect(errorDeRespuesta(400, '{"statusCode":400,"message":"Unexpected token"}', null).message).toBe('Revise los datos enviados.')
  })
})
