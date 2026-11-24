/**
 * Reglas de WordPress para cada componente del catálogo: lo que se descarga se
 * pega tal cual en un "Raw HTML" de WPBakery en sapiencia.gov.co (WordPress
 * 5.9, tema Jupiter). Son las mismas del bloque de la página principal
 * (apps/web/principal/bloque.test.ts), donde está de dónde sale cada una.
 */
import { describe, expect, it } from 'vitest'
import { armarBloque, COMPONENTES, idRaiz, partes, type Componente } from '.'

/** Cada coincidencia de `patron` como "línea N: texto". */
function hallazgos(texto: string, patron: RegExp): string[] {
  return [...texto.matchAll(patron)].map(
    (coincidencia) => `línea ${texto.slice(0, coincidencia.index).split('\n').length}: ${coincidencia[0]}`,
  )
}

/** Selectores de las reglas de estilo (también dentro de @media y @container) y las at-rules de un CSS. */
function analizarCss(css: string): { selectores: string[]; arrobas: string[] } {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectores: string[] = []
  const arrobas: string[] = []
  const pila: string[] = []
  let previo = ''
  for (const caracter of sinComentarios) {
    if (caracter === '{') {
      const preludio = previo.trim()
      previo = ''
      const dentroDeRegla = pila.length > 0 && pila.at(-1) !== 'grupo'
      if (preludio.startsWith('@')) {
        arrobas.push(preludio)
        pila.push(/^@(media|supports|container|layer)\b/.test(preludio) ? 'grupo' : 'otra')
      } else {
        if (!dentroDeRegla) selectores.push(...preludio.split(',').map((parte) => parte.trim().replace(/\s+/g, ' ')))
        pila.push(dentroDeRegla ? 'otra' : 'regla')
      }
    } else if (caracter === '}') {
      pila.pop()
      previo = ''
    } else if (caracter === ';' && (pila.length === 0 || pila.at(-1) === 'grupo')) {
      if (previo.trim().startsWith('@')) arrobas.push(previo.trim())
      previo = ''
    } else {
      previo += caracter
    }
  }
  return { selectores, arrobas }
}

describe.each(COMPONENTES.map((componente) => [componente.slug, componente] as const))(
  'el componente %s se puede pegar en WordPress',
  (_slug, componente: Componente) => {
    const raiz = idRaiz(componente)
    const bloque = armarBloque(componente)

    it('tiene un solo elemento raíz con su id, y todos sus ids llevan el prefijo odes-', () => {
      expect(componente.html.match(new RegExp(`\\bid="${raiz}"`, 'g'))).toHaveLength(1)
      const ids = [...componente.html.matchAll(/\bid\s*=\s*"([^"]*)"/g)].map(([, id]) => id)
      expect(ids.filter((id) => !id?.startsWith('odes-'))).toEqual([])
    })

    it('todos sus estilos van bajo su id raíz, para no tocar el tema', () => {
      const { selectores, arrobas } = analizarCss(componente.css)
      expect(selectores.length).toBeGreaterThan(0)
      expect(selectores.filter((selector) => !selector.startsWith(`#${raiz}`))).toEqual([])
      expect(arrobas.filter((arroba) => /^@(?:-webkit-)?keyframes\b/.test(arroba) && !/keyframes odes-/.test(arroba))).toEqual(
        [],
      )
      expect(arrobas.filter((arroba) => /^@(import|font-face)\b/.test(arroba))).toEqual([])
    })

    it('no tiene nada que WordPress pueda tomar por un shortcode', () => {
      expect(hallazgos(bloque, /\[(?!data-|aria-)[A-Za-z_][\w-]*(?=[\]\s/])/g)).toEqual([])
    })

    it('no carga nada de otros sitios', () => {
      expect(
        hallazgos(
          bloque,
          /<link\b|@import\b|<iframe\b|\b(?:src|srcset|poster|data|href)\s*=\s*["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//gi,
        ),
      ).toEqual([])
    })

    it('evita lo que el CSS y los plugins del sitio alteran', () => {
      expect(hallazgos(bloque, /<strong\b|<header\b|\btarget\s*=|attachShadow/gi)).toEqual([])
    })

    it('su script va aparte: el HTML no trae <script>, y el bloque lo lleva solo si el componente tiene script', () => {
      expect(componente.html).not.toMatch(/<script\b/i)
      expect(bloque.match(/<script>/g) ?? []).toHaveLength(componente.js ? 1 : 0)
      // Como el del bloque principal: encerrado en una función con "use strict".
      expect(componente.js?.trim() ?? "(function () { 'use strict'; })();").toMatch(
        /^\(function \(\) \{\s*'use strict';[\s\S]*\}\)\(\);$/,
      )
    })

    it('no tiene caracteres invisibles ni saltos de línea de Windows', () => {
      for (const texto of [componente.html, componente.css, componente.js ?? '']) {
        expect(hallazgos(texto, /[\p{Cf}\p{Mn}\p{Co}\p{Cs}]|[^\P{Cc}\n\t]/gu)).toEqual([])
      }
    })
  },
)

describe('el bloque completo', () => {
  const [tresLados] = COMPONENTES
  if (!tresLados) throw new Error('El catálogo está vacío')

  it('junta los estilos y el contenido, en ese orden y con un solo <style>', () => {
    const bloque = armarBloque(tresLados)
    expect(bloque.match(/<style>/g)).toHaveLength(1)
    expect(bloque.indexOf('<style>')).toBeLessThan(bloque.indexOf('<section id="odes-tres-lados"'))
    expect(bloque).toContain(tresLados.css.trim())
    expect(bloque).toContain(tresLados.html.trim())
    expect(bloque).toContain('Incluye estilos y contenido.')
  })

  it('agrega el script al final cuando el componente lo tiene', () => {
    const js = "(function () {\n  'use strict';\n})();"
    const bloque = armarBloque({ ...tresLados, js })
    expect(bloque.trimEnd().endsWith(`<script>\n${js}\n</script>`)).toBe(true)
    expect(bloque).toContain('Incluye estilos, contenido y script.')
  })

  it('las partes se descargan con el nombre del componente', () => {
    const archivos = partes(tresLados)
    expect(archivos.html.nombre).toBe('tres-lados.html')
    expect(archivos.css.nombre).toBe('tres-lados.css')
    expect(archivos.js).toBeNull()
    expect(archivos.bloque).toMatchObject({ nombre: 'tres-lados-bloque.html', tipo: 'text/html;charset=utf-8' })
    expect(partes({ ...tresLados, js: 'x' }).js?.nombre).toBe('tres-lados.js')
  })
})
