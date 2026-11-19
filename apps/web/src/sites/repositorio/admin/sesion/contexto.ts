import { createContext, use } from 'react'
import type { CredencialesAdmin, SesionAdmin } from '../../api-repositorio'
import type { ClienteAdmin } from '../datos/clienteAdmin'

export type EstadoSesion =
  | { fase: 'verificando' }
  /** No se pudo verificar la sesión (red, 503). */
  | { fase: 'error'; mensaje: string }
  | { fase: 'anonima' }
  | { fase: 'activa'; sesion: SesionAdmin }
  /** Había sesión y el servidor respondió 401: hay que volver a entrar. */
  | { fase: 'vencida'; sesion: SesionAdmin }

export interface ValorSesion {
  estado: EstadoSesion
  cliente: ClienteAdmin
  /** Lanza ErrorAdmin si el servidor rechaza las credenciales. */
  iniciar: (credenciales: CredencialesAdmin) => Promise<void>
  /** Cierra la sesión en el servidor (lanza ErrorAdmin si no se pudo). */
  cerrar: () => Promise<void>
  /** Vuelve a verificar la sesión tras un error. */
  reintentar: () => void
}

export const ContextoSesion = createContext<ValorSesion | null>(null)

export function useSesion(): ValorSesion {
  const valor = use(ContextoSesion)
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>.')
  return valor
}

/** Cliente de la API (solo dentro de la administración, con sesión). */
export function useCliente(): ClienteAdmin {
  return useSesion().cliente
}
