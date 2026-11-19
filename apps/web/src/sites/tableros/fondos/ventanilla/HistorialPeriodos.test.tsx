import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import HistorialPeriodos from './HistorialPeriodos'
import { FICHAS_EJEMPLO, FICHAS_EJEMPLO_UNA, fichaEjemploLarga } from './ejemplo-fichas'
import type { FichaFondos } from './tipos'

function ficha(programa: string): FichaFondos {
  const hallada = [...FICHAS_EJEMPLO, ...FICHAS_EJEMPLO_UNA].find((una) => una.p === programa)
  if (!hallada) throw new Error(`No hay ficha de ejemplo del programa ${programa}`)
  return structuredClone(hallada)
}

function envuelta(datos: FichaFondos) {
  return (
    <div className="tablero-fondos vc">
      <HistorialPeriodos ficha={datos} />
    </div>
  )
}

function pintar(datos: FichaFondos) {
  return render(envuelta(datos))
}

function pista(): HTMLElement {
  return screen.getByRole('toolbar', { name: /Periodos del beneficio/ })
}

function paradas(): HTMLElement[] {
  return within(pista()).getAllByRole('button')
}

function parada(periodo: string): HTMLElement {
  return within(pista()).getByRole('button', { name: new RegExp(`^${periodo},`) })
}

/** El panel del periodo elegido: la zona que se anuncia al cambiar. */
function detalle(contenedor: HTMLElement): HTMLElement {
  const panel = contenedor.querySelector<HTMLElement>('[aria-live="polite"]')
  if (!panel) throw new Error('No está el detalle del periodo')
  return panel
}

function abrirTabla(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /Ver la tabla completa/ }))
  return screen.getByRole('table')
}

