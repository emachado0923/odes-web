import type { ReactNode } from 'react'
import { mensajeDe } from '../datos/clienteCrm'
import Icono from './Icono'

/**
 * Mientras llegan los datos. Las tres marcas de estado se llenan por turnos
 * (quietas si la persona pidió menos movimiento).
 */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="crm-cargando" role="status" aria-live="polite">
      <span className="crm-cargando-marcas" aria-hidden="true">
        <i data-estado="pendiente" />
        <i data-estado="en_proceso" />
        <i data-estado="terminada" />
      </span>
      <span className="crm-cargando-texto">{texto}</span>
    </div>
  )
}

/**
 * Lo que no se pudo cargar: qué pasó (mensajeDe) y, con `alReintentar`, el
 * botón «Intentar de nuevo».
 */
export function ErrorCarga({
  error,
  alReintentar,
  titulo = 'No se pudo cargar la información.',
}: {
  error: unknown
  alReintentar?: () => void
  titulo?: string
}) {
  return (
    <div className="crm-error-carga" role="alert">
      <Icono nombre="alerta" tamano={22} className="crm-error-carga-icono" />
      <div className="crm-error-carga-texto">
        <p className="crm-error-carga-titulo">{titulo}</p>
        <p>{mensajeDe(error)}</p>
        {alReintentar ? (
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" onClick={alReintentar}>
            <Icono nombre="reintentar" tamano={16} />
            Intentar de nuevo
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Un espacio sin nada todavía: qué falta y, si se puede, la acción para llenarlo. */
export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="crm-vacio">
      <p className="crm-vacio-titulo">{titulo}</p>
      {texto ? <p className="crm-vacio-texto">{texto}</p> : null}
      {accion ? <div className="crm-vacio-accion">{accion}</div> : null}
    </div>
  )
}
