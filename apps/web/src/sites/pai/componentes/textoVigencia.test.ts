import { describe, expect, it } from 'vitest'
import { vigenciaPrueba } from '../pruebas/datosPrueba'
import { SIN_BIMESTRE_ABIERTO, fechaLimite, nombreBimestre, textoVigencia } from './textoVigencia'

describe('textoVigencia (barra de navegación)', () => {
  it('bimestre abierto con fecha límite: "Bimestre 4 · julio–agosto · abierto hasta el 15 de septiembre"', () => {
    // 15 de septiembre a las 23:59:59.999 en Colombia (UTC-5).
    const vigencia = vigenciaPrueba({ bimestreAbierto: 4, abiertoHasta: '2026-09-16T04:59:59.999Z', abiertoAhora: true })
    expect(textoVigencia(vigencia)).toBe('Bimestre 4 · julio–agosto · abierto hasta el 15 de septiembre')
  })

  it('sin bimestre abierto: "No hay bimestre abierto"', () => {
    expect(textoVigencia(vigenciaPrueba({ bimestreAbierto: null }))).toBe(SIN_BIMESTRE_ABIERTO)
    expect(SIN_BIMESTRE_ABIERTO).toBe('No hay bimestre abierto')
  })

  it('abierto sin fecha límite', () => {
    expect(textoVigencia(vigenciaPrueba({ bimestreAbierto: 5, abiertoHasta: null }))).toBe(
      'Bimestre 5 · septiembre–octubre · abierto',
    )
  })

  it('con la fecha límite vencida lo dice (el servidor ya no deja reportar)', () => {
    const vigencia = vigenciaPrueba({ bimestreAbierto: 4, abiertoHasta: '2026-09-16T04:59:59.999Z', abiertoAhora: false })
    expect(textoVigencia(vigencia)).toBe('Bimestre 4 · julio–agosto · el plazo venció el 15 de septiembre')
  })

  it('la fecha lleva el año solo si no es el de la vigencia', () => {
    expect(fechaLimite('2026-09-16T04:59:59.999Z', 2026)).toBe('15 de septiembre')
    expect(fechaLimite('2027-01-16T04:59:59.999Z', 2026)).toBe('15 de enero de 2027')
    expect(fechaLimite('no es fecha', 2026)).toBe('')
  })

  it('nombreBimestre usa los nombres que manda el servidor', () => {
    const vigencia = vigenciaPrueba()
    expect(nombreBimestre(vigencia, 1)).toBe('Bimestre 1 · enero–febrero')
    expect(nombreBimestre(vigencia, null)).toBe('')
  })
})
