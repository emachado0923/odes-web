import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

describe('index.html', () => {
  it('sin JavaScript muestra un aviso general en lugar de una página en blanco', () => {
    const aviso = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? ''
    expect(aviso).toContain('Para usar este sitio, activa JavaScript en tu navegador.')
    // Va después del contenedor de React (el mismo index.html sirve /sivu, /odes y /repositorio).
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf('<div id="root"></div>'))
  })
})
