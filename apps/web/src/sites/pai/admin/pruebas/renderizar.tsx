/**
 * Monta una página suelta del PAI con una sesión de prueba
 * (ProveedorSesionPrueba) dentro de un router de datos en memoria, para
 * probar la administración sin el sitio completo. El tablero y cualquier
 * otra ruta son marcadores ("Tablero de prueba", "Otra página") para
 * comprobar a dónde llevan los enlaces.
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Outlet, createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { RolPai, SesionPai, VigenciaPai } from '../../api-pai'
import { ProveedorSesionPrueba } from '../../pruebas/ProveedorSesionPrueba'

export function renderizarPagina(
  elemento: ReactElement,
  {
    ruta,
    rol = 'administrador',
    sesion,
    vigencia,
  }: { ruta: string; rol?: RolPai; sesion?: SesionPai; vigencia?: VigenciaPai | null },
) {
  const patron = ruta.split('?')[0]
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorSesionPrueba rol={rol} sesion={sesion} vigencia={vigencia}>
            <Outlet />
          </ProveedorSesionPrueba>
        ),
        children: [
          { path: patron, element: elemento },
          { path: '/pai', element: <p>Tablero de prueba</p> },
          { path: '*', element: <p>Otra página</p> },
        ],
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
  return { router }
}

export function boton(nombre: string | RegExp, dentro?: HTMLElement): HTMLElement {
  return (dentro ? within(dentro) : screen).getByRole('button', { name: nombre })
}

export function enlace(nombre: string | RegExp, dentro?: HTMLElement): HTMLElement {
  return (dentro ? within(dentro) : screen).getByRole('link', { name: nombre })
}
