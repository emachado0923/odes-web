import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import Buscador, { CargandoResultado, type PropsBuscador, SinResultados } from './Buscador'
import { CORTE_DATOS } from './ficha'
import { FICHAS_EJEMPLO, FICHAS_EJEMPLO_UNA } from './ejemplo-fichas'
import type { ConsultaReciente } from './tipos'

const RECIENTES: ConsultaReciente[] = [
  { documento: '999000111', nombre: FICHAS_EJEMPLO[0].n, beneficios: 3 },
  { documento: '999000222', nombre: FICHAS_EJEMPLO_UNA[0].n, beneficios: 1 },
]

function propsBase(cambios: Partial<PropsBuscador> = {}): PropsBuscador {
  return {
    documento: '',
    alCambiar: vi.fn<PropsBuscador['alCambiar']>(),
    alConsultar: vi.fn<PropsBuscador['alConsultar']>(),
    buscando: false,
    error: null,
    recientes: [],
    compacto: false,
    ...cambios,
  }
}

function montar(cambios: Partial<PropsBuscador> = {}) {
  const props = propsBase(cambios)
  const vista = render(
    <div className="vc">
      <Buscador {...props} />
    </div>,
  )
  /** Vuelve a pintar el mismo buscador con otros props (como hace la página). */
  const pintar = (nuevos: Partial<PropsBuscador>) =>
    vista.rerender(
      <div className="vc">
        <Buscador {...props} {...nuevos} />
      </div>,
    )
  return { props, pintar, ...vista }
}

function campo(): HTMLElement {
  return screen.getByLabelText('Número de documento')
}

describe('Buscador: el campo y la consulta', () => {
  it('asocia la etiqueta «Número de documento» al campo y le describe cómo se consultará lo escrito', () => {
    montar({ documento: '1.000 547-866' })
    expect(within(screen.getByRole('search')).getByRole('textbox', { name: 'Número de documento' })).toBe(campo())
    expect(campo()).toHaveValue('1.000 547-866')
    // Puntos, espacios y guiones no cuentan: se ve el documento como se va a buscar.
    expect(screen.getByText('1.000.547.866')).toBeVisible()
    expect(campo()).toHaveAccessibleDescription(/Se consultará 1\.000\.547\.866/)
  })

  it('deja «Consultar» deshabilitado sin documento (vacío, espacios o solo signos) y lo habilita con texto', () => {
    const { pintar } = montar({ documento: '' })
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled()
    pintar({ documento: '   ' })
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled()
    pintar({ documento: ' .-. ' })
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled()
    pintar({ documento: '999000111' })
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled()
  })

  it('al escribir avisa con alCambiar y al enviar llama alConsultar sin argumentos', () => {
    const { props } = montar({ documento: '99900011' })
    fireEvent.change(campo(), { target: { value: '999000111' } })
    expect(props.alCambiar).toHaveBeenCalledWith('999000111')

    fireEvent.submit(screen.getByRole('search'))
    expect(props.alConsultar).toHaveBeenCalledTimes(1)
    expect(props.alConsultar).toHaveBeenCalledWith()
  })

  it('borra el documento con el botón «Borrar el documento» y con Escape en el campo; vacío, no ofrece borrar', () => {
    const { props, pintar } = montar({ documento: '999000111' })
    fireEvent.click(screen.getByRole('button', { name: 'Borrar el documento' }))
    expect(props.alCambiar).toHaveBeenLastCalledWith('')
    expect(campo()).toHaveFocus()

    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(props.alCambiar).toHaveBeenCalledTimes(2)
    expect(props.alCambiar).toHaveBeenLastCalledWith('')

    pintar({ documento: '' })
    expect(screen.queryByRole('button', { name: 'Borrar el documento' })).not.toBeInTheDocument()
  })

  it('mientras consulta, el botón dice «Consultando…», queda deshabilitado y el formulario se marca ocupado', () => {
    montar({ documento: '999000111', buscando: true })
    expect(screen.getByRole('button', { name: 'Consultando…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Consultar' })).not.toBeInTheDocument()
    expect(screen.getByRole('search')).toHaveAttribute('aria-busy', 'true')
  })

  it('muestra el error en una alerta, con qué hacer', () => {
    montar({ documento: '999000111', error: 'No se pudo hacer la consulta' })
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo hacer la consulta')
    expect(alerta).toHaveTextContent(/consulte de nuevo/)
  })
})

