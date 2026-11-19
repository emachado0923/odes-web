import { describe, expect, it } from 'vitest'
import { parametrosFiltros, rutaFicha, rutaTablero } from './rutas'

describe('rutas de /pai', () => {
  it('ficha por código', () => {
    expect(rutaFicha('SAF-TH-02')).toBe('/pai/indicadores/SAF-TH-02')
  })

  it('tablero con filtros en la URL, sin los vacíos y en orden fijo', () => {
    expect(rutaTablero()).toBe('/pai')
    expect(rutaTablero({ estado: 'pendiente', dependencia: 3, q: '', proceso: null })).toBe(
      '/pai?dependencia=3&estado=pendiente',
    )
    expect(parametrosFiltros({ q: 'talento humano', tipo: 'proyecto' }).toString()).toBe('tipo=proyecto&q=talento+humano')
  })
})
