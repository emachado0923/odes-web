import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoTareaCrm, PersonaCrm, TareaCrm, TareaDetalleCrm } from '../api-crm'
import { apiEquipo, ErrorCrmHttp } from '../datos/clienteCrm'
import { ProveedorAvisos } from '../ui'
import { PERSONAS_MUESTRA, tareaMuestra } from '../ui/muestras'
import TableroPersona from './TableroPersona'

// Solo se simulan las llamadas a la API; los errores y mensajeDe son los de verdad.
vi.mock('../datos/clienteCrm', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../datos/clienteCrm')>()
  type Api = typeof original.apiEquipo
  const apiEquipo: Api = {
    personas: vi.fn<Api['personas']>(),
    tablero: vi.fn<Api['tablero']>(),
    tarea: vi.fn<Api['tarea']>(),
    cambiarEstado: vi.fn<Api['cambiarEstado']>(),
    subirEntregable: vi.fn<Api['subirEntregable']>(),
    quitarEntregable: vi.fn<Api['quitarEntregable']>(),
    terminar: vi.fn<Api['terminar']>(),
  }
  return { ...original, apiEquipo }
})

const LIDER: PersonaCrm = { ...PERSONAS_MUESTRA[0], nombre: 'José David Ramírez Abraham', iniciales: 'JR' }
const ANA = PERSONAS_MUESTRA[1]
const INFORME = tareaMuestra({ id: 101, titulo: 'Consolidar el informe trimestral', requiereEntregable: true, adjuntos: 1 })
const COMITE = tareaMuestra({ id: 104, titulo: 'Preparar la presentación para el comité', estado: 'en_proceso' })

function detalleDe(tarea: TareaCrm, cambios: Partial<TareaDetalleCrm> = {}): TareaDetalleCrm {
  return { ...tarea, descripcion: '', notaCierre: null, archivos: [], eventos: [], avisada: true, ...cambios }
}

function montar(ruta = '/crm/equipo/2') {
  return render(
    <ProveedorAvisos>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/crm" element={<p>Inicio de prueba</p>} />
          <Route path="/crm/equipo/:personaId" element={<TableroPersona />} />
        </Routes>
      </MemoryRouter>
    </ProveedorAvisos>,
  )
}

/** La columna de un estado en el tablero. */
function columna(estado: 'pendiente' | 'en_proceso' | 'terminada'): HTMLElement {
  const nodo = document.querySelector<HTMLElement>(`.crm-columna[data-estado="${estado}"]`)
  if (!nodo) throw new Error(`No se encontró la columna ${estado}`)
  return nodo
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiEquipo.personas).mockResolvedValue([LIDER, ANA])
  vi.mocked(apiEquipo.tablero).mockResolvedValue({ persona: ANA, tareas: [INFORME, COMITE] })
  vi.mocked(apiEquipo.tarea).mockImplementation(async (_persona, id) => detalleDe(id === COMITE.id ? COMITE : INFORME))
})

