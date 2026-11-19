import { describe, expect, it } from 'vitest'
import { formatoBytes, formatoFecha, formatoFechaCorta, formatoNumero, formatoPorcentaje } from './formatos'

describe('formatos del PAI (es-CO, hora de Colombia)', () => {
  it('números y porcentajes', () => {
    expect(formatoNumero(1234.5)).toBe('1.234,5')
    expect(formatoNumero(0.1666666667)).toBe('0,17')
    expect(formatoNumero(0.1666666667, true)).toBe('0,166667')
    expect(formatoNumero(null)).toBe('—')
    expect(formatoPorcentaje(0.85)).toBe('85 %')
    expect(formatoPorcentaje(1.234)).toBe('123,4 %')
    expect(formatoPorcentaje(null)).toBe('—')
  })

  it('fechas en la hora de Colombia', () => {
    // 2026-09-16 03:00 UTC = 15 de septiembre, 10 p. m. en Bogotá.
    expect(formatoFecha('2026-09-16T03:00:00.000Z')).toBe('15 de septiembre de 2026')
    expect(formatoFechaCorta('2026-09-16T03:00:00.000Z')).toBe('15 de septiembre')
    expect(formatoFecha(null)).toBe('')
    expect(formatoFecha('no es fecha')).toBe('')
  })

  it('tamaños', () => {
    expect(formatoBytes(120)).toBe('120 B')
    expect(formatoBytes(830 * 1024)).toBe('830 KB')
    expect(formatoBytes(2.44 * 1024 * 1024)).toBe('2,4 MB')
  })
})
