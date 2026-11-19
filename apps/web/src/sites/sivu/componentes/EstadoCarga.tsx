import type { FocusEvent, Ref } from 'react'
import type { EstadoVisor } from '../visor/estado'

interface PropsEstadoCarga {
  estado: EstadoVisor
  /** Párrafo del estado: destino del foco tras "Reintentar" (el botón desaparece). */
  refTexto?: Ref<HTMLParagraphElement>
  refBoton?: Ref<HTMLButtonElement>
  onReintentar: () => void
  /** El foco entra o sale de la tarjeta (Edificio3D lo pasa a la barra cuando la tarjeta desaparece). */
  onFoco?: (dentro: boolean) => void
}

function textoEstado(estado: EstadoVisor): string {
  if (estado.fase === 'error') {
    if (estado.error?.tipo === 'contexto') return 'Se perdió la imagen 3D. Vuelve a cargar el edificio para verla de nuevo.'
    return estado.error?.mensaje ?? 'No se pudo cargar el edificio en 3D.'
  }
  return estado.fase === 'procesando' ? 'Preparando el edificio en 3D…' : 'Cargando el edificio en 3D…'
}

/**
 * Tarjeta sobre la escena mientras el edificio carga (giro y porcentaje de la
 * descarga de 10,7 MB) o cuando falla (mensaje y "Reintentar"). Se centra en
 * la zona que el panel deja libre. No se muestra con el edificio listo.
 */
export default function EstadoCarga({ estado, refTexto, refBoton, onReintentar, onFoco }: PropsEstadoCarga) {
  if (estado.listo) return null

  const error = estado.fase === 'error'
  // Sin WebGL no hay nada que reintentar.
  const conBoton = error && estado.error?.tipo !== 'webgl'
  const porcentaje = !error && estado.fase === 'descargando' && estado.progreso !== null ? estado.progreso : null

  const alSalir = (evento: FocusEvent<HTMLDivElement>) => {
    if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) onFoco?.(false)
  }

  return (
    <div className="ed-estado" onFocus={() => onFoco?.(true)} onBlur={alSalir}>
      {!error && <span className="ed-girando" aria-hidden="true" />}
      {/* tabIndex -1: destino del foco tras "Reintentar" (no entra en el orden de Tab). */}
      <p ref={refTexto} className="ed-estado-texto" role="status" tabIndex={-1}>
        {textoEstado(estado)}
      </p>
      {!error && (
        <span className="ed-porcentaje" aria-hidden="true">
          {porcentaje === null ? '' : `${porcentaje}\u00a0%`}
        </span>
      )}
      {conBoton && (
        <button ref={refBoton} type="button" className="ed-boton ed-reintentar" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}
