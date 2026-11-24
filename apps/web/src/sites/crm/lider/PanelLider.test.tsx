import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResumenLiderCrm, SesionLiderCrm } from '../api-crm'
import { crearApiLider, type ApiLider, type FiltroTareasLider } from '../datos/clienteCrm'
import { PERSONAS_MUESTRA, tareasMuestra } from '../ui/muestras'
import { ContextoLiderCrm, type ContextoLider } from './contexto'
import PanelLider from './PanelLider'

// El cliente real, salvo la sesión del líder y sus llamadas (crearApiLider).
vi.mock('../datos/clienteCrm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../datos/clienteCrm')>()
  return {
    ...real,
    apiSesionLider: { obtener: vi.fn<typeof real.apiSesionLider.obtener>(), iniciar: vi.fn<typeof real.apiSesionLider.iniciar>() },
    crearApiLider: vi.fn<typeof real.crearApiLider>(),
  }
})

const SESION: SesionLiderCrm = { nombre: 'José David Ramírez Abraham', csrf: 'c'.repeat(43), expira: '2026-11-25T05:00:00.000Z' }
const TAREAS = tareasMuestra()
const RESUMEN: ResumenLiderCrm = {
  personas: PERSONAS_MUESTRA,
  totales: { pendientes: 3, enProceso: 2, terminadasRecientes: 2, vencidas: 1 },
  correo: { configurado: true, pendientes: 0, errores: 2 },
}
/** Tarea de Carlos: sale del tablero al filtrar por Ana. */
const DE_CARLOS = 'Actualizar la matriz de riesgos de la oficina'

function Detalle() {
  const { id } = useParams()
  return <p>Detalle de la tarea {id}</p>
}

function montar() {
  const api = {
    resumen: vi.fn<ApiLider['resumen']>(async () => RESUMEN),
    tareas: vi.fn<ApiLider['tareas']>(async (filtro: FiltroTareasLider = {}) =>
      TAREAS.filter((t) => filtro.responsable === undefined || t.responsable.id === filtro.responsable),
    ),
  }
  vi.mocked(crearApiLider).mockReturnValue(api as unknown as ApiLider)
  const vencida = vi.fn<() => void>()
  const contexto: ContextoLider = {
    sesion: SESION,
    api: crearApiLider(SESION.csrf),
    vencida,
    salir: vi.fn<() => Promise<void>>(async () => undefined),
    avisarCambioCorreos: vi.fn<() => void>(),
  }
  render(
    <MemoryRouter initialEntries={['/crm/lider']}>
      <div className="crm">
        <ContextoLiderCrm value={contexto}>
          <Routes>
            <Route path="/crm/lider" element={<PanelLider />} />
            <Route path="/crm/lider/tareas/:id" element={<Detalle />} />
          </Routes>
        </ContextoLiderCrm>
      </div>
    </MemoryRouter>,
  )
  return { api, vencida }
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('PanelLider', () => {
  it('pinta las tareas del equipo en sus columnas, avisa de los correos que no salieron y abre la tarea', async () => {
    const { api, vencida } = montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Panel del equipo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nueva tarea' })).toHaveAttribute('href', '/crm/lider/tareas/nueva')

    const pendientes = await screen.findByRole('region', { name: 'Pendiente: 3 tareas' })
    expect(within(pendientes).getByText(DE_CARLOS)).toBeInTheDocument()
    expect(within(pendientes).getByText('Revisar la ficha técnica de la convocatoria del fondo de becas 2027')).toBeInTheDocument()
    const enProceso = screen.getByRole('region', { name: 'En proceso: 2 tareas' })
    expect(within(enProceso).getByText('Cruzar la base de beneficiarios con los reportes de deserción')).toBeInTheDocument()
    const terminadas = screen.getByRole('region', { name: 'Terminada: 2 tareas' })
    expect(within(terminadas).getByText('Enviar el seguimiento de metas de octubre')).toBeInTheDocument()
    // De solo lectura y con el responsable en cada tarjeta.
    expect(screen.queryByRole('button', { name: /^Mover/ })).not.toBeInTheDocument()
    expect(within(enProceso).getByText('Daniela Cardona Zapata')).toBeInTheDocument()
    expect(api.tareas).toHaveBeenCalledWith({ responsable: undefined, q: undefined, terminadas: 'recientes' }, expect.any(AbortSignal))

    expect(await screen.findByText('2 correos no salieron.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar en Correos' })).toHaveAttribute('href', '/crm/lider/correos')
    expect(screen.getByText('En todo el equipo: 3 pendientes, 2 en proceso, 1 vencida y 2 terminadas en los últimos 30 días.')).toBeInTheDocument()

    fireEvent.click(within(pendientes).getByRole('button', { name: DE_CARLOS }))
    expect(await screen.findByText('Detalle de la tarea 103')).toBeInTheDocument()
    expect(vencida).not.toHaveBeenCalled()
  })

  it('el filtro por persona vuelve a pedir las tareas con su responsable; otro clic lo quita', async () => {
    const { api } = montar()
    const ana = await screen.findByRole('button', { name: 'Ana María Restrepo Gil' })
    expect(ana).toHaveAttribute('aria-pressed', 'false')
    expect(ana).toHaveAccessibleDescription('3 pendientes, 2 en proceso y 1 vencida.')
    expect(await screen.findByText(DE_CARLOS)).toBeInTheDocument()

    fireEvent.click(ana)
    expect(ana).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(api.tareas.mock.lastCall?.[0]).toMatchObject({ responsable: 2 }))
    await waitFor(() => expect(screen.queryByText(DE_CARLOS)).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2, name: 'Tareas de Ana María Restrepo Gil' })).toBeInTheDocument()

    fireEvent.click(ana)
    expect(ana).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(api.tareas.mock.lastCall?.[0]?.responsable).toBeUndefined())
    expect(await screen.findByText(DE_CARLOS)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Tareas del equipo' })).toBeInTheDocument()
  })

  it('la búsqueda espera a que se deje de escribir y «Todas» pide también las terminadas viejas', async () => {
    const { api } = montar()
    expect(await screen.findByText(DE_CARLOS)).toBeInTheDocument()
    const antes = api.tareas.mock.calls.length

    const buscar = screen.getByRole('searchbox', { name: 'Buscar' })
    fireEvent.change(buscar, { target: { value: 'mat' } })
    fireEvent.change(buscar, { target: { value: 'matriz' } })
    expect(api.tareas.mock.calls).toHaveLength(antes)
    await waitFor(() => expect(api.tareas.mock.lastCall?.[0]).toMatchObject({ q: 'matriz', terminadas: 'recientes' }))
    expect(api.tareas.mock.calls).toHaveLength(antes + 1)

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(api.tareas.mock.lastCall?.[0]).toMatchObject({ q: 'matriz', terminadas: 'todas' }))
  })
})
