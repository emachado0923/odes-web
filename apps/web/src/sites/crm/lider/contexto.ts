/**
 * Sesión del líder dentro de /crm/lider/*. La provee SitioLider (después de
 * iniciar sesión) y la usan todas las pantallas del líder:
 *
 *   const { sesion, api, vencida } = useLider()
 *   try { await api.avisar(id) } catch (e) { if (esNoAutenticado(e)) return vencida(); … }
 *
 * - api: crearApiLider(sesion.csrf): todas las llamadas del líder, con CSRF.
 * - vencida(): llamar cuando una petición respondió 401; SitioLider vuelve al
 *   ingreso con «La sesión venció. Ingrese de nuevo.».
 * - salir(): cierra la sesión (DELETE) y vuelve al ingreso.
 * - avisarCambioCorreos(): después de reintentar o generar correos, para que
 *   la insignia de «Correos» del menú se recargue.
 */
import { createContext, useContext } from 'react'
import type { SesionLiderCrm } from '../api-crm'
import type { ApiLider } from '../datos/clienteCrm'

export interface ContextoLider {
  sesion: SesionLiderCrm
  api: ApiLider
  vencida: () => void
  salir: () => Promise<void>
  avisarCambioCorreos: () => void
}

export const ContextoLiderCrm = createContext<ContextoLider | null>(null)

export function useLider(): ContextoLider {
  const contexto = useContext(ContextoLiderCrm)
  if (!contexto) throw new Error('useLider() solo funciona dentro de SitioLider.')
  return contexto
}
