import type { ReactNode } from 'react'
import Icono from './Icono'
import RegionAvisos from './RegionAvisos'
import { useModal } from './useModal'

/**
 * Diálogo modal (<dialog> con showModal): título, descripción opcional,
 * contenido y pie con las acciones (la principal a la derecha del pie, con
 * crm-boton-primario; «Cancelar» con crm-boton-secundario o fantasma).
 *
 * Escape y la X cierran (alCerrar) salvo `bloqueado`. El foco entra al primer
 * control del contenido (o al que lleve `data-autofocus`) y vuelve al cerrar.
 * Cerrado no pinta nada: lo que tenga adentro empieza de cero al abrir.
 */
export default function Dialogo({
  abierto,
  titulo,
  descripcion,
  alCerrar,
  children,
  pie,
  tamano = 'md',
  bloqueado = false,
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  alCerrar: () => void
  children: ReactNode
  pie?: ReactNode
  tamano?: 'sm' | 'md' | 'lg'
  bloqueado?: boolean
}) {
  const { ref, idTitulo, idDescripcion, alCancelar, alCerrarNativo, alTecla, esSuperior } = useModal({ abierto, alCerrar, bloqueado })
  if (!abierto) return null
  return (
    <dialog
      ref={ref}
      className={`crm-modal crm-dialogo crm-dialogo-${tamano}`}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
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
        {descripcion ? (
          <p className="crm-modal-descripcion" id={idDescripcion}>
            {descripcion}
          </p>
        ) : null}
        <div className="crm-modal-cuerpo">{children}</div>
        {pie ? <footer className="crm-modal-pie">{pie}</footer> : null}
      </div>
      <RegionAvisos mostrar={esSuperior} />
    </dialog>
  )
}
