import { render, screen, within, waitFor } from '@testing-library/react'
import { createMemoryRouter, Route, Routes } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RolPai } from '../api-pai'
import { ProveedorSesionPrueba } from '../pruebas/ProveedorSesionPrueba'
import { falla, ok, simularApiPai } from '../tablero/apiPruebaPai'
import { fichaPrueba } from '../tablero/datosPruebaTablero'
import PaginaFichaIndicador from './PaginaFichaIndicador'

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(ruta: string, rol: RolPai = 'responsable') {
  const router = createMemoryRouter(
    [
      {
        path: '/pai/*',
        element: (
          <ProveedorSesionPrueba rol={rol}>
            <Routes>
              <Route path="indicadores/:codigo" element={<PaginaFichaIndicador />} />
            </Routes>
          </ProveedorSesionPrueba>
        ),
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function dato(etiqueta: string): HTMLElement {
  const termino = screen.getAllByText(etiqueta, { selector: 'dt' })[0]
  return termino.nextElementSibling as HTMLElement
}

describe('ficha del indicador', () => {
  it('muestra todos los campos de la ficha y la tabla de los seis bimestres', async () => {
    const peticiones = simularApiPai((p) => (p.ruta === '/api/pai/indicadores/SAF-TH-01' ? ok(fichaPrueba()) : undefined))
    montar('/pai/indicadores/SAF-TH-01')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'SAF-TH-01 Porcentaje de ejecución del plan de bienestar' }),
    ).toBeInTheDocument()
    expect(peticiones[0].ruta).toBe('/api/pai/indicadores/SAF-TH-01')
    // El título lo pone un efecto: puede llegar justo después del encabezado.
    await waitFor(() =>
      expect(document.title).toBe('SAF-TH-01 · Ficha del indicador · Plan de Acción Institucional · Sapiencia'),
    )
    expect(dato('Dependencia')).toHaveTextContent('SAF · Subdirección Administrativa, Financiera y de Apoyo')
    expect(dato('Línea del Plan de Desarrollo')).toHaveTextContent('1. Creemos en la educación')
    expect(dato('Dimensión del Plan Estratégico')).toHaveTextContent('Talento humano')
    expect(dato('Programa')).toHaveTextContent('Sin información')
    expect(dato('Objetivo')).toHaveTextContent('Fortalecer el bienestar de los servidores.')
    expect(dato('Productos')).toHaveTextContent('Informe de ejecución del plan de bienestar')
    expect(dato('Rol responsable')).toHaveTextContent('Profesional de Talento Humano')
    expect(dato('Meta total')).toHaveTextContent('12 (suma de los seis bimestres)')
    expect(dato('% total')).toHaveTextContent('25 % · El % se limita a 100 %')
    expect(screen.getByRole('heading', { name: 'Acción 1' })).toBeInTheDocument()
    expect(screen.getByText('Ejecutar el plan de bienestar laboral')).toBeInTheDocument()
    expect(screen.getByText('Riesgo de corrupción')).toBeInTheDocument()

    const tabla = screen.getByRole('table', { name: /por bimestre/ })
    // "Evidencias" tiene además una versión corta para el celular (oculta por CSS en pantallas anchas).
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Bimestre',
      'Meta',
      'Avance',
      '%',
      'Estado',
      'EvidenciasEvid.',
    ])
    const filas = within(tabla).getAllByRole('rowheader').map((c) => c.textContent)
    expect(filas).toEqual([
      'Bimestre 1enero–febrero',
      'Bimestre 2marzo–abril',
      'Bimestre 3mayo–junio',
      'Bimestre 4julio–agosto',
      'Bimestre 5septiembre–octubre',
      'Bimestre 6noviembre–diciembre',
      'Total',
    ])
    const primera = within(tabla).getAllByRole('row')[1]
    expect(within(primera).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '2', '100 %', 'Reportado', '1'])

    // Textos y evidencias de cada bimestre.
    const b1 = screen.getByRole('article', { name: 'Bimestre 1 · enero–febrero' })
    expect(within(b1).getByText('Se realizaron dos jornadas de bienestar.')).toBeInTheDocument()
    expect(within(b1).getByText('Listas de asistencia.')).toBeInTheDocument()
    expect(within(b1).getByRole('link', { name: 'asistencia-enero.pdf' })).toHaveAttribute('href', '/api/pai/evidencias/51')
    const b5 = screen.getByRole('article', { name: 'Bimestre 5 · septiembre–octubre' })
    expect(within(b5).getByText('Sin reporte en este bimestre.')).toBeInTheDocument()

    // El responsable puede reportar el bimestre 4 desde el tablero.
    expect(screen.getByRole('link', { name: 'Reportar en el tablero' })).toHaveAttribute('href', '/pai?q=SAF-TH-01')
    expect(screen.getByText('Puede editar: bimestre 4.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/pai')
  })

  it('el administrador la ve igual, sin bimestres editables', async () => {
    simularApiPai((p) => (p.ruta === '/api/pai/indicadores/1' ? ok(fichaPrueba('administrador')) : undefined))
    montar('/pai/indicadores/1', 'administrador')
    expect(await screen.findByRole('link', { name: 'Ver en el tablero' })).toHaveAttribute('href', '/pai?q=SAF-TH-01')
    expect(screen.queryByText(/Puede editar/)).not.toBeInTheDocument()
    expect(screen.queryByText('Editable')).not.toBeInTheDocument()
  })

  it('404: el indicador no existe o no está asignado', async () => {
    simularApiPai(() => falla(404, 'no_encontrado', 'No se encontró el indicador.'))
    montar('/pai/indicadores/XYZ-99')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se encontró el indicador «XYZ-99», o no está entre los indicadores que tiene asignados.',
    )
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/pai')
  })

  it('otro error: mensaje y reintento', async () => {
    simularApiPai(() => falla(503, 'no_disponible', 'El PAI no está disponible.'))
    montar('/pai/indicadores/SAF-TH-01')
    expect(await screen.findByText('No se pudo cargar la ficha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})

describe('ficha: textos de cada bimestre', () => {
  it('"Reportes por bimestre" dice "Sin meta" igual que la tabla (no "—")', async () => {
    const ficha = fichaPrueba()
    ficha.bimestres[1] = { ...ficha.bimestres[1], meta: 0, avance: null, porcentaje: null, estado: 'sin_meta', logros: null, origen: null, actualizadoEn: null }
    simularApiPai((p) => (p.ruta === '/api/pai/indicadores/SAF-TH-01' ? ok(ficha) : undefined))
    montar('/pai/indicadores/SAF-TH-01')
    const reporte = await screen.findByRole('article', { name: 'Bimestre 2 · marzo–abril' })
    expect(within(reporte).getByText(/^Sin meta · meta 0 · avance — ·/)).toHaveTextContent('Sin meta · meta 0 · avance — · Sin meta')
  })
})
