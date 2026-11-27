import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Componente, Grupo } from './catalogo'
import FichaComponente from './FichaComponente'

/** Dos versiones mínimas de un componente, con su script para la vista previa. */
function version(n: number, ejecutar: () => void): Componente {
  return {
    slug: `prueba-${n}`,
    nombre: `Versión ${n}: la ${n === 1 ? 'primera' : 'segunda'}`,
    descripcion: `Descripción de la versión ${n}.`,
    html: `<p id="odes-prueba-${n}">Contenido ${n}</p>`,
    css: `#odes-prueba-${n}{color:#163854}`,
    js: "(function () { 'use strict'; })();",
    ejecutar,
  }
}

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.restoreAllMocks()
})

describe('ficha con versiones (para comparar en /componentes)', () => {
  it('el selector cambia la vista previa, corre el script de la elegida y descarga esa versión', () => {
    const ejecutados: number[] = []
    const grupo: Grupo = {
      id: 'prueba',
      nombre: 'Componente de prueba',
      descripcion: 'Dos versiones para comparar.',
      versiones: [version(1, () => ejecutados.push(1)), version(2, () => ejecutados.push(2))],
    }
    const descargados: string[] = []
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn<(blob: Blob) => string>(() => 'blob:prueba') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn<(url: string) => void>() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargados.push(this.download)
    })

    render(<FichaComponente ficha={grupo} />)
    const ficha = screen.getByRole('article', { name: 'Componente de prueba' })
    const botones = within(within(ficha).getByRole('group', { name: 'Versión' })).getAllByRole('button')
    expect(botones.map((boton) => boton.textContent)).toEqual(['1la primera', '2la segunda'])
    expect(botones[0]).toHaveAttribute('aria-pressed', 'true')
    expect(within(ficha).getByText('Contenido 1')).toBeInTheDocument()
    expect(ejecutados).toEqual([1])

    fireEvent.click(botones[1]!)
    expect(botones[1]).toHaveAttribute('aria-pressed', 'true')
    expect(within(ficha).queryByText('Contenido 1')).toBeNull()
    expect(within(ficha).getByText('Contenido 2')).toBeInTheDocument()
    expect(within(ficha).getByText('Descripción de la versión 2.')).toBeInTheDocument()
    expect(ejecutados).toEqual([1, 2])

    expect(within(ficha).getByText('Descargar la versión 2')).toBeInTheDocument()
    fireEvent.click(within(ficha).getByRole('button', { name: /^Bloque completo/ }))
    expect(descargados).toEqual(['prueba-2-bloque.html'])
  })
})
