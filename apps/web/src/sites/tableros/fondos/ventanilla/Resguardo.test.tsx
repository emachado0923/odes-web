import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Resguardo from './Resguardo'

function Rota(): never {
  throw new Error('dato con una forma inesperada')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resguardo de una parte del expediente', () => {
  it('si no hay fallo, pinta lo que envuelve', () => {
    render(
      <Resguardo que="el beneficio de Fondo EPM">
        <p>Contenido del beneficio</p>
      </Resguardo>,
    )
    expect(screen.getByText('Contenido del beneficio')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si una pieza falla, avisa en su lugar y el resto del expediente sigue en pantalla', () => {
    // React informa el error capturado por consola: aquí es lo esperado.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <div>
        <Resguardo que="el resumen de la persona">
          <p>Persona de prueba</p>
        </Resguardo>
        <Resguardo que="el beneficio de Fondo EPM, convocatoria 2019-2">
          <Rota />
        </Resguardo>
      </div>,
    )
    expect(screen.getByText('Persona de prueba')).toBeInTheDocument()
    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('No se pudo mostrar el beneficio de Fondo EPM, convocatoria 2019-2.')
    expect(aviso).toHaveTextContent('El resto del expediente está completo.')
    // El aviso no repite el mensaje interno del error.
    expect(aviso).not.toHaveTextContent('forma inesperada')
  })
})
