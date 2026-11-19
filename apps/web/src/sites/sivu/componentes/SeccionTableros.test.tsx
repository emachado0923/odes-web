import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it, vi } from 'vitest'
import SeccionTableros from './SeccionTableros'

vi.mock('../datos/tableros', () => ({
  TABLEROS: [
    { id: 'externo', titulo: 'Tablero externo', descripcion: 'En Power BI.', tema: 'Matrícula', url: 'https://app.powerbi.com/view?r=abc' },
    { id: 'propio', titulo: 'Tablero propio', descripcion: 'En este sitio.', tema: 'Cobertura', url: '/sivu/tableros/cobertura' },
    { id: 'sin-url', titulo: 'Tablero sin dirección', descripcion: 'Aún no.', tema: 'Deserción', url: '  ' },
    { id: 'peligroso', titulo: 'Tablero con javascript:', descripcion: 'No debe enlazar.', tema: 'Otro', url: 'javascript:alert(1)' },
  ],
}))

function renderizar() {
  const router = createMemoryRouter([{ path: '*', element: <SeccionTableros /> }])
  render(<RouterProvider router={router} />)
}

const tarjeta = (titulo: string) => {
  const li = screen.getByRole('heading', { level: 3, name: titulo }).closest('li')
  if (!li) throw new Error(`Falta la tarjeta ${titulo}`)
  return within(li)
}

describe('SeccionTableros', () => {
  it('un tablero de otro sitio se abre en una pestaña nueva y lo dice', () => {
    renderizar()

    const enlace = tarjeta('Tablero externo').getByRole('link', { name: /Abrir tablero/ })
    expect(enlace).toHaveAttribute('href', 'https://app.powerbi.com/view?r=abc')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
    // (jsdom une los textos sin el espacio inicial del texto oculto; el navegador lo conserva)
    expect(enlace).toHaveAccessibleName(/^Abrir tablero ?\(se abre en una pestaña nueva\)$/)
  })

  it('una ruta propia enlaza en la misma pestaña', () => {
    renderizar()

    const enlace = tarjeta('Tablero propio').getByRole('link', { name: 'Abrir tablero' })
    expect(enlace).toHaveAttribute('href', '/sivu/tableros/cobertura')
    expect(enlace).not.toHaveAttribute('target')
  })

  it.each(['Tablero sin dirección', 'Tablero con javascript:'])('"%s" dice "Próximamente" y no enlaza', (titulo) => {
    renderizar()

    expect(tarjeta(titulo).queryByRole('link')).not.toBeInTheDocument()
    expect(tarjeta(titulo).getByText('Próximamente')).toBeInTheDocument()
  })

  it('cada tarjeta muestra su tema y su descripción; al final, la tarjeta de "más tableros"', () => {
    renderizar()

    expect(tarjeta('Tablero externo').getByText('Matrícula')).toHaveClass('sv-tablero-tema')
    expect(tarjeta('Tablero externo').getByText('En Power BI.')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.at(-1)).toHaveTextContent('Pronto habrá más tableros aquí.')
  })
})
