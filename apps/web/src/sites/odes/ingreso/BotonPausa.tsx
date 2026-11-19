import Icono from '../componentes/Icono'

/**
 * Pausa y reanuda las animaciones de la página (estrellas, nebulosas y luna),
 * que no terminan solas (WCAG 2.2.2). Va abajo a la izquierda del <main>, que
 * necesita position: relative. Con «reducir movimiento» no se muestra: ya
 * está todo quieto.
 */
export default function BotonPausa({ pausado, onCambiar }: { pausado: boolean; onCambiar: (pausado: boolean) => void }) {
  const texto = pausado ? 'Reanudar animaciones' : 'Pausar animaciones'
  return (
    <button type="button" className="odes-pausa" title={texto} onClick={() => onCambiar(!pausado)}>
      <Icono nombre={pausado ? 'play_arrow' : 'pause'} />
      <span className="visually-hidden">{texto}</span>
    </button>
  )
}
