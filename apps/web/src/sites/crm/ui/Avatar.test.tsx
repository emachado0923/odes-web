import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Avatar from './Avatar'
import { COLORES_PERSONA, colorPersona } from './colores'

const ANA = { nombre: 'Ana María Restrepo Gil', iniciales: 'AR', semilla: 2 }

function circulo(contenedor: HTMLElement): HTMLElement {
  const elemento = contenedor.querySelector<HTMLElement>('.crm-avatar')
  if (!elemento) throw new Error('No se pintó el avatar')
  return elemento
}

describe('Avatar', () => {
  it('sin foto muestra las iniciales sobre el color de la persona, y junto al nombre es decorativo', () => {
    const { container } = render(<Avatar {...ANA} foto={null} />)
    const avatar = circulo(container)
    expect(avatar).toHaveTextContent('AR')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).toHaveClass('crm-avatar-md')
    expect(avatar.style.getPropertyValue('--crm-av-fondo')).toBe(colorPersona(2).fondo)
    expect(avatar.style.getPropertyValue('--crm-av-texto')).toBe(colorPersona(2).texto)
    expect(container.querySelector('img')).toBeNull()
  })

  it('con foto pinta la imagen con alt vacío; si no carga, vuelve a las iniciales', () => {
    const { container } = render(<Avatar {...ANA} foto="/api/crm/personas/2/foto?v=3" tamano="xl" />)
    const imagen = container.querySelector('img')
    expect(imagen).toHaveAttribute('src', '/api/crm/personas/2/foto?v=3')
    expect(imagen).toHaveAttribute('alt', '')
    expect(circulo(container)).not.toHaveTextContent('AR')

    fireEvent.error(imagen as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(circulo(container)).toHaveTextContent('AR')
    expect(circulo(container)).toHaveClass('crm-avatar-xl')
  })

  it('si cambia la foto (otra versión), la vuelve a intentar', () => {
    const { container, rerender } = render(<Avatar {...ANA} foto="/api/crm/personas/2/foto?v=3" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    rerender(<Avatar {...ANA} foto="/api/crm/personas/2/foto?v=4" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/crm/personas/2/foto?v=4')
  })

  it('con decorativo={false} se anuncia con el nombre', () => {
    render(<Avatar {...ANA} foto={null} decorativo={false} />)
    expect(screen.getByRole('img', { name: 'Ana María Restrepo Gil' })).toHaveTextContent('AR')
  })

  it('el color sale del id: el mismo id da el mismo color y ocho ids seguidos no repiten', () => {
    const ocho = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => colorPersona(id).fondo)
    expect(new Set(ocho).size).toBe(COLORES_PERSONA.length)
    expect(colorPersona(9)).toBe(colorPersona(1))
    expect(colorPersona(-3)).toBe(colorPersona(5))
  })
})
