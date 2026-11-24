import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiEquipo, ErrorCrmHttp } from '../datos/clienteCrm'
import { PERSONAS_MUESTRA } from '../ui/muestras'
import Inicio from './Inicio'

// Solo se simula la llamada a la API; los errores y mensajeDe son los de verdad.
vi.mock('../datos/clienteCrm', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../datos/clienteCrm')>()
  return { ...original, apiEquipo: { ...original.apiEquipo, personas: vi.fn<typeof original.apiEquipo.personas>() } }
})

const personas = vi.mocked(apiEquipo.personas)

function montar() {
  return render(
    <MemoryRouter initialEntries={['/crm']}>
      <Routes>
        <Route path="/crm" element={<Inicio />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Inicio del CRM (/crm)', () => {
  beforeEach(() => {
    personas.mockReset()
  })

  it('pinta una tarjeta por persona y cada una lleva a su tablero', async () => {
    personas.mockResolvedValue(PERSONAS_MUESTRA)
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Tareas de la Oficina de Planeación' })).toBeInTheDocument()
    expect(screen.getByText('Elija su nombre para ver sus tareas.')).toBeInTheDocument()

    const lista = await screen.findByRole('list', { name: 'Personas del equipo' })
    expect(within(lista).getAllByRole('link')).toHaveLength(PERSONAS_MUESTRA.length)
    expect(within(lista).getByRole('link', { name: /Ana María Restrepo Gil/ })).toHaveAttribute('href', '/crm/equipo/2')
    expect(within(lista).getByRole('link', { name: /Valentina Mora Quintero/ })).toHaveAttribute('href', '/crm/equipo/8')
  })

  it('la tarjeta del líder lleva a /crm/lider y dice que pide contraseña', async () => {
    personas.mockResolvedValue(PERSONAS_MUESTRA)
    montar()
    const lider = await screen.findByRole('link', { name: /Martha Lucía Giraldo Arango/ })
    expect(lider).toHaveAttribute('href', '/crm/lider')
    expect(lider).toHaveAccessibleName(/Líder/)
    expect(lider).toHaveAccessibleName(/pide contraseña/)
    // Las demás no piden contraseña.
    expect(screen.getByRole('link', { name: /Ana María Restrepo Gil/ })).not.toHaveAccessibleName(/contraseña/)
    expect(screen.getByText('¿No encuentra su nombre? Pídale a Martha que actualice el equipo.')).toBeInTheDocument()
  })

  it('si no carga deja intentar de nuevo, y sin personas dice que el equipo está vacío', async () => {
    personas.mockRejectedValueOnce(new ErrorCrmHttp('red', 'No hay conexión con el servidor.')).mockResolvedValueOnce([])
    montar()
    expect(await screen.findByText('No se pudo cargar el equipo.')).toBeInTheDocument()
    expect(screen.getByText('No hay conexión con el servidor.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Todavía no hay personas en el equipo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar como líder' })).toHaveAttribute('href', '/crm/lider')
    expect(personas).toHaveBeenCalledTimes(2)
  })
})
