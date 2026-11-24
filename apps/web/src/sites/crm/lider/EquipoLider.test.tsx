import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { PersonaAdminCrm } from '../api-crm'
import { ErrorCrmHttp, type ApiLider } from '../datos/clienteCrm'
import ProveedorAvisos from '../ui/ProveedorAvisos'
import EquipoLider from './EquipoLider'
import { ContextoLiderCrm, type ContextoLider } from './contexto'

function persona(id: number, cambios: Partial<PersonaAdminCrm> = {}): PersonaAdminCrm {
  return {
    id,
    nombre: `Persona ${id}`,
    iniciales: `P${id}`,
    esLider: false,
    puedeCrearTareas: false,
    foto: null,
    conteo: { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 },
    correo: `persona${id}@sapiencia.gov.co`,
    activo: true,
    orden: id,
    ...cambios,
  }
}

const MARTHA = persona(1, { nombre: 'Martha Lucía Gómez', iniciales: 'MG', esLider: true })
const ANA = persona(2, {
  nombre: 'Ana María Restrepo',
  iniciales: 'AR',
  conteo: { pendientes: 3, enProceso: 1, terminadasRecientes: 2, vencidas: 1 },
})
const JOSE = persona(3, { nombre: 'José David Ramírez', iniciales: 'JR' })
const EQUIPO = [MARTHA, ANA, JOSE]

/** Monta la pantalla con una api falsa (solo lo que usa la prueba). */
function montar(api: Partial<ApiLider>) {
  const contexto: ContextoLider = {
    sesion: { nombre: 'Martha', csrf: 'token-1', expira: '2026-11-25T00:00:00Z' },
    api: api as ApiLider,
    vencida: vi.fn<() => void>(),
    salir: vi.fn<() => Promise<void>>(async () => {}),
    avisarCambioCorreos: vi.fn<() => void>(),
  }
  render(
    <MemoryRouter initialEntries={['/crm/lider/equipo']}>
      <ProveedorAvisos>
        <ContextoLiderCrm value={contexto}>
          <EquipoLider />
        </ContextoLiderCrm>
      </ProveedorAvisos>
    </MemoryRouter>,
  )
  return contexto
}

async function abrirAgregar(): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: 'Ana María Restrepo' })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
  return screen.getByRole('dialog', { name: 'Agregar persona' })
}

