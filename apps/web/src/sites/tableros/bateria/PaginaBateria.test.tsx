import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as echarts from 'echarts'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../../router'
import { URL_DATOS_BATERIA } from '../rutas'

/*
 * El tablero real (TableroBateria.tsx) con sus datos reales de
 * apps/web/public/tableros/bateria-indicadores/datos/. Se simulan solo lo que
 * jsdom no tiene: la carga de scripts, el canvas y ECharts.
 */

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('../componentes/EstilosTableros', () => ({ default: () => null }))

// Del gráfico solo importa que el tablero cree la instancia y registre los mapas.
vi.mock('echarts', () => ({
  init: vi.fn<() => object>(() => ({
    setOption: vi.fn<() => void>(),
    resize: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    getDataURL: vi.fn<() => string>(() => 'data:,'),
  })),
  registerMap: vi.fn<() => void>(),
}))

/**
 * jsdom no ejecuta <script src>: el simulado de cargar-script ejecuta el
 * archivo real de datos/ como lo haría el navegador (cada uno se guarda en
 * window.ODES) y anota lo pedido. Con `fallar`, la descarga falla. Los
 * archivos se leen como texto (?raw) solo cuando se piden.
 */
const datos = vi.hoisted(() => ({ fallar: false, pedidos: [] as string[] }))
vi.mock('./cargar-script', () => {
  const archivos = import.meta.glob<string>('../../../../public/tableros/bateria-indicadores/datos/**/*.js', {
    query: '?raw',
    import: 'default',
  })
  return {
    cargarScript: async (url: string) => {
      datos.pedidos.push(url)
      if (datos.fallar) throw new Error(`No se pudo cargar ${url}`)
      const archivo = url.slice('/tableros/bateria-indicadores/datos/'.length).split('?')[0]
      const leer = archivos[`../../../../public/tableros/bateria-indicadores/datos/${archivo}`]
      if (!leer) throw new Error(`No existe ${url}`)
      // Como un <script> clásico: corre en el ámbito global.
      new Function(await leer())()
    },
  }
})

const TITULO = 'Batería de indicadores de educación postsecundaria'
const SUFIJO_TITULO = 'Batería de indicadores · Observatorio de Educación de Sapiencia'

beforeAll(() => {
  // El tablero mide los rótulos con un canvas, que jsdom no implementa.
  const contexto = { font: '', measureText: (texto: string) => ({ width: texto.length * 7 }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => contexto as never)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  datos.fallar = false
  datos.pedidos.length = 0
  sessionStorage.clear()
  delete (window as Window & { ODES?: unknown }).ODES
})

function abrir(ruta: string, { conBienvenida = false } = {}) {
  // La bienvenida sale una vez por sesión: sin ella se ve directo el tablero.
  if (!conBienvenida) sessionStorage.setItem('odes_intro_vista', '1')
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return router
}

const direccion = (router: ReturnType<typeof abrir>) => router.state.location.pathname + router.state.location.search

describe('batería de indicadores (/tableros/bateria-indicadores)', () => {
  it('carga los datos base, muestra la bienvenida y monta el tablero con la cabecera azul', async () => {
    abrir('/tableros/bateria-indicadores', { conBienvenida: true })
    const bienvenida = await screen.findByRole('dialog', { name: TITULO })
    expect(datos.pedidos).toEqual(
      expect.arrayContaining(['definiciones.js', 'vistas.js', 'geo.js'].map((a) => `${URL_DATOS_BATERIA}/${a}`)),
    )
    expect(screen.getByRole('heading', { level: 1, name: TITULO })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    expect(screen.getByRole('contentinfo')).toHaveClass('odes-footer')
    expect(document.querySelector('.tableros')).toHaveClass('tablero-bateria')
    expect(document.title).toBe(SUFIJO_TITULO)

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(bienvenida).not.toBeInTheDocument()
    expect(sessionStorage.getItem('odes_intro_vista')).toBe('1')
  })

  it('las vistas son rutas del sitio y se navega entre ellas sin recargar, pidiendo los datos de cada una', async () => {
    const router = abrir('/tableros/bateria-indicadores')
    await screen.findByRole('heading', { level: 2, name: 'Mapa de indicadores' })
    expect(screen.getByRole('link', { name: /Glosario/ })).toHaveAttribute('href', '/tableros/bateria-indicadores/glosario')
    // El inicio muestra el primer grupo (educación postsecundaria); su primera vista es ep-ies.
    const enlace = document.querySelector<HTMLAnchorElement>('a.inicio-vista[href="/tableros/bateria-indicadores/ep-ies"]')
    expect(enlace).not.toBeNull()

    // Un clic normal lo maneja el tablero (sin recarga): el router cambia de dirección.
    expect(fireEvent.click(enlace as HTMLAnchorElement)).toBe(false)
    expect(direccion(router)).toBe('/tableros/bateria-indicadores/ep-ies')
    const vista = 'Instituciones que ofertan educación superior'
    expect(await screen.findByRole('heading', { level: 2, name: vista })).toBeInTheDocument()
    await waitFor(() => expect(datos.pedidos).toContain(`${URL_DATOS_BATERIA}/v/ep-ies__nacional.js?v=20261011`))
    await waitFor(() => expect(echarts.init).toHaveBeenCalled())
    expect(document.title).toBe(`${vista} · ${SUFIJO_TITULO}`)

    // Atrás vuelve al inicio, como antes con el hash.
    await act(() => router.navigate(-1))
    expect(direccion(router)).toBe('/tableros/bateria-indicadores')
    await waitFor(() => expect(document.title).toBe(SUFIJO_TITULO))
  })

  it('las direcciones del tablero estático llevan a la misma vista y variante', async () => {
    const router = abrir('/tableros/bateria-indicadores/index.html#/sa-fondo-epm?v=comunas')
    await waitFor(() => expect(direccion(router)).toBe('/tableros/bateria-indicadores/sa-fondo-epm?v=comunas'))
    expect(router.state.location.hash).toBe('')
    await waitFor(() => expect(datos.pedidos).toContain(`${URL_DATOS_BATERIA}/v/sa-fondo-epm__comunas.js?v=20261011`))
  })

  it('el catálogo dibuja las fórmulas con KaTeX, que se descarga al abrirlo', async () => {
    abrir('/tableros/bateria-indicadores/catalogo')
    expect(await screen.findByRole('heading', { level: 2, name: 'Catálogo de indicadores' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.katex')).not.toBeNull(), { timeout: 5000 })
  })

  it('si los datos no se pueden descargar, avisa en vez de mostrar el tablero', async () => {
    datos.fallar = true
    abrir('/tableros/bateria-indicadores')
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('El tablero no pudo cargarse.')
    expect(aviso).toHaveTextContent('No se pudieron descargar los datos del tablero.')
  })
})
