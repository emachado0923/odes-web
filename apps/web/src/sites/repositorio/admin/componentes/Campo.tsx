/**
 * Campo de formulario con etiqueta, ayuda y error asociados al control
 * (aria-describedby, aria-invalid). El control se dibuja con una función que
 * recibe esos atributos.
 */
import type { ReactNode } from 'react'
import Icono from './IconoAdmin'

export interface AtributosControl {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

interface PropsCampo {
  id: string
  etiqueta: ReactNode
  ayuda?: ReactNode
  error?: string
  obligatorio?: boolean
  /** "12 de 300" u otro texto a la derecha de la etiqueta. */
  extra?: ReactNode
  className?: string
  children: (atributos: AtributosControl) => ReactNode
}

function idAyuda(id: string) {
  return `${id}-ayuda`
}

function idError(id: string) {
  return `${id}-error`
}

export default function Campo({ id, etiqueta, ayuda, error, obligatorio, extra, className, children }: PropsCampo) {
  const descritoPor = [ayuda ? idAyuda(id) : null, error ? idError(id) : null].filter(Boolean).join(' ')
  return (
    <div className={`ra-campo${error ? ' ra-campo-con-error' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ra-etiqueta-fila">
        <label className="ra-etiqueta" htmlFor={id}>
          {etiqueta}
          {obligatorio && <span className="ra-obligatorio"> (obligatorio)</span>}
        </label>
        {extra}
      </div>
      {ayuda && (
        <p className="ra-ayuda" id={idAyuda(id)}>
          {ayuda}
        </p>
      )}
      {children({
        id,
        'aria-describedby': descritoPor || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': obligatorio ? true : undefined,
      })}
      {error && <MensajeError id={idError(id)} texto={error} />}
    </div>
  )
}

export function MensajeError({ id, texto }: { id: string; texto: string }) {
  return (
    <p className="ra-error" id={id}>
      <Icono nombre="error" />
      <span>{texto}</span>
    </p>
  )
}

/** "12 / 300" junto a la etiqueta (solo visual; el límite está en la ayuda). */
export function Contador({ actual, maximo }: { actual: number; maximo: number }) {
  return (
    <span className={`ra-contador${actual > maximo ? ' ra-contador-excedido' : ''}`} aria-hidden="true">
      {actual} / {maximo}
    </span>
  )
}
