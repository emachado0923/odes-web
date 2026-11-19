import { Component, type ReactNode } from 'react'

/**
 * Resguardo de una parte del expediente: si una pieza falla al pintarse (un dato con una forma que nadie
 * previó), se muestra un aviso en su lugar y el resto del expediente sigue en pantalla. Sin esto, un solo
 * beneficio raro dejaría la página en blanco. No registra ni muestra el contenido de la ficha.
 */
export default class Resguardo extends Component<{ que: string; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }

  static getDerivedStateFromError(): { fallo: boolean } {
    return { fallo: true }
  }

  render(): ReactNode {
    if (!this.state.fallo) return this.props.children
    return (
      <div className="vc-resguardo" role="alert">
        <b>No se pudo mostrar {this.props.que}.</b> El resto del expediente está completo. Si se repite, avise al equipo de
        datos con el documento consultado.
      </div>
    )
  }
}
