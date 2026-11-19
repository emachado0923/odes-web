import { describe, expect, it } from 'vitest'
import { diaColombia, diaMaxAutorizacion, finDelDiaColombia, hoyColombia } from './fechas'

describe('fechas de los formularios (hora de Colombia, UTC-5)', () => {
  it('finDelDiaColombia: último instante de ese día en Colombia, en ISO UTC', () => {
    expect(finDelDiaColombia('2026-09-15')).toBe('2026-09-16T04:59:59.999Z')
    expect(finDelDiaColombia('2026-12-31')).toBe('2027-01-01T04:59:59.999Z')
  })

  it('finDelDiaColombia rechaza textos que no son fechas reales', () => {
    expect(finDelDiaColombia('')).toBeNull()
    expect(finDelDiaColombia('2026-02-30')).toBeNull()
    expect(finDelDiaColombia('15/09/2026')).toBeNull()
    expect(finDelDiaColombia('2026-13-01')).toBeNull()
  })

  it('diaColombia: el día en Colombia de un instante (ida y vuelta con finDelDiaColombia)', () => {
    expect(diaColombia('2026-09-16T04:59:59.999Z')).toBe('2026-09-15')
    expect(diaColombia('2026-09-16T05:00:00.000Z')).toBe('2026-09-16')
    expect(diaColombia(finDelDiaColombia('2026-03-01'))).toBe('2026-03-01')
    expect(diaColombia(null)).toBe('')
    expect(diaColombia('no es fecha')).toBe('')
  })

  it('hoyColombia: a las 9 p. m. del 15 en Colombia ya es 16 en UTC, pero sigue siendo 15', () => {
    expect(hoyColombia(new Date('2026-09-16T02:00:00.000Z'))).toBe('2026-09-15')
  })

  it('diaMaxAutorizacion: hoy + 365 días, y el final de ese día cabe en los 366 días que admite el servidor', () => {
    // A las 00:00 del 12 de octubre en Colombia (el caso más ajustado).
    const ahora = new Date('2026-10-12T05:00:00.000Z')
    const maximo = diaMaxAutorizacion(ahora)
    expect(maximo).toBe('2027-10-12')
    const fin = new Date(finDelDiaColombia(maximo) as string).getTime()
    expect(fin).toBeLessThanOrEqual(ahora.getTime() + 366 * 86_400_000)
    expect(diaMaxAutorizacion(new Date('2026-10-13T04:59:00.000Z'))).toBe('2027-10-12')
  })
})
