import { describe, expect, it } from 'vitest'
import { componerPagina, MARCADOR } from './componer'
import pagina from './index.html?raw'
import bloque from './observatorio-bloque.html?raw'

describe('componerPagina', () => {
  it('pone el bloque tal cual en el lugar del marcador, aunque traiga "$"', () => {
    expect(componerPagina(`<main>${MARCADOR}</main>`, "<p>$ 999.999 $& $' $1</p>")).toBe(
      "<main><p>$ 999.999 $& $' $1</p></main>",
    )
  })

  it('falla si la página no tiene el marcador o lo tiene repetido', () => {
    expect(() => componerPagina('<main></main>', 'x')).toThrow(/exactamente una vez \(tiene 0\)/)
    expect(() => componerPagina(MARCADOR + MARCADOR, 'x')).toThrow(/exactamente una vez \(tiene 2\)/)
  })

  it('la página de /principal queda con el bloque completo, una sola vez', () => {
    const resultado = componerPagina(pagina, bloque)
    expect(resultado.split(bloque)).toHaveLength(2)
    expect(resultado).not.toContain(MARCADOR)
    // El bloque va dentro del <main> de la página, en la columna del tema.
    const inicioColumna = resultado.indexOf('<div class="pp-columna">')
    expect(inicioColumna).toBeGreaterThan(resultado.indexOf('<main id="contenido"'))
    expect(resultado.indexOf(bloque)).toBeGreaterThan(inicioColumna)
    expect(resultado.indexOf(bloque) + bloque.length).toBeLessThan(resultado.indexOf('</main>'))
  })
})