describe('Buscador: el atajo «/»', () => {
  it('lleva el foco al campo desde cualquier parte de la página, y deja de escuchar al desmontarse', () => {
    const { unmount } = montar({ documento: '999000111' })
    campo().blur()
    expect(campo()).not.toHaveFocus()

    // fireEvent devuelve false cuando alguien canceló la tecla: no llega a
    // escribirse ni abre la búsqueda rápida del navegador.
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    expect(campo()).toHaveFocus()

    unmount()
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(true)
  })

  it('no interrumpe a quien escribe en otro campo', () => {
    render(
      <div className="vc">
        <input aria-label="Otro campo" />
        <Buscador {...propsBase()} />
      </div>,
    )
    const otro = screen.getByLabelText('Otro campo')
    otro.focus()

    expect(fireEvent.keyDown(otro, { key: '/' })).toBe(true)
    expect(otro).toHaveFocus()
  })

  it('no actúa cuando la ventanilla está oculta dentro de un contenedor hidden', () => {
    render(
      <div>
        <button type="button">Tablero</button>
        <div hidden>
          <Buscador {...propsBase()} />
        </div>
      </div>,
    )
    const delTablero = screen.getByRole('button', { name: 'Tablero' })
    delTablero.focus()

    expect(fireEvent.keyDown(delTablero, { key: '/' })).toBe(true)
    expect(delTablero).toHaveFocus()
    expect(campo()).not.toHaveFocus()
  })
})

describe('Buscador: consultas recientes', () => {
  it('en la entrada lista un botón por consulta, con nombre y documento con formato, y al pulsarlo consulta ese documento', () => {
    // La misma persona consultada dos veces sale una sola vez.
    const { props } = montar({ recientes: [...RECIENTES, RECIENTES[0]] })
    const lista = screen.getByRole('list', { name: 'Consultas de esta sesión' })
    expect(within(lista).getAllByRole('button')).toHaveLength(2)

    const deMaria = within(lista).getByRole('button', { name: /Maria Fernanda Restrepo de la Ossa.*999\.000\.111/ })
    expect(deMaria).toHaveTextContent('3 beneficios')
    expect(within(lista).getByRole('button', { name: /999\.000\.222/ })).toHaveTextContent('1 beneficio')

    fireEvent.click(deMaria)
    expect(props.alConsultar).toHaveBeenCalledWith('999000111')
    expect(props.alCambiar).toHaveBeenCalledWith('999000111')
  })

  it('en la barra compacta el panel «Recientes» abre y cierra, y lo anuncia con aria-expanded', () => {
    montar({ documento: '999000111', compacto: true, recientes: RECIENTES })
    const alternar = screen.getByRole('button', { name: /Recientes/ })
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Consultas de esta sesión' })).not.toBeInTheDocument()

    fireEvent.click(alternar)
    expect(alternar).toHaveAttribute('aria-expanded', 'true')
    const lista = screen.getByRole('list', { name: 'Consultas de esta sesión' })
    expect(within(lista).getAllByRole('button')).toHaveLength(2)
    // aria-controls apunta al panel que de verdad contiene la lista.
    const idPanel = alternar.getAttribute('aria-controls') ?? ''
    expect(idPanel).not.toBe('')
    expect(document.getElementById(idPanel)).toContainElement(lista)

    fireEvent.click(alternar)
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Consultas de esta sesión' })).not.toBeInTheDocument()
  })

  it('el panel de la barra se cierra con Escape, con un clic fuera y al elegir una consulta, sin perder el foco', () => {
    const props = propsBase({ documento: '999000111', compacto: true, recientes: RECIENTES })
    render(
      <div className="vc">
        <Buscador {...props} />
        <div data-testid="expediente">Expediente</div>
      </div>,
    )
    const alternar = screen.getByRole('button', { name: /Recientes/ })

    fireEvent.click(alternar)
    const primera = within(screen.getByRole('list', { name: 'Consultas de esta sesión' })).getAllByRole('button')[0]
    primera.focus()
    fireEvent.keyDown(primera, { key: 'Escape' })
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(alternar).toHaveFocus()

    fireEvent.click(alternar)
    expect(alternar).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(screen.getByTestId('expediente'))
    expect(alternar).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(alternar)
    fireEvent.click(screen.getByRole('button', { name: /999\.000\.222/ }))
    expect(props.alConsultar).toHaveBeenCalledWith('999000222')
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(alternar).toHaveFocus()
  })
})

describe('Buscador: el aviso de error de la barra compacta', () => {
  it('se puede cerrar y reaparece en la siguiente consulta que falle igual; sin consultas no ofrece «Recientes»', () => {
    const { pintar } = montar({ documento: '999000111', compacto: true, error: 'Sin conexión' })
    expect(screen.queryByRole('button', { name: /Recientes/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(campo()).toHaveFocus()

    // Otra consulta (aquí la lanza la página, no el formulario) vuelve a fallar con el mismo mensaje.
    pintar({ buscando: true })
    pintar({ buscando: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión')
  })
})

describe('Estados vecinos de la consulta', () => {
  it('CargandoResultado anuncia «Consultando…» como estado; SinResultados dice el documento con formato y orienta qué revisar', () => {
    const cargando = render(<CargandoResultado />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando…')
    cargando.unmount()

    render(<SinResultados documento="1000547866" />)
    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent('No hay beneficios registrados con el documento 1.000.547.866')
    expect(aviso).toHaveTextContent(/tarjeta de identidad/)
    expect(aviso).toHaveTextContent(`corte al ${CORTE_DATOS}`)
    expect(within(aviso).getAllByRole('listitem')).toHaveLength(3)
  })
})