describe('EquipoLider', () => {
  it('lista a las personas con su correo, la marca «Líder», si están activas y sus conteos', async () => {
    montar({ personas: vi.fn<ApiLider['personas']>(async () => [...EQUIPO, persona(4, { nombre: 'Luz Arango', activo: false })]) })
    const fila = (await screen.findByRole('heading', { name: 'Martha Lucía Gómez' })).closest('li') as HTMLElement
    expect(within(fila).getByText('Líder')).toBeInTheDocument()
    expect(within(fila).getByText('persona1@sapiencia.gov.co')).toBeInTheDocument()
    expect(within(fila).getByText('Activa')).toBeInTheDocument()
    const ana = screen.getByRole('heading', { name: 'Ana María Restrepo' }).closest('li') as HTMLElement
    expect(within(ana).getByText('Tareas: 3 pendientes, 1 en proceso, 2 terminadas en los últimos 30 días y 1 vencida.')).toBeInTheDocument()
    const luz = screen.getByRole('heading', { name: 'Luz Arango' }).closest('li') as HTMLElement
    expect(within(luz).getByText('Inactiva')).toBeInTheDocument()
    expect(within(luz).getByRole('button', { name: 'Activar a Luz Arango' })).toBeInTheDocument()
    expect(screen.getByText('3 personas activas y 1 inactiva.')).toBeInTheDocument()
  })

  it('«Agregar persona» llama crearPersona con nombre y correo, avisa y recarga la lista', async () => {
    const personas = vi.fn<ApiLider['personas']>(async () => EQUIPO)
    const crearPersona = vi.fn<ApiLider['crearPersona']>(async (datos) => persona(9, { nombre: datos.nombre, correo: datos.correo }))
    montar({ personas, crearPersona })

    const dialogo = await abrirAgregar()
    fireEvent.change(within(dialogo).getByLabelText(/Nombre/), { target: { value: '  Luis   Pérez ' } })
    fireEvent.change(within(dialogo).getByLabelText(/Correo/), { target: { value: 'luis.perez@sapiencia.gov.co' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar persona' }))

    await waitFor(() => expect(crearPersona).toHaveBeenCalledWith({ nombre: 'Luis Pérez', correo: 'luis.perez@sapiencia.gov.co' }))
    expect(await screen.findByText('Se agregó a Luis Pérez.')).toBeInTheDocument()
    await waitFor(() => expect(personas).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sin nombre ni correo no llama al servidor y dice qué falta junto a cada campo', async () => {
    const crearPersona = vi.fn<ApiLider['crearPersona']>()
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), crearPersona })

    const dialogo = await abrirAgregar()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar persona' }))
    expect(await within(dialogo).findByText('Escriba el nombre.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Escriba el correo.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText(/Nombre/)).toHaveFocus()
    expect(crearPersona).not.toHaveBeenCalled()
  })

  it('un 409 del servidor (correo repetido) se muestra junto al campo Correo', async () => {
    const crearPersona = vi.fn<ApiLider['crearPersona']>(async () => {
      throw new ErrorCrmHttp('conflicto', 'Ya hay una persona con ese correo.', { estado: 409 })
    })
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), crearPersona })

    const dialogo = await abrirAgregar()
    fireEvent.change(within(dialogo).getByLabelText(/Nombre/), { target: { value: 'Ana Restrepo' } })
    fireEvent.change(within(dialogo).getByLabelText(/Correo/), { target: { value: 'persona2@sapiencia.gov.co' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar persona' }))

    const correo = within(dialogo).getByLabelText(/Correo/)
    await waitFor(() => expect(correo).toHaveAttribute('aria-invalid', 'true'))
    expect(correo).toHaveAccessibleDescription(/Ya hay una persona con ese correo\./)
    expect(correo).toHaveFocus()
    expect(within(dialogo).getByLabelText(/Nombre/)).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('dialog', { name: 'Agregar persona' })).toBeInTheDocument()
  })

  it('«Desactivar» pide confirmación antes de llamar a editarPersona', async () => {
    const editarPersona = vi.fn<ApiLider['editarPersona']>(async (id, datos) => ({ ...ANA, ...datos, id }))
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), editarPersona })

    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ana María Restrepo' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Desactivar a Ana María Restrepo?' })
    expect(dialogo).toHaveAccessibleDescription('Ya no aparecerá en el inicio; sus tareas se conservan.')
    expect(editarPersona).not.toHaveBeenCalled()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(editarPersona).toHaveBeenCalledWith(2, { activo: false }))
    expect(await screen.findByRole('button', { name: 'Activar a Ana María Restrepo' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el 409 del único líder activo se muestra como error en la confirmación', async () => {
    const editarPersona = vi.fn<ApiLider['editarPersona']>(async () => {
      throw new ErrorCrmHttp('conflicto', 'No se puede desactivar al único líder activo.', { estado: 409 })
    })
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), editarPersona })

    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar a Martha Lucía Gómez' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Desactivar a Martha Lucía Gómez?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se puede desactivar al único líder activo.')
  })

  it('la casilla «Puede crearse tareas» hace PATCH puedeCrearTareas, avisa y queda marcada (y se desmarca igual)', async () => {
    const editarPersona = vi.fn<ApiLider['editarPersona']>(async (id, datos) => ({ ...ANA, ...datos, id }))
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), editarPersona })

    const casilla = await screen.findByRole('checkbox', { name: /^Puede crearse tareas\s*\(Ana María Restrepo\)$/ })
    expect(casilla).not.toBeChecked()
    fireEvent.click(casilla)
    await waitFor(() => expect(editarPersona).toHaveBeenCalledWith(2, { puedeCrearTareas: true }))
    expect(await screen.findByText('Ana María Restrepo ya puede crearse tareas desde su tablero.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Puede crearse tareas\s*\(Ana María Restrepo\)$/ })).toBeChecked())

    fireEvent.click(screen.getByRole('checkbox', { name: /^Puede crearse tareas\s*\(Ana María Restrepo\)$/ }))
    await waitFor(() => expect(editarPersona).toHaveBeenLastCalledWith(2, { puedeCrearTareas: false }))
    expect(await screen.findByText('Ana María Restrepo ya no puede crearse tareas.')).toBeInTheDocument()
  })

  it('si falla el cambio del permiso, avisa el error y la casilla queda como estaba', async () => {
    const editarPersona = vi.fn<ApiLider['editarPersona']>(async () => {
      throw new ErrorCrmHttp('no_disponible', 'El servicio no está disponible.', { estado: 503 })
    })
    montar({ personas: vi.fn<ApiLider['personas']>(async () => EQUIPO), editarPersona })
    const casilla = await screen.findByRole('checkbox', { name: /^Puede crearse tareas\s*\(José David Ramírez\)$/ })
    fireEvent.click(casilla)
    expect(await screen.findByText('El servicio no está disponible.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^Puede crearse tareas\s*\(José David Ramírez\)$/ })).not.toBeChecked()
  })

  it('«Subir» intercambia el orden con la vecina (dos editarPersona) y recarga', async () => {
    const personas = vi.fn<ApiLider['personas']>(async () => EQUIPO)
    const editarPersona = vi.fn<ApiLider['editarPersona']>(async (id, datos) => ({ ...persona(id), ...datos }))
    montar({ personas, editarPersona })

    expect(await screen.findByRole('button', { name: 'Subir a Martha Lucía Gómez un puesto' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar a José David Ramírez un puesto' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Subir a José David Ramírez un puesto' }))

    await waitFor(() => expect(personas).toHaveBeenCalledTimes(2))
    expect(editarPersona).toHaveBeenNthCalledWith(1, 3, { orden: 2 })
    expect(editarPersona).toHaveBeenNthCalledWith(2, 2, { orden: 3 })
  })
})
