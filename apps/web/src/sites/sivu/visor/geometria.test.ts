import { describe, expect, it } from 'vitest'
import {
  MARGEN_SEGURIDAD,
  calcularDistanciaEntrada,
  calcularRadioSeguro,
  corregirPosicionHorizontal,
  elegirDireccionPuerta,
  factorPorFotogramas,
} from './geometria'

describe('calcularRadioSeguro', () => {
  // Edificio de 10 × 6 (X × Z): radios 5 y 3, margen = 10 × 3,5 % = 0,35.
  const margen = 10 * MARGEN_SEGURIDAD

  it('sobre los ejes vale el semieje más el margen del 3,5 %', () => {
    expect(calcularRadioSeguro(1, 0, 10, 6)).toBeCloseTo(5 + margen, 10)
    expect(calcularRadioSeguro(-7, 0, 10, 6)).toBeCloseTo(5 + margen, 10)
    expect(calcularRadioSeguro(0, 2, 10, 6)).toBeCloseTo(3 + margen, 10)
    expect(calcularRadioSeguro(0, -9, 10, 6)).toBeCloseTo(3 + margen, 10)
  })

  it('en la diagonal usa 1 / (|cos| / rx + |sen| / rz)', () => {
    const c = Math.SQRT1_2
    expect(calcularRadioSeguro(1, 1, 10, 6)).toBeCloseTo(1 / (c / 5 + c / 3) + margen, 10)
    // Edificio cuadrado: r / √2 en los cuatro cuadrantes.
    for (const [dx, dz] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      expect(calcularRadioSeguro(dx, dz, 8, 8)).toBeCloseTo(4 / Math.SQRT2 + 8 * MARGEN_SEGURIDAD, 10)
    }
  })

  it('no divide entre cero con un edificio plano', () => {
    expect(Number.isFinite(calcularRadioSeguro(1, 1, 0, 0))).toBe(true)
  })
})

describe('corregirPosicionHorizontal', () => {
  it('no toca una cámara que ya está fuera del radio seguro', () => {
    expect(corregirPosicionHorizontal(20, 0, 10, 6)).toBeNull()
  })

  it('empuja hacia afuera, en la misma dirección, una cámara dentro del edificio', () => {
    const corregida = corregirPosicionHorizontal(1, 0, 10, 6)
    expect(corregida).not.toBeNull()
    expect(corregida!.x).toBeCloseTo(5 + 10 * MARGEN_SEGURIDAD, 10)
    expect(corregida!.z).toBeCloseTo(0, 10)

    const diagonal = corregirPosicionHorizontal(0.5, 0.5, 8, 8)!
    expect(diagonal.x).toBeCloseTo(diagonal.z, 10)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(calcularRadioSeguro(1, 1, 8, 8), 10)
  })

  it('en el centro exacto saca la cámara por +X', () => {
    const radio = calcularRadioSeguro(0, 0, 10, 6)
    expect(corregirPosicionHorizontal(0, 0, 10, 6)).toEqual({ x: radio, z: 0 })
  })
})

describe('elegirDireccionPuerta', () => {
  it('elige el eje más alineado con "hacia afuera" y lo orienta hacia afuera', () => {
    const x = { x: 1, y: 0, z: 0 }
    const z = { x: 0, y: 0, z: 1 }
    expect(elegirDireccionPuerta(x, z, { x: 0, y: 0, z: 1 })).toEqual({ x: 0, y: 0, z: 1 })
    const d = elegirDireccionPuerta(x, z, { x: -0.9, y: 0, z: 0.1 })
    expect(d.x).toBeCloseTo(-1, 12)
    expect(d.y).toBe(0)
    expect(d.z).toBeCloseTo(0, 12)
  })

  it('aplana el resultado (y = 0) y lo normaliza', () => {
    const inclinado = { x: 0.6, y: 0.8, z: 0 }
    const d = elegirDireccionPuerta(inclinado, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })
    expect(d.y).toBe(0)
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 12)
  })

  it('con "hacia afuera" nulo usa el eje Z sin invertirlo', () => {
    const d = elegirDireccionPuerta({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 })
    expect(d).toEqual({ x: 0, y: 0, z: -1 })
  })
})

describe('calcularDistanciaEntrada', () => {
  it('acota la distancia entre el 25 % y el 40 % del lado mayor', () => {
    expect(calcularDistanciaEntrada(10, 0.1, 0.1)).toBeCloseTo(2.5, 12)
    expect(calcularDistanciaEntrada(10, 0.8, 0.2)).toBeCloseTo(3.2, 12)
    expect(calcularDistanciaEntrada(10, 5, 5)).toBeCloseTo(4, 12)
  })
})

describe('factorPorFotogramas', () => {
  it('a 60 fps (1 fotograma) es exactamente el factor original', () => {
    expect(factorPorFotogramas(0.035, 1)).toBe(0.035)
    expect(factorPorFotogramas(0.0035, 1)).toBe(0.0035)
  })

  it('a 120 fps, dos pasos de medio fotograma equivalen a uno de 60 fps', () => {
    const medio = factorPorFotogramas(0.035, 0.5)
    const restante = (1 - medio) * (1 - medio)
    expect(1 - restante).toBeCloseTo(0.035, 12)
  })
})
