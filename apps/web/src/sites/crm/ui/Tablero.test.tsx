import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { EstadoTarea, TareaCrm } from '../api-crm'
import { tareaMuestra } from './muestras'
import Tablero, { type PropsTablero } from './Tablero'

const HOY = '2026-11-24'

const TAREAS: TareaCrm[] = [
  tareaMuestra({ id: 1, titulo: 'Informe trimestral', fechaLimite: '2026-11-20', vencida: true }),
  tareaMuestra({ id: 2, titulo: 'Matriz de riesgos', requiereEntregable: true, adjuntos: 2 }),
  tareaMuestra({ id: 3, titulo: 'Presentación al comité', estado: 'en_proceso', fechaLimite: HOY }),
  tareaMuestra({ id: 4, titulo: 'Seguimiento de octubre', estado: 'terminada', terminadaEn: '2026-11-22T15:00:00.000Z' }),
]

function montar(cambios: Partial<PropsTablero> = {}) {
  const props: PropsTablero = { tareas: TAREAS, alAbrir: vi.fn<PropsTablero['alAbrir']>(), hoy: HOY, ...cambios }
  return { props, ...render(<Tablero {...props} />) }
}

const columna = (nombre: string | RegExp) => screen.getByRole('region', { name: nombre })
const itemDe = (titulo: string) => screen.getByRole('button', { name: titulo }).closest('li') as HTMLLIElement

/** dataTransfer mínimo para los eventos de arrastre de jsdom. */
function transferencia() {
  return {
    setData: vi.fn<(formato: string, datos: string) => void>(),
    getData: vi.fn<(formato: string) => string>(),
    types: ['text/plain'],
    effectAllowed: 'all',
    dropEffect: 'none',
  }
}

describe('Tablero: columnas y conteos', () => {
  it('una columna por estado con su número de tareas, y cuántas están vencidas', () => {
    montar()
    const pendiente = columna('Pendiente: 2 tareas')
    expect(within(pendiente).getAllByRole('article')).toHaveLength(2)
    expect(within(pendiente).getByText('1 vencida')).toBeInTheDocument()
    expect(within(columna('En proceso: 1 tarea')).getAllByRole('article')).toHaveLength(1)
    expect(within(columna('Terminada: 1 tarea')).getByRole('button', { name: 'Seguimiento de octubre' })).toBeInTheDocument()

    // La barra para ir a cada columna (en pantallas angostas) dice lo mismo.
    const saltos = screen.getByRole('navigation', { name: 'Ir a una columna' })
    expect(within(saltos).getAllByRole('button').map((b) => b.textContent)).toEqual(['2 pendientes', '1 en proceso', '1 terminada'])
  })

  it('la tarjeta dice si está vencida, si pide entregable y sus adjuntos; el título la abre', () => {
    const { props } = montar()
    const vencida = within(columna(/^Pendiente/)).getAllByRole('article')[0]
    expect(vencida).toHaveTextContent('Vencida, era para el 20 de nov')
    const conEntregable = itemDe('Matriz de riesgos')
    expect(conEntregable).toHaveTextContent('Pide entregable')
    expect(conEntregable).toHaveTextContent('2 adjuntos')
    expect(within(columna(/^En proceso/)).getByText('Vence hoy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Matriz de riesgos' }))
    expect(props.alAbrir).toHaveBeenCalledWith(2)
    // Un clic en otra parte de la tarjeta (no en un control) también la abre.
    fireEvent.click(within(conEntregable).getByText('Pide entregable'))
    expect(props.alAbrir).toHaveBeenCalledTimes(2)
  })

  it('una columna vacía muestra `vacio` o el texto por defecto, y el pie de columna', () => {
    montar({
      tareas: TAREAS.filter((t) => t.estado !== 'en_proceso' && t.estado !== 'terminada'),
      vacio: { en_proceso: <p>Nadie tiene tareas en proceso.</p> },
      pieColumna: { terminada: <a href="#todas">Ver todas las terminadas</a> },
    })
    expect(within(columna('En proceso: 0 tareas')).getByText('Nadie tiene tareas en proceso.')).toBeInTheDocument()
    const terminadas = columna('Terminada: 0 tareas')
    expect(within(terminadas).getByText('Sin tareas terminadas.')).toBeInTheDocument()
    expect(within(terminadas).getByRole('link', { name: 'Ver todas las terminadas' })).toBeInTheDocument()
  })
})

