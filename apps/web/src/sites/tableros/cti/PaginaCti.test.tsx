import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../../router'

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('../componentes/EstilosTableros', () => ({ default: () => null }))

// Del gráfico solo importa que el tablero cree las instancias.
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
 * jsdom no ejecuta <script src>: el simulado de cargar-script corre el archivo
 * real de datos/ como lo haría el navegador (cada uno se guarda en
 * window.ODES) y anota lo pedido. Con `fallar`, la descarga falla.
 */
const datos = vi.hoisted(() => ({ fallar: false, pedidos: [] as string[] }))
vi.mock('../bateria/cargar-script', () => {
  const archivos = import.meta.glob<string>('../../../../public/tableros/matricula-cti/datos/*.js', {
    query: '?raw',
    import: 'default',
  })
  return {
    cargarScript: async (url: string) => {
      datos.pedidos.push(url)
      if (datos.fallar) throw new Error(`No se pudo cargar ${url}`)
      const leer = archivos[`../../../../public/tableros/matricula-cti/datos/${url.split('/').pop()}`]
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
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/tableros/matricula-cti'] })} />)
}

describe('/tableros/matricula-cti', () => {
  it('carga los datos antes del tablero y lo monta con la cabecera azul y la ruta por SIVU', async () => {
    abrir()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tablero matrícula en ciencia, tecnología e innovación' }),
    ).toBeInTheDocument()
    const secciones = await screen.findByRole('tablist', { name: 'Secciones del tablero' }, { timeout: 5000 })
    expect(datos.pedidos.sort()).toEqual(['/tableros/matricula-cti/datos/cti.js', '/tableros/matricula-cti/datos/definiciones.js'])
    expect(document.title).toBe('Tablero matrícula en ciencia, tecnología e innovación')
    expect(document.querySelector('.tableros')).toHaveClass('tablero-matricula', 'tablero-convocatoria', 'tablero-cti')
    expect(screen.getByRole('banner')).toHaveClass('odes-header')
    const ruta = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(ruta).getByRole('link', { name: 'SIVU' })).toHaveAttribute('href', '/sivu#tableros')

    // Tres secciones; la primera abierta y los indicadores con los estudiantes en CTi.
    const pestanas = within(secciones).getAllByRole('tab')
    expect(pestanas.map((p) => p.textContent)).toEqual([
      'Sección 1Panorama general',
      'Sección 2Áreas de conocimiento',
      'Sección 3Instituciones y programas',
    ])
    expect(pestanas[0]).toHaveAttribute('aria-selected', 'true')
    const indicadores = screen.getByRole('region', { name: 'Indicadores de la selección' })
    expect(within(indicadores).getByText('Estudiantes en CTi')).toBeInTheDocument()

    fireEvent.click(pestanas[2])
    expect(pestanas[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', pestanas[2].id)
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
