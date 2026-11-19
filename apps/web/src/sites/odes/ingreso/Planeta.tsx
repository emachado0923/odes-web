import { useEffect, useRef } from 'react'

/** Recorrido de la luna sobre la órbita: va de un extremo al otro y vuelve. */
const ORBITA_LUNA = 'M170 207.4 A400 270 0 0 1 830 207.4'

/**
 * Pie decorativo de la pantalla de ingreso: un planeta con su órbita, el
 * telescopio de OdeS en la cima, puntos y una luna que recorre la órbita (SMIL).
 * - Con «menos movimiento» la luna queda quieta al comienzo de su recorrido
 *   (en la maqueta, al quitar la animación quedaba en la esquina, en 0,0).
 * - Pausado por la persona, la luna se detiene donde va (pauseAnimations).
 */
export default function Planeta({ menosMovimiento, pausado }: { menosMovimiento: boolean; pausado: boolean }) {
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const elemento = svg.current
    // jsdom no implementa las animaciones SMIL.
    if (!elemento || typeof elemento.pauseAnimations !== 'function') return
    if (pausado) elemento.pauseAnimations()
    else elemento.unpauseAnimations()
  }, [pausado])

  return (
    <div className="odes-ingreso__pie" aria-hidden="true">
      <svg ref={svg} viewBox="0 0 1000 230" preserveAspectRatio="xMidYMax slice" focusable="false">
        <ellipse className="odes-ingreso__orbita" cx="500" cy="360" rx="400" ry="270" />
        <circle className="odes-ingreso__planeta" cx="500" cy="360" r="250" />
        <g transform="translate(560 117)">
          <path
            d="M0 -40 L-30 3 M0 -40 L2 5 M0 -40 L28 3"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g transform="translate(0 -40) rotate(-35)">
            <rect x="-46" y="-4" width="12" height="8" rx="3" fill="#ffffff" />
            <rect x="-36" y="-8" width="84" height="16" rx="6" fill="#ffffff" />
            <rect className="odes-ingreso__acento" x="-12" y="-8" width="7" height="16" fillOpacity="0.35" />
            <rect x="46" y="-11" width="14" height="22" rx="4" fill="#f6dcee" />
          </g>
          <circle className="odes-ingreso__acento" cx="0" cy="-40" r="5.5" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <circle className="odes-ingreso__punto" cx="120" cy="60" r="6" fillOpacity="0.6" />
        <circle className="odes-ingreso__punto" cx="215" cy="150" r="4" fillOpacity="0.5" />
        <circle className="odes-ingreso__punto" cx="300" cy="40" r="3" fillOpacity="0.5" />
        <circle className="odes-ingreso__punto" cx="780" cy="45" r="4" fillOpacity="0.6" />
        <circle className="odes-ingreso__punto" cx="880" cy="170" r="10" fillOpacity="0.35" />
        <circle className="odes-ingreso__punto" cx="940" cy="70" r="5" fillOpacity="0.5" />
        {menosMovimiento ? (
          <circle className="odes-ingreso__luna" cx="170" cy="207.4" r="13" />
        ) : (
          <circle className="odes-ingreso__luna" r="13">
            <animateMotion
              dur="36s"
              repeatCount="indefinite"
              path={ORBITA_LUNA}
              keyPoints="0;1;0"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
          </circle>
        )}
      </svg>
    </div>
  )
}
