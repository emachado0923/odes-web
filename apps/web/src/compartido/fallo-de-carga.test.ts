import { afterEach, describe, expect, it, vi } from 'vitest'
import { esFalloDeCarga, olvidarRecarga, recargarUnaVez } from './fallo-de-carga'

afterEach(() => {
  sessionStorage.clear()
})

describe('fallo al descargar un chunk', () => {
  it('reconoce los mensajes de Safari, Chrome y Firefox', () => {
    expect(esFalloDeCarga(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(esFalloDeCarga(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true)
    expect(esFalloDeCarga(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(esFalloDeCarga(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(esFalloDeCarga('Importing a module script failed.')).toBe(false)
  })

  it('recarga una sola vez por pestaña, y otra vez después de una carga buena', () => {
    const recargar = vi.fn<() => void>()
    expect(recargarUnaVez('prueba', recargar)).toBe(true)
    expect(recargarUnaVez('prueba', recargar)).toBe(false)
    expect(recargar).toHaveBeenCalledTimes(1)

    olvidarRecarga('prueba')
    expect(recargarUnaVez('prueba', recargar)).toBe(true)
    expect(recargar).toHaveBeenCalledTimes(2)
  })

  it('sin sessionStorage no recarga (no podría evitar un ciclo)', () => {
    const recargar = vi.fn<() => void>()
    const lectura = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    try {
      expect(recargarUnaVez('prueba', recargar)).toBe(false)
      expect(recargar).not.toHaveBeenCalled()
    } finally {
      lectura.mockRestore()
    }
  })
})
