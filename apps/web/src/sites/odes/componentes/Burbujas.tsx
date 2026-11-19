import type { ReactNode } from 'react'
import { NOMBRE_ASISTENTE } from '../chat/protocolo'

/** Imagen del asistente: el retrato de ODES (cabeza y visor) en un círculo. */
export const URL_AVATAR = '/odes/img/odes-retrato.webp'

/**
 * Grupo de mensajes del asistente, como en BelloEduca: burbujas apiladas y el
 * avatar redondo junto a la última.
 */
export function GrupoAsistente({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ? `odes-grupo ${className}` : 'odes-grupo'}>
      <img className="odes-avatar" src={URL_AVATAR} alt="" width={40} height={40} />
      <div className="odes-grupo__contenido">
        <span className="visually-hidden">{NOMBRE_ASISTENTE}:</span>
        {children}
      </div>
    </div>
  )
}

export function Burbuja({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `odes-burbuja ${className}` : 'odes-burbuja'}>{children}</div>
}

/** Mensaje de la persona, alineado a la derecha. */
export function BurbujaUsuario({ children }: { children: ReactNode }) {
  return (
    <div className="odes-fila-usuario">
      <div className="odes-burbuja odes-burbuja--usuario">
        <span className="visually-hidden">Tú: </span>
        {children}
      </div>
    </div>
  )
}
