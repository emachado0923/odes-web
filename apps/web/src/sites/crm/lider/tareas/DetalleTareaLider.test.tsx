import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { CorreoCrm, EventoTareaCrm, TareaDetalleCrm } from '../../api-crm'
import { ErrorCrmHttp, type ApiLider } from '../../datos/clienteCrm'
import ProveedorAvisos from '../../ui/ProveedorAvisos'
import { ContextoLiderCrm, type ContextoLider } from '../contexto'
import DetalleTareaLider from './DetalleTareaLider'
import { estadoNoSubidos } from './comun'

const ANA = { id: 2, nombre: 'Ana María Restrepo Gil', iniciales: 'AR', foto: null }

function tarea(cambios: Partial<TareaDetalleCrm> = {}): TareaDetalleCrm {
  return {
    id: 7,
    titulo: 'Consolidar el informe trimestral',
    estado: 'pendiente',
    responsable: ANA,
    fechaLimite: null,
    vencida: false,
    requiereEntregable: false,
    adjuntos: 0,
    entregables: 0,
    creadaEn: '2026-11-20T15:00:00.000Z',
    actualizadaEn: '2026-11-20T15:00:00.000Z',
    terminadaEn: null,
    descripcion: 'Revisar los indicadores.\nEnviar el consolidado.',
    notaCierre: null,
    archivos: [],
    eventos: [],
    avisada: true,
    correos: [],
    ...cambios,
  }
}

function evento(id: number, cambios: Partial<EventoTareaCrm>): EventoTareaCrm {
  return {
    id,
    tipo: 'creada',
    actor: 'lider',
    personaNombre: null,
    deEstado: null,
    aEstado: null,
    detalle: null,
    creadoEn: '2026-11-20T15:00:00.000Z',
    ...cambios,
  }
}

function correo(cambios: Partial<CorreoCrm> = {}): CorreoCrm {
  return {
    id: 31,
    tareaId: 7,
    tareaTitulo: 'Consolidar el informe trimestral',
    tipo: 'tarea_asignada',
    para: 'ana.restrepo@ejemplo.org',
    asunto: 'Nueva tarea',
    estado: 'error',
    intentos: 2,
    error: 'El buzón no existe.',
    adjuntos: 1,
    creadoEn: '2026-11-20T15:05:00.000Z',
    enviadoEn: null,
    ...cambios,
  }
}

function montar(api: Partial<ApiLider>, entrada: string | { pathname: string; state: unknown } = '/crm/lider/tareas/7') {
  const contexto: ContextoLider = {
    sesion: { nombre: 'Martha', csrf: 'csrf-de-prueba', expira: '2026-11-25T05:00:00.000Z' },
    api: api as ApiLider,
    vencida: vi.fn<ContextoLider['vencida']>(),
    salir: vi.fn<ContextoLider['salir']>(async () => {}),
    avisarCambioCorreos: vi.fn<ContextoLider['avisarCambioCorreos']>(),
  }
  const vista = render(
    <ProveedorAvisos>
      <ContextoLiderCrm value={contexto}>
        <MemoryRouter initialEntries={[entrada]}>
          <Routes>
            <Route path="/crm/lider" element={<p>Panel del líder</p>} />
            <Route path="/crm/lider/tareas/:id" element={<DetalleTareaLider />} />
            <Route path="/crm/lider/tareas/:id/editar" element={<p>Editar la tarea</p>} />
          </Routes>
        </MemoryRouter>
      </ContextoLiderCrm>
    </ProveedorAvisos>,
  )
  return { ...vista, contexto }
}

