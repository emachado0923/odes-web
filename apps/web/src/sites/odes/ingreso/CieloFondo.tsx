import CieloEstrellado from './CieloEstrellado'
import type { OpcionesCielo } from './cielo'
import './cielo-fondo.css'

/** Estrellas tenues en magenta (blancas en modo oscuro): el color sale de --cielo-estrella. */
const CIELO_FONDO: OpcionesCielo = {
  densidad: 5500,
  radioMinimo: 0.5,
  radioVariable: 1.2,
  alfa: 0.5,
  alfaFugaz: 0.45,
  primeraFugaz: 6000,
  cadaFugaz: 9000,
  color: (lienzo) => getComputedStyle(lienzo).getPropertyValue('--cielo-estrella').trim(),
}

/**
 * Fondo de partículas de ODES (de la maqueta «Pregúntale a OdeS»): nebulosa
 * que deriva y estrellas tenues con alguna fugaz. Decorativo.
 * - En la pantalla de ingreso cubre su <main>.
 * - En el chat (`fijo`) queda fijo detrás de toda la página: el lienzo mide lo
 *   que la ventana y no lo que la conversación, y la cabecera, el pie y las
 *   burbujas, que tienen fondo, se pintan encima (ver cielo-fondo.css).
 */
export default function CieloFondo({ quieto, fijo = false }: { quieto: boolean; fijo?: boolean }) {
  const clases = ['odes-cielo', fijo && 'odes-cielo--fijo', quieto && 'odes-cielo--quieto'].filter(Boolean).join(' ')
  return (
    <div className={clases} aria-hidden="true">
      <div className="odes-cielo__nebulosa" />
      <CieloEstrellado className="odes-cielo__estrellas" opciones={CIELO_FONDO} quieto={quieto} />
    </div>
  )
}
