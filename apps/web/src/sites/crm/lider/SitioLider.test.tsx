import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResumenLiderCrm, SesionLiderCrm } from '../api-crm'
import { apiSesionLider, crearApiLider, ErrorCrmHttp, type ApiLider } from '../datos/clienteCrm'
import { PERSONAS_MUESTRA, tareasMuestra } from '../ui/muestras'
import SitioLider from './SitioLider'

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

const RESUMEN: ResumenLiderCrm = {
  personas: PERSONAS_MUESTRA,
  totales: { pendientes: 3, enProceso: 2, terminadasRecientes: 2, vencidas: 1 },
  correo: { configurado: true, pendientes: 2, errores: 1 },
}

/** Las llamadas del líder que usan la barra y el panel. */
function apiFalsa() {
  const api = {
    resumen: vi.fn<ApiLider['resumen']>(async () => RESUMEN),
    tareas: vi.fn<ApiLider['tareas']>(async () => tareasMuestra()),
    cerrarSesion: vi.fn<ApiLider['cerrarSesion']>(async () => undefined),
  }
  vi.mocked(crearApiLider).mockReturnValue(api as unknown as ApiLider)
  return api
}

function montar(ruta = '/crm/lider') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <div className="crm">
        <Routes>
          <Route path="/crm" element={<p>Inicio del CRM</p>} />
          <Route path="/crm/lider/*" element={<SitioLider />} />
        </Routes>
      </div>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('SitioLider', () => {
  it('sin sesión muestra el ingreso; con la contraseña pasa al panel con la barra del líder', async () => {
    vi.mocked(apiSesionLider.obtener).mockResolvedValue(null)
    vi.mocked(apiSesionLider.iniciar).mockResolvedValue(SESION)
    apiFalsa()
    montar()

    expect(await screen.findByRole('heading', { level: 1, name: 'Ingreso del líder' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menú del líder' })).not.toBeInTheDocument()
    expect(crearApiLider).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave del líder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel del equipo' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Menú del líder' })).toBeInTheDocument()
    expect(crearApiLider).toHaveBeenCalledWith(SESION.csrf)
  })

  it('con sesión muestra el panel y la barra (insignia de correos incluida); «Cerrar sesión» vuelve al ingreso', async () => {
    vi.mocked(apiSesionLider.obtener).mockResolvedValue(SESION)
    const api = apiFalsa()
    montar()

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel del equipo' })).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Menú del líder' })
    expect(within(menu).getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('link', { name: 'Nueva tarea' })).toHaveAttribute('href', '/crm/lider/tareas/nueva')
    expect(within(menu).getByRole('link', { name: 'Equipo' })).toHaveAttribute('href', '/crm/lider/equipo')
    // 2 pendientes y 1 con error: la insignia dice 3, en rojo.
    const correos = await within(menu).findByRole('link', { name: /^Correos.*3 sin enviar \(1 con error\)$/ })
    expect(correos).toHaveAttribute('href', '/crm/lider/correos')
    expect(correos.querySelector('.crm-li-insignia')).toHaveAttribute('data-tono', 'error')

    expect(screen.getByText('Sesión de José')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver tablero del equipo' })).toHaveAttribute('href', '/crm')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingreso del líder' })).toBeInTheDocument()
    expect(api.cerrarSesion).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('La sesión venció. Ingrese de nuevo.')).not.toBeInTheDocument()
  })

  it('si una petición responde 401 vuelve al ingreso con el aviso de sesión vencida', async () => {
    vi.mocked(apiSesionLider.obtener).mockResolvedValue(SESION)
    const api = apiFalsa()
    api.tareas.mockRejectedValue(new ErrorCrmHttp('no_autenticado', 'La sesión no existe o venció.', { estado: 401 }))
    montar()

    expect(await screen.findByText('La sesión venció. Ingrese de nuevo.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ingreso del líder' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menú del líder' })).not.toBeInTheDocument()
  })

  it('si no se pudo comprobar la sesión, ofrece intentar de nuevo', async () => {
    vi.mocked(apiSesionLider.obtener)
      .mockRejectedValueOnce(new ErrorCrmHttp('red', 'No hay conexión con el servidor.'))
      .mockResolvedValueOnce(null)
    montar()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar la sesión.')
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingreso del líder' })).toBeInTheDocument()
    expect(apiSesionLider.obtener).toHaveBeenCalledTimes(2)
  })
})
