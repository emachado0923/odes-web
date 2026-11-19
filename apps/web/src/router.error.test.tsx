import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorRama from './compartido/ErrorRama'
import { rutas } from './router'

// Simula que el módulo de la rama ODES no se puede cargar.
vi.mock('./sites/odes/OdesSitio', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/OdesSitio-viejo.js')
})

describe('errorElement de las ramas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si una rama falla, muestra un mensaje amable con "Recargar la página"', async () => {
    const router = createMemoryRouter(rutas, { initialEntries: ['/odes'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos mostrar esta sección')
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
  })

  it('reconoce un chunk que ya no existe (tras un despliegue) y lo explica', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/rama',
          ErrorBoundary: ErrorRama,
          lazy: async () => {
            throw new TypeError('Failed to fetch dynamically imported module: /assets/Rama-viejo.js')
          },
        },
      ],
      { initialEntries: ['/rama'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Es posible que el sitio se haya actualizado')
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
  })
})
