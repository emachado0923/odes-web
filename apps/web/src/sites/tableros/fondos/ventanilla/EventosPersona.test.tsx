import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EventosPersona from './EventosPersona'
import { FICHAS_EJEMPLO } from './ejemplo-fichas'
import type { FichaFondos } from './tipos'

const COLUMNAS = ['Fecha', 'Periodo', 'Evento', 'Detalle', 'Convocatoria', 'Fondo', 'Radicado PQRS']

/** La ficha de eventos de la persona ficticia: 4 eventos, de 2021 a 2025. */
function fichaDeEjemplo(): FichaFondos {
  const ficha = FICHAS_EJEMPLO.find((otra) => otra.p === 'EVENTOS')
  if (!ficha) throw new Error('ejemplo-fichas.ts ya no trae la ficha de eventos')
  return ficha
}

/** Una ficha de eventos hecha para la prueba. */
function fichaCon(filas: string[][], columnas: string[] = COLUMNAS): FichaFondos {
  return { p: 'EVENTOS', c: '', n: '', e: '', s: [], t: [['Historial de eventos', columnas, filas]] }
}

function pintar(ficha: FichaFondos, id = 'eventos') {
  return render(
    <div className="vc">
      <EventosPersona ficha={ficha} id={id} />
    </div>,
  )
}

/** Los títulos de los eventos, en el orden en que se leen. */
function titulos(): (string | null)[] {
  return screen.getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent)
}

/** El elemento de la línea de tiempo del evento con ese título. */
function entrada(titulo: string): HTMLElement {
  const elemento = screen.getByRole('heading', { level: 3, name: titulo }).closest('li')
  if (!elemento) throw new Error(`El evento «${titulo}» no está en la lista`)
  return elemento
}

