import type { ReactNode } from 'react'
import Icono from './Icono'
import RegionAvisos from './RegionAvisos'
import { useModal } from './useModal'

/**
 * Hoja lateral derecha (el detalle de una tarea junto al tablero): también un
 * <dialog> modal, con el mismo manejo del foco y de Escape que Dialogo. El
 * contenido se desplaza; la cabecera y el pie quedan fijos. En el celular
 * ocupa toda la pantalla.
 */
export default function PanelLateral({
  abierto,
  titulo,
  alCerrar,
  children,
  pie,
  bloqueado = false,
}: {
  abierto: boolean
  titulo: string
  alCerrar: () => void
  children: ReactNode
  pie?: ReactNode
  bloqueado?: boolean
}) {
  const { ref, idTitulo, alCancelar, alCerrarNativo, alTecla, esSuperior } = useModal({ abierto, alCerrar, bloqueado })
  if (!abierto) return null
  return (
    <dialog
      ref={ref}
      className="crm-modal crm-panel"
      aria-labelledby={idTitulo}
      aria-busy={bloqueado || undefined}
      onCancel={alCancelar}
      onClose={alCerrarNativo}
      onKeyDown={alTecla}
    >
      <div className="crm-modal-caja">
        <header className="crm-modal-cabeza">
          <h2 className="crm-modal-titulo" id={idTitulo}>
            {titulo}
          </h2>
          <button type="button" className="crm-boton-icono crm-modal-cerrar" onClick={alCerrar} disabled={bloqueado} aria-label="Cerrar">
            <Icono nombre="cerrar" />
          </button>
        </header>
        <div className="crm-modal-cuerpo">{children}</div>
        {/* Entre el cuerpo y el pie, en el flujo: no tapa las acciones del pie. */}
        <RegionAvisos mostrar={esSuperior} />
        {pie ? <footer className="crm-modal-pie">{pie}</footer> : null}
      </div>
    </dialog>
  )
}
