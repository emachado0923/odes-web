import { use } from 'react'
import { ContextoRegionAvisos, type TipoAviso } from './avisos'
import Icono, { type NombreIcono } from './Icono'

const ICONO: Record<TipoAviso, NombreIcono> = { exito: 'check', info: 'info', error: 'alerta' }

/**
 * Región role="status" donde se pintan los avisos. Está siempre montada (una
 * región viva que aparece ya llena no se anuncia); `mostrar` dice si le toca
 * pintarlos. La usan ProveedorAvisos (página) y los modales abiertos.
 */
export default function RegionAvisos({ mostrar }: { mostrar: boolean }) {
  const region = use(ContextoRegionAvisos)
  if (!region) return null
  const { avisos, quitar, pausar, seguir } = region
  return (
    <div
      className="crm-avisos"
      role="status"
      aria-live="polite"
      onMouseEnter={pausar}
      onMouseLeave={seguir}
      onFocus={pausar}
      onBlur={(evento) => {
        if (!(evento.relatedTarget instanceof Node && evento.currentTarget.contains(evento.relatedTarget))) seguir()
      }}
    >
      {mostrar
        ? avisos.map((aviso) => (
            <div key={aviso.id} className="crm-aviso" data-tipo={aviso.tipo}>
              <Icono nombre={ICONO[aviso.tipo]} tamano={20} className="crm-aviso-icono" />
              <p className="crm-aviso-texto">{aviso.texto}</p>
              <button type="button" className="crm-boton-icono crm-aviso-cerrar" aria-label="Cerrar el aviso" onClick={() => quitar(aviso.id)}>
                <Icono nombre="cerrar" tamano={16} />
              </button>
            </div>
          ))
        : null}
    </div>
  )
}
