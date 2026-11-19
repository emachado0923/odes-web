/**
 * Enlaces de las tarjetas. Las URL vienen de la base de datos (algunas las
 * escribe a mano quien administra), así que solo se aceptan rutas propias
 * ("/api/…") y direcciones http(s). Cualquier otra cosa (javascript:,
 * data:, "//otro-sitio") se descarta y el botón no se muestra.
 */

/** La URL si es segura para un href; si no, null. */
export function urlSegura(url: string | null | undefined): string | null {
  const t = url?.trim()
  if (!t) return null
  if (t.startsWith('/')) return t.startsWith('//') || t.startsWith('/\\') ? null : t
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null
  } catch {
    return null
  }
}

/** true si la URL es de otro sitio (se abre en una pestaña nueva). */
export function esExterna(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin
  } catch {
    return true
  }
}
