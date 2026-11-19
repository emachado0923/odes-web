import { useEffect, useLayoutEffect, useRef } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router'
import { ID_ENTRADA } from '../chat/ChatOdes'
import ChatOdes from '../chat/ChatOdes'
import BandaOdes from '../ingreso/BandaOdes'
import BotonPausa from '../ingreso/BotonPausa'
import CieloFondo from '../ingreso/CieloFondo'
import { useMenosMovimiento, usePausaAnimaciones } from '../ingreso/menos-movimiento'
import { vieneDelIngreso } from './rutas'

/**
 * Chat del Asistente ODES ("/odes/chat"), con el fondo de partículas y la
 * franja «¡Pregúntale a OdeS!» de la pantalla de ingreso (en el mismo lugar y
 * sin «Ingresar»). El fondo queda fijo detrás de la página; sus animaciones y
 * las de la franja se pausan con el mismo botón (y la misma pausa) del ingreso.
 *
 * Al llegar desde la pantalla de ingreso ("/odes", botón «Ingresar») la página
 * empieza arriba y el foco pasa al campo de texto, que es lo siguiente que se
 * hace. Solo en esa navegación (PUSH): el estado sigue en el historial, pero
 * recargar o volver con Atrás/Adelante (POP) no mueve nada.
 */
export default function ConversacionOdes() {
  const menosMovimiento = useMenosMovimiento()
  const [pausado, setPausado] = usePausaAnimaciones()
  const quieto = menosMovimiento || pausado
  const { state } = useLocation()
  const desdeIngreso = useNavigationType() === NavigationType.Push && vieneDelIngreso(state)
  // StrictMode repite los efectos en desarrollo: la segunda subida desharía el
  // desplazamiento del chat hasta una conversación guardada.
  const hecho = useRef(false)

  // Antes de pintar y antes de que el chat se desplace a una conversación
  // guardada (sus efectos normales corren después de este).
  useLayoutEffect(() => {
    if (!desdeIngreso || hecho.current) return
    document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'instant' })
  }, [desdeIngreso])

  useEffect(() => {
    if (!desdeIngreso || hecho.current) return
    hecho.current = true
    document.getElementById(ID_ENTRADA)?.focus({ preventScroll: true })
  }, [desdeIngreso])

  return (
    <main className="odes-principal odes-principal--cielo">
      <title>Asistente ODES · Observatorio de Sapiencia</title>
      <meta
        name="description"
        content="Asistente virtual que responde preguntas con los documentos del repositorio del Observatorio de Sapiencia."
      />
      <CieloFondo fijo quieto={quieto} />
      <div className="odes-marco-banda">
        <BandaOdes quieta={quieto} />
      </div>
      <ChatOdes />
      {!menosMovimiento && <BotonPausa pausado={pausado} onCambiar={setPausado} />}
    </main>
  )
}
