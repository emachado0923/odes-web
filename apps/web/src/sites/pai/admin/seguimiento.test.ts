import { describe, expect, it } from 'vitest'
import { tableroPrueba } from '../tablero/datosPruebaTablero'
import {
  LEYENDA_NIVELES,
  anchoBarra,
  bimestresFuturos,
  claseProgreso,
  nivelAvance,
  textoPendientes,
  textoReportados,
  textoSinLogro,
} from './seguimiento'

describe('niveles y colores del avance', () => {
  it('completo desde 100 % (como el tablero), parcial desde 50 %, bajo por debajo y sin dato si es null', () => {
    expect(nivelAvance(1.2)).toBe('completo')
    expect(nivelAvance(1)).toBe('completo')
    expect(nivelAvance(0.9999999999)).toBe('completo')
    expect(nivelAvance(0.966)).toBe('parcial')
    expect(nivelAvance(0.95)).toBe('parcial')
    expect(nivelAvance(0.5)).toBe('parcial')
    expect(nivelAvance(0.1)).toBe('bajo')
    expect(nivelAvance(0)).toBe('bajo')
    expect(nivelAvance(null)).toBe('sin_dato')
    expect(nivelAvance(Number.NaN)).toBe('sin_dato')
  })

  it('cada nivel usa una variante de progress del kit', () => {
    expect(claseProgreso(1)).toBe('progress-success')
    expect(claseProgreso(0.6)).toBe('progress-warning')
    expect(claseProgreso(0.2)).toBe('progress-danger')
    expect(claseProgreso(null)).toBe('progress-neutral')
  })

  it('el ancho de la barra va de 0 a 100 (más de 100 % la llena)', () => {
    expect(anchoBarra(0.456)).toBe(45.6)
    expect(anchoBarra(1.7)).toBe(100)
    expect(anchoBarra(-0.2)).toBe(0)
    expect(anchoBarra(null)).toBe(0)
  })
})

describe('conteo del bimestre abierto', () => {
  it('"120 de 138 reportados" cuenta los que tienen meta o ya reportaron', () => {
    expect(textoReportados({ bimestre: 4, reportados: 120, pendientes: 18, sinMeta: 4 })).toBe('120 de 138 reportados')
    expect(textoReportados({ bimestre: 4, reportados: 1200, pendientes: 34, sinMeta: 0 })).toBe('1.200 de 1.234 reportados')
  })

  it('sin indicadores con meta ni reportes: "Sin meta en el bimestre 4" (no "0 de 0")', () => {
    expect(textoReportados({ bimestre: 4, reportados: 0, pendientes: 0, sinMeta: 7 })).toBe('Sin meta en el bimestre 4')
  })

  it('pendientes y sin meta, solo si hay', () => {
    expect(textoPendientes({ bimestre: 4, reportados: 120, pendientes: 18, sinMeta: 4 })).toBe('18 pendientes · 4 sin meta')
    expect(textoPendientes({ bimestre: 4, reportados: 1, pendientes: 1, sinMeta: 0 })).toBe('1 pendiente')
    expect(textoPendientes({ bimestre: 4, reportados: 5, pendientes: 0, sinMeta: 0 })).toBe('')
  })
})

describe('leyenda y bimestres futuros', () => {
  it('la leyenda usa las mismas variantes que las barras', () => {
    expect(LEYENDA_NIVELES.map((n) => n.clase)).toEqual(['progress-success', 'progress-warning', 'progress-danger'])
  })

  it('los bimestres con estado futuro aún no se reportan (no "Sin datos")', () => {
    const futuros = bimestresFuturos(tableroPrueba())
    expect([...futuros]).toEqual([5, 6])
    expect(textoSinLogro(5, futuros)).toBe('Aún no se reporta')
    expect(textoSinLogro(2, futuros)).toBe('Sin datos')
    expect(bimestresFuturos({ indicadores: [] }).size).toBe(0)
  })
})
