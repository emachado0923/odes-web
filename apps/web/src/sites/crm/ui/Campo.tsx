import type { ReactNode } from 'react'
import Icono from './Icono'

/**
 * Un campo de formulario: etiqueta unida al control (label for=id), ayuda
 * debajo de la etiqueta y error debajo del control.
 *
 * El control hijo debe llevar el mismo `id` y, para que el lector de pantalla
 * lea la ayuda y el error, aria-describedby con `${id}-ayuda` / `${id}-error`
 * y aria-invalid cuando hay error. ariaCampo(id, { ayuda, error }) (campos.ts)
 * los arma:
 *
 *   <Campo etiqueta="Título" id="titulo" obligatorio error={errores.titulo}>
 *     <input className="crm-control" {...ariaCampo('titulo', { error: errores.titulo })} />
 *   </Campo>
 */
export default function Campo({
  etiqueta,
  id,
  error,
  ayuda,
  obligatorio = false,
  children,
}: {
  etiqueta: string
  id: string
  error?: string | null
  ayuda?: string
  obligatorio?: boolean
  children: ReactNode
}) {
  return (
    <div className="crm-campo" data-error={error ? '' : undefined}>
      <label className="crm-campo-etiqueta" htmlFor={id}>
        {etiqueta}
        {obligatorio ? (
          <>
            {' '}
            <span className="crm-campo-obligatorio">(obligatorio)</span>
          </>
        ) : null}
      </label>
      {ayuda ? (
        <p className="crm-campo-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="crm-campo-error" id={`${id}-error`}>
          <Icono nombre="alerta" tamano={16} />
          {error}
        </p>
      ) : null}
    </div>
  )
}