describe('Tablero: mover tareas', () => {
  it('sin alMover es de solo lectura: ni botones de mover ni arrastre', () => {
    montar()
    expect(screen.queryByRole('button', { name: /^Mover/ })).not.toBeInTheDocument()
    expect(itemDe('Matriz de riesgos')).not.toHaveAttribute('draggable')
  })

  it('los botones «Mover a …» (teclado y pantallas táctiles) llaman a alMover con la tarea y el destino', () => {
    const alMover = vi.fn<NonNullable<PropsTablero['alMover']>>()
    montar({ alMover })
    const tarjeta = itemDe('Matriz de riesgos')
    expect(within(tarjeta).getAllByRole('button', { name: /^Mover/ }).map((b) => b.textContent)).toEqual(['En proceso', 'Terminada'])

    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Mover «Matriz de riesgos» a En proceso' }))
    expect(alMover).toHaveBeenCalledTimes(1)
    expect(alMover).toHaveBeenCalledWith(TAREAS[1], 'en_proceso')
  })

  it('puedeMover decide qué destinos se ofrecen y cuáles reciben al arrastrar', () => {
    const alMover = vi.fn<NonNullable<PropsTablero['alMover']>>()
    const puedeMover = (tarea: TareaCrm, destino: EstadoTarea) => tarea.estado !== 'terminada' && destino !== 'terminada'
    montar({ alMover, puedeMover })

    const pendiente = itemDe('Matriz de riesgos')
    expect(within(pendiente).getAllByRole('button', { name: /^Mover/ }).map((b) => b.textContent)).toEqual(['En proceso'])
    expect(within(itemDe('Presentación al comité')).getAllByRole('button', { name: /^Mover/ }).map((b) => b.textContent)).toEqual([
      'Pendiente',
    ])
    // La terminada no se mueve: sin botones y sin arrastre.
    const terminada = itemDe('Seguimiento de octubre')
    expect(within(terminada).queryByRole('button', { name: /^Mover/ })).not.toBeInTheDocument()
    expect(terminada).not.toHaveAttribute('draggable')

    // Arrastrada, la columna Terminada no la recibe.
    fireEvent.dragStart(pendiente, { dataTransfer: transferencia() })
    expect(fireEvent.dragOver(columna(/^Terminada/), { dataTransfer: transferencia() })).toBe(true)
    fireEvent.drop(columna(/^Terminada/), { dataTransfer: transferencia() })
    expect(alMover).not.toHaveBeenCalled()
  })

  it('arrastrar y soltar en otra columna llama a alMover; mientras se arrastra se marcan los destinos', async () => {
    const alMover = vi.fn<NonNullable<PropsTablero['alMover']>>()
    montar({ alMover })
    const tarjeta = itemDe('Matriz de riesgos')
    expect(tarjeta).toHaveAttribute('draggable', 'true')

    fireEvent.dragStart(tarjeta, { dataTransfer: transferencia() })
    await act(async () => {
      await new Promise((listo) => setTimeout(listo, 0))
    })
    expect(columna(/^En proceso/)).toHaveAttribute('data-destino', 'si')
    expect(columna(/^Pendiente/)).toHaveAttribute('data-destino', 'origen')
    expect(tarjeta).toHaveAttribute('data-arrastrando')

    // Sobre su propia columna no se puede soltar (dragover no se cancela).
    expect(fireEvent.dragOver(columna(/^Pendiente/), { dataTransfer: transferencia() })).toBe(true)
    // Sobre otra sí: dragover se cancela y la columna se resalta.
    expect(fireEvent.dragOver(columna(/^En proceso/), { dataTransfer: transferencia() })).toBe(false)
    expect(columna(/^En proceso/)).toHaveAttribute('data-sobre')

    fireEvent.drop(columna(/^En proceso/), { dataTransfer: transferencia() })
    expect(alMover).toHaveBeenCalledWith(TAREAS[1], 'en_proceso')
    expect(columna(/^En proceso/)).not.toHaveAttribute('data-destino')
  })

  it('las tareas ocupadas se ven atenuadas, dicen «Guardando…» y no se mueven', () => {
    const alMover = vi.fn<NonNullable<PropsTablero['alMover']>>()
    montar({ alMover, ocupadas: new Set([3]) })
    const ocupada = itemDe('Presentación al comité')
    const tarjeta = within(ocupada).getByRole('article')
    expect(tarjeta).toHaveAttribute('aria-busy', 'true')
    expect(within(ocupada).getByRole('status')).toHaveTextContent('Guardando…')
    expect(ocupada).not.toHaveAttribute('draggable')

    const botones = within(ocupada).getAllByRole('button', { name: /^Mover/ })
    expect(botones.length).toBeGreaterThan(0)
    for (const boton of botones) {
      expect(boton).toBeDisabled()
      fireEvent.click(boton)
    }
    expect(alMover).not.toHaveBeenCalled()

    // Las demás sí se mueven.
    fireEvent.click(screen.getByRole('button', { name: 'Mover «Informe trimestral» a En proceso' }))
    expect(alMover).toHaveBeenCalledWith(TAREAS[0], 'en_proceso')
  })

  it('después de mover con un botón, el foco queda en la tarea dentro de su columna nueva', () => {
    function TableroConEstado() {
      const [tareas, setTareas] = useState(TAREAS)
      return (
        <Tablero
          tareas={tareas}
          hoy={HOY}
          alAbrir={() => {}}
          alMover={(tarea, destino) => setTareas((lista) => lista.map((t) => (t.id === tarea.id ? { ...t, estado: destino } : t)))}
        />
      )
    }
    render(<TableroConEstado />)
    fireEvent.click(screen.getByRole('button', { name: 'Mover «Matriz de riesgos» a En proceso' }))
    const enProceso = columna('En proceso: 2 tareas')
    const titulo = within(enProceso).getByRole('button', { name: 'Matriz de riesgos' })
    expect(titulo).toHaveFocus()
  })
})
