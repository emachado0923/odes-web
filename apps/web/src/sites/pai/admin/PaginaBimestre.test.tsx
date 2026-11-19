import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../../router'
import { CABECERA_CSRF } from '../api-pai'
import { CSRF_PRUEBA, vigenciaPrueba } from '../pruebas/datosPrueba'
import PaginaBimestre from './PaginaBimestre'
import { ApiSimuladaPai, errorSimulado } from './pruebas/apiSimulada'
import { boton, renderizarPagina } from './pruebas/renderizar'

vi.mock('../componentes/EstilosPai', () => ({ default: () => null }))

let api: ApiSimuladaPai

beforeEach(() => {
  // Solo se fija la fecha (las esperas de Testing Library siguen con temporizadores reales).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-08-20T15:00:00.000Z'))
  api = new ApiSimuladaPai()
  api.iniciarComo('administrador')
  api.instalar()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function renderizar() {
  renderizarPagina(<PaginaBimestre />, { ruta: '/pai/admin/bimestre' })
  return screen.findByRole('region', { name: /Estado actual/ })
}

describe('bimestre habilitado (/pai/admin/bimestre)', () => {
  it('muestra el estado actual y quién lo cambió por última vez', async () => {
    api.vigencia = vigenciaPrueba({
      bimestreAbierto: 4,
      abiertoHasta: '2026-09-16T04:59:59.999Z',
      actualizadoEn: '2026-07-01T15:00:00.000Z',
      actualizadoPor: 'Planeación Estratégica',
    })
    const estado = await renderizar()
    expect(estado).toHaveTextContent('Bimestre 4 · julio–agosto · abierto hasta el 15 de septiembre')
    expect(estado).toHaveTextContent('por Planeación Estratégica')
    expect(screen.getByLabelText(/Bimestre 4/)).toBeChecked()
    expect(screen.getByLabelText('Fecha límite (opcional)')).toHaveValue('2026-09-15')
    expect(screen.getByLabelText('Fecha límite (opcional)')).toHaveAttribute('min', '2026-08-20')
  })

  it('abrir otro bimestre con fecha límite: confirmación y PUT /admin/vigencia con el CSRF', async () => {
    await renderizar()
    fireEvent.click(screen.getByLabelText(/Bimestre 5/))
    fireEvent.change(screen.getByLabelText('Fecha límite (opcional)'), { target: { value: '2026-10-31' } })
    fireEvent.click(boton('Guardar cambios'))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Abrir el bimestre?' })
    expect(confirmacion).toHaveTextContent(
      'Se cerrará el bimestre 4 y se abrirá el Bimestre 5 (septiembre–octubre) hasta el 31 de octubre',
    )
    expect(boton('Cancelar', confirmacion)).toHaveFocus()
    expect(api.mutaciones()).toHaveLength(0)
    await act(async () => fireEvent.click(boton('Sí, abrir', confirmacion)))
    const aviso = await screen.findByText(/Listo: Bimestre 5 · septiembre–octubre · abierto hasta el 31 de octubre/)
    expect(aviso).toHaveFocus()
    const peticion = api.ultima('PUT', '/admin/vigencia')!
    expect(peticion.ruta).toBe('/admin/vigencia?vigencia=2026')
    expect(peticion.cuerpo).toEqual({ bimestreAbierto: 5, abiertoHasta: '2026-11-01T04:59:59.999Z' })
    expect(peticion.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(screen.getByRole('region', { name: /Estado actual/ })).toHaveTextContent('Bimestre 5 · septiembre–octubre')
  })

  it('sin bimestre abierto exige elegir uno; una fecha pasada no se acepta', async () => {
    api.vigencia = vigenciaPrueba({ bimestreAbierto: null })
    const estado = await renderizar()
    expect(estado).toHaveTextContent('No hay bimestre abierto')
    expect(within(estado).queryByRole('button', { name: 'Cerrar el bimestre' })).not.toBeInTheDocument()
    fireEvent.click(boton('Abrir el bimestre'))
    expect(await screen.findByText('Elija el bimestre que va a abrir.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Bimestre 1/)).toHaveFocus()

    fireEvent.click(screen.getByLabelText(/Bimestre 4/))
    fireEvent.change(screen.getByLabelText('Fecha límite (opcional)'), { target: { value: '2026-08-19' } })
    fireEvent.click(boton('Abrir el bimestre'))
    expect(await screen.findByText('La fecha límite debe ser hoy o una fecha futura.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha límite (opcional)')).toHaveFocus()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // Sin fecha límite.
    fireEvent.change(screen.getByLabelText('Fecha límite (opcional)'), { target: { value: '' } })
    fireEvent.click(boton('Abrir el bimestre'))
    const confirmacion = screen.getByRole('alertdialog')
    expect(confirmacion).toHaveTextContent('Se abrirá el Bimestre 4 (julio–agosto) sin fecha límite')
    await act(async () => fireEvent.click(boton('Sí, abrir', confirmacion)))
    await waitFor(() => expect(api.ultima('PUT', '/admin/vigencia')?.cuerpo).toEqual({ bimestreAbierto: 4, abiertoHasta: null }))
  })

  it('cerrar el bimestre con confirmación', async () => {
    await renderizar()
    fireEvent.click(boton('Cerrar el bimestre'))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Cerrar el bimestre?' })
    expect(confirmacion).toHaveTextContent('Se cerrará el bimestre 4')
    await act(async () => fireEvent.click(boton('Sí, cerrar', confirmacion)))
    expect(await screen.findByText(/Se cerró el bimestre/)).toBeInTheDocument()
    expect(api.ultima('PUT', '/admin/vigencia')?.cuerpo).toEqual({ bimestreAbierto: null, abiertoHasta: null })
    expect(screen.getByRole('region', { name: /Estado actual/ })).toHaveTextContent('No hay bimestre abierto')
  })

  it('cancelar la confirmación no cambia nada', async () => {
    await renderizar()
    fireEvent.click(boton('Cerrar el bimestre'))
    fireEvent.click(boton('Cancelar', screen.getByRole('alertdialog')))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('error del servidor al guardar: se muestra el mensaje', async () => {
    api.forzar('PUT', '/admin/vigencia', errorSimulado(400, 'solicitud_invalida', 'La fecha límite debe ser futura.'))
    await renderizar()
    fireEvent.click(boton('Cerrar el bimestre'))
    await act(async () => fireEvent.click(boton('Sí, cerrar', screen.getByRole('alertdialog'))))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha límite debe ser futura.')
  })

  it('con el sitio completo, la barra muestra el bimestre nuevo después de abrirlo', async () => {
    render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/pai/admin/bimestre'] })} />)
    expect(await screen.findByText('Bimestre 4 · julio–agosto · abierto', { selector: '.pai-barra-bimestre' })).toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText(/Bimestre 6/))
    fireEvent.change(screen.getByLabelText('Fecha límite (opcional)'), { target: { value: '2026-12-15' } })
    fireEvent.click(boton('Guardar cambios'))
    await act(async () => fireEvent.click(boton('Sí, abrir', screen.getByRole('alertdialog'))))
    expect(
      await screen.findByText('Bimestre 6 · noviembre–diciembre · abierto hasta el 15 de diciembre', {
        selector: '.pai-barra-bimestre',
      }),
    ).toBeInTheDocument()
  })
})