describe('Tablero de una persona (/crm/equipo/:personaId)', () => {
  it('saluda a la persona y resume en una frase lo que tiene abierto', async () => {
    montar()
    expect(await screen.findByRole('heading', { level: 1, name: /Ana María Restrepo Gil$/ })).toBeInTheDocument()
    expect(document.querySelector('.crm-eq-resumen')).toHaveTextContent('Tiene 1 pendiente y 1 en proceso.')
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/crm')
    expect(apiEquipo.tablero).toHaveBeenCalledWith(2, false, expect.anything())
  })

  it('mover a «En proceso» llama a cambiarEstado y la tarjeta cambia de columna sin esperar al servidor', async () => {
    let responder: (detalle: TareaDetalleCrm) => void = () => {}
    vi.mocked(apiEquipo.cambiarEstado).mockImplementation(
      () =>
        new Promise<TareaDetalleCrm>((resolver) => {
          responder = resolver
        }),
    )
    montar()
    fireEvent.click(await screen.findByRole('button', { name: `Mover «${INFORME.titulo}» a En proceso` }))
    expect(apiEquipo.cambiarEstado).toHaveBeenCalledWith(2, INFORME.id, 'en_proceso')
    expect(within(columna('en_proceso')).getByRole('button', { name: INFORME.titulo })).toBeInTheDocument()
    expect(within(columna('en_proceso')).getByText('Guardando…')).toBeInTheDocument()

    responder(detalleDe({ ...INFORME, estado: 'en_proceso' }))
    expect(await screen.findByText(`«${INFORME.titulo}» pasó a En proceso.`)).toBeInTheDocument()
    expect(within(columna('en_proceso')).queryByText('Guardando…')).not.toBeInTheDocument()
  })

  it('si no se puede mover, la tarjeta vuelve a su columna y se avisa el error', async () => {
    vi.mocked(apiEquipo.cambiarEstado).mockRejectedValue(new ErrorCrmHttp('red', 'No hay conexión con el servidor.'))
    montar()
    fireEvent.click(await screen.findByRole('button', { name: `Mover «${INFORME.titulo}» a En proceso` }))
    expect(await screen.findByText(`No se pudo mover «${INFORME.titulo}». No hay conexión con el servidor.`)).toBeInTheDocument()
    expect(within(columna('pendiente')).getByRole('button', { name: INFORME.titulo })).toBeInTheDocument()
  })

  it('pedir «Terminar» abre el diálogo de terminar sin mover la tarea', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: `Mover «${INFORME.titulo}» a Terminada` }))
    const dialogo = await screen.findByRole('dialog', { name: `Terminar «${INFORME.titulo}»` })
    expect(apiEquipo.cambiarEstado).not.toHaveBeenCalled()
    expect(await within(dialogo).findByText('José pidió un documento al terminar: súbalo aquí. Le llegará adjunto en el correo.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Terminar y avisar a José' })).toBeDisabled()
    expect(within(columna('pendiente')).getByRole('button', { name: INFORME.titulo })).toBeInTheDocument()
  })

  it('con ?tarea=<id> (el enlace del correo) abre el detalle, y su «Terminar» abre el diálogo', async () => {
    const creada: EventoTareaCrm = {
      id: 1,
      tipo: 'creada',
      actor: 'lider',
      personaNombre: LIDER.nombre,
      deEstado: null,
      aEstado: 'pendiente',
      detalle: null,
      creadoEn: '2026-11-20T15:00:00.000Z',
    }
    vi.mocked(apiEquipo.tarea).mockResolvedValue(detalleDe(INFORME, { descripcion: 'Primera línea.\nSegunda línea.', eventos: [creada] }))
    montar(`/crm/equipo/2?tarea=${INFORME.id}`)

    const panel = await screen.findByRole('dialog', { name: INFORME.titulo })
    expect(await within(panel).findByText('José creó la tarea')).toBeInTheDocument()
    expect(within(panel).getByText('Pide entregable')).toBeInTheDocument()
    expect(within(panel).getByText(/Primera línea\./)).toHaveClass('crm-eq-texto-libre')
    expect(within(panel).getByRole('button', { name: 'Empezar' })).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Terminar' }))
    expect(await screen.findByRole('dialog', { name: `Terminar «${INFORME.titulo}»` })).toBeInTheDocument()
  })

  it('«Ver todas las terminadas» pide también las viejas y deja volver a las recientes', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver todas las terminadas' }))
    await waitFor(() => expect(apiEquipo.tablero).toHaveBeenLastCalledWith(2, true, expect.anything()))
    expect(await screen.findByRole('button', { name: 'Ver solo las recientes' })).toBeInTheDocument()
  })

  it('si la persona no existe o está inactiva (404), lo dice y lleva al inicio', async () => {
    vi.mocked(apiEquipo.tablero).mockRejectedValue(new ErrorCrmHttp('no_encontrado', 'No se encontró la persona.', { estado: 404 }))
    montar('/crm/equipo/99')
    expect(await screen.findByText('Esta persona no está en el equipo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/crm')
  })
})
