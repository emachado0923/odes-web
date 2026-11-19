import { describe, expect, it } from 'vitest'
import { LIMITES_PAI } from '../api-pai'
import { reportePrueba } from '../tablero/datosPruebaTablero'
import {
  datosObservaciones,
  erroresDelServidor,
  hayCambios,
  validarObservaciones,
  valoresDe,
  type ValoresObservaciones,
} from './formularioObservaciones'

const vacio: ValoresObservaciones = {
  logros: '',
  observaciones: '',
  riesgoMaterializado: null,
  numeralRiesgo: '',
  descripcionRiesgo: '',
  fuentesVerificacion: '',
}

describe('formulario de observaciones', () => {
  it('valores a partir del reporte (null -> "")', () => {
    expect(valoresDe(reportePrueba(4))).toEqual(vacio)
    expect(
      valoresDe(reportePrueba(1, { logros: 'L', riesgoMaterializado: 'SI', numeralRiesgo: '2', descripcionRiesgo: 'D' })),
    ).toEqual({ ...vacio, logros: 'L', riesgoMaterializado: 'SI', numeralRiesgo: '2', descripcionRiesgo: 'D' })
  })

  it('hay cambios: cuenta los textos (sin espacios al final) y el riesgo; el numeral solo con "Sí"', () => {
    expect(hayCambios(vacio, vacio)).toBe(false)
    expect(hayCambios({ ...vacio, logros: 'Algo' }, vacio)).toBe(true)
    expect(hayCambios({ ...vacio, logros: '   ' }, vacio)).toBe(false)
    expect(hayCambios({ ...vacio, logros: 'a\r\nb' }, { ...vacio, logros: 'a\nb' })).toBe(false)
    expect(hayCambios({ ...vacio, riesgoMaterializado: 'NO' }, vacio)).toBe(true)
    const no = { ...vacio, riesgoMaterializado: 'NO' as const }
    expect(hayCambios({ ...no, numeralRiesgo: 'oculto' }, no)).toBe(false)
    const si = { ...vacio, riesgoMaterializado: 'SI' as const }
    expect(hayCambios({ ...si, numeralRiesgo: '1' }, si)).toBe(true)
  })

  it('riesgo "Sí" exige numeral y descripción; los textos tienen un máximo', () => {
    expect(validarObservaciones(vacio)).toEqual({})
    expect(validarObservaciones({ ...vacio, riesgoMaterializado: 'NO' })).toEqual({})
    const errores = validarObservaciones({ ...vacio, riesgoMaterializado: 'SI' })
    expect(Object.keys(errores).sort()).toEqual(['descripcionRiesgo', 'numeralRiesgo'])
    expect(validarObservaciones({ ...vacio, riesgoMaterializado: 'SI', numeralRiesgo: '1', descripcionRiesgo: 'D' })).toEqual({})
    expect(validarObservaciones({ ...vacio, logros: 'x'.repeat(LIMITES_PAI.maxTexto + 1) }).logros).toMatch(/a lo sumo/)
    expect(
      validarObservaciones({ ...vacio, riesgoMaterializado: 'SI', numeralRiesgo: 'x'.repeat(201), descripcionRiesgo: 'D' })
        .numeralRiesgo,
    ).toMatch(/a lo sumo 200/)
  })

  it('cuerpo del PUT: textos vacíos como null, sin avance, y el riesgo según la respuesta', () => {
    expect(datosObservaciones({ ...vacio, logros: 'Logro', observaciones: '  ' }, null)).toEqual({
      logros: 'Logro',
      observaciones: null,
      fuentesVerificacion: null,
      actualizadoEn: null,
    })
    expect(
      datosObservaciones(
        { ...vacio, riesgoMaterializado: 'SI', numeralRiesgo: '1', descripcionRiesgo: 'Se materializó' },
        '2026-07-10T15:00:00.000Z',
      ),
    ).toEqual({
      logros: null,
      observaciones: null,
      fuentesVerificacion: null,
      riesgoMaterializado: 'SI',
      numeralRiesgo: '1',
      descripcionRiesgo: 'Se materializó',
      actualizadoEn: '2026-07-10T15:00:00.000Z',
    })
    // "No" borra el numeral y la descripción que hubiera.
    expect(datosObservaciones({ ...vacio, riesgoMaterializado: 'NO', numeralRiesgo: '1' }, null)).toMatchObject({
      riesgoMaterializado: 'NO',
      numeralRiesgo: null,
      descripcionRiesgo: null,
    })
    expect(datosObservaciones(vacio, null)).not.toHaveProperty('avance')
    expect(datosObservaciones(vacio, null)).not.toHaveProperty('riesgoMaterializado')
  })

  it('errores del servidor por campo: solo los del formulario', () => {
    expect(erroresDelServidor({ numeralRiesgo: 'Falta.', avance: 'otro', nada: 'x' })).toEqual({ numeralRiesgo: 'Falta.' })
  })
})
