import type { ReactNode } from 'react'
import type { EnlaceOficial as Enlace } from '../../datos/sapiencia-oficial'

/** Aviso para lectores de pantalla de los enlaces que abren otra pestaña. */
export const AVISO_PESTANA = '(se abre en una pestaña nueva)'

/**
 * Enlace a sapiencia.gov.co (u otro sitio) con el comportamiento del sitio
 * oficial: en la misma pestaña, o en otra si `pestanaNueva` (entonces con
 * rel="noopener noreferrer" y el aviso oculto "(se abre en una pestaña nueva)").
 * Siempre un <a> simple: sale de la aplicación.
 */
export default function EnlaceOficial({
  enlace,
  className,
  children,
}: {
  enlace: Enlace
  className?: string
  /** Contenido visible; por defecto, el texto del enlace. */
  children?: ReactNode
}) {
  const nueva = enlace.pestanaNueva === true
  return (
    <a
      className={className}
      href={enlace.url}
      target={nueva ? '_blank' : undefined}
      rel={nueva ? 'noopener noreferrer' : undefined}
    >
      {children ?? enlace.texto}
      {nueva && (
        <>
          {' '}
          <span className="pe-sr">{AVISO_PESTANA}</span>
        </>
      )}
    </a>
  )
}
