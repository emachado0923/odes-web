/**
 * Sesión de los tableros privados (hoy, /tableros/fondos-2026): la API de
 * apps/server/src/sivu/acceso. La cookie (sivu_sesion, HttpOnly) la maneja el
 * navegador; aquí solo se guarda el token CSRF para cerrar la sesión.
 */

export const URL_SESION_TABLEROS = '/api/sivu/sesion'

export interface SesionTableros {
  usuario: string
  nombre: string | null
  /** Token para la cabecera X-CSRF-Token (cerrar la sesión). */
  csrf: string
  /** ISO de vencimiento. */
  expira: string
}

/** El servidor respondió 401: hace falta iniciar sesión (o la sesión venció). */
export class ErrorSinSesion extends Error {
  constructor() {
    super('Inicie sesión para ver este tablero.')
    this.name = 'ErrorSinSesion'
  }
}

async function mensajeDe(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { mensaje?: unknown }
    return typeof cuerpo.mensaje === 'string' && cuerpo.mensaje ? cuerpo.mensaje : porDefecto
  } catch {
    return porDefecto
  }
}

/** La sesión abierta, o null si no hay (401). */
export async function obtenerSesion(): Promise<SesionTableros | null> {
  const respuesta = await fetch(URL_SESION_TABLEROS, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
  if (respuesta.status === 401) return null
  if (!respuesta.ok) {
    throw new Error(
      respuesta.status === 503
        ? 'La base de datos no está disponible en este momento. Intente de nuevo en unos minutos.'
        : `El servidor respondió con el código ${respuesta.status}.`,
    )
  }
  return (await respuesta.json()) as SesionTableros
}

/** Inicia sesión; si falla, lanza un Error con el mensaje del servidor (credenciales, bloqueo, etc.). */
export async function iniciarSesion(usuario: string, contrasena: string): Promise<SesionTableros> {
  const respuesta = await fetch(URL_SESION_TABLEROS, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ usuario, contrasena }),
  })
  if (respuesta.ok) return (await respuesta.json()) as SesionTableros
  throw new Error(
    await mensajeDe(
      respuesta,
      respuesta.status === 429 ? 'Demasiados intentos. Espere unos minutos e intente de nuevo.' : 'No se pudo iniciar sesión.',
    ),
  )
}

/** Cierra la sesión (el servidor borra la cookie). */
export async function cerrarSesion(sesion: SesionTableros): Promise<void> {
  await fetch(URL_SESION_TABLEROS, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': sesion.csrf },
    credentials: 'same-origin',
  })
}
