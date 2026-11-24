/**
 * Íconos de línea del CRM (24 × 24, trazo de 1,75, puntas redondas), en línea
 * y del color del texto (currentColor). Sin `titulo` son decorativos
 * (aria-hidden): el nombre accesible lo pone el botón o el texto de al lado.
 * Con `titulo` se anuncian como imagen.
 */
import { TRAZOS_ICONO, type NombreIcono } from './trazos-iconos'

export type { NombreIcono }

export default function Icono({
  nombre,
  tamano = 18,
  titulo,
  className,
}: {
  nombre: NombreIcono
  tamano?: number
  /** Texto para lectores de pantalla; sin él, el ícono es decorativo. */
  titulo?: string
  className?: string
}) {
  return (
    <svg
      className={className ? `crm-icono ${className}` : 'crm-icono'}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      aria-label={titulo || undefined}
    >
      {titulo ? <title>{titulo}</title> : null}
      <path d={TRAZOS_ICONO[nombre]} />
    </svg>
  )
}
