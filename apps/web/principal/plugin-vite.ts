/**
 * Plugin de Vite de la página principal (/principal).
 *
 * principal/index.html es una segunda entrada de Vite, aparte de la SPA:
 * Vite procesa su CSS, su script y sus imágenes como en cualquier página, y
 * este plugin le inserta el bloque de WordPress (observatorio-bloque.html)
 * DESPUÉS de ese proceso, así el bloque llega al navegador tal cual, sin
 * minificar ni reescribir nada.
 *
 * - Desarrollo (y `vite preview`): /principal y /principal/ sirven esa página
 *   (sin esto, Vite respondería el index.html de la SPA).
 * - Cada petición vuelve a leer el bloque: al guardarlo se ve el cambio.
 * - Al guardar el bloque o la página, recarga el navegador (Vite solo
 *   recargaría si la URL fuera la del archivo .html).
 * - Compilación: deja la página completa en dist/principal/index.html, que
 *   NestJS sirve en /principal con su propia CSP (apps/server/src/frontend).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizePath, type Connect, type Plugin } from 'vite'
import { componerPagina } from './componer.ts'

/** Entrada de Vite de la página (build.rolldownOptions.input en vite.config.ts). */
export const ENTRADA_PRINCIPAL = normalizePath(fileURLToPath(new URL('./index.html', import.meta.url)))

const CARPETA = normalizePath(fileURLToPath(new URL('./', import.meta.url)))
const BLOQUE = fileURLToPath(new URL('./observatorio-bloque.html', import.meta.url))

/** "/principal" o "/principal/", con o sin query, sin distinguir mayúsculas (como el servidor). */
const PATRON_RUTA = /^\/principal\/?(?=$|\?)/i

const reescribirRuta: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url && PATRON_RUTA.test(req.url)) {
    req.url = req.url.replace(PATRON_RUTA, '/principal/index.html')
  }
  next()
}

export function paginaPrincipal(): Plugin {
  return {
    name: 'sapiencia:pagina-principal',

    // Se registran antes que los middlewares de Vite (y que su fallback de la SPA).
    configureServer(server) {
      server.middlewares.use(reescribirRuta)
    },
    configurePreviewServer(server) {
      server.middlewares.use(reescribirRuta)
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, { filename }) {
        if (normalizePath(filename) !== ENTRADA_PRINCIPAL) return html
        return componerPagina(html, readFileSync(BLOQUE, 'utf8'))
      },
    },

    hotUpdate({ file }) {
      if (this.environment.name !== 'client') return
      if (normalizePath(file).startsWith(CARPETA) && file.endsWith('.html')) {
        this.environment.hot.send({ type: 'full-reload' })
        return []
      }
    },
  }
}
