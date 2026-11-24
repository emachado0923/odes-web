import { ETIQUETAS_ESTADO, type EstadoTarea } from '../api-crm'
import MarcaEstado from './MarcaEstado'

/**
 * El estado de una tarea: su marca (○ pendiente, ◐ en proceso, ● terminada),
 * su nombre y su color. El color nunca va solo: siempre lleva el texto.
 */
export default function ChipEstado({
  estado,
  tamano = 'md',
  className,
}: {
  estado: EstadoTarea
  tamano?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span className={`crm-chip-estado crm-chip-estado-${tamano}${className ? ` ${className}` : ''}`} data-estado={estado}>
      <MarcaEstado estado={estado} />
      {ETIQUETAS_ESTADO[estado]}
    </span>
  )
}
