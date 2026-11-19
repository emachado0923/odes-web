import type { Ref } from 'react'
import type { SentidoGiro } from '../visor/VisorEdificio'
import Icono from './Icono'

interface PropsBarraControles {
  /** Contenedor de la ayuda y la barra (Edificio3D lo usa para ubicar el aviso de la rueda). */
  ref?: Ref<HTMLDivElement>
  /** Botón de pausa del giro: recibe el foco cuando desaparece la tarjeta de carga que lo tenía. */
  refBotonGiro?: Ref<HTMLButtonElement>
  rotacionActiva: boolean
  /** Pantalla táctil: cambia el texto de ayuda. */
  tactil: boolean
  onAlternarRotacion: () => void
  onGirar: (sentido: SentidoGiro) => void
  onAcercar: () => void
  onAlejar: () => void
}

/**
 * Ayuda y barra de controles del bloque del edificio, abajo a la derecha de
 * la zona libre: pausa del giro automático (primero, WCAG 2.2.2), girar y
 * acercar con botones (alternativa al arrastre y al pellizco para teclado y
 * para un solo dedo).
 */
export default function BarraControles({
  ref,
  refBotonGiro,
  rotacionActiva,
  tactil,
  onAlternarRotacion,
  onGirar,
  onAcercar,
  onAlejar,
}: PropsBarraControles) {
  const etiquetaGiro = rotacionActiva ? 'Detener el giro automático' : 'Reanudar el giro automático'

  return (
    <div ref={ref} className="ed-controles">
      <p className="ed-ayuda">
        <Icono nombre="girar360" />
        <span>
          {tactil
            ? 'Desliza a los lados para girar. Pellizca para acercar.'
            : 'Arrastra para girar. Doble clic: ir a la entrada.'}
        </span>
      </p>
      <div className="ed-barra" role="group" aria-label="Controles del edificio en 3D">
        <button
          ref={refBotonGiro}
          type="button"
          className={rotacionActiva ? 'ed-control ed-giro' : 'ed-control ed-giro ed-detenido'}
          aria-label={etiquetaGiro}
          title={etiquetaGiro}
          onClick={onAlternarRotacion}
        >
          <Icono nombre={rotacionActiva ? 'pausa' : 'reproducir'} />
        </button>
        <button
          type="button"
          className="ed-control"
          aria-label="Girar a la izquierda"
          title="Girar a la izquierda"
          onClick={() => onGirar('izquierda')}
        >
          <Icono nombre="girarIzquierda" />
        </button>
        <button
          type="button"
          className="ed-control"
          aria-label="Girar a la derecha"
          title="Girar a la derecha"
          onClick={() => onGirar('derecha')}
        >
          <Icono nombre="girarDerecha" />
        </button>
        <button type="button" className="ed-control" aria-label="Acercar" title="Acercar" onClick={onAcercar}>
          <Icono nombre="acercar" />
        </button>
        <button type="button" className="ed-control" aria-label="Alejar" title="Alejar" onClick={onAlejar}>
          <Icono nombre="alejar" />
        </button>
      </div>
    </div>
  )
}
