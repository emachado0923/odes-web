/**
 * Casilla de verificación con tres estados (marcada, parcial, vacía) para los
 * padres del árbol de asignaciones. El estado parcial usa la propiedad
 * `indeterminate` del <input>, que los lectores de pantalla anuncian como
 * "parcialmente marcada".
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { Marca } from './asignaciones'

export default function CasillaTriestado({
  id,
  marca,
  onCambiar,
  children,
  deshabilitada = false,
}: {
  id: string
  marca: Marca
  onCambiar: () => void
  children: ReactNode
  deshabilitada?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marca === 'parcial'
  }, [marca])
  return (
    <div className="form-check">
      <input
        ref={ref}
        className="form-check-input"
        type="checkbox"
        id={id}
        checked={marca === 'marcado'}
        onChange={onCambiar}
        disabled={deshabilitada}
      />
      <label className="form-check-label" htmlFor={id}>
        {children}
      </label>
    </div>
  )
}
