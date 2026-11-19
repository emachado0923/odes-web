import { Link } from 'react-router'
import BandaOdes from '../ingreso/BandaOdes'
import BotonPausa from '../ingreso/BotonPausa'
import CieloFondo from '../ingreso/CieloFondo'
import Constelacion from '../ingreso/Constelacion'
import { useMenosMovimiento, usePausaAnimaciones } from '../ingreso/menos-movimiento'
import Planeta from '../ingreso/Planeta'
import '../ingreso/ingreso.css'
import { RUTA_CHAT_ODES, type EstadoDesdeIngreso } from './rutas'

const DESDE_INGRESO: EstadoDesdeIngreso = { desdeIngreso: true }

/**
 * Pantalla de ingreso de ODES ("/odes"), adaptada de la maqueta «Pregúntale a
 * OdeS»: franja magenta (BandaOdes, la misma que encabeza el chat) con el
 * botón «Ingresar» (lleva al chat, "/odes/chat"), las cuatro preguntas sobre el
 * asistente y un planeta con el telescopio, sobre un cielo estrellado.
 *
 * Las animaciones (estrellas, nebulosas y luna) no terminan solas: el botón
 * «Pausar animaciones» las detiene (WCAG 2.2.2), y la pausa sigue en el chat.
 * Con «reducir movimiento» en el sistema ya están quietas y el botón no se
 * muestra.
 */
export default function IngresoOdes() {
  const menosMovimiento = useMenosMovimiento()
  const [pausado, setPausado] = usePausaAnimaciones()
  const quieto = menosMovimiento || pausado

  return (
    <main id="odes-contenido" className="odes-principal odes-ingreso" tabIndex={-1}>
      <title>Pregúntale a OdeS · Observatorio de Sapiencia</title>
      <meta
        name="description"
        content="OdeS, el asistente virtual del Observatorio de Sapiencia: consulta los estudios y cifras del Observatorio."
      />

      <CieloFondo quieto={quieto} />

      <div className="odes-ingreso__contenido">
        <BandaOdes quieta={quieto}>
          <Link to={RUTA_CHAT_ODES} state={DESDE_INGRESO} className="odes-banda__ingresar">
            Ingresar
          </Link>
        </BandaOdes>

        <Constelacion />
        <Planeta menosMovimiento={menosMovimiento} pausado={pausado} />
      </div>

      {!menosMovimiento && <BotonPausa pausado={pausado} onCambiar={setPausado} />}
    </main>
  )
}
