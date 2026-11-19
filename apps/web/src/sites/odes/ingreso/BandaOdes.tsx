import type { ReactNode } from 'react'
import CieloEstrellado from './CieloEstrellado'
import type { OpcionesCielo } from './cielo'
import './banda.css'

/** Estrellas blancas y una fugaz cada 5-10 s sobre la franja magenta. */
const CIELO_BANDA: OpcionesCielo = {
  densidad: 2600,
  radioMinimo: 0.4,
  radioVariable: 1.3,
  alfa: 1,
  alfaFugaz: 1,
  primeraFugaz: 3000,
  cadaFugaz: 5000,
}

/**
 * Franja magenta «¡Pregúntale a OdeS!» (de la maqueta): cara de OdeS, título,
 * bajada y, si se pasa, una acción debajo (el «Ingresar» de la pantalla de
 * ingreso). Encabeza la pantalla de ingreso y el chat en el mismo lugar, así
 * al pasar de una a otra la franja no se mueve.
 *
 * `quieta` detiene las estrellas y la nebulosa (pausa o «reducir movimiento»
 * en el ingreso; siempre en el chat, para no distraer de la conversación).
 */
export default function BandaOdes({ quieta, children }: { quieta: boolean; children?: ReactNode }) {
  return (
    <section className={quieta ? 'odes-banda odes-banda--quieta' : 'odes-banda'} aria-labelledby="odes-banda-titulo">
      <div className="odes-banda__nebulosa" aria-hidden="true" />
      <CieloEstrellado className="odes-banda__estrellas" opciones={CIELO_BANDA} quieto={quieta} />
      <img className="odes-banda__cara" src="/odes/img/odes-cara.webp" alt="Cara de OdeS" width={400} height={400} />
      <div className="odes-banda__texto">
        <h1 id="odes-banda-titulo" className="odes-banda__titulo">
          ¡Pregúntale a OdeS!
        </h1>
        <p className="odes-banda__bajada">Consulta los estudios y cifras del Observatorio de Sapiencia</p>
        {children}
      </div>
      <svg className="odes-banda__orbitas" viewBox="0 0 200 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <circle cx="120" cy="62" r="78" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" />
        <circle cx="44" cy="102" r="7" fill="#ffffff" />
        <circle cx="86" cy="140" r="10" fill="#ffffff" />
        <circle cx="118" cy="62" r="4.5" fill="#ffffff" fillOpacity="0.55" />
      </svg>
    </section>
  )
}
