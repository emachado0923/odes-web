import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../router'
import { FICHAS_EJEMPLO } from './fondos/ventanilla/ejemplo-fichas'

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('./componentes/EstilosTableros', () => ({ default: () => null }))

// El tablero real (ECharts sobre canvas) no corre en jsdom: este muestra lo que
// encuentra en window.ODES al importarse, para comprobar que los datos llegan antes.
vi.mock('./matricula/TableroMatricula', () => {
  const odes = (window as Window & { ODES?: { matricula?: { meta?: { municipio?: string } } } }).ODES
  const municipio = odes?.matricula?.meta?.municipio ?? 'sin datos'
  return { default: () => <p>Tablero simulado: {municipio}</p> }
})

// El de los fondos recibe los datos por props (no por window.ODES).
vi.mock('./fondos/TableroFondos', () => ({
  default: ({ datos }: { datos: { fondos: { meta: { periodoActual: string } } } }) => (
    <p>Tablero de fondos simulado: {datos.fondos.meta.periodoActual}</p>
  ),
}))

// La matrícula 2000-2025 también recibe los datos por props.
vi.mock('./historica/TableroMatriculaHistorica', () => ({
  default: ({ datos }: { datos: { meta: { desde: number; hasta: number }; filas: unknown[] } }) => (
    <p>
      Serie simulada: {datos.meta.desde}-{datos.meta.hasta}, {datos.filas.length} filas
    </p>
  ),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as Window & { ODES?: unknown }).ODES
})

function renderizarEn(ruta: string) {
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />)
}

function respuesta(estado: number, cuerpo: unknown = {}): Response {
  // Los 503 piden reintentar sin esperar, para no demorar las pruebas.
  const headers = { 'Content-Type': 'application/json', ...(estado === 503 ? { 'Retry-After': '0' } : {}) }
  return new Response(JSON.stringify(cuerpo), { status: estado, headers })
}

function responder(estado: number, cuerpo: unknown = {}) {
  const pedir = vi.fn<(url: string, opciones?: RequestInit) => Promise<Response>>(async () => respuesta(estado, cuerpo))
  vi.stubGlobal('fetch', pedir)
  return pedir
}

/** Respuestas por dirección (y método): la sesión de los tableros y los datos van a URL distintas. */
function responderPorUrl(rutas: Record<string, () => Response>) {
  const pedir = vi.fn<(url: string, opciones?: RequestInit) => Promise<Response>>(async (url, opciones) => {
    const clave = `${opciones?.method ?? 'GET'} ${url}`
    const fabrica = rutas[clave] ?? rutas[url]
    if (!fabrica) throw new Error(`Petición inesperada: ${clave}`)
    return fabrica()
  })
  vi.stubGlobal('fetch', pedir)
  return pedir
}

const SESION = { usuario: 'planeacion', nombre: 'Planeación', csrf: 'x'.repeat(43), expira: '2026-11-18T00:00:00.000Z' }
const DATOS_FONDOS = {
  fondos: { meta: { periodoActual: '2026-2' }, dim: { periodo: ['2026-2'] }, estados: [] },
  definiciones: { nota: 'Fuente' },
}