function caja(top: number, alto: number, ancho = 300): DOMRect {
  return { x: 0, y: top, top, left: 0, width: ancho, height: alto, right: ancho, bottom: top + alto, toJSON: () => ({}) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HistorialPeriodos', () => {
  it('muestra el título, el recorrido dicho en palabras y, por defecto, el último periodo', () => {
    const { container } = pintar(ficha('EPM'))

    expect(screen.getByRole('heading', { level: 4, name: 'Recorrido por periodo' })).toBeInTheDocument()
    expect(screen.getByText(/13 periodos, de 2019-2 a 2025-2/)).toBeInTheDocument()

    expect(parada('2025-2')).toHaveAttribute('aria-pressed', 'true')
    const panel = within(detalle(container))
    expect(panel.getByText('2025-2')).toBeInTheDocument()
    expect(panel.getByText('Notificado')).toBeInTheDocument()
    expect(panel.getByText('Paso al cobro a sapiencia')).toBeInTheDocument()
    expect(screen.getByText('Periodo 13 de 13')).toBeInTheDocument()
  })

  it('tiene un botón por periodo cuyo nombre dice el periodo, el estado legible y el giro', () => {
    pintar(ficha('EPM'))

    expect(paradas()).toHaveLength(13)
    expect(within(pista()).getByRole('button', { name: '2021-1, Suspensión temporal, sin giro' })).toBeInTheDocument()
    expect(within(pista()).getByRole('button', { name: /^2019-2, Activo, giro de \$\s3\.835\.000$/ })).toBeInTheDocument()
    expect(within(pista()).getByRole('button', { name: '2024-2, Periodo de gracia, sin giro' })).toBeInTheDocument()
  })

  it('al pulsar otra parada el detalle pasa a ese periodo, con su estado, motivo y campos', () => {
    const { container } = pintar(ficha('EPM'))

    fireEvent.click(parada('2021-1'))
    let panel = within(detalle(container))
    expect(parada('2021-1')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2025-2')).toHaveAttribute('aria-pressed', 'false')
    expect(panel.getByText('2021-1')).toBeInTheDocument()
    expect(panel.getByText('Primer semestre de 2021')).toBeInTheDocument()
    expect(panel.getByText('Suspensión temporal')).toBeInTheDocument()
    expect(panel.getByText('No presentación oportuna de los documentos')).toBeInTheDocument()
    expect(panel.getByText('Sin giro')).toBeInTheDocument()
    expect(screen.getByText('Periodo 4 de 13')).toBeInTheDocument()

    fireEvent.click(parada('2019-2'))
    panel = within(detalle(container))
    expect(panel.getByText('Segundo semestre de 2019')).toBeInTheDocument()
    expect(panel.getByText('Legalizado')).toBeInTheDocument()
    expect(panel.getByText('Girado en el periodo')).toBeInTheDocument()
    expect(panel.getByText(/^\$\s3\.835\.000$/)).toBeInTheDocument()
    expect(panel.getByText('Sostenimiento')).toBeInTheDocument()
    expect(panel.getByText(/^\$\s1\.300\.000$/)).toBeInTheDocument()
    expect(panel.getByText('Giros pendientes')).toBeInTheDocument()
    expect(panel.getByText('7')).toBeInTheDocument()
  })

  it('con el teclado, las flechas, Inicio y Fin mueven el foco y la selección, y solo la elegida entra al tabulador', () => {
    pintar(ficha('EPM'))
    const elegidas = () => paradas().filter((boton) => boton.tabIndex === 0)

    expect(elegidas()).toEqual([parada('2025-2')])

    parada('2025-2').focus()
    fireEvent.keyDown(parada('2025-2'), { key: 'ArrowLeft' })
    expect(parada('2025-1')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2025-1')).toHaveFocus()
    expect(elegidas()).toEqual([parada('2025-1')])

    fireEvent.keyDown(parada('2025-1'), { key: 'Home' })
    expect(parada('2019-2')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2019-2')).toHaveFocus()

    // En el primer periodo la flecha izquierda no sale del recorrido.
    fireEvent.keyDown(parada('2019-2'), { key: 'ArrowLeft' })
    expect(parada('2019-2')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(parada('2019-2'), { key: 'ArrowRight' })
    expect(parada('2020-1')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2020-1')).toHaveFocus()

    fireEvent.keyDown(parada('2020-1'), { key: 'End' })
    expect(parada('2025-2')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2025-2')).toHaveFocus()

    fireEvent.keyDown(parada('2025-2'), { key: 'ArrowRight' })
    expect(parada('2025-2')).toHaveAttribute('aria-pressed', 'true')
    expect(elegidas()).toEqual([parada('2025-2')])
  })

  it('los botones de periodo anterior y siguiente recorren la línea', () => {
    pintar(ficha('EPM'))

    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
    expect(parada('2025-1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Periodo 12 de 13')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('la leyenda lista los estados presentes con su cantidad y sus botones alternan el resaltado', () => {
    pintar(ficha('EPM'))
    const leyenda = within(screen.getByRole('list', { name: 'Estados del recorrido' }))

    const activo = leyenda.getByRole('button', { name: /^Activo\s+8\s+periodos$/ })
    const suspension = leyenda.getByRole('button', { name: /^Suspensión\s+1\s+periodo$/ })
    expect(leyenda.getByRole('button', { name: /^Periodo de gracia\s+2\s+periodos$/ })).toBeInTheDocument()
    expect(activo).toHaveAttribute('aria-pressed', 'false')
    expect(leyenda.queryByRole('button', { name: 'Ver todos' })).not.toBeInTheDocument()

    fireEvent.click(activo)
    expect(activo).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(suspension)
    expect(activo).toHaveAttribute('aria-pressed', 'false')
    expect(suspension).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(leyenda.getByRole('button', { name: 'Ver todos' }))
    expect(suspension).toHaveAttribute('aria-pressed', 'false')
    expect(leyenda.queryByRole('button', { name: 'Ver todos' })).not.toBeInTheDocument()
  })

  it('con un solo estado en todo el recorrido la leyenda informa pero no es interactiva', () => {
    pintar(ficha('FA'))
    const leyenda = within(screen.getByRole('list', { name: 'Estados del recorrido' }))

    expect(leyenda.getByText('Activo')).toBeInTheDocument()
    expect(leyenda.getByText('4')).toBeInTheDocument()
    expect(leyenda.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/4 periodos, de 2023-2 a 2025-1\. Activo en todos\./)).toBeInTheDocument()
  })

  it('«Ver la tabla completa» abre la tabla con sus encabezados y el total girado, y «Ocultar la tabla» la quita', () => {
    pintar(ficha('EPM'))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const alternar = screen.getByRole('button', { name: /Ver la tabla completa/ })
    expect(alternar).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(alternar)
    const tabla = within(screen.getByRole('table'))
    expect(alternar).toHaveAttribute('aria-expanded', 'true')
    expect(tabla.getByRole('columnheader', { name: 'Periodo' })).toBeInTheDocument()
    expect(tabla.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
    expect(tabla.getByRole('columnheader', { name: 'Monto total' })).toBeInTheDocument()
    // Encabezado, trece periodos y el pie.
    expect(tabla.getAllByRole('row')).toHaveLength(15)
    expect(tabla.getByRole('rowheader', { name: 'Total girado' })).toBeInTheDocument()
    expect(tabla.getByText(/^\$\s33\.060\.000$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Ocultar la tabla/ }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver la tabla completa/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('pulsar el periodo de una fila de la tabla elige ese periodo en la pista y en el detalle', () => {
    const { container } = pintar(ficha('EPM'))
    const tabla = within(abrirTabla())

    expect(tabla.getByRole('button', { name: '2025-2' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(tabla.getByRole('button', { name: '2020-2' }))

    expect(tabla.getByRole('button', { name: '2020-2' })).toHaveAttribute('aria-pressed', 'true')
    expect(tabla.getByRole('button', { name: '2025-2' })).toHaveAttribute('aria-pressed', 'false')
    expect(parada('2020-2')).toHaveAttribute('aria-pressed', 'true')
    expect(within(detalle(container)).getByText('2020-2')).toBeInTheDocument()
    expect(screen.getByText('Periodo 3 de 13')).toBeInTheDocument()
  })

  it('los valores en mayúsculas se leen con tildes y siglas, en el detalle y en la tabla', () => {
    const datos = ficha('EPM')
    const primera = datos.t[0]?.[2][0]
    if (!primera) throw new Error('La ficha de ejemplo no trae filas')
    primera[3] = 'CONVENIO ICETEX'
    const { container } = pintar(datos)

    expect(within(detalle(container)).getByText('Matrícula y sostenimiento')).toBeInTheDocument()
    fireEvent.click(parada('2019-2'))
    expect(within(detalle(container)).getByText('Convenio ICETEX')).toBeInTheDocument()

    const tabla = within(abrirTabla())
    expect(tabla.getAllByText('Matrícula y sostenimiento')).toHaveLength(12)
    expect(tabla.getByText('Convenio ICETEX')).toBeInTheDocument()
    expect(screen.queryByText(/MATRICULA|Matricula|icetex/)).not.toBeInTheDocument()
    // Las cifras no se tocan.
    expect(tabla.getAllByText(/^\$\s3\.835\.000$/)).toHaveLength(1)
  })

  it('con un solo periodo no dibuja la pista y muestra el detalle con sus giros', () => {
    const { container } = pintar(ficha('EM'))

    expect(screen.getByRole('heading', { level: 4, name: 'Recorrido por periodo' })).toBeInTheDocument()
    expect(screen.getByText('Un solo periodo, 2022-2.')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Estados del recorrido' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Periodo anterior' })).not.toBeInTheDocument()

    const panel = within(detalle(container))
    expect(panel.getByText('2022-2')).toBeInTheDocument()
    expect(panel.getByText(/^Condonación total$/i)).toBeInTheDocument()
    expect(panel.getByText('Girado en el periodo')).toBeInTheDocument()
    expect(panel.getByText(/^\$\s31\.100\.435$/)).toBeInTheDocument()
    expect(panel.getByText('Giro 1 ICETEX')).toBeInTheDocument()
    expect(panel.getByText(/^\$\s11\.100\.435$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver la tabla completa/ })).toBeInTheDocument()
  })

  it('sin tabla no pinta nada; sin columna «Periodo» muestra solo la tabla', () => {
    const sinTabla = pintar({ ...ficha('FA'), t: [] })
    expect(sinTabla.container.firstElementChild).toBeEmptyDOMElement()
    sinTabla.unmount()

    const datos = ficha('FA')
    datos.t = datos.t.map(([titulo, columnas, filas]) => [titulo, columnas.slice(1), filas.map((fila) => fila.slice(1))])
    pintar(datos)

    expect(screen.getByRole('heading', { level: 4, name: 'Historial por periodo' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tabla/ })).not.toBeInTheDocument()
    const tabla = within(screen.getByRole('table'))
    expect(tabla.queryByRole('columnheader', { name: 'Periodo' })).not.toBeInTheDocument()
    expect(tabla.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
    expect(tabla.getAllByText('Condonable')).toHaveLength(4)
    expect(tabla.queryByRole('button')).not.toBeInTheDocument()
  })

  it('un recorrido de 49 periodos tiene 49 paradas y arranca en la última, sin datos rotos', () => {
    const { container } = pintar(fichaEjemploLarga())

    expect(paradas()).toHaveLength(49)
    expect(screen.getByText(/49 periodos, de 2005-2 a 2026-3/)).toBeInTheDocument()
    expect(within(pista()).getByRole('button', { name: /^2026-3, .+, sin giro$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(paradas().filter((boton) => boton.tabIndex === 0)).toHaveLength(1)
    const panel = within(detalle(container))
    expect(panel.getByText('Intersemestral de 2026')).toBeInTheDocument()
    expect(screen.getByText('Periodo 49 de 49')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/NaN|undefined|null/)
  })

  it('al cambiar de beneficio vuelve al último periodo del nuevo y cierra la tabla', () => {
    const { rerender } = pintar(ficha('EPM'))
    fireEvent.click(parada('2019-2'))
    abrirTabla()

    rerender(envuelta(ficha('MB')))

    expect(paradas()).toHaveLength(7)
    expect(parada('2022-1')).toHaveAttribute('aria-pressed', 'true')
    expect(parada('2019-2')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Periodo 7 de 7')).toBeInTheDocument()
  })

  it('con la tabla abierta, la fila del periodo elegido queda a la vista dentro del marco sin mover la página', () => {
    // Marco de 200 px que empieza en 100; encabezado y pie pegados de 30 px; filas de 40 px.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function medir(this: Element) {
      if (this.getAttribute('role') === 'region') return caja(100, 200)
      if (this.tagName === 'THEAD' || this.tagName === 'TFOOT') return caja(0, 30)
      const cuerpo = this.parentElement
      if (this.tagName === 'TR' && cuerpo && cuerpo.tagName === 'TBODY') {
        const corrido = this.closest('[role="region"]')?.scrollTop ?? 0
        return caja(130 + Array.from(cuerpo.children).indexOf(this) * 40 - corrido, 40)
      }
      return caja(0, 0, 0)
    })
    const pagina = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    pintar(ficha('EPM'))
    abrirTabla()
    const marco = screen.getByRole('region', { name: /tabla completa/ })
    Object.defineProperty(marco, 'scrollTop', { value: 0, writable: true, configurable: true })

    // La primera fila ya se ve: no se mueve nada.
    fireEvent.click(parada('2019-2'))
    expect(marco.scrollTop).toBe(0)

    // La última queda debajo del marco: baja lo justo para que asome sobre el pie.
    fireEvent.click(parada('2025-2'))
    expect(marco.scrollTop).toBe(380)

    // La segunda quedó arriba, tapada: sube hasta dejarla bajo el encabezado.
    fireEvent.click(parada('2020-1'))
    expect(marco.scrollTop).toBe(40)

    expect(pagina).not.toHaveBeenCalled()
  })
})