describe('DetalleTareaLider', () => {
  it('muestra los datos, el historial y los correos; «Avisar de nuevo» avisa y recarga', async () => {
    const api = {
      tarea: vi.fn<ApiLider['tarea']>(async () =>
        tarea({
          fechaLimite: '2026-11-10',
          vencida: true,
          eventos: [
            evento(4, { tipo: 'aviso' }),
            evento(3, { tipo: 'estado', actor: 'responsable', personaNombre: ANA.nombre, aEstado: 'en_proceso' }),
            evento(2, { tipo: 'adjunto', personaNombre: 'Martha Lucía Giraldo Arango', detalle: 'informe.pdf' }),
            evento(1, { tipo: 'creada', personaNombre: 'Martha Lucía Giraldo Arango' }),
          ],
          correos: [correo()],
        }),
      ),
      avisar: vi.fn<ApiLider['avisar']>(async () => ({ correoId: 32, estado: 'enviado', mensaje: 'Se le avisó a Ana por correo.' })),
    }
    const { contexto } = montar(api)

    expect(await screen.findByRole('heading', { level: 1, name: 'Consolidar el informe trimestral' })).toBeInTheDocument()
    expect(screen.getByText('Vencida')).toBeInTheDocument()
    expect(screen.getByText('Aviso enviado')).toBeInTheDocument()
    expect(screen.getByText('Ana la pasó a En proceso')).toBeInTheDocument()
    expect(screen.getByText('Martha subió «informe.pdf»')).toBeInTheDocument()
    expect(screen.getByText('Martha creó la tarea')).toBeInTheDocument()
    expect(screen.getByText('Se le avisó por correo')).toBeInTheDocument()
    expect(screen.getByText('Falló')).toBeInTheDocument()
    expect(screen.getByText('El buzón no existe.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/crm/lider/tareas/7/editar')

    fireEvent.click(screen.getByRole('button', { name: 'Avisar de nuevo' }))
    expect(await screen.findByText('Se le avisó a Ana por correo.')).toBeInTheDocument()
    expect(api.avisar).toHaveBeenCalledWith(7)
    await waitFor(() => expect(api.tarea).toHaveBeenCalledTimes(2))
    expect(contexto.avisarCambioCorreos).toHaveBeenCalled()
  })

  it('«Reintentar» reemplaza la fila del correo y avisa', async () => {
    const api = {
      tarea: vi.fn<ApiLider['tarea']>(async () => tarea({ correos: [correo()] })),
      reintentarCorreo: vi.fn<ApiLider['reintentarCorreo']>(async () =>
        correo({ estado: 'enviado', error: null, intentos: 3, enviadoEn: '2026-11-24T16:00:00.000Z' }),
      ),
    }
    const { contexto } = montar(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar el correo «Tarea asignada» para ana.restrepo@ejemplo.org' }))

    expect(await screen.findByText('Se envió el correo a ana.restrepo@ejemplo.org.')).toBeInTheDocument()
    expect(api.reintentarCorreo).toHaveBeenCalledWith(31)
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(screen.getByText('3 intentos')).toBeInTheDocument()
    expect(screen.queryByText('El buzón no existe.')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Reintentar/ })).toBeNull()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalled()
  })

  it('«Devolver» exige la observación; con ella devuelve, avisa y recarga', async () => {
    const terminada = tarea({ estado: 'terminada', terminadaEn: '2026-11-22T20:00:00.000Z', notaCierre: 'Quedó en la carpeta compartida.' })
    const api = {
      tarea: vi.fn<ApiLider['tarea']>(async () => terminada),
      devolver: vi.fn<ApiLider['devolver']>(async () => ({
        tarea: { ...terminada, estado: 'en_proceso', terminadaEn: null },
        aviso: { correoId: 9, estado: 'enviado', mensaje: 'Se le avisó a Ana por correo.' },
      })),
    }
    const { contexto } = montar(api)
    expect(await screen.findByText('Quedó en la carpeta compartida.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Avisar/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Devolver' }))
    const dialogo = screen.getByRole('dialog', { name: 'Devolver la tarea' })
    const observacion = within(dialogo).getByLabelText(/^Observación/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Devolver tarea' }))

    expect(within(dialogo).getByText('Escriba la observación: qué debe corregir o completar.')).toBeInTheDocument()
    expect(observacion).toHaveAttribute('aria-invalid', 'true')
    expect(observacion).toHaveFocus()
    expect(api.devolver).not.toHaveBeenCalled()

    fireEvent.change(observacion, { target: { value: '  Falta el anexo de octubre.  ' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Devolver tarea' }))

    expect(await screen.findByText('Se le avisó a Ana por correo.')).toBeInTheDocument()
    expect(api.devolver).toHaveBeenCalledWith(7, 'Falta el anexo de octubre.')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(api.tarea).toHaveBeenCalledTimes(2))
    expect(contexto.avisarCambioCorreos).toHaveBeenCalled()
  })

  it('«Eliminar» pide confirmación; al confirmar elimina, vuelve al panel y avisa', async () => {
    const api = {
      tarea: vi.fn<ApiLider['tarea']>(async () => tarea()),
      eliminarTarea: vi.fn<ApiLider['eliminarTarea']>(async () => undefined),
    }
    montar(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))

    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar la tarea?' })
    expect(dialogo).toHaveTextContent('La tarea desaparecerá del tablero de Ana María Restrepo Gil.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.eliminarTarea).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar tarea' }))

    expect(await screen.findByText('Panel del líder')).toBeInTheDocument()
    expect(api.eliminarTarea).toHaveBeenCalledWith(7)
    expect(await screen.findByText('Tarea eliminada.')).toBeInTheDocument()
  })

  it('quitar un adjunto pide confirmación y lo saca de la lista', async () => {
    const conAdjunto = tarea({
      adjuntos: 1,
      archivos: [
        {
          id: 5,
          tipo: 'adjunto',
          nombre: 'Lineamientos.pdf',
          mime: 'application/pdf',
          bytes: 2048,
          subidoEn: '2026-11-20T15:01:00.000Z',
          url: '/api/crm/lider/tareas/7/archivos/5',
        },
      ],
    })
    const api = {
      // La recarga, después de quitarlo, ya no lo trae.
      tarea: vi.fn<ApiLider['tarea']>(async () => tarea()).mockResolvedValueOnce(conAdjunto),
      quitarAdjunto: vi.fn<ApiLider['quitarAdjunto']>(async () => undefined),
    }
    montar(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Lineamientos.pdf' }))
    expect(api.quitarAdjunto).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Quitar el adjunto?' })).getByRole('button', { name: 'Quitar' }))

    expect(await screen.findByText('Se quitó «Lineamientos.pdf».')).toBeInTheDocument()
    expect(api.quitarAdjunto).toHaveBeenCalledWith(7, 5)
    expect(screen.queryByRole('link', { name: 'Lineamientos.pdf' })).toBeNull()
  })

  it('dice qué adjuntos no subieron al crearla', async () => {
    montar(
      { tarea: vi.fn<ApiLider['tarea']>(async () => tarea({ avisada: false })) },
      { pathname: '/crm/lider/tareas/7', state: estadoNoSubidos(['matriz.xlsx']) },
    )
    expect(await screen.findByText(/Al crear la tarea no se subió «matriz\.xlsx»/)).toBeInTheDocument()
    expect(screen.getByText('Sin avisar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avisar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(screen.queryByText(/Al crear la tarea no se subió/)).toBeNull())
  })

  it('una tarea que no existe muestra el aviso con el enlace al panel', async () => {
    montar({
      tarea: vi.fn<ApiLider['tarea']>(async () => {
        throw new ErrorCrmHttp('no_encontrado', 'No se encontró la tarea.', { estado: 404 })
      }),
    })
    expect(await screen.findByText('No se encontró la tarea')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al panel' })).toHaveAttribute('href', '/crm/lider')
  })

  it('si la sesión venció (401), llama a vencida()', async () => {
    const { contexto } = montar({
      tarea: vi.fn<ApiLider['tarea']>(async () => {
        throw new ErrorCrmHttp('no_autenticado', 'La sesión venció.', { estado: 401 })
      }),
    })
    await waitFor(() => expect(contexto.vencida).toHaveBeenCalled())
  })
})
