import { describe, expect, it } from 'vitest'
import {
  enlaceOlvidoContrasena,
  erroresCambioContrasena,
  largoContrasena,
  problemaContrasena,
  textoBloqueo,
} from './textos'

describe('textoBloqueo', () => {
  it('convierte los segundos de Retry-After en minutos (redondeando hacia arriba)', () => {
    expect(textoBloqueo(900)).toBe('Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.')
    expect(textoBloqueo(61)).toMatch(/Espere 2 minutos/)
    expect(textoBloqueo(30)).toMatch(/Espere 1 minuto e/)
    expect(textoBloqueo(0)).toMatch(/Espere 1 minuto e/)
  })

  it('sin Retry-After pide esperar unos minutos', () => {
    expect(textoBloqueo(null)).toBe('Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.')
  })
})

describe('enlaceOlvidoContrasena', () => {
  it('abre un correo a quien administra el aplicativo, con asunto y cuerpo', () => {
    const enlace = new URL(enlaceOlvidoContrasena(''))
    expect(enlace.protocol).toBe('mailto:')
    expect(enlace.pathname).toBe('juan.escobar@sapiencia.gov.co')
    expect(enlace.searchParams.get('subject')).toBe('PAI: olvidé mi contraseña')
    expect(enlace.searchParams.get('body')).toMatch(/^Hola:\r\n\r\nOlvidé mi contraseña del Plan de Acción Institucional/)
  })

  it('incluye el usuario escrito (como lo envía el ingreso) y codifica espacios como %20, no +', () => {
    const enlace = enlaceOlvidoContrasena('  Responsable.SAF ')
    expect(new URL(enlace).searchParams.get('body')).toMatch(/\r\nUsuario: responsable\.saf$/)
    expect(enlace).not.toContain('+')
    expect(enlace).toContain('%0D%0A')
  })
})

describe('problemaContrasena (mismas reglas del servidor)', () => {
  it('acepta de 12 a 1024 caracteres sin espacios en los extremos', () => {
    expect(problemaContrasena('abcdefghijkl')).toBeNull()
    expect(problemaContrasena('con espacios en medio')).toBeNull()
    expect(problemaContrasena('x'.repeat(1024))).toBeNull()
  })

  it('rechaza vacías, cortas, largas y con espacios al inicio o al final', () => {
    expect(problemaContrasena('')).toBe('Escriba la contraseña.')
    expect(problemaContrasena('corta')).toMatch(/al menos 12/)
    expect(problemaContrasena('x'.repeat(1025))).toMatch(/más de 1024/)
    expect(problemaContrasena(' abcdefghijkl')).toMatch(/espacios/)
    expect(problemaContrasena('abcdefghijkl ')).toMatch(/espacios/)
  })

  it('cuenta caracteres como el servidor (puntos de código tras NFC), no unidades UTF-16', () => {
    // Seis emoji: 12 unidades UTF-16 pero 6 caracteres para el servidor.
    expect(largoContrasena('🙂'.repeat(6))).toBe(6)
    expect(problemaContrasena('🙂'.repeat(6))).toMatch(/al menos 12/)
    expect(problemaContrasena('🙂'.repeat(12))).toBeNull()
    // "e" + tilde combinable se normaliza a "é" (1 carácter).
    expect(largoContrasena('e\u0301')).toBe(1)
  })
})

describe('erroresCambioContrasena', () => {
  it('sin errores cuando todo está bien', () => {
    expect(erroresCambioContrasena({ actual: 'temporal', nueva: 'nueva-segura-123', confirmacion: 'nueva-segura-123' })).toEqual({})
  })

  it('pide la actual, valida la nueva y exige que la confirmación coincida', () => {
    expect(erroresCambioContrasena({ actual: '', nueva: '', confirmacion: '' })).toEqual({
      actual: 'Escriba su contraseña actual.',
      nueva: 'Escriba la contraseña nueva.',
    })
    expect(erroresCambioContrasena({ actual: 'a', nueva: 'corta', confirmacion: 'corta' }).nueva).toMatch(/al menos 12/)
    expect(
      erroresCambioContrasena({ actual: 'a', nueva: 'nueva-segura-123', confirmacion: 'otra-cosa-1234' }).confirmacion,
    ).toBe('La confirmación no coincide con la contraseña nueva.')
  })

  it('la nueva debe ser distinta de la actual', () => {
    const misma = 'misma-contrasena-1'
    expect(erroresCambioContrasena({ actual: misma, nueva: misma, confirmacion: misma }).nueva).toBe(
      'La contraseña nueva debe ser distinta de la actual.',
    )
  })
})
