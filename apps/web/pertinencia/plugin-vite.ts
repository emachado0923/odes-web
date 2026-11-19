/**
 * Plugin de Vite del bloque de /pertinencia (pertinencia-bloque.html).
 *
 * /pertinencia es una página de React (src/sites/pertinencia), pero su
 * contenido es el bloque de WordPress, que se pega tal cual en
 * sapiencia.gov.co. El aplicativo pone en la página los estilos y el
 * contenido del bloque (importado con ?raw) y necesita además correr su
 * script. Como la CSP del sitio (script-src 'self') bloquea los scripts en
 * línea y eval(), este plugin sirve el script del bloque como un módulo más:
 *
 *   import ejecutarBloque from '…/pertinencia/pertinencia-bloque.html?script'
 *
 * exporta por defecto una función que corre el script (ver componer.ts). Vite
 * la empaqueta con el resto de la rama, así que llega desde el propio sitio.
 * Funciona igual en desarrollo, al compilar y en las pruebas (Vitest usa los
 * plugins de vite.config.ts).
 *
 * Al guardar el bloque en desarrollo, el navegador se recarga completo (el
 * script corre una sola vez por página).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizePath, type Plugin } from 'vite'
import { moduloDelScript } from './componer.ts'

const BLOQUE = normalizePath(fileURLToPath(new URL('./pertinencia-bloque.html', import.meta.url)))
const SUFIJO = '?script'

export function scriptBloquePertinencia(): Plugin {
  return {
    name: 'sapiencia:pertinencia-bloque-script',
    enforce: 'pre',

    load(id) {
      if (normalizePath(id) !== BLOQUE + SUFIJO) return null
      this.addWatchFile(BLOQUE)
      return { code: moduloDelScript(readFileSync(BLOQUE, 'utf8')), map: null }
    },

    hotUpdate({ file }) {
      if (this.environment.name !== 'client') return
      if (normalizePath(file) === BLOQUE) {
        this.environment.hot.send({ type: 'full-reload' })
        return []
      }
    },
  }
}
