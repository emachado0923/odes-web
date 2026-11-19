/**
 * Reglas del bloque de WordPress (observatorio-bloque.html).
 *
 * El bloque se pega tal cual en un elemento "Raw HTML" de WPBakery en
 * sapiencia.gov.co (WordPress 5.9, tema Jupiter), y /principal lo muestra
 * igual. Todo cambio de /principal se hace en el bloque, así que estas pruebas
 * vigilan que siga funcionando allá: cada regla viene de algo que pasó o que
 * se comprobó en ese sitio (ver LEEME.md).
 */
import { describe, expect, it } from 'vitest'
import pagina from './index.html?raw'
import bloque from './observatorio-bloque.html?raw'
import estilosPagina from './pagina.css?raw'

function linea(texto: string, indice: number): number {
  return texto.slice(0, indice).split('\n').length
}

/** Cada coincidencia de `patron` como "línea N: texto". */
function hallazgos(texto: string, patron: RegExp): string[] {
  return [...texto.matchAll(patron)].map(
    (coincidencia) => `línea ${linea(texto, coincidencia.index)}: ${coincidencia[0]}`,
  )
}

interface Script {
  atributos: string
  contenido: string
}

function scriptsDe(html: string): Script[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(([, atributos = '', contenido = '']) => ({
    atributos,
    contenido,
  }))
}

/** Selectores de las reglas de estilo (también dentro de @media) y las at-rules de un CSS. */
function analizarCss(css: string): { selectores: string[]; arrobas: string[] } {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectores: string[] = []
  const arrobas: string[] = []
  // Contexto de cada llave abierta: 'grupo' (@media, @supports...), 'regla' o 'otra'.
  const pila: string[] = []
  let previo = ''
  for (let i = 0; i < sinComentarios.length; i++) {
    const caracter = sinComentarios.charAt(i)
    if (caracter === '"' || caracter === "'") {
      const cierre = sinComentarios.indexOf(caracter, i + 1)
      previo += sinComentarios.slice(i, cierre + 1)
      i = cierre
    } else if (caracter === '{') {
      const preludio = previo.trim()
      previo = ''
      const dentroDeRegla = pila.length > 0 && pila.at(-1) !== 'grupo'
      if (preludio.startsWith('@')) {
        arrobas.push(preludio)
        pila.push(/^@(media|supports|container|layer)\b/.test(preludio) ? 'grupo' : 'otra')
      } else {
        if (!dentroDeRegla) selectores.push(...separarSelectores(preludio))
        pila.push(dentroDeRegla ? 'otra' : 'regla')
      }
    } else if (caracter === '}') {
      pila.pop()
      previo = ''
    } else if (caracter === ';' && (pila.length === 0 || pila.at(-1) === 'grupo')) {
      // Sentencias como @import "x"; fuera de las reglas.
      if (previo.trim().startsWith('@')) arrobas.push(previo.trim())
      previo = ''
    } else {
      previo += caracter
    }
  }
  return { selectores, arrobas }
}

/** Separa "a, b:is(c, d)" en ["a", "b:is(c, d)"]: las comas entre paréntesis no cuentan. */
function separarSelectores(lista: string): string[] {
  const partes = ['']
  let profundidad = 0
  for (const caracter of lista) {
    if (caracter === '(') profundidad++
    if (caracter === ')') profundidad--
    if (caracter === ',' && profundidad === 0) partes.push('')
    else partes[partes.length - 1] += caracter
  }
  return partes.map((parte) => parte.trim().replace(/\s+/g, ' '))
}

const estilos = /<style>([\s\S]*?)<\/style>/.exec(bloque)?.[1] ?? ''

