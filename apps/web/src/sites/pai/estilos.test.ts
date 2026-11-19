/**
 * Reglas de las hojas del PAI que no se ven en jsdom (no aplica CSS): se
 * revisa el texto de las hojas para que no vuelvan los problemas medidos en
 * el navegador (modo oscuro del kit, barras de progreso, región aria-live,
 * contraste de las ayudas y de las casillas marcadas).
 */
import { describe, expect, it } from 'vitest'

const hojas = import.meta.glob<string>('./**/*.css', { query: '?raw', import: 'default', eager: true })
const todas = Object.entries(hojas)
const pai = hojas['./pai.css']
const tablero = hojas['./tablero/tablero-pai.css']

/** Cuerpo de la regla cuyo selector es exactamente `selector` (sin comentarios). */
function regla(css: string, selector: string): string {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const inicio = limpio.split('}').find((bloque) => bloque.split('{')[0].trim() === selector)
  return inicio ? inicio.split('{')[1] : ''
}

describe('hojas del PAI', () => {
  it('se leen (import.meta.glob ?raw)', () => {
    expect(todas.length).toBeGreaterThanOrEqual(7)
    expect(pai).toContain('.pai')
    expect(regla(pai, '.pai .pai-principal')).toMatch(/flex:\s*1/)
  })

  it('modo oscuro: ninguna regla usa la forma de ancestro "[data-bs-theme=dark] .pai" (pintaba rosa pálido sobre la página clara)', () => {
    const conAncestro = todas
      .filter(([, css]) => /\[data-bs-theme=['"]?dark['"]?\]\s+\.pai(?![\w-])/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')))
      .map(([archivo]) => archivo)
    expect(conAncestro).toEqual([])
  })

  it('barras de progreso: sin el punto ::before del kit y con la barra dentro del riel', () => {
    expect(regla(pai, '.pai .progress::before')).toMatch(/content:\s*none/)
    expect(regla(pai, '.pai .progress .progress-bar')).toMatch(/top:\s*0/)
    expect(regla(pai, '.pai .progress .progress-bar')).toMatch(/height:\s*100%/)
  })

  it('la región aria-live de la casilla nunca queda en display:none', () => {
    expect(tablero).not.toMatch(/\.pai-casilla-estado:empty\s*\{[^}]*display:\s*none/)
  })

  it('contraste: ayudas con el gris tenue de la rama y casillas marcadas en azul oscuro', () => {
    expect(regla(pai, '.pai .form-text')).toMatch(/color:\s*var\(--pai-tenue\)/)
    expect(regla(pai, '.pai .card-footer a')).toMatch(/color:\s*var\(--pai-magenta-oscuro\)/)
    expect(regla(pai, '.pai .form-check-input')).toMatch(/--bs-form-check-checked-bg-color:\s*var\(--bs-tertiary-blue-40/)
    expect(pai).toMatch(/\.pai \.form-check-input:not\(:checked, :indeterminate\)/)
  })
})
