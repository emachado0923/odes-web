/**
 * Pestañas de los seis bimestres para los modales (patrón "tabs" de ARIA con
 * el marcado nav-tabs del kit): flechas izquierda/derecha, Inicio y Fin
 * mueven la selección; solo la pestaña elegida está en el orden del Tab.
 * El panel (role=tabpanel) lo dibuja quien las usa, con `idPanel`.
 */
import type { KeyboardEvent, ReactNode, Ref } from 'react'
import { NUMEROS_BIMESTRE, infoBimestre, type NumeroBimestre } from '../api-pai'
import { idPestana } from './idsModales'

export interface PropsPestanasBimestre {
  /** Prefijo de los id de las pestañas (único en la página). */
  id: string
  idPanel: string
  bimestre: NumeroBimestre
  onCambiar: (bimestre: NumeroBimestre) => void
  /** Algo junto al número (insignia de conteo, marca de editable). */
  marca?: (bimestre: NumeroBimestre) => ReactNode
  /** Texto extra para lectores de pantalla (p. ej., ", editable"). */
  descripcion?: (bimestre: NumeroBimestre) => string
  deshabilitadas?: boolean
  /** Ref de la pestaña elegida (para el foco inicial del modal). */
  refElegida?: Ref<HTMLButtonElement>
}

export default function PestanasBimestre({
  id,
  idPanel,
  bimestre,
  onCambiar,
  marca,
  descripcion,
  deshabilitadas = false,
  refElegida,
}: PropsPestanasBimestre) {
  function enfocar(siguiente: NumeroBimestre) {
    onCambiar(siguiente)
    document.getElementById(idPestana(id, siguiente))?.focus()
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const teclas: Record<string, () => NumeroBimestre> = {
      ArrowRight: () => (bimestre === 6 ? 1 : bimestre + 1) as NumeroBimestre,
      ArrowLeft: () => (bimestre === 1 ? 6 : bimestre - 1) as NumeroBimestre,
      Home: () => 1,
      End: () => 6,
    }
    const destino = teclas[evento.key]
    if (!destino || deshabilitadas) return
    evento.preventDefault()
    enfocar(destino())
  }

  return (
    <div className="nav nav-tabs pai-pestanas" role="tablist" aria-label="Bimestre" onKeyDown={alTeclear}>
      {NUMEROS_BIMESTRE.map((b) => {
        const info = infoBimestre(b)
        const elegida = b === bimestre
        return (
          <button
            key={b}
            ref={elegida ? refElegida : undefined}
            type="button"
            role="tab"
            id={idPestana(id, b)}
            className={`nav-link pai-pestana${elegida ? ' active' : ''}`}
            aria-selected={elegida}
            aria-controls={idPanel}
            tabIndex={elegida ? 0 : -1}
            disabled={deshabilitadas && !elegida}
            title={`${info.nombre}, ${info.meses}`}
            onClick={() => onCambiar(b)}
          >
            <span aria-hidden="true">B{b}</span>
            <span className="pai-solo-lector">
              {info.nombre}
              {descripcion?.(b) ?? ''}
            </span>
            {marca?.(b)}
          </button>
        )
      })}
    </div>
  )
}
