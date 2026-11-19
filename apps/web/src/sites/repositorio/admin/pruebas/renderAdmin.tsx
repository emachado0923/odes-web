/**
 * Utilidades de las pruebas de la administración: montar la rama completa
 * (RepositorioSitio, que carga AdminRepositorio diferido) en un router en
 * memoria, y buscar botones y enlaces por su texto.
 */
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import RepositorioSitio from '../../RepositorioSitio'

export function renderAdmin(ruta = '/repositorio/admin') {
  const router = createMemoryRouter([{ path: '/repositorio/*', Component: RepositorioSitio }], {
    initialEntries: [ruta],
  })
  const resultado = render(<RouterProvider router={router} />)
  return { router, ...resultado }
}

const limpio = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()

/**
 * Control por su texto visible (jsdom no conserva el espacio inicial de los
 * <span> ocultos en el nombre accesible: "Editar «…»" queda "Editar«…»").
 */
export function boton(texto: string | RegExp, dentro: HTMLElement = document.body): HTMLButtonElement {
  const b = within(dentro)
    .queryAllByRole('button')
    .find((x) => (typeof texto === 'string' ? limpio(x.textContent) === texto : texto.test(limpio(x.textContent))))
  if (!b) throw new Error(`No hay un botón "${String(texto)}"`)
  return b as HTMLButtonElement
}

export function enlace(texto: string | RegExp, dentro: HTMLElement = document.body): HTMLAnchorElement {
  const a = within(dentro)
    .queryAllByRole('link')
    .find((x) => (typeof texto === 'string' ? limpio(x.textContent) === texto : texto.test(limpio(x.textContent))))
  if (!a) throw new Error(`No hay un enlace "${String(texto)}"`)
  return a as HTMLAnchorElement
}

export async function esperarTitulo(texto: string | RegExp) {
  return screen.findByRole('heading', { level: 1, name: texto }, { timeout: 3000 })
}