describe('el bloque se puede pegar en WordPress', () => {
  it('trae sus estilos, su contenido y su script', () => {
    expect(bloque.match(/<style>/g)).toHaveLength(1)
    expect(bloque.match(/\bid="odes-observatorio"/g)).toHaveLength(1)
    expect(scriptsDe(bloque).length).toBeGreaterThan(0)
  })

  it('no tiene nada que WordPress pueda tomar por un shortcode', () => {
    // WPBakery pasa el HTML por do_shortcode: "[nombre]", "[nombre atributo"
    // o "[nombre/" se ejecutarían si ese shortcode existe en el sitio. Por
    // eso los índices de JavaScript van con espacios (lista[ i ]) y los
    // selectores de atributo genéricos con *| ([*|hidden]). [data-...] y
    // [aria-...] no chocan con ningún shortcode.
    expect(hallazgos(bloque, /\[(?!data-|aria-)[A-Za-z_][\w-]*(?=[\]\s/])/g)).toEqual([])
  })

  it('todos sus estilos van bajo #odes-observatorio, para no tocar el tema', () => {
    const { selectores, arrobas } = analizarCss(estilos)
    expect(selectores.length).toBeGreaterThan(100)
    expect(selectores.filter((selector) => !selector.startsWith('#odes-observatorio'))).toEqual([])
    // Los nombres de @keyframes son globales: llevan el prefijo odes-.
    expect(arrobas.filter((arroba) => /^@(?:-webkit-)?keyframes\b/.test(arroba) && !/keyframes odes-/.test(arroba))).toEqual(
      [],
    )
    // Ni hojas ni fuentes externas: la fuente Rubik la pone el tema.
    expect(arrobas.filter((arroba) => /^@(import|font-face)\b/.test(arroba))).toEqual([])
  })

  it('no carga nada de otros sitios', () => {
    // En WordPress no hace falta y en /principal la CSP lo bloquearía. Si algún
    // día se necesita (un tablero de Power BI, una imagen de la biblioteca de
    // medios), agregue el dominio a la CSP de /principal en
    // apps/server/src/frontend/pagina-principal.ts y luego a esta excepción.
    expect(
      hallazgos(
        bloque,
        /<link\b|@import\b|<iframe\b|\b(?:src|srcset|poster|data)\s*=\s*["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//gi,
      ),
    ).toEqual([])
  })

  it('evita lo que el CSS y los plugins del sitio alteran', () => {
    // .master-holder strong pinta de morado todo <strong>; "header nav" lleva
    // margin-left: 185px; el plugin de accesibilidad (pojo) quita los target;
    // el bloque no usa Shadow DOM (WordPress no lo necesita y complica el tema).
    expect(hallazgos(bloque, /<strong\b|<header\b|\btarget\s*=|attachShadow/gi)).toEqual([])
  })

  it('su JavaScript va en un solo script, encerrado en una función con "use strict"', () => {
    const ejecutables = scriptsDe(bloque).filter(({ atributos }) => !/type\s*=\s*"application\/json"/.test(atributos))
    expect(ejecutables).toHaveLength(1)
    const [{ atributos, contenido }] = ejecutables
    expect(atributos.trim()).toBe('')
    expect(contenido.trim()).toMatch(/^\(function \(\) \{\s*'use strict';[\s\S]*\}\)\(\);$/)
  })

  it('sus ids llevan el prefijo odes-, para no chocar con los del tema', () => {
    const ids = [...bloque.matchAll(/\bid\s*=\s*"([^"]*)"/g)].map(([, id]) => id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => !id?.startsWith('odes-'))).toEqual([])
  })

  it('no tiene caracteres invisibles ni saltos de línea de Windows', () => {
    // Un editor o WordPress los puede quitar o cambiar sin que se note. En el
    // código, use escapes como \u0300 en vez del carácter literal.
    expect(hallazgos(bloque, /[\p{Cf}\p{Mn}\p{Co}\p{Cs}]|[^\P{Cc}\n\t]/gu)).toEqual([])
  })
})

describe('la página de /principal no cambia el bloque', () => {
  it('ni sus estilos ni su HTML tocan el bloque: lo que se ve en /principal es lo que se ve en WordPress', () => {
    expect(hallazgos(estilosPagina, /odes-/g)).toEqual([])
    expect(hallazgos(pagina, /odes-|<style\b/g)).toEqual([])
  })
})
