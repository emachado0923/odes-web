import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../../router'

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('../componentes/EstilosTableros', () => ({ default: () => null }))

// Del gráfico solo importa que el tablero cree las instancias y registre el mapa de comunas.
const graficos = vi.hoisted(() => ({ mapas: [] as string[] }))
vi.mock('echarts', () => ({
  init: vi.fn<() => object>(() => ({
    setOption: vi.fn<() => void>(),
    resize: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    getDataURL: vi.fn<() => string>(() => 'data:,'),
  })),
  registerMap: vi.fn<(nombre: string) => void>((nombre) => void graficos.mapas.push(nombre)),
}))

/**
 * jsdom no ejecuta <script src>: el simulado de cargar-script corre el archivo
 * real de datos/ como lo haría el navegador (cada uno se guarda en
 * window.ODES) y anota lo pedido. Con `fallar`, la descarga falla.
 */
const datos = vi.hoisted(() => ({ fallar: false, pedidos: [] as string[] }))
vi.mock('../bateria/cargar-script', () => {
  const archivos = import.meta.glob<string>('../../../../public/tableros/convocatoria-pregrado/datos/*.js', {
    query: '?raw',
    import: 'default',
  })
  return {
    cargarScript: async (url: string) => {
      datos.pedidos.push(url)
      if (datos.fallar) throw new Error(`No se pudo cargar ${url}`)
      const leer = archivos[`../../../../public/tableros/convocatoria-pregrado/datos/${url.split('/').pop()}`]
      if (!leer) throw new Error(`No existe ${url}`)
      // Como un <script> clásico: corre en el ámbito global.
      new Function(await leer())()
    },
  }
})

beforeAll(() => {
  // El tablero mide los rótulos con un canvas, que jsdom no implementa.
  const contexto = { font: '', measureText: (texto: string) => ({ width: texto.length * 7 }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => contexto as never)
})

afterEach(() => {
  datos.fallar = false
  datos.pedidos.length = 0
})

function abrir() {
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/tableros/convocatoria-pregrado'] })} />)
}

describe('/tableros/convocatoria-pregrado', () => {
  it('carga los tres archivos de datos antes del tablero y lo monta con la cabecera azul y la ruta por SIVU', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Tablero caracterización inscritos convocatorias' })).toBeInTheDocument()
    const secciones = await screen.findByRole('tablist', { name: 'Secciones del tablero' }, { timeout: 5000 })
    expect(datos.pedidos.sort()).toEqual([
      '/tableros/convocatoria-pregrado/datos/comunas.js',
      '/tableros/convocatoria-pregrado/datos/convocatoria.js',
      '/tableros/convocatoria-pregrado/datos/definiciones.js',
    ])
    expect(graficos.mapas).toContain('medellin')
    expect(document.title).toBe('Tablero caracterización inscritos convocatorias')
    expect(document.querySelector('.tableros')).toHaveClass('tablero-matricula', 'tablero-convocatoria')
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    const ruta = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(ruta).getByRole('link', { name: 'SIVU' })).toHaveAttribute('href', '/sivu#tableros')

    // Siete secciones; la primera abierta y los indicadores con la cifra de inscritos.
    const pestanas = within(secciones).getAllByRole('tab')
    expect(pestanas).toHaveLength(7)
    expect(pestanas[0]).toHaveAttribute('aria-selected', 'true')
    const indicadores = screen.getByRole('region', { name: 'Indicadores de la selección' })
    expect(within(indicadores).getByText('Inscritos')).toBeInTheDocument()

    fireEvent.click(pestanas[4])
    expect(pestanas[4]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', pestanas[4].id)
  })

  it('si los datos no descargan, lo dice en vez de quedarse cargando', async () => {
    datos.fallar = true
    delete (window as Window & { ODES?: unknown }).ODES
    abrir()
    expect(
      await screen.findByText('No se pudieron descargar los datos del tablero. Revise la conexión y vuelva a intentarlo.'),
    ).toBeInTheDocument()
  })
})
