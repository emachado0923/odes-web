import { useEffect, useRef } from 'react'
import { animarCielo, type ControlCielo, type OpcionesCielo } from './cielo'

/**
 * Lienzo con el cielo estrellado (ver cielo.ts). Decorativo: aria-hidden.
 * `opciones` debe ser estable (constante del módulo): si cambia, el cielo se
 * vuelve a crear. `quieto` (menos movimiento o pausa) lo detiene o lo
 * reanuda sin volver a repartir las estrellas.
 */
export default function CieloEstrellado({
  className,
  opciones,
  quieto,
}: {
  className: string
  opciones: OpcionesCielo
  quieto: boolean
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const control = useRef<ControlCielo | null>(null)
  /** Último valor de `quieto`, para crear el cielo ya detenido si hace falta. */
  const quietoActual = useRef(quieto)

  useEffect(() => {
    if (!lienzo.current) return
    const cielo = animarCielo(lienzo.current, opciones, quietoActual.current)
    control.current = cielo
    return () => {
      cielo.detener()
      control.current = null
    }
  }, [opciones])

  useEffect(() => {
    quietoActual.current = quieto
    control.current?.fijarQuieto(quieto)
  }, [quieto])

  return <canvas ref={lienzo} className={className} aria-hidden="true" />
}
