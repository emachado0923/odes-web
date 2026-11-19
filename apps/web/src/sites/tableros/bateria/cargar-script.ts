/**
 * Carga (una sola vez por dirección) un script del propio sitio y resuelve
 * cuando ya se ejecutó. Lo usan los archivos de datos de la batería de
 * indicadores, que su ETL genera como scripts que se guardan en window.ODES
 * (definiciones.js, vistas.js, geo.js y v/<vista>.js). Son del mismo origen,
 * así que cumplen la CSP del servidor (script-src 'self'): no hay eval.
 *
 * Si falla, se olvida la dirección para poder reintentar.
 */
const cargas = new Map<string, Promise<void>>()

export function cargarScript(url: string): Promise<void> {
  const previa = cargas.get(url)
  if (previa) return previa
  const carga = new Promise<void>((listo, fallo) => {
    const script = document.createElement('script')
    script.src = url
    script.addEventListener('load', () => listo())
    script.addEventListener('error', () => {
      cargas.delete(url)
      script.remove()
      fallo(new Error(`No se pudo cargar ${url}`))
    })
    document.head.appendChild(script)
  })
  cargas.set(url, carga)
  return carga
}
