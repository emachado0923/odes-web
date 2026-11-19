/** Textos del inicio de sesión. */

/** "Espere 15 minutos" a partir de los segundos de Retry-After. */
export function textoBloqueo(segundos: number | null): string {
  if (segundos === null) return 'Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.'
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  return `Demasiados intentos fallidos. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e intente de nuevo.`
}