describe('rama /tableros', () => {
  it('el tablero de matrícula pide sus datos a la API y los deja en window.ODES antes de importar el tablero', async () => {
    const pedir = responder(200, { matricula: { meta: { municipio: 'Medellín' } }, definiciones: { nota: 'SNIES' } })
    renderizarEn('/tableros/matricula-2025')
    expect(await screen.findByRole('heading', { level: 1, name: /Tablero matrícula en educación superior/ })).toBeInTheDocument()
    expect(await screen.findByText('Tablero simulado: Medellín')).toBeInTheDocument()
    expect(pedir).toHaveBeenCalledWith('/api/sivu/tableros/matricula-2025', expect.anything())
    expect(document.title).toBe('Tablero matrícula en educación superior en Medellín (2025)')
    // Cabecera y pie azules del tablero estático, solo en este tablero.
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    expect(screen.getByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('contentinfo')).toHaveClass('odes-footer')
  })

  it('la matrícula 2000-2025 lee el JSON estático del ETL y monta el tablero con la hoja de matrícula', async () => {
    const DATOS = {
      meta: { desde: 2000, hasta: 2025 },
      anios: [2000, 2025],
      dim: { programa: [] },
      filas: [[0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]],
      referencia: {},
    }
    const pedir = responder(200, DATOS)
    renderizarEn('/tableros/matricula-historica')
    expect(await screen.findByText('Serie simulada: 2000-2025, 1 filas')).toBeInTheDocument()
    expect(pedir).toHaveBeenCalledWith('/tableros/matricula-historica/datos/matricula.json', expect.anything())
    expect(document.title).toBe('Tablero matrícula en educación superior en Medellín (2000-2025)')
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    expect(document.querySelector('.tableros')).toHaveClass('tablero-matricula', 'tablero-historica')
  })

  it('la matrícula 2000-2025 avisa si el archivo de datos no está publicado', async () => {
    responder(404)
    renderizarEn('/tableros/matricula-historica')
    expect(await screen.findByText('El tablero todavía no tiene datos publicados.')).toBeInTheDocument()
  })

  it('los fondos, con sesión, abren el tablero y el selector cambia a la ventanilla sin volver a pedir los datos', async () => {
    const pedir = responderPorUrl({
      '/api/sivu/sesion': () => respuesta(200, SESION),
      '/api/sivu/tableros/fondos-2026': () => respuesta(200, DATOS_FONDOS),
    })
    renderizarEn('/tableros/fondos-2026')
    expect(await screen.findByRole('heading', { level: 1, name: /Tablero beneficiarios de los fondos de Sapiencia/ })).toBeInTheDocument()
    expect(await screen.findByText('Tablero de fondos simulado: 2026-2')).toBeInTheDocument()
    expect(document.title).toBe('Tablero beneficiarios de los fondos de Sapiencia (2026)')
    const selector = screen.getByRole('navigation', { name: 'Fondos de Sapiencia' })
    expect(within(selector).getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(selector).getByRole('link', { name: 'Ventanilla de consulta' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Ventanilla de consulta de los fondos de Sapiencia/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Número de documento')).toBeVisible()
    expect(screen.getByText('Tablero de fondos simulado: 2026-2')).not.toBeVisible()
    // De vuelta al tablero: sigue montado, sin otra petición de datos.
    fireEvent.click(within(selector).getByRole('link', { name: 'Tablero' }))
    expect(await screen.findByText('Tablero de fondos simulado: 2026-2')).toBeVisible()
    expect(pedir.mock.calls.filter(([url]) => url === '/api/sivu/tableros/fondos-2026')).toHaveLength(1)
    // Los mismos cabecera y pie azules del de matrícula, con su hoja.
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    expect(screen.getByRole('contentinfo')).toHaveClass('odes-footer')
    expect(document.querySelector('.tableros')).toHaveClass('tablero-matricula', 'tablero-fondos')
  })

  it('la ventanilla tiene su propia dirección, consulta por documento con POST y X-CSRF-Token y muestra el expediente', async () => {
    const pedir = responderPorUrl({
      '/api/sivu/sesion': () => respuesta(200, SESION),
      '/api/sivu/tableros/fondos-2026': () => respuesta(200, DATOS_FONDOS),
      'POST /api/sivu/tableros/fondos-2026/consulta': () => respuesta(200, { documento: '999000111', fichas: FICHAS_EJEMPLO }),
    })
    renderizarEn('/tableros/fondos-2026/ventanilla')
    expect(await screen.findByRole('heading', { level: 1, name: /Ventanilla de consulta de los fondos de Sapiencia/ })).toBeInTheDocument()
    fireEvent.change(await screen.findByLabelText('Número de documento'), { target: { value: '999.000.111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    // El expediente: la persona, una ficha por beneficio y sus eventos.
    expect(await screen.findByRole('heading', { level: 2, name: 'Maria Fernanda Restrepo de la Ossa' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Fondo EPM/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Becas Mejores Bachilleres/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Enlaza Mundos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Eventos reportados/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'maria.ficticia@ejemplo.org' })).toHaveAttribute('href', 'mailto:maria.ficticia@ejemplo.org')
    const envio = pedir.mock.calls.find(([url, opciones]) => url === '/api/sivu/tableros/fondos-2026/consulta' && opciones?.method === 'POST')
    expect(envio?.[1]?.method).toBe('POST')
    expect(((envio?.[1]?.headers ?? {}) as Record<string, string>)['X-CSRF-Token']).toBe(SESION.csrf)
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ documento: '999.000.111' })
    // El tablero se precarga en segundo plano: al pasar a él, ya está.
    await waitFor(() => expect(pedir).toHaveBeenCalledWith('/api/sivu/tableros/fondos-2026', expect.anything()))
    fireEvent.click(screen.getByRole('link', { name: 'Tablero' }))
    expect(await screen.findByText('Tablero de fondos simulado: 2026-2')).toBeVisible()
    // Al volver, la consulta sigue ahí.
    fireEvent.click(screen.getByRole('link', { name: 'Ventanilla de consulta' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Maria Fernanda Restrepo de la Ossa' })).toBeVisible()
  })

  it('el tablero de los fondos avisa si los datos no tienen la forma esperada', async () => {
    responderPorUrl({
      '/api/sivu/sesion': () => respuesta(200, SESION),
      '/api/sivu/tableros/fondos-2026': () => respuesta(200, { definiciones: {} }),
    })
    renderizarEn('/tableros/fondos-2026')
    expect(await screen.findByRole('alert')).toHaveTextContent('formato inesperado')
  })

  it('el tablero de los fondos es privado: sin sesión muestra el ingreso y no pide los datos', async () => {
    const pedir = responderPorUrl({ '/api/sivu/sesion': () => respuesta(401, { codigo: 'no_autenticado' }) })
    renderizarEn('/tableros/fondos-2026')
    expect(await screen.findByText('Acceso restringido')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
    expect(pedir).not.toHaveBeenCalledWith('/api/sivu/tableros/fondos-2026', expect.anything())
    // La cabecera y el pie siguen siendo los azules del tablero.
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
  })

  it('con usuario y contraseña correctos entra al tablero y muestra «Cerrar sesión»', async () => {
    const pedir = responderPorUrl({
      'GET /api/sivu/sesion': () => respuesta(401, { codigo: 'no_autenticado' }),
      'POST /api/sivu/sesion': () => respuesta(200, SESION),
      '/api/sivu/tableros/fondos-2026': () => respuesta(200, DATOS_FONDOS),
    })
    renderizarEn('/tableros/fondos-2026')
    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'planeacion' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'una-clave-larga-de-prueba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Tablero de fondos simulado: 2026-2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Planeación')).toBeInTheDocument()
    const envio = pedir.mock.calls.find(([url, opciones]) => url === '/api/sivu/sesion' && opciones?.method === 'POST')
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ usuario: 'planeacion', contrasena: 'una-clave-larga-de-prueba' })
  })

  it('con la contraseña equivocada muestra el mensaje del servidor y no entra', async () => {
    responderPorUrl({
      'GET /api/sivu/sesion': () => respuesta(401, { codigo: 'no_autenticado' }),
      'POST /api/sivu/sesion': () => respuesta(401, { codigo: 'no_autenticado', mensaje: 'Usuario o contraseña incorrectos.' }),
    })
    renderizarEn('/tableros/fondos-2026')
    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'planeacion' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'otra-clave-cualquiera' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.queryByText(/Tablero de fondos simulado/)).not.toBeInTheDocument()
  })

  it('sin base (503) reintenta dos veces y muestra un aviso claro en vez del tablero', async () => {
    const pedir = responder(503, { codigo: 'no_disponible' })
    renderizarEn('/tableros/matricula-2025')
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('El tablero no pudo cargarse.')
    expect(aviso).toHaveTextContent('La base de datos no está disponible')
    expect(pedir).toHaveBeenCalledTimes(3)
  })

  it('un 503 momentáneo (la base se estaba conectando) se reintenta y el tablero carga', async () => {
    const pedir = responder(200, { matricula: { meta: { municipio: 'Medellín' } }, definiciones: {} })
    pedir.mockResolvedValueOnce(respuesta(503, { codigo: 'no_disponible' }))
    renderizarEn('/tableros/matricula-2025')
    expect(await screen.findByText('Tablero simulado: Medellín')).toBeInTheDocument()
    expect(pedir).toHaveBeenCalledTimes(2)
  })

  it('una ruta desconocida dentro de /tableros enlaza a los tres tableros', async () => {
    responder(200)
    renderizarEn('/tableros/otro')
    expect(await screen.findByRole('heading', { name: 'No encontramos ese tablero' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /matrícula en educación superior/ })).toHaveAttribute('href', '/tableros/matricula-2025')
    expect(screen.getByRole('link', { name: /beneficiarios de los fondos/ })).toHaveAttribute('href', '/tableros/fondos-2026')
    expect(screen.getByRole('link', { name: /batería de indicadores/ })).toHaveAttribute('href', '/tableros/bateria-indicadores')
    // Fuera de los tableros siguen la cabecera y el pie magenta del sitio.
    expect(screen.getByRole('banner')).toHaveClass('tb-cabecera')
    expect(screen.getByRole('contentinfo')).toHaveClass('tb-pie')
  })
})