describe('EventosPersona', () => {
  it('muestra el título, la cantidad de eventos y lleva en la raíz el id recibido', () => {
    pintar(fichaDeEjemplo(), 'saltar-aqui')

    expect(screen.getByRole('heading', { level: 2, name: 'Eventos reportados' })).toBeInTheDocument()
    expect(screen.getByText('4 eventos')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Eventos reportados' })).toHaveAttribute('id', 'saltar-aqui')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('escribe cada fecha para leer, en un <time> con la fecha ISO, sin correrla de día aunque traiga hora', () => {
    pintar(
      fichaCon([
        ['2025-03-04', '2025-1', 'Prórroga', '', '', '', ''],
        ['2025-03-01 00:00:00', '2025-1', 'Renuncia', '', '', '', ''],
        ['2024-12-31 23:59:59', '2024-2', 'Reintegro', '', '', '', ''],
      ]),
    )

    const fecha = screen.getByText('4 de marzo de 2025')
    expect(fecha.tagName).toBe('TIME')
    expect(fecha).toHaveAttribute('datetime', '2025-03-04')
    expect(screen.getByText('1 de marzo de 2025')).toHaveAttribute('datetime', '2025-03-01')
    expect(screen.getByText('31 de diciembre de 2024')).toHaveAttribute('datetime', '2024-12-31')
    expect(within(entrada('Prórroga')).getByText('Periodo 2025-1')).toBeInTheDocument()
  })

  it('pone primero lo más reciente y el botón de orden lo invierte y cambia su texto', () => {
    pintar(fichaDeEjemplo())

    expect(titulos()).toEqual([
      'Prórroga del periodo de gracia',
      'Estudiante obtiene grado',
      'Cambio de programa',
      'Suspensión temporal',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Ver primero los más antiguos' }))

    expect(titulos()).toEqual([
      'Suspensión temporal',
      'Cambio de programa',
      'Estudiante obtiene grado',
      'Prórroga del periodo de gracia',
    ])
    expect(screen.queryByRole('button', { name: 'Ver primero los más antiguos' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver primero los más recientes' }))
    expect(titulos()[0]).toBe('Prórroga del periodo de gracia')
  })

  it('filtra por tipo: lista cada tipo con su cantidad y «Todos», alterna aria-pressed y avisa cuántos se ven', () => {
    pintar(fichaDeEjemplo())

    const filtros = within(screen.getByRole('group', { name: 'Filtrar por tipo de evento' }))
    expect(filtros.getAllByRole('button')).toHaveLength(5)
    const todos = filtros.getByRole('button', { name: /^Todos.*4 eventos$/ })
    const cambio = filtros.getByRole('button', { name: /^Cambio de programa.*1 evento$/ })
    expect(filtros.getByRole('button', { name: /^Suspensión temporal.*1 evento$/ })).toBeInTheDocument()
    expect(todos).toHaveAttribute('aria-pressed', 'true')
    expect(cambio).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(cambio)

    expect(cambio).toHaveAttribute('aria-pressed', 'true')
    expect(todos).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 de 4 eventos')).toHaveAttribute('role', 'status')
    expect(titulos()).toEqual(['Cambio de programa'])

    // Volver a pulsar el tipo elegido lo suelta.
    fireEvent.click(cambio)

    expect(todos).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('1 de 4 eventos')).not.toBeInTheDocument()
    expect(titulos()).toHaveLength(4)
  })

  it('agrupa en un mismo filtro los tipos que solo difieren en mayúsculas o tildes', () => {
    pintar(
      fichaCon([
        ['2021-02-11', '', 'Suspensión temporal', '', '', '', ''],
        ['2022-02-11', '', 'SUSPENSION TEMPORAL', '', '', '', ''],
        ['2023-02-11', '', 'Renuncia', '', '', '', ''],
      ]),
    )

    const filtros = within(screen.getByRole('group', { name: 'Filtrar por tipo de evento' }))
    expect(filtros.getAllByRole('button')).toHaveLength(3)

    fireEvent.click(filtros.getByRole('button', { name: /^Suspensión temporal.*2 eventos$/ }))

    expect(screen.getByText('2 de 3 eventos')).toHaveAttribute('role', 'status')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('dice a qué beneficio corresponde cada evento, con el nombre corto del fondo y la convocatoria', () => {
    pintar(fichaDeEjemplo())
    expect(screen.getAllByText('Fondo EPM, convocatoria 2019-2')).toHaveLength(3)
    expect(
      within(entrada('Estudiante obtiene grado')).getByText('Mejores Bachilleres, convocatoria 2019-1'),
    ).toBeInTheDocument()
  })

  it('si falta el fondo o la convocatoria dice solo lo que hay, y un fondo desconocido se lee sin mayúsculas sostenidas', () => {
    pintar(
      fichaCon([
        ['2024-01-10', '', 'Solo convocatoria', '', '2020-1', '', ''],
        ['2024-01-11', '', 'Solo fondo', '', '', 'epm', ''],
        ['2024-01-12', '', 'Fondo desconocido', '', '2021-2', 'FONDO NUEVO', ''],
      ]),
    )

    expect(within(entrada('Solo convocatoria')).getByText('Convocatoria 2020-1')).toBeInTheDocument()
    expect(within(entrada('Solo fondo')).getByText('Fondo EPM')).toBeInTheDocument()
    expect(within(entrada('Fondo desconocido')).getByText('Fondo Nuevo, convocatoria 2021-2')).toBeInTheDocument()
  })

  it('ofrece copiar el radicado PQRS de cada evento que lo tiene, y nada donde no hay radicado', async () => {
    const writeText = vi.fn<(texto: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    pintar(fichaDeEjemplo())

    const sinRadicado = within(entrada('Suspensión temporal'))
    expect(sinRadicado.queryByText('Radicado PQRS')).not.toBeInTheDocument()
    expect(sinRadicado.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument()

    const conRadicado = within(entrada('Cambio de programa'))
    expect(conRadicado.getByText('202130045871')).toBeInTheDocument()
    // Cada botón nombra su radicado: hay tres en pantalla y no se confunden.
    expect(screen.getAllByRole('button', { name: /^Copiar el radicado/ })).toHaveLength(3)
    fireEvent.click(conRadicado.getByRole('button', { name: 'Copiar el radicado 202130045871' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('202130045871')
    })
  })

  it('recorta un detalle de más de 220 caracteres y «Ver todo» lo muestra completo', () => {
    const largo = Array.from({ length: 45 }, (_, i) => `palabra${i}`).join(' ')
    const justo = 'x'.repeat(220)
    pintar(
      fichaCon([
        ['2024-05-02', '', 'Reporte largo', largo, '', '', ''],
        ['2024-05-01', '', 'Reporte corto', justo, '', '', ''],
      ]),
    )
    expect(largo.length).toBeGreaterThan(220)

    expect(screen.queryByText(largo)).not.toBeInTheDocument()
    expect(within(entrada('Reporte corto')).getByText(justo)).toBeInTheDocument()
    expect(within(entrada('Reporte corto')).queryByRole('button')).not.toBeInTheDocument()

    const verTodo = screen.getByRole('button', { name: /^Ver todo/ })
    expect(verTodo).toHaveAttribute('aria-expanded', 'false')
    const detalle = document.getElementById(verTodo.getAttribute('aria-controls') ?? '')
    expect(detalle).not.toBeNull()
    expect(detalle).toHaveTextContent(/^palabra0 palabra1 .*…$/)

    fireEvent.click(verTodo)

    expect(detalle).toHaveTextContent(largo)
    const verMenos = screen.getByRole('button', { name: /^Ver menos/ })
    expect(verMenos).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(verMenos)
    expect(screen.queryByText(largo)).not.toBeInTheDocument()
  })

  it('deja al final, en los dos sentidos, los eventos sin fecha o con una fecha que no se puede leer, y esa se muestra tal cual', () => {
    pintar(
      fichaCon([
        ['', '', 'Sin fecha alguna', '', '', '', ''],
        ['2024-01-10', '', 'De 2024', '', '', '', ''],
        ['marzo de 2023', '', 'Fecha en palabras', '', '', '', ''],
        ['2025-02-31', '', 'Día que no existe', '', '', '', ''],
        ['0025-03-04', '', 'Año mal digitado', '', '', '', ''],
        ['2022-05-05', '', 'De 2022', '', '', '', ''],
      ]),
    )
    const alFinal = ['Sin fecha alguna', 'Fecha en palabras', 'Día que no existe', 'Año mal digitado']

    expect(titulos()).toEqual(['De 2024', 'De 2022', ...alFinal])
    expect(within(entrada('Sin fecha alguna')).getByText('Sin fecha')).toBeInTheDocument()
    const enPalabras = within(entrada('Fecha en palabras')).getByText('marzo de 2023')
    expect(enPalabras.tagName).not.toBe('TIME')
    expect(within(entrada('Día que no existe')).getByText('2025-02-31')).toBeInTheDocument()
    expect(within(entrada('Año mal digitado')).getByText('0025-03-04')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver primero los más antiguos' }))

    expect(titulos()).toEqual(['De 2022', 'De 2024', ...alFinal])
  })

  it('con un solo evento no ofrece filtros ni cambio de orden; con varios del mismo tipo, solo el orden', () => {
    const { unmount } = pintar(fichaCon([['2024-01-10', '2024-1', 'Renuncia', 'Entrega carta.', '', '', '']]))

    expect(screen.getByText('1 evento')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()

    pintar(
      fichaCon([
        ['2024-01-10', '', 'Renuncia', '', '', '', ''],
        ['2025-01-10', '', 'Renuncia', '', '', '', ''],
      ]),
    )
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver primero los más antiguos' })).toBeInTheDocument()
  })

  it('no pinta nada si no hay tabla, si no tiene filas o si todas vienen vacías', () => {
    const sinTabla: FichaFondos = { p: 'EVENTOS', c: '', n: '', e: '', s: [], t: [] }
    for (const ficha of [sinTabla, fichaCon([]), fichaCon([['', ' ', '', '', '', '', ''], []])]) {
      const { container, unmount } = render(<EventosPersona ficha={ficha} id="eventos" />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('pasa a oración un tipo en MAYÚSCULAS respetando la sigla, y deja igual el que ya trae minúsculas', () => {
    pintar(
      fichaCon([
        ['2024-01-10', '', 'CONVENIO ICETEX', '', '', '', ''],
        ['2024-01-09', '', 'Reintegro al Fondo', '', '', '', ''],
        ['2024-01-08', '', '', 'Reporte sin clasificar.', '', '', ''],
      ]),
    )

    expect(titulos()).toEqual(['Convenio ICETEX', 'Reintegro al Fondo', 'Evento sin tipo'])
    const filtros = within(screen.getByRole('group', { name: 'Filtrar por tipo de evento' }))
    expect(filtros.getByRole('button', { name: /^Convenio ICETEX.*1 evento$/ })).toBeInTheDocument()
    expect(filtros.getByRole('button', { name: /^Sin tipo.*1 evento$/ })).toBeInTheDocument()
  })

  it('funciona con las columnas en otro orden o ausentes, sin dejar huecos ni «undefined»', () => {
    const { container } = pintar(
      fichaCon(
        [
          ['Renuncia', '2024-01-10'],
          ['Reintegro', '2025-01-10'],
        ],
        ['Evento', 'Fecha'],
      ),
    )

    expect(titulos()).toEqual(['Reintegro', 'Renuncia'])
    expect(screen.getByText('10 de enero de 2025')).toHaveAttribute('datetime', '2025-01-10')
    expect(container).not.toHaveTextContent(/undefined|NaN|Periodo|Radicado|onvocatoria/)
  })

  it('al llegar la ficha de otra persona parte de cero el filtro y los detalles, y conserva el orden elegido', () => {
    const largo = Array.from({ length: 45 }, (_, i) => `palabra${i}`).join(' ')
    const otra = fichaCon([
      ['2023-01-10', '', 'Renuncia', largo, '', '', ''],
      ['2024-01-10', '', 'Reintegro', '', '', '', ''],
    ])
    const { rerender } = pintar(otra)

    fireEvent.click(screen.getByRole('button', { name: 'Ver primero los más antiguos' }))
    fireEvent.click(screen.getByRole('button', { name: /^Renuncia.*1 evento$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Ver todo/ }))
    expect(titulos()).toEqual(['Renuncia'])
    expect(screen.getByText(largo)).toBeInTheDocument()

    rerender(
      <div className="vc">
        <EventosPersona ficha={fichaDeEjemplo()} id="eventos" />
      </div>,
    )

    expect(screen.getByRole('button', { name: /^Todos.*4 eventos$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(titulos()).toEqual([
      'Suspensión temporal',
      'Cambio de programa',
      'Estudiante obtiene grado',
      'Prórroga del periodo de gracia',
    ])

    // Y al volver a la primera, su filtro y su detalle desplegado tampoco reaparecen.
    rerender(
      <div className="vc">
        <EventosPersona ficha={otra} id="eventos" />
      </div>,
    )
    expect(titulos()).toEqual(['Renuncia', 'Reintegro'])
    expect(screen.queryByText(largo)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ver todo/ })).toHaveAttribute('aria-expanded', 'false')
  })
})
