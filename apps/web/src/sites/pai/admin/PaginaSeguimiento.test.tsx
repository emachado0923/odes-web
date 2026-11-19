import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vigenciaPrueba } from '../pruebas/datosPrueba'
import PaginaSeguimiento from './PaginaSeguimiento'
import { ApiSimuladaPai, errorSimulado } from './pruebas/apiSimulada'
import { tableroPrueba } from './pruebas/datos'
import { boton, enlace, renderizarPagina } from './pruebas/renderizar'

let api: ApiSimuladaPai

beforeEach(() => {
  api = new ApiSimuladaPai()
  api.iniciarComo('administrador')
  api.instalar()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderizar() {
  return renderizarPagina(<PaginaSeguimiento />, { ruta: '/pai/admin' })
}

async function tablaProcesos() {
  return screen.findByRole('table', { name: /Logro por bimestre, avance anual y reportes/ })
}

describe('seguimiento (/pai/admin)', () => {
  it('muestra el avance general y el conteo del bimestre abierto', async () => {
    renderizar()
    const general = await screen.findByRole('region', { name: 'Avance general' })
    expect(within(general).getByText('41 %')).toBeInTheDocument()
    expect(within(general).getByText('2 de 5 reportados')).toBeInTheDocument()
    expect(within(general).getByText('3 pendientes')).toBeInTheDocument()
    expect(screen.getByText(/PAI 2026 · Bimestre 4 · julio–agosto · abierto/)).toBeInTheDocument()
    expect(document.title).toBe('Seguimiento · Plan de Acción Institucional · Sapiencia')
  })

  it('una tarjeta por dependencia con barras de logro y enlaces al tablero filtrado', async () => {
    // DTF no tiene pendientes: sin el enlace "Ver pendientes".
    api.tablero.resumen.dependencias[1].conteo = { bimestre: 4, reportados: 2, pendientes: 0, sinMeta: 0 }
    renderizar()
    const saf = await screen.findByRole('article', { name: /SAF/ })
    const barra = within(saf).getByRole('progressbar', { name: 'Logro del bimestre 3 en SAF' })
    expect(barra).toHaveAttribute('aria-valuenow', '50')
    expect(barra).toHaveAttribute('aria-valuetext', '50 %')
    expect(barra).toHaveClass('progress', 'progress-warning')
    expect(within(saf).getByRole('progressbar', { name: 'Logro del bimestre 1 en SAF' })).toHaveClass('progress-success')
    // Los bimestres 5 y 6 aún no se reportan (estado 'futuro'): neutros, no "Sin datos" ni avance bajo.
    expect(within(saf).getAllByText('Aún no se reporta')).toHaveLength(2)
    expect(within(saf).queryByText('Sin datos')).not.toBeInTheDocument()
    expect(within(saf).getByText('Reportados en el bimestre 4')).toBeInTheDocument()
    expect(enlace('Ver sus 3 indicadores de SAF', saf)).toHaveAttribute('href', '/pai?dependencia=1')
    expect(enlace('Ver pendientes de SAF', saf)).toHaveAttribute('href', '/pai?dependencia=1&estado=pendiente')
    const dtf = screen.getByRole('article', { name: /DTF/ })
    expect(within(dtf).queryByRole('link', { name: /pendientes/ })).not.toBeInTheDocument()
  })

  it('la leyenda explica los colores con el umbral del tablero (100 %) y los bimestres futuros', async () => {
    renderizar()
    const general = await screen.findByRole('region', { name: 'Avance general' })
    const leyenda = within(general).getByRole('list', { name: 'Colores de las barras:' })
    expect(within(leyenda).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '100 % o más de la meta',
      'del 50 % al 99 %',
      'menos del 50 %',
      '«Aún no se reporta»: bimestre que todavía no se abre para reportar',
    ])
  })

  it('un proceso sin indicadores con meta en el bimestre dice "Sin meta en el bimestre 4" (no "0 de 0")', async () => {
    api.tablero.resumen.procesos[0] = {
      ...api.tablero.resumen.procesos[0],
      conteo: { bimestre: 4, reportados: 0, pendientes: 0, sinMeta: 2 },
    }
    renderizar()
    const tabla = await tablaProcesos()
    const fila = within(tabla).getAllByRole('row')[1]
    expect(within(fila).getByText('Sin meta en el bimestre 4')).toBeInTheDocument()
    expect(within(fila).queryByText(/0 de 0/)).not.toBeInTheDocument()
  })

  it('tabla por proceso: encabezados con scope, logros, conteo y enlaces al tablero', async () => {
    renderizar()
    const tabla = await tablaProcesos()
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Proceso o proyecto',
      'Dependencia',
      'Bim. 1',
      'Bim. 2',
      'Bim. 3',
      'Bim. 4',
      'Bim. 5',
      'Bim. 6',
      'Avance anual',
      'Reportados (Bim. 4)',
    ])
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(3)
    const th = within(filas[0]).getByRole('rowheader')
    expect(enlace(/SAF-TH Gestión del Talento Humano/, th)).toHaveAttribute('href', '/pai?proceso=11')
    expect(within(filas[0]).getByText('1 de 2 reportados')).toBeInTheDocument()
    expect(enlace('1 pendiente de SAF-TH', filas[0])).toHaveAttribute('href', '/pai?proceso=11&estado=pendiente')
    expect(within(filas[2]).getByText('Proyecto')).toBeInTheDocument()
    expect(within(filas[0]).getByRole('progressbar', { name: 'Avance anual de SAF-TH' })).toHaveAttribute('aria-valuenow', '42')
  })

  it('el filtro por dependencia acota la tabla y la exportación', async () => {
    renderizar()
    const tabla = await tablaProcesos()
    const exportar = enlace('Exportar CSV')
    expect(exportar).toHaveAttribute('href', '/api/pai/admin/exportar.csv?vigencia=2026')
    expect(exportar).toHaveAttribute('download')
    fireEvent.change(screen.getByLabelText('Dependencia'), { target: { value: '1' } })
    expect(within(tabla).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText(/Se exportan los indicadores de SAF/)).toBeInTheDocument()
    expect(enlace('Exportar CSV')).toHaveAttribute('href', '/api/pai/admin/exportar.csv?dependencia=1&vigencia=2026')
    fireEvent.change(screen.getByLabelText('Textos del bimestre'), { target: { value: '2' } })
    expect(enlace('Exportar CSV')).toHaveAttribute(
      'href',
      '/api/pai/admin/exportar.csv?dependencia=1&bimestre=2&vigencia=2026',
    )
  })

  it('clic en un proceso lleva al tablero con el filtro en la URL', async () => {
    const { router } = renderizar()
    const tabla = await tablaProcesos()
    fireEvent.click(enlace(/DTF-GF Gestión de Fondos/, tabla))
    expect(await screen.findByText('Tablero de prueba')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pai')
    expect(router.state.location.search).toBe('?proceso=21')
  })

  it('sin bimestre abierto no hay conteo y la exportación usa el último bimestre con reportes', async () => {
    api.vigencia = vigenciaPrueba({ bimestreAbierto: null })
    api.tablero = tableroPrueba(api.vigencia)
    api.tablero.resumen.procesos = api.tablero.resumen.procesos.map((p) => ({ ...p, conteo: null }))
    renderizar()
    const tabla = await tablaProcesos()
    expect(within(tabla).getByRole('columnheader', { name: 'Reportados' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'El último con reportes' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Avance general' })).queryByText(/reportados/)).not.toBeInTheDocument()
  })

  it('sin indicadores cargados avisa', async () => {
    api.tablero = { ...tableroPrueba(), indicadores: [] }
    renderizar()
    expect(await screen.findByText(/Todavía no hay indicadores cargados para el PAI 2026/)).toBeInTheDocument()
  })

  it('error al cargar: aviso con Reintentar', async () => {
    const no = { ...errorSimulado(503, 'no_disponible', 'El PAI no está disponible.'), cabeceras: { 'Retry-After': '0' } }
    api.forzar('GET', '/tablero', no, no, no)
    renderizar()
    expect(await screen.findByText('El PAI no está disponible.')).toBeInTheDocument()
    fireEvent.click(boton('Reintentar'))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Avance general' })).toBeInTheDocument())
  })
})
