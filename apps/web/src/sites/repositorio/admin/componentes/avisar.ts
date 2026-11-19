/** Contexto de los avisos breves (ver Avisos.tsx). */
import { createContext, use } from 'react'

export type Avisar = (texto: string) => void

export const ContextoAvisos = createContext<Avisar>(() => {})

/** Muestra un aviso breve ("Cambios guardados") que se anuncia sin mover el foco. */
export function useAvisar(): Avisar {
  return use(ContextoAvisos)
}
