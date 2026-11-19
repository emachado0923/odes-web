/**
 * Cambios sin guardar de la administración: el editor avisa si tiene cambios
 * pendientes y la barra los consulta antes de cerrar la sesión (cerrarla
 * desmonta la página sin pasar por la navegación, así que el aviso de
 * useBlocker no saltaría).
 */
import { createContext, use, useEffect, useId } from 'react'

export interface RegistroCambios {
  marcar: (quien: string, pendientes: boolean) => void
  hay: () => boolean
}

export function crearRegistroCambios(): RegistroCambios {
  const pendientes = new Set<string>()
  return {
    marcar: (quien, hay) => {
      if (hay) pendientes.add(quien)
      else pendientes.delete(quien)
    },
    hay: () => pendientes.size > 0,
  }
}

export const ContextoCambios = createContext<RegistroCambios>(crearRegistroCambios())

/** El componente que llama tiene (o no) cambios sin guardar. */
export function useCambiosPendientes(pendientes: boolean): void {
  const registro = use(ContextoCambios)
  const quien = useId()
  useEffect(() => {
    registro.marcar(quien, pendientes)
    return () => registro.marcar(quien, false)
  }, [registro, quien, pendientes])
}

export function useRegistroCambios(): RegistroCambios {
  return use(ContextoCambios)
}
