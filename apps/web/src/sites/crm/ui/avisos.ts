/**
 * Avisos breves («Tarea movida a En proceso», «Se le avisó a José por
 * correo»): los pinta ProveedorAvisos abajo a la derecha y se van solos a los
 * 6 segundos. useAvisar() devuelve la función para lanzarlos; fuera del
 * proveedor no hace nada.
 *
 * Con un Dialogo o un PanelLateral abierto, el resto de la página queda inerte
 * (ni se ve encima ni se anuncia), así que los avisos se pintan dentro del
 * modal de más arriba: cada modal se registra con registrarModal mientras
 * está abierto.
 */
import { createContext, use } from 'react'

export type TipoAviso = 'exito' | 'info' | 'error'

export type Avisar = (texto: string, tipo?: TipoAviso) => void

export interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
}

export const ContextoAvisos = createContext<Avisar>(() => {})

export function useAvisar(): Avisar {
  return use(ContextoAvisos)
}

/** Lo que necesitan las regiones donde se pintan los avisos (uso interno de ui/). */
export interface RegionAvisos {
  avisos: readonly Aviso[]
  quitar: (id: number) => void
  pausar: () => void
  seguir: () => void
  /** Modales abiertos, del más viejo al más nuevo: los avisos van en el último. */
  modales: readonly string[]
  /** Registra un modal abierto; devuelve la función para quitarlo. */
  registrarModal: (id: string) => () => void
}

export const ContextoRegionAvisos = createContext<RegionAvisos | null>(null)
