import { useState, type CSSProperties } from 'react'
import { PREGUNTAS } from './preguntas'

const ID_RESPUESTA = 'odes-ingreso-respuesta'

/**
 * Cuatro preguntas unidas por una línea, como una constelación: la elegida se
 * rellena, la línea avanza hasta ella y su respuesta aparece debajo (en una
 * región aria-live que no se vuelve a crear, para que el lector la anuncie).
 *
 * La caja de la respuesta mide lo que la más larga: las cuatro van también,
 * invisibles y ocultas al lector, en la misma celda (ingreso.css). Así el
 * bloque no salta al cambiar de pregunta y puede ir centrado entre la franja y
 * el planeta sin reservar espacio de más.
 */
export default function Constelacion() {
  const [activa, setActiva] = useState(0)

  return (
    <div className="odes-ingreso__constelacion">
      <div className="odes-ingreso__nodos" style={{ '--odes-nodo': activa } as CSSProperties}>
        {PREGUNTAS.map((pregunta, i) => (
          <button
            key={pregunta.rotulo}
            type="button"
            className="odes-ingreso__nodo"
            aria-pressed={i === activa}
            aria-controls={ID_RESPUESTA}
            onClick={() => setActiva(i)}
          >
            <span className="odes-ingreso__circulo">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {pregunta.icono}
              </svg>
            </span>
            <span className="odes-ingreso__rotulo">{pregunta.rotulo}</span>
          </button>
        ))}
      </div>
      <div className="odes-ingreso__respuesta">
        <p id={ID_RESPUESTA} className="odes-ingreso__respuesta-texto" aria-live="polite">
          {/* La clave vuelve a montar el texto para repetir su entrada suave. */}
          <span key={activa} className="odes-ingreso__respuesta-entrada">
            {PREGUNTAS[activa].respuesta}
          </span>
        </p>
        {PREGUNTAS.map((pregunta) => (
          <p key={pregunta.rotulo} className="odes-ingreso__respuesta-molde" aria-hidden="true">
            {pregunta.respuesta}
          </p>
        ))}
      </div>
    </div>
  )
}
