/**
 * Reglas de las hojas de /pertinencia que jsdom no deja ver (no aplica CSS):
 * se revisa su texto para cuidar el contrato de la rama (todo bajo
 * .pertinencia), que ninguna regla entre al bloque de WordPress (lo que se ve
 * aquí debe ser lo que se verá allá) y lo medido en el navegador (logos
 * invisibles en colores forzados). Se importan como texto (?raw; ver test.css
 * en vite.config.ts). Las reglas de diseño del contenido (estrellas, contraste
 * de los accesos, triángulos, columnas) son del bloque: están en
 * apps/web/pertinencia/bloque.test.ts.
 */
import { describe, expect, it } from 'vitest'
import hojaSapiencia from './componentes/sapiencia/sapiencia.css?raw'
import hoja from './pertinencia.css?raw'

interface Regla {
  selector: string
  cuerpo: string
  /** Condición del @media que la envuelve ('' si no hay). */
  media: string
}

const SIN_COMENTARIOS = hoja.replace(/\/\*[\s\S]*?\*\//g, '')

/** Reglas hoja de la hoja, con el @media que las envuelve (un nivel de anidación basta aquí). */
function leerReglas(css: string, media = ''): Regla[] {
  const reglas: Regla[] = []
  let i = 0
  while (i < css.length) {
    const abre = css.indexOf('{', i)
    if (abre < 0) break
    const selector = css.slice(i, abre).trim()
    let profundidad = 1
    let j = abre + 1
    while (profundidad > 0 && j < css.length) {
      if (css[j] === '{') profundidad++
      else if (css[j] === '}') profundidad--
      j++
    }
    const cuerpo = css.slice(abre + 1, j - 1)
    if (selector.startsWith('@media')) reglas.push(...leerReglas(cuerpo, selector))
    else reglas.push({ selector, cuerpo, media })
    i = j
  }
  return reglas
}

const REGLAS = leerReglas(SIN_COMENTARIOS)
/** Reglas de la cabecera y el pie oficiales (componentes/sapiencia/sapiencia.css). */
const REGLAS_SAPIENCIA = leerReglas(hojaSapiencia.replace(/\/\*[\s\S]*?\*\//g, ''))

/** Valor de una declaración dentro de un cuerpo de regla. */
function valor(cuerpo: string, propiedad: string): string | undefined {
  const escapada = propiedad.replace(/[-]/g, '\\-')
  return new RegExp(`(?:^|;)\\s*${escapada}\\s*:\\s*([^;]+)`).exec(cuerpo)?.[1].trim()
}

/** Separa un selector por sus comas de primer nivel (no las de :is(…)). */
function partes(selector: string): string[] {
  const salida: string[] = []
  let profundidad = 0
  let actual = ''
  for (const c of selector) {
    if (c === '(') profundidad++
    if (c === ')') profundidad--
    if (c === ',' && profundidad === 0) {
      salida.push(actual.trim())
      actual = ''
    } else actual += c
  }
  salida.push(actual.trim())
  return salida
}

describe('pertinencia.css', () => {
  it('se lee (?raw) y todo selector va bajo .pertinencia, salvo los @font-face; sin @keyframes', () => {
    expect(REGLAS.length).toBeGreaterThan(25)
    expect(SIN_COMENTARIOS).not.toMatch(/@keyframes/)
    const fuera = REGLAS.filter((r) => r.selector !== '@font-face')
      .flatMap((r) => partes(r.selector))
      .filter((s) => !/^\.pertinencia(?![\w-])/.test(s))
    expect(fuera).toEqual([])
  })

  it('ninguna regla entra al bloque de WordPress (#odes-pertinencia): las generales se detienen en él', () => {
    const EXCLUSION = ':where(:not(#odes-pertinencia, #odes-pertinencia *))'
    const selectores = REGLAS.filter((r) => r.selector !== '@font-face').flatMap((r) => partes(r.selector))
    // Las que no nombran una clase propia (pe-…) alcanzarían al bloque: llevan la exclusión.
    const generales = selectores.filter((s) => s !== '.pertinencia' && !/\.pe-[\w-]/.test(s.replace(/^\.pertinencia/, '')))
    expect(generales.length).toBeGreaterThan(5)
    expect(generales.filter((s) => !s.includes(EXCLUSION))).toEqual([])
    // Fuera de la exclusión, ninguna hoja nombra algo del bloque (sus clases e ids empiezan por odes-).
    expect(selectores.map((s) => s.replaceAll(EXCLUSION, '')).filter((s) => s.includes('odes-'))).toEqual([])
    expect(REGLAS_SAPIENCIA.flatMap((r) => partes(r.selector)).filter((s) => s.includes('odes-'))).toEqual([])
  })

  it('el pie deja sobre sí el margen que deja WordPress tras el Raw HTML (25 px; 15 px hasta 767 px), y el 404 el aire del bloque', () => {
    const margenPie = (media: string) =>
      REGLAS_SAPIENCIA.filter((r) => r.selector === '.pertinencia .pe-sap-pie' && r.media === media)
        .map((r) => valor(r.cuerpo, 'margin-top'))
        .filter(Boolean)
    expect(margenPie('')).toEqual(['25px'])
    expect(margenPie('@media (max-width: 767px)')).toEqual(['15px'])
    // El bloque deja 51 px abajo (pertinencia-bloque.html); el 404, lo mismo.
    expect(REGLAS.filter((r) => r.selector === '.pertinencia .pe-404' && r.media === '').map((r) => valor(r.cuerpo, 'margin-bottom'))).toEqual([
      '3.1875rem',
    ])
  })

  it('colores forzados: la barra GOV.CO y el pie azules conservan su color (sus logos son blancos)', () => {
    const conservan = REGLAS_SAPIENCIA.filter(
      (r) => r.media.includes('forced-colors: active') && valor(r.cuerpo, 'forced-color-adjust') === 'none',
    ).map((r) => r.selector)
    expect(conservan.some((s) => /\.pe-sap-govco(?![\w-])/.test(s))).toBe(true)
    expect(conservan.some((s) => /\.pe-sap-pie(?![\w-])/.test(s))).toBe(true)
  })
})
