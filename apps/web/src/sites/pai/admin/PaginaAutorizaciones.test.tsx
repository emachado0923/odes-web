import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../api-pai'
import { CSRF_PRUEBA } from '../pruebas/datosPrueba'
import { alcancesDeUsuario, dividirAutorizaciones, ordenarAutorizaciones } from './autorizaciones'
import PaginaAutorizaciones from './PaginaAutorizaciones'
import { ApiSimuladaPai, errorSimulado } from './pruebas/apiSimulada'
import { autorizacionPrueba, tableroPrueba, usuarioPrueba } from './pruebas/datos'
import { boton, renderizarPagina } from './pruebas/renderizar'

let api: ApiSimuladaPai

beforeEach(() => {
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
  renderizarPagina(<PaginaAutorizaciones />, { ruta: '/pai/admin/autorizaciones' })
  await screen.findByLabelText('Responsable')
  return screen.findByRole('region', { name: /Vigentes/ })
}

function opciones(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((o) => o.textContent ?? '')
}

describe('autorizaciones (/pai/admin/autorizaciones)', () => {
  it('lista las vigentes y, aparte, las vencidas o revocadas', async () => {
    const vigentes = await renderizar()
    expect(vigentes).toHaveAccessibleName('Vigentes (1)')
    expect(within(vigentes).getByText('SAF-TH · Gestión del Talento Humano')).toBeInTheDocument()
    expect(within(vigentes).getByText('Vigente')).toBeInTheDocument()
    const otras = screen.getByRole('region', { name: 'Vencidas y revocadas (1)' })
    expect(within(otras).getByText('Revocada')).toBeInTheDocument()
    // Otorgada y revocada por Planeación.
    expect(within(otras).getAllByText(/por Planeación Estratégica/, { selector: '.pai-detalle-usuario' })).toHaveLength(2)
    expect(within(otras).queryByRole('button', { name: /Revocar/ })).not.toBeInTheDocument()
  })

  it('solo ofrece responsables activos y los procesos e indicadores que tienen asignados', async () => {
    api.usuarios = [...api.usuarios, usuarioPrueba(4, { nombre: 'Inactiva', usuario: 'inactiva', activo: false })]
    await renderizar()
    const responsable = screen.getByLabelText('Responsable')
    expect(opciones(responsable)).toEqual(['Elija…', 'Responsable SAF (responsable.saf)', 'Carlos Ruiz (carlos.ruiz)'])
    const proceso = screen.getByLabelText('Proceso o proyecto')
    expect(proceso).toBeDisabled()

    fireEvent.change(responsable, { target: { value: '2' } })
    expect(opciones(proceso)).toEqual(['Elija…', 'SAF-TH · Gestión del Talento Humano'])
    fireEvent.change(proceso, { target: { value: '11' } })
    expect(opciones(screen.getByLabelText('Alcance'))).toEqual([
      'Todo el proceso',
      'Solo SAF-TH-01 · Capacitaciones realizadas',
      'Solo SAF-TH-02 · Evaluaciones de desempeño',
    ])

    // Carlos solo tiene DTF-GF-01 suelto.
    fireEvent.change(responsable, { target: { value: '3' } })
    expect(proceso).toHaveValue('')
    fireEvent.change(proceso, { target: { value: '21' } })
    expect(opciones(screen.getByLabelText('Alcance'))).toEqual([
      'Todos sus indicadores de este proceso',
      'Solo DTF-GF-01 · Convocatorias abiertas',
    ])
  })

  it('valida antes de enviar', async () => {
    await renderizar()
    fireEvent.click(boton('Otorgar autorización'))
    expect(await screen.findByText('Elija el responsable.')).toBeInTheDocument()
    expect(screen.getByText('Elija el bimestre.')).toBeInTheDocument()
    expect(screen.getByText('Elija hasta qué día vale la autorización.')).toBeInTheDocument()
    expect(screen.getByText('Escriba el motivo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Responsable')).toHaveFocus()

    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Vigente hasta'), { target: { value: '2026-08-01' } })
    fireEvent.click(boton('Otorgar autorización'))
    expect(await screen.findByText('Elija el proceso.')).toBeInTheDocument()
    expect(screen.getByText('La fecha debe ser hoy o una fecha futura.')).toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('otorga una autorización para un indicador (POST con el CSRF) y la agrega a las vigentes', async () => {
    const vigentes = await renderizar()
    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Bimestre que podrá reportar'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Proceso o proyecto'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Alcance'), { target: { value: '1002' } })
    fireEvent.change(screen.getByLabelText('Vigente hasta'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '  Corregir el avance de marzo ' } })
    await act(async () => fireEvent.click(boton('Otorgar autorización')))
    expect(await screen.findByText(/Se autorizó a Responsable SAF para reportar el bimestre 2/)).toBeInTheDocument()
    const peticion = api.ultima('POST', '/admin/autorizaciones')!
    expect(peticion.cuerpo).toEqual({
      usuarioId: 2,
      bimestre: 2,
      procesoId: null,
      indicadorId: 1002,
      vigenteHasta: '2026-10-01T04:59:59.999Z',
      motivo: 'Corregir el avance de marzo',
    })
    expect(peticion.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(vigentes).toHaveAccessibleName('Vigentes (2)')
    expect(within(vigentes).getByText('SAF-TH-02 · Evaluaciones de desempeño')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo')).toHaveValue('')
  })

  it('con todo el proceso envía procesoId', async () => {
    await renderizar()
    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Bimestre que podrá reportar'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Proceso o proyecto'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Vigente hasta'), { target: { value: '2026-08-20' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Rezago' } })
    await act(async () => fireEvent.click(boton('Otorgar autorización')))
    await waitFor(() =>
      expect(api.ultima('POST', '/admin/autorizaciones')?.cuerpo).toMatchObject({
        procesoId: 11,
        indicadorId: null,
        vigenteHasta: '2026-08-21T04:59:59.999Z',
      }),
    )
  })

  it('errores del servidor por campo', async () => {
    api.forzar(
      'POST',
      '/admin/autorizaciones',
      errorSimulado(400, 'solicitud_invalida', 'Revise los datos.', { vigenteHasta: 'Debe ser futura.' }),
    )
    await renderizar()
    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Bimestre que podrá reportar'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Proceso o proyecto'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Vigente hasta'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'x' } })
    await act(async () => fireEvent.click(boton('Otorgar autorización')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revise los datos.')
    expect(screen.getByText('Debe ser futura.')).toBeInTheDocument()
    expect(screen.getByLabelText('Vigente hasta')).toHaveFocus()
  })

  it('revocar pide confirmación y la pasa a "Vencidas y revocadas"', async () => {
    const vigentes = await renderizar()
    fireEvent.click(boton('Revocar la autorización de Responsable SAF', vigentes))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Revocar la autorización?' })
    expect(confirmacion).toHaveTextContent('Responsable SAF ya no podrá reportar el bimestre 2')
    expect(boton('Cancelar', confirmacion)).toHaveFocus()
    await act(async () => fireEvent.click(boton('Revocar', confirmacion)))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.ultima('DELETE', '/admin/autorizaciones/1')?.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(vigentes).toHaveAccessibleName('Vigentes (0)')
    expect(within(vigentes).getByText('No hay autorizaciones vigentes.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vencidas y revocadas (2)' })).toBeInTheDocument()
    // El botón de la fila desapareció: el foco va al aviso.
    expect(screen.getByText(/Se revocó la autorización de Responsable SAF/)).toHaveFocus()
  })

  it('si revocar falla, el foco va al aviso del error (los botones estaban deshabilitados)', async () => {
    api.forzar('DELETE', '/admin/autorizaciones/1', errorSimulado(500, 'interno', 'No se pudo revocar.'))
    const vigentes = await renderizar()
    fireEvent.click(boton('Revocar la autorización de Responsable SAF', vigentes))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Revocar la autorización?' })
    await act(async () => fireEvent.click(boton('Revocar', confirmacion)))
    const error = await within(confirmacion).findByRole('alert')
    expect(error).toHaveTextContent('No se pudo revocar.')
    await waitFor(() => expect(error).toHaveFocus())
  })

  it('sin responsables activos lo explica', async () => {
    api.usuarios = api.usuarios.filter((u) => u.rol === 'administrador')
    renderizarPagina(<PaginaAutorizaciones />, { ruta: '/pai/admin/autorizaciones' })
    expect(await screen.findByText(/No hay responsables activos/)).toBeInTheDocument()
  })
})

describe('lógica de autorizaciones', () => {
  it('alcancesDeUsuario: procesos completos y procesos con indicadores sueltos', () => {
    const tablero = tableroPrueba()
    const alcances = alcancesDeUsuario({ asignaciones: { procesos: [12], indicadores: [1005] } }, tablero)
    expect(alcances.map((a) => [a.proceso.codigo, a.completo, a.indicadores.map((i) => i.codigo)])).toEqual([
      ['SAF-AC', true, ['SAF-AC-01']],
      ['DTF-GF', false, ['DTF-GF-02']],
    ])
    expect(alcancesDeUsuario({ asignaciones: { procesos: [], indicadores: [] } }, tablero)).toEqual([])
  })

  it('ordenarAutorizaciones: vigentes primero (la que vence antes), luego las demás de la más reciente', () => {
    const lista = [
      autorizacionPrueba(1, { estado: 'vencida', otorgadaEn: '2026-01-01T00:00:00.000Z' }),
      autorizacionPrueba(2, { vigenteHasta: '2026-12-31T00:00:00.000Z' }),
      autorizacionPrueba(3, { estado: 'revocada', otorgadaEn: '2026-05-01T00:00:00.000Z' }),
      autorizacionPrueba(4, { vigenteHasta: '2026-09-30T00:00:00.000Z' }),
    ]
    expect(ordenarAutorizaciones(lista).map((a) => a.id)).toEqual([4, 2, 3, 1])
    const { vigentes, otras } = dividirAutorizaciones(lista)
    expect(vigentes.map((a) => a.id)).toEqual([4, 2])
    expect(otras.map((a) => a.id)).toEqual([3, 1])
  })
})
