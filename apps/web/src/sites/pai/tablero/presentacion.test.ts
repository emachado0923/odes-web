import { describe, expect, it } from 'vitest'
import { LIMITES_PAI } from '../api-pai'
import { vigenciaPrueba } from '../pruebas/datosPrueba'
import { indicadorPrueba } from './datosPruebaTablero'
import {
  bimestreInicial,
  claseCasilla,
  claseReporte,
  claseTotal,
  conteoTextos,
  descripcionCasilla,
  leerAvance,
  nombreTipoEvidencia,
  textoConteo,
  textoEditable,
  textoMotivo,
  textoPorcentaje,
  textoRegla,
  textoTope,
  totalEvidencias,
  LEYENDA_AVANCE,
  escalaDe,
  nombreTipoMeta,
} from './presentacion'

describe('color de las casillas (claseCasilla)', () => {
  const indicador = indicadorPrueba({
    id: 1,
    codigo: 'SAF-TH-01',
    metas: [2, 2, 2, 0, 0, 2],
    avances: [2, 1, null, 5, null, null],
    porcentajes: [1, 0.5, null, null, null, null],
    estados: ['reportado', 'reportado', 'pendiente', 'reportado', 'sin_meta', 'futuro'],
  })

  it('completo con 100 %, parcial por debajo, sin avance sin % y sin meta con meta 0 (aunque haya avance)', () => {
    expect(claseCasilla(indicador, 1)).toBe('completo')
    expect(claseCasilla(indicador, 2)).toBe('parcial')
    expect(claseCasilla(indicador, 3)).toBe('cero')
    expect(claseCasilla(indicador, 4)).toBe('sin_meta')
    expect(claseCasilla(indicador, 5)).toBe('sin_meta')
  })

  it('el estado futuro del servidor manda sobre la meta', () => {
    expect(claseCasilla(indicador, 6)).toBe('futuro')
  })

  it('tolera el redondeo de Excel cerca de 100 % y trata 0 % como sin avance', () => {
    const casi = indicadorPrueba({ id: 2, codigo: 'X-01', porcentajes: [0.99999999999, 0, 1.4, null, null, null] })
    expect(claseCasilla(casi, 1)).toBe('completo')
    expect(claseCasilla(casi, 2)).toBe('cero')
    expect(claseCasilla(casi, 3)).toBe('completo')
  })

  it('total y reporte de la ficha con las mismas reglas', () => {
    expect(claseTotal({ metaTotal: 12, porcentajeTotal: 0.25 })).toBe('parcial')
    expect(claseTotal({ metaTotal: 0, porcentajeTotal: null })).toBe('sin_meta')
    expect(claseTotal({ metaTotal: 10, porcentajeTotal: null })).toBe('cero')
    expect(claseReporte({ estado: 'futuro', meta: 2, porcentaje: null })).toBe('futuro')
    expect(claseReporte({ estado: 'reportado', meta: 2, porcentaje: 1 })).toBe('completo')
  })

  it('textos del % y descripción para lectores de pantalla', () => {
    expect(textoPorcentaje('sin_meta', null)).toBe('Sin meta')
    expect(textoPorcentaje('parcial', 0.5)).toBe('50 %')
    expect(textoPorcentaje('cero', null)).toBe('—')
    expect(descripcionCasilla(indicador, 2)).toBe('Bimestre 2, marzo–abril: meta 2, avance 1, 50 %, parcial.')
    expect(descripcionCasilla(indicador, 3)).toBe('Bimestre 3, mayo–junio: meta 2, avance sin reportar, sin avance.')
    expect(descripcionCasilla(indicador, 4)).toBe('Bimestre 4, julio–agosto: meta 0, avance 5, sin meta.')
  })
})

describe('avance que escribe el responsable (leerAvance / textoEditable)', () => {
  it('acepta coma o punto decimal y vacío como borrar', () => {
    expect(leerAvance('12,5')).toEqual({ ok: true, valor: 12.5 })
    expect(leerAvance(' 12.5 ')).toEqual({ ok: true, valor: 12.5 })
    expect(leerAvance('0,125')).toEqual({ ok: true, valor: 0.125 })
    expect(leerAvance('1234,567')).toEqual({ ok: true, valor: 1234.567 })
    expect(leerAvance('1250')).toEqual({ ok: true, valor: 1250 })
    expect(leerAvance('0')).toEqual({ ok: true, valor: 0 })
    expect(leerAvance('')).toEqual({ ok: true, valor: null })
    expect(leerAvance('   ')).toEqual({ ok: true, valor: null })
  })

  it('rechaza lo ambiguo (¿miles o decimales?) con una sugerencia', () => {
    expect(leerAvance('1.250')).toEqual({ ok: false, mensaje: '«1.250» es ambiguo: escriba 1250 o 1,25.' })
    expect(leerAvance('2,500').ok).toBe(false)
  })

  it('rechaza negativos, letras, separadores de miles y más de 6 decimales', () => {
    expect(leerAvance('-3')).toEqual({ ok: false, mensaje: 'El avance no puede ser negativo.' })
    expect(leerAvance('abc').ok).toBe(false)
    expect(leerAvance('1.234,5').ok).toBe(false)
    expect(leerAvance('1e3').ok).toBe(false)
    expect(leerAvance('0,1234567')).toEqual({ ok: false, mensaje: `Use a lo sumo ${LIMITES_PAI.maxDecimalesAvance} decimales.` })
    expect(leerAvance('0,123456')).toEqual({ ok: true, valor: 0.123456 })
    expect(leerAvance('99999999999999').ok).toBe(false)
  })

  it('muestra el avance sin separador de miles, con coma y hasta 6 decimales', () => {
    expect(textoEditable(1234.5)).toBe('1234,5')
    expect(textoEditable(0.1666666667)).toBe('0,166667')
    expect(textoEditable(0)).toBe('0')
    expect(textoEditable(null)).toBe('')
    // Ida y vuelta: lo que se muestra se vuelve a leer igual.
    expect(leerAvance(textoEditable(41.25))).toEqual({ ok: true, valor: 41.25 })
  })
})

