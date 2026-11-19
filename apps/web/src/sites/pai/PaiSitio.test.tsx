import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../router'

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('./componentes/EstilosPai', () => ({ default: () => null }))

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Sin sesión: toda la API del PAI responde 401 (el ingreso queda dentro de <main>). */
function sinSesion() {
  const pedir = vi.fn<(url: string, opciones?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify({ codigo: 'no_autenticado', mensaje: 'Inicie sesión para continuar.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', pedir)
  return pedir
}

function renderizarEn(ruta: string) {
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />)
}

describe('rama /pai: el cascarón', () => {
  it('muestra la cabecera y el pie del Observatorio, el salto al contenido y el <main>', async () => {
    sinSesion()
    renderizarEn('/pai')
    const logo = await screen.findByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })
    expect(logo).toHaveAttribute('href', '/')
    expect(screen.getByRole('banner')).toHaveTextContent('Plan de Acción Institucional')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido')
    const principal = screen.getByRole('main')
    expect(principal).toHaveAttribute('id', 'contenido')
    expect(principal.closest('.pai')).toHaveAttribute('data-bs-theme', 'light')
  })

  it('las subrutas (también las de administración) son de la rama, no el 404 global', async () => {
    sinSesion()
    renderizarEn('/pai/admin/usuarios')
    expect(await screen.findByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido')
  })
})
