/**
 * Contexto de la sesión del PAI: lo crea ProveedorSesionPai
 * (ProveedorSesionPai.tsx) y lo usan todas las páginas. Aquí solo están los
 * tipos y los hooks, para que cada parte programe contra ellos.
 */
import { createContext, use } from 'react'
import type { CambioContrasenaPai, CredencialesPai, RolPai, SesionPai, VigenciaPai } from '../api-pai'
import type { ClientePai } from '../datos/clientePai'

export type EstadoSesionPai =
  | { fase: 'verificando' }
  /** No se pudo verificar la sesión (red, 503). */
  | { fase: 'error'; mensaje: string }
  | { fase: 'anonima' }
  /** Con sesión; si sesion.debeCambiarContrasena, se muestra el cambio de contraseña obligatorio. */
  | { fase: 'activa'; sesion: SesionPai }
  /** Había sesión y el servidor respondió 401: el ingreso aparece encima y la página sigue montada. */
  | { fase: 'vencida'; sesion: SesionPai }

export interface ValorSesionPai {
  estado: EstadoSesionPai
  /** Cliente de la API (guarda el CSRF de la sesión en memoria). */
  cliente: ClientePai
  /** La sesión activa o vencida; null si no hay. */
  sesion: SesionPai | null
  /** Vigencia elegida (bimestre abierto) para la barra; null mientras carga o sin sesión. */
  vigencia: VigenciaPai | null
  /**
   * Año que se consulta en todas las páginas (selector de la barra); null =
   * la vigencia más reciente (lo normal). Sirve para terminar el año
   * anterior (Bimestre 6, correcciones) cuando ya se cargó el siguiente.
   */
  vigenciaElegida: number | null
  /** Cambia la vigencia de todas las páginas (null = la más reciente). */
  elegirVigencia: (anio: number | null) => void
  /** Sube cada vez que alguien inicia sesión: las cargas que fallaron por la sesión vencida se repiten solas. */
  generacion: number
  /** Lanza ErrorPai si el servidor rechaza las credenciales (401, 429 con reintentarEn, 503). */
  iniciar: (credenciales: CredencialesPai) => Promise<void>
  /** Cierra la sesión en el servidor (lanza ErrorPai si no se pudo). */
  cerrar: () => Promise<void>
  /** Cambia la contraseña propia y actualiza la sesión (quita debeCambiarContrasena). */
  cambiarContrasena: (datos: CambioContrasenaPai) => Promise<void>
  /** Vuelve a verificar la sesión tras un error. */
  reintentar: () => void
  /** Reemplaza la vigencia (p. ej., después de abrir o cerrar el bimestre). */
  actualizarVigencia: (vigencia: VigenciaPai) => void
  /** Vuelve a pedir la vigencia al servidor. */
  recargarVigencia: () => void
}

export const ContextoSesionPai = createContext<ValorSesionPai | null>(null)

export function useSesionPai(): ValorSesionPai {
  const valor = use(ContextoSesionPai)
  if (!valor) throw new Error('useSesionPai debe usarse dentro de <ProveedorSesionPai>.')
  return valor
}

/** Cliente de la API. */
export function useClientePai(): ClientePai {
  return useSesionPai().cliente
}

/** Sesión activa; lanza si no hay (usar solo dentro de PuertaSesionPai). */
export function useSesionActivaPai(): SesionPai {
  const { sesion } = useSesionPai()
  if (!sesion) throw new Error('useSesionActivaPai requiere una sesión (dentro de <PuertaSesionPai>).')
  return sesion
}

export function esAdministrador(sesion: Pick<SesionPai, 'rol'> | null | undefined): boolean {
  return sesion?.rol === 'administrador'
}

/** "Administrador(a)" / "Responsable", para la barra y las tablas. */
export function nombreRol(rol: RolPai): string {
  return rol === 'administrador' ? 'Administrador(a)' : 'Responsable'
}
