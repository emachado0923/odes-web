import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SesionLiderCrm } from '../api-crm'
import { apiSesionLider, ErrorCrmHttp } from '../datos/clienteCrm'
import IngresoLider from './IngresoLider'

// El cliente real, salvo las llamadas de la sesión del líder.
vi.mock('../datos/clienteCrm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../datos/clienteCrm')>()
  return {
    ...real,
    apiSesionLider: { obtener: vi.fn<typeof real.apiSesionLider.obtener>(), iniciar: vi.fn<typeof real.apiSesionLider.iniciar>() },
    crearApiLider: vi.fn<typeof real.crearApiLider>(),
  }
})

const SESION: SesionLiderCrm = { nombre: 'José David Ramírez Abraham', csrf: 'c'.repeat(43), expira: '2026-11-25T05:00:00.000Z' }

afterEach(() => {
  vi.resetAllMocks()
})

function montar(aviso: string | null = null) {
  const alIngresar = vi.fn<(sesion: SesionLiderCrm) => void>()
  render(
    <MemoryRouter initialEntries={['/crm/lider']}>
      <div className="crm">
        <IngresoLider aviso={aviso} alIngresar={alIngresar} />
      </div>
    </MemoryRouter>,
  )
  return { alIngresar, campo: screen.getByLabelText('Contraseña') }
}

function entrarCon(campo: HTMLElement, contrasena: string) {
  fireEvent.change(campo, { target: { value: contrasena } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('IngresoLider', () => {
  it('pide solo la contraseña: usuario oculto para el gestor, «Entrar» apagado si está vacío y botón para verla', () => {
    const { campo } = montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Ingreso del líder' })).toBeInTheDocument()
    expect(screen.getByText('Escriba su contraseña para ver el panel del equipo.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('type', 'password')
    expect(campo).toHaveAttribute('autocomplete', 'current-password')
    expect(campo).toHaveFocus()

    const usuario = document.querySelector('input[autocomplete="username"]')
    expect(usuario).toHaveValue('lider')
    expect(usuario).toHaveAttribute('tabindex', '-1')
    expect(usuario).toHaveClass('crm-sr')

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
    fireEvent.change(campo, { target: { value: 'algo' } })
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()

    const ver = screen.getByRole('button', { name: 'Mostrar la contraseña' })
    expect(ver).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(ver)
    expect(ver).toHaveAttribute('aria-pressed', 'true')
    expect(campo).toHaveAttribute('type', 'text')

    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/crm')
  })

  it('con 401 dice «Contraseña incorrecta.» y devuelve el foco al campo', async () => {
    vi.mocked(apiSesionLider.iniciar).mockRejectedValue(
      new ErrorCrmHttp('no_autenticado', 'La sesión no existe o venció. Entre de nuevo con la contraseña.', { estado: 401 }),
    )
    const { alIngresar, campo } = montar()
    entrarCon(campo, 'equivocada')
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()

    expect(await screen.findByRole('alert')).toHaveTextContent('Contraseña incorrecta.')
    expect(apiSesionLider.iniciar).toHaveBeenCalledWith('equivocada')
    await waitFor(() => expect(campo).toHaveFocus())
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Contraseña incorrecta.')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(alIngresar).not.toHaveBeenCalled()
  })

  it('con 429 dice cuántos minutos esperar (Retry-After)', async () => {
    vi.mocked(apiSesionLider.iniciar).mockRejectedValue(
      new ErrorCrmHttp('demasiados_intentos', 'Demasiados intentos.', { estado: 429, reintentarEn: 840 }),
    )
    const { campo } = montar()
    entrarCon(campo, 'otra vez')
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos. Espere 14 minutos e intente de nuevo.')
  })

  it('con la contraseña buena entrega la sesión; el aviso de sesión vencida se lee con el campo', async () => {
    vi.mocked(apiSesionLider.iniciar).mockResolvedValue(SESION)
    const { alIngresar, campo } = montar('La sesión venció. Ingrese de nuevo.')
    expect(screen.getByRole('status')).toHaveTextContent('La sesión venció. Ingrese de nuevo.')
    expect(campo).toHaveAccessibleDescription('La sesión venció. Ingrese de nuevo.')

    entrarCon(campo, 'clave del líder')
    await waitFor(() => expect(alIngresar).toHaveBeenCalledWith(SESION))
    expect(apiSesionLider.iniciar).toHaveBeenCalledWith('clave del líder')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
