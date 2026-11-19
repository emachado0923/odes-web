/** Abre una dirección en la misma pestaña (en un módulo aparte para poder simularlo en las pruebas). */
export function irA(url: string): void {
  window.location.assign(url)
}
