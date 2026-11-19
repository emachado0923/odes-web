/**
 * Tablero medida de pertinencia (public/tableros/medida-pertinencia/index.html): la página completa que abre
 * "Conoce más". Es un solo archivo que se puede mover tal cual: nada se carga de otro sitio.
 */
import { describe, expect, it } from 'vitest'
import pagina from '../public/tableros/medida-pertinencia/index.html?raw'
import definiciones from '../public/tableros/pertinencia/datos/definiciones.js?raw'
import consulta from '../public/tableros/pertinencia/js/consulta.jsx?raw'
import datosEmbebido from '../public/tableros/pertinencia/datos/pertinencia.js?raw'

const TITULO = 'Tablero medida de pertinencia'
/** La página sin comentarios (los de la aplicación mencionan el React del original). */
const codigo = pagina.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const inicioDatos = pagina.indexOf('window.ODES.pertinencia = ') + 'window.ODES.pertinencia = '.length
const datos = JSON.parse(pagina.slice(inicioDatos, pagina.indexOf(';\n', inicioDatos)))

describe('tablero medida de pertinencia', () => {
  it('es un solo archivo: no carga scripts, hojas de estilo ni imágenes de afuera', () => {
    expect(pagina).not.toMatch(/<script[^>]*\ssrc=/i)
    expect(pagina).not.toMatch(/<link[^>]*rel=["']?stylesheet/i)
    expect(pagina).not.toMatch(/\ssrc=["']?(?!data:)[^"'\s>]+/i)
    // url() de CSS (no URL.revokeObjectURL(url) de la descarga del CSV)
    expect(pagina).not.toMatch(/(?<![\w.])url\(\s*(?!["']?(?:data:|#))/i)
    expect(pagina).not.toMatch(/\bfetch\(|XMLHttpRequest|import\(/)
  })

  it('lleva el título en la pestaña y en la cabecera', () => {
    expect(pagina).toContain(`<title>${TITULO}</title>`)
    expect(pagina).toContain(`<h1 class="odes-titulo">${TITULO}</h1>`)
  })

  it('tiene la cabecera y el pie del tablero de matrícula 2025 (azul con filete magenta)', () => {
    expect(pagina).toContain('<header class="odes-header">')
    expect(pagina).toContain('<footer class="odes-footer">')
    expect(pagina).toContain('--odes-azul: #0E5074;')
    expect(pagina).toContain('--odes-linea: #921C8D;')
    expect(pagina).toContain('border-bottom: 4px solid var(--odes-linea);')
    expect(pagina).toContain('border-top: 4px solid var(--odes-linea);')
  })

  it('trae los datos en línea y una sola aplicación, encerrada con "use strict"', () => {
    expect(pagina.match(/window\.ODES\s*=/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(pagina).toContain('datos/definiciones.js')
    expect(pagina).toContain('datos/pertinencia.js')
    expect(pagina.match(/'use strict'/g)).toHaveLength(1)
    expect(codigo).not.toMatch(/React|Babel|echarts/)
  })

  it('los dos tableros llevan la nota final y distinguen los programas con "Virtual" o el domicilio', () => {
    const nota = "notaFinal: 'La presencia de un programa en esta herramienta de consulta no habilita su financiación en el " +
      'Programa Único de Acceso y Permanencia. El índice y el puntaje solo informan el criterio de pertinencia; la ' +
      "elegibilidad del programa y de la persona aspirante se rige por los términos de cada convocatoria.'"
    expect(pagina).toContain(nota)
    expect(definiciones).toContain(nota)
    // La nota es lo último del tablero.
    expect(pagina).toContain("DEF.notaFinal ? h('p', { className: 'nota-final' }, DEF.notaFinal) : null);")
    expect(consulta.match(/\{DEF\.notaFinal \? <p className="nota-final">\{DEF\.notaFinal\}<\/p> : null\}\n\s*<\/div>\n(?:\s*<\/Fragment>\n)?\s*\);/g))
      .toHaveLength(2)
    for (const app of [pagina, consulta]) {
      expect(app).toContain('lugar: P.lugares[f[6]]')
      expect(app).toContain("['SNIES: ' + p.codigo, P.ies[p.ies].nombre, p.lugar]")
    }
  })

  it('con una institución elegida la lista muestra todos sus programas', () => {
    expect(pagina).toContain('limite: sel.ies !== null ? Infinity : 300')
    expect(consulta.match(/limite=\{sel\.ies !== null \? Infinity : 300\}/g)).toHaveLength(2)
  })

  it('los programas son las filas de la base del SNIES, sin nombres dañados y con su domicilio', () => {
    expect(datos.lugares).toContain('Virtual')
    expect(datos.programas.length).toBeGreaterThan(30000)
    for (const f of datos.programas) {
      expect(f).toHaveLength(7)
      expect(f[1]).not.toMatch(/[¿?ÀÈÌÒÙàèìòù]/)
      expect(datos.lugares[f[6]]).toBeTruthy()
    }
    expect(new Set(datos.programas.map((f: unknown[]) => f[0])).size).toBe(datos.programas.length)
  })

  it('el índice y el puntaje de cada campo siguen el procedimiento de la resolución', () => {
    type Fila = { indice: string; puntaje: number }
    const rango = (texto: string) => {
      const n = (texto.match(/\d+/g) ?? []).map(Number)
      if (/mayor/i.test(texto)) return [n[0] + 1, 100]
      if (/menor/i.test(texto)) return [0, n[0]]
      return n.length >= 2 ? [n[0], n[1]] : [n[0], n[0]]
    }
    const distintos: string[] = []
    for (const c of datos.campos) {
      const den = c.dir + c.comp * 0.5
      const pop = den ? (c.relDir + c.relComp * 0.5) / den : 0
      if (c.ip !== Math.max(0, Math.ceil(pop * 100 - 1e-9))) distintos.push(`${c.codigo} índice`)
      for (const linea of ['pregrado', 'efe', 'em']) {
        const fila = (datos.puntajes[linea] as Fila[]).find(f => {
          const [a, b] = rango(f.indice)
          return c.ip >= a && c.ip <= b
        })
        if (c.puntaje[linea] !== fila?.puntaje) distintos.push(`${c.codigo} puntaje ${linea}`)
      }
    }
    expect(distintos).toEqual([])
    for (const f of datos.programas) expect(datos.campos[f[5]]).toBeDefined()
  })

  it('el tablero embebido y el de "Conoce más" tienen los mismos datos', () => {
    expect(datosEmbebido.match(/^window\.ODES\.pertinencia = .*$/m)?.[0])
      .toBe(pagina.match(/^window\.ODES\.pertinencia = .*$/m)?.[0])
  })
})
