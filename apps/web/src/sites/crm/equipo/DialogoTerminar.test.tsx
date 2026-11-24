import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchivoCrm, TareaCrm, TareaDetalleCrm } from '../api-crm'
import { apiEquipo, ErrorCrmHttp } from '../datos/clienteCrm'
import { ProveedorAvisos } from '../ui'
import { tareaMuestra } from '../ui/muestras'
import DialogoTerminar from './DialogoTerminar'

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

const TAREA = tareaMuestra({ id: 101, titulo: 'Consolidar el informe trimestral', requiereEntregable: true })
const INFORME_PDF: ArchivoCrm = {
  id: 7,
  tipo: 'entregable',
  nombre: 'informe.pdf',
  mime: 'application/pdf',
  bytes: 2048,
  subidoEn: '2026-11-24T15:00:00.000Z',
  url: '/api/crm/personas/2/tareas/101/archivos/7',
}

function detalleDe(tarea: TareaCrm, cambios: Partial<TareaDetalleCrm> = {}): TareaDetalleCrm {
  return { ...tarea, descripcion: '', notaCierre: null, archivos: [], eventos: [], avisada: true, ...cambios }
}

function montar(tarea: TareaCrm = TAREA) {
  const props = {
    alCerrar: vi.fn<() => void>(),
    alTerminada: vi.fn<(tarea: TareaDetalleCrm | null) => void>(),
    alCambio: vi.fn<() => void>(),
  }
  render(
    <ProveedorAvisos>
      <DialogoTerminar personaId={2} tarea={tarea} lider="José David Ramírez Abraham" {...props} />
    </ProveedorAvisos>,
  )
  return props
}

/** Elige archivos en el selector de la zona (como si se escogieran en el sistema). */
function elegir(...archivos: File[]) {
  const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!entrada) throw new Error('No se encontró el selector de archivos')
  fireEvent.change(entrada, { target: { files: archivos } })
}

function botonTerminar(): HTMLElement {
  return screen.getByRole('button', { name: 'Terminar y avisar a José' })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiEquipo.tarea).mockResolvedValue(detalleDe(TAREA))
})

describe('DialogoTerminar', () => {
  it('con entregable obligatorio, el botón espera a que haya un entregable; al terminar muestra el aviso del servidor', async () => {
    vi.mocked(apiEquipo.subirEntregable).mockResolvedValue(INFORME_PDF)
    const terminada = detalleDe({ ...TAREA, estado: 'terminada', entregables: 1, terminadaEn: '2026-11-24T16:00:00.000Z' })
    vi.mocked(apiEquipo.terminar).mockResolvedValue({
      tarea: terminada,
      aviso: { correoId: 9, estado: 'enviado', mensaje: 'Se le avisó a José por correo.' },
    })
    const { alTerminada, alCambio } = montar()

    expect(screen.getByRole('dialog', { name: `Terminar «${TAREA.titulo}»` })).toBeInTheDocument()
    expect(screen.getByText('José pidió un documento al terminar: súbalo aquí. Le llegará adjunto en el correo.')).toBeInTheDocument()
    expect(botonTerminar()).toBeDisabled()
    await waitFor(() => expect(apiEquipo.tarea).toHaveBeenCalledWith(2, TAREA.id, expect.anything()))
    expect(botonTerminar()).toBeDisabled()

    const archivo = new File(['%PDF-1.7 informe'], 'informe.pdf', { type: 'application/pdf' })
    elegir(archivo)
    expect(apiEquipo.subirEntregable).toHaveBeenCalledWith(2, TAREA.id, archivo, expect.objectContaining({ alProgreso: expect.any(Function) }))
    await waitFor(() => expect(botonTerminar()).toBeEnabled())
    expect(screen.getByRole('link', { name: 'informe.pdf' })).toHaveAttribute('href', INFORME_PDF.url)
    expect(alCambio).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Nota para José'), { target: { value: 'Quedó en la carpeta compartida.' } })
    expect(screen.getByText('31 de 2.000 caracteres')).toBeInTheDocument()
    fireEvent.click(botonTerminar())
    expect(await screen.findByText('Se le avisó a José por correo.')).toBeInTheDocument()
    expect(apiEquipo.terminar).toHaveBeenCalledWith(2, TAREA.id, 'Quedó en la carpeta compartida.')
    expect(alTerminada).toHaveBeenCalledWith(terminada)
  })

  it('no sube lo que no se puede subir y, si la tarea no pide entregable, deja terminar sin archivos', async () => {
    const opcional = { ...TAREA, requiereEntregable: false }
    vi.mocked(apiEquipo.tarea).mockResolvedValue(detalleDe(opcional))
    montar(opcional)
    expect(screen.getByText('Subir un documento es opcional. Si sube alguno, le llegará a José adjunto en el correo.')).toBeInTheDocument()

    elegir(new File(['PK'], 'acta.zip', { type: 'application/zip' }))
    expect(await screen.findByText(/«acta\.zip» no se puede subir/)).toBeInTheDocument()
    expect(apiEquipo.subirEntregable).not.toHaveBeenCalled()
    expect(botonTerminar()).toBeEnabled()
  })

  it('si el servidor dice que falta el entregable (400), lo muestra junto a los archivos', async () => {
    vi.mocked(apiEquipo.tarea).mockResolvedValue(detalleDe(TAREA, { archivos: [INFORME_PDF], entregables: 1 }))
    vi.mocked(apiEquipo.terminar).mockRejectedValue(
      new ErrorCrmHttp('solicitud_invalida', 'Revise los datos.', { estado: 400, campos: { entregable: 'Suba al menos un entregable antes de terminar.' } }),
    )
    const { alTerminada } = montar()
    await waitFor(() => expect(botonTerminar()).toBeEnabled())
    fireEvent.click(botonTerminar())
    expect(await screen.findByText('Suba al menos un entregable antes de terminar.')).toBeInTheDocument()
    expect(alTerminada).not.toHaveBeenCalled()
  })

  it('si ya estaba terminada (409), lo avisa y pide recargar', async () => {
    vi.mocked(apiEquipo.tarea).mockResolvedValue(detalleDe(TAREA, { archivos: [INFORME_PDF], entregables: 1 }))
    vi.mocked(apiEquipo.terminar).mockRejectedValue(new ErrorCrmHttp('conflicto', 'La tarea ya estaba terminada.', { estado: 409 }))
    const { alTerminada } = montar()
    await waitFor(() => expect(botonTerminar()).toBeEnabled())
    fireEvent.click(botonTerminar())
    expect(await screen.findByText('La tarea ya estaba terminada.')).toBeInTheDocument()
    expect(alTerminada).toHaveBeenCalledWith(null)
  })
})