describe('textos de apoyo', () => {
  it('bimestre con el que abren los modales: el editable, si no el abierto, si no el último reportado', () => {
    const editable = indicadorPrueba({ id: 1, codigo: 'A-01', editables: [false, true, false, false, false, false] })
    expect(bimestreInicial(editable, vigenciaPrueba({ bimestreAbierto: 4 }))).toBe(2)
    const cerrado = indicadorPrueba({ id: 2, codigo: 'A-02' })
    expect(bimestreInicial(cerrado, vigenciaPrueba({ bimestreAbierto: 4 }))).toBe(4)
    expect(bimestreInicial(cerrado, vigenciaPrueba({ bimestreAbierto: null }))).toBe(3)
    const vacio = indicadorPrueba({ id: 3, codigo: 'A-03', estados: ['pendiente', 'pendiente', 'futuro', 'futuro', 'futuro', 'futuro'] })
    expect(bimestreInicial(vacio, null)).toBe(1)
  })

  it('insignias y conteo', () => {
    const indicador = indicadorPrueba({ id: 1, codigo: 'A-01', tieneTextos: [true, false, true, false, false, false], evidencias: [1, 0, 3, 0, 0, 0] })
    expect(conteoTextos(indicador)).toBe(2)
    expect(totalEvidencias(indicador)).toBe(4)
    expect(textoConteo(344, 344)).toBe('344 indicadores')
    expect(textoConteo(1, 1)).toBe('1 indicador')
    expect(textoConteo(12, 1344)).toBe('12 de 1.344 indicadores')
  })

  it('motivos de edición según el rol', () => {
    expect(textoMotivo('abierto', 'responsable')).toMatch(/puede editarlo/)
    expect(textoMotivo('autorizado', 'responsable')).toMatch(/autorización/)
    expect(textoMotivo('sin_permiso', 'administrador')).toMatch(/solo lectura/)
    expect(textoMotivo('sin_permiso', 'responsable')).toMatch(/No tiene permiso/)
  })

  it('reglas de los totales y tope del %', () => {
    expect(textoRegla('suma', null)).toBe('Suma de los seis bimestres')
    expect(textoRegla('suma_dividida', 6)).toBe('Suma de los bimestres dividida entre 6')
    expect(textoRegla('si_suma_mayor_99_entonces_100', null)).toMatch(/supera 99/)
    expect(textoRegla('constante', null)).toMatch(/Valor fijo/)
    expect(textoTope({ tope100: true, topePorBimestre: null })).toBe('El % se limita a 100 %')
    expect(textoTope({ tope100: false, topePorBimestre: null })).toMatch(/no tiene tope/)
    expect(
      textoTope({ tope100: null, topePorBimestre: { bimestres: [true, false, true, false, false, false], total: false } }),
    ).toBe('Tope de 100 % en los bimestres 1, 3; el total no tiene tope')
  })

  it('nombre del tipo de evidencia', () => {
    expect(nombreTipoEvidencia('application/pdf')).toBe('PDF')
    expect(nombreTipoEvidencia('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel')
    expect(nombreTipoEvidencia('text/plain')).toBe('Archivo')
  })
})

describe('bimestres futuros y escala de los porcentajes', () => {
  it('un bimestre futuro es neutro (clase futuro) y se describe como "aún no se reporta"', () => {
    const indicador = indicadorPrueba({ id: 1, codigo: 'SAF-TH-01' })
    expect(claseCasilla(indicador, 5)).toBe('futuro')
    expect(descripcionCasilla(indicador, 5)).toBe('Bimestre 5, septiembre–octubre: meta 2, aún no se reporta.')
    expect(claseCasilla(indicador, 4)).toBe('cero')
    expect(LEYENDA_AVANCE.find((l) => l.clase === 'futuro')?.descripcion).toMatch(/aún no se reporta/)
  })

  it('escala de los porcentajes: "Porcentaje (de 0 a 1)" solo si el servidor la envía así', () => {
    const base = indicadorPrueba({ id: 1, codigo: 'GEP-EDI-01', tipoMeta: 'porcentaje' })
    expect(escalaDe(base)).toBeNull()
    expect(nombreTipoMeta(base)).toBe('Porcentaje')
    expect(nombreTipoMeta({ ...base, escala: '0-1' } as typeof base)).toBe('Porcentaje (de 0 a 1)')
    expect(nombreTipoMeta({ ...base, escala: '0-100' } as typeof base)).toBe('Porcentaje')
    expect(nombreTipoMeta({ ...base, tipoMeta: 'a_demanda' })).toBe('A demanda')
  })
})
