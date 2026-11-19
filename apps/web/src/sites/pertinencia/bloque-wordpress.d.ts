/**
 * El script del bloque de WordPress de /pertinencia, servido como módulo por
 * apps/web/pertinencia/plugin-vite.ts: exporta una función que lo corre (el
 * propio script hace su trabajo una sola vez por bloque).
 */
declare module '*/pertinencia-bloque.html?script' {
  const ejecutarBloquePertinencia: () => void
  export default ejecutarBloquePertinencia
}
