/** Mensajes con los que los navegadores rechazan un import() dinámico que no se pudo descargar. */
const PATRON_FALLO_DE_CARGA =
  /dynamically imported module|module script failed|error loading dynamically imported|unable to preload|failed to fetch/i

/** Un import() dinámico que falló porque su chunk no se pudo descargar. */
export function esFalloDeCarga(error: unknown): boolean {
  return error instanceof Error && PATRON_FALLO_DE_CARGA.test(error.message)
}

/**
 * Recarga la página una sola vez por pestaña con la marca `clave` (en
 * sessionStorage). Sirve cuando un chunk ya no existe porque la página quedó
 * de un despliegue anterior: la recarga trae el index vigente, que apunta a
 * los chunks nuevos. Devuelve false si ya se recargó (o si no se puede
 * guardar la marca): entonces toca mostrar el error.
 */
export function recargarUnaVez(clave: string, recargar: () => void = () => window.location.reload()): boolean {
  try {
    if (sessionStorage.getItem(clave) !== null) return false
    sessionStorage.setItem(clave, String(Date.now()))
  } catch {
    return false
  }
  recargar()
  return true
}

/** Borra la marca cuando la carga salió bien, para que un próximo despliegue también pueda recargar. */
export function olvidarRecarga(clave: string): void {
  try {
    sessionStorage.removeItem(clave)
  } catch {
    // Sin sessionStorage no hubo marca.
  }
}
