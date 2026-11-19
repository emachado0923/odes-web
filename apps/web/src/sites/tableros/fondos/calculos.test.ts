import { describe, expect, it } from 'vitest'
import {
  activosPorCategoria,
  activosPorPrograma,
  alternar,
  beneficiosPorPeriodo,
  cohortesPorConvocatoria,
  destinosPorConvocatoria,
  destinosPorPais,
  estadosDelPeriodo,
  estadosPorPeriodo,
  estadosPorPrograma,
  fechaLarga,
  filasDetalle,
  filtrosIniciales,
  filtrosQueNoAplican,
  type FiltrosFondos,
  girosPorPeriodo,
  girosPorPrograma,
  lineasDe,
  millones,
  millonesCorto,
  opcionesConvocatoria,
  opcionesPrograma,
  ordenPorValor,
  periodosRegulares,
  programasConDesglose,
  resumir,
  textoNoAplican,
  ventana,
} from './calculos'
import type { ConjuntoFondos } from './tipos'

/*
 * Datos hechos a mano, pequeños para poder sumar de cabeza. Periodo 3
 * («2026-1») es el actual; el 2 («2025-3») es un intersemestral.
 */
const C: ConjuntoFondos = {
  meta: {
    titulo: 'Prueba',
    corte: '2026-11-09',
    periodoActual: '2026-1',
    fuente: 'Prueba',
    generado: '2026-11-17',
    beneficios: 0,
    filasOrigen: 0,
    excluidos: 'Nada',
  },
  dim: {
    programa: [
      { clave: 'EPM', nombre: 'Fondo EPM', corto: 'EPM', linea: 'Pregrado' },
      { clave: 'MB', nombre: 'Becas Mejores Bachilleres', corto: 'Mejores Bachilleres', linea: 'Pregrado' },
      { clave: 'EM', nombre: 'Enlaza Mundos', corto: 'Enlaza Mundos', linea: 'Movilidad internacional' },
    ],
    convocatoria: ['2025-1', '2025-2', '2026-1'],
    periodo: ['2025-1', '2025-2', '2025-3', '2026-1'],
    estado: ['Activo', 'Suspensión', 'Desertor'],
    sexo: ['Mujer', 'Hombre'],
    comuna: ['Popular', 'Belén'],
    ies: ['Universidad de Antioquia', 'ITM', 'EAFIT'],
    pais: ['España', 'Chile'],
  },
  // [programa, convocatoria, periodo, estado, beneficios]
  estados: [
    [0, 0, 0, 0, 10],
    [0, 0, 1, 0, 8],
    [0, 0, 1, 1, 2],
    [0, 0, 2, 0, 1],
    [0, 0, 3, 0, 7],
    [0, 0, 3, 2, 1],
    [1, 1, 1, 0, 5],
    [1, 1, 3, 0, 4],
    [1, 2, 3, 0, 6],
    [2, 2, 3, 0, 3],
    [2, 2, 3, 1, 1],
  ],
  // [programa, periodo, monto, matricula, sostenimiento, conGiro]
  giros: [
    [0, 0, 10_000_000, 4_000_000, 6_000_000, 10],
    [0, 3, 7_500_000, 3_000_000, 4_500_000, 7],
    [1, 3, 2_000_000, null, null, 10],
    [2, 3, 1_250_000, null, null, 3],
  ],
  // [programa, convocatoria, estado actual, beneficios]
  cohortes: [
    [0, 0, 0, 7],
    [0, 0, 2, 3],
    [1, 1, 0, 4],
    [1, 1, 1, 1],
    [1, 2, 0, 6],
    [2, 2, 0, 3],
    [2, 2, 1, 1],
  ],
  // [programa, periodo, categoría, activos]
  sexo: [
    [0, 1, 0, 5],
    [0, 1, 1, 3],
    [0, 3, 0, 4],
    [0, 3, 1, 3],
    [1, 3, 0, 6],
    [1, 3, 1, 4],
    [2, 3, 0, 2],
    [2, 3, 1, 1],
  ],
  comunas: [
    [0, 3, 0, 5],
    [0, 3, 1, 2],
    [1, 3, 1, 10],
    [2, 3, 0, 3],
  ],
  ies: [
    [0, 3, 0, 4],
    [0, 3, 1, 3],
    [1, 3, 0, 10],
  ],
  // [convocatoria, país, beneficios]
  destinos: [
    [0, 0, 2],
    [2, 0, 1],
    [2, 1, 2],
  ],
}

const TODO: FiltrosFondos = filtrosIniciales(C)
const con = (cambios: Partial<FiltrosFondos>): FiltrosFondos => ({ ...TODO, ...cambios })

describe('periodos y filtros iniciales', () => {
  it('abre en meta.periodoActual, sin más filtros', () => {
    expect(TODO).toEqual({ linea: [], programa: [], periodo: 3, convocatoria: [] })
  })

  it('si meta.periodoActual no está, abre en el último periodo regular', () => {
    const otro = { ...C, meta: { ...C.meta, periodoActual: '2030-1' } }
    expect(filtrosIniciales(otro).periodo).toBe(3)
  })

  it('los intersemestrales («-3») no son periodos regulares', () => {
    expect(periodosRegulares(C.dim)).toEqual([0, 1, 3])
  })

  it('las líneas salen de los programas, sin repetir y en su orden', () => {
    expect(lineasDe(C.dim)).toEqual(['Pregrado', 'Movilidad internacional'])
  })
})

describe('estados', () => {
  it('activos por periodo: solo el estado Activo, en todos los periodos', () => {
    expect(beneficiosPorPeriodo(C, TODO, true)).toEqual([10, 13, 1, 20])
  })

  it('beneficios con registro: cualquier estado', () => {
    expect(beneficiosPorPeriodo(C, TODO, false)).toEqual([10, 15, 1, 22])
  })

  it('línea, programa y convocatoria recortan los activos', () => {
    expect(beneficiosPorPeriodo(C, con({ linea: ['Pregrado'] }), true)[3]).toBe(17)
    expect(beneficiosPorPeriodo(C, con({ programa: [2] }), true)[3]).toBe(3)
    expect(beneficiosPorPeriodo(C, con({ convocatoria: [2] }), true)[3]).toBe(9)
    // Línea y programa se cruzan: Enlaza Mundos no es de pregrado.
    expect(beneficiosPorPeriodo(C, con({ linea: ['Pregrado'], programa: [2] }), true)[3]).toBe(0)
  })

  it('estados del periodo elegido', () => {
    expect(estadosDelPeriodo(C, TODO)).toEqual([20, 1, 1])
    expect(estadosDelPeriodo(C, con({ periodo: 1 }))).toEqual([13, 2, 0])
  })

  it('estados por periodo y por programa', () => {
    const porPeriodo = estadosPorPeriodo(C, TODO)
    expect(porPeriodo[1]).toEqual([13, 2, 0])
    expect(porPeriodo[3]).toEqual([20, 1, 1])
    expect(estadosPorPrograma(C, TODO)).toEqual([
      [7, 0, 1],
      [10, 0, 0],
      [3, 1, 0],
    ])
    expect(activosPorPrograma(C, TODO)).toEqual([7, 10, 3])
    expect(activosPorPrograma(C, con({ programa: [0] }))).toEqual([7, 0, 0])
  })

  it('la tabla detallada trae todos los periodos (también los «-3») sin filtrar por periodo', () => {
    expect(filasDetalle(C, TODO)).toHaveLength(C.estados.length)
    const epm = filasDetalle(C, con({ programa: [0], periodo: 0 }))
    expect(epm).toHaveLength(6)
    expect(epm).toContainEqual({ programa: 0, convocatoria: 0, periodo: 2, estado: 0, beneficios: 1 })
  })
})

describe('giros', () => {
  it('monto por periodo; matrícula y sostenimiento solo donde vienen', () => {
    const g = girosPorPeriodo(C, TODO)
    expect(g.monto).toEqual([10_000_000, 0, 0, 10_750_000])
    expect(g.conGiro).toEqual([10, 0, 0, 20])
    expect(g.matricula).toEqual([4_000_000, 0, 0, 3_000_000])
    expect(g.sostenimiento).toEqual([6_000_000, 0, 0, 4_500_000])
  })

  it('la convocatoria no recorta los giros; la línea sí', () => {
    expect(girosPorPeriodo(C, con({ convocatoria: [2] })).monto[3]).toBe(10_750_000)
    expect(girosPorPeriodo(C, con({ linea: ['Pregrado'] })).monto[3]).toBe(9_500_000)
  })

  it('monto por programa en el periodo', () => {
    expect(girosPorPrograma(C, TODO)).toEqual({ monto: [7_500_000, 2_000_000, 1_250_000], conGiro: [7, 10, 3] })
    expect(girosPorPrograma(C, con({ periodo: 0 })).monto).toEqual([10_000_000, 0, 0])
  })

  it('solo los programas con matrícula y sostenimiento tienen desglose', () => {
    expect(programasConDesglose(C)).toEqual([0])
  })
})

describe('cohortes', () => {
  it('estado actual por convocatoria, con línea, programa y convocatoria', () => {
    expect(cohortesPorConvocatoria(C, TODO)).toEqual([
      [7, 0, 3],
      [4, 1, 0],
      [9, 1, 0],
    ])
    expect(cohortesPorConvocatoria(C, con({ programa: [1], convocatoria: [2] }))).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [6, 0, 0],
    ])
  })

  it('el periodo no cambia las cohortes', () => {
    expect(cohortesPorConvocatoria(C, con({ periodo: 0 }))).toEqual(cohortesPorConvocatoria(C, TODO))
  })
})

describe('sexo, comunas e instituciones (solo activos)', () => {
  it('suman los activos del periodo por categoría y cuentan los programas', () => {
    expect(activosPorCategoria(C.sexo, 2, C, TODO).beneficios).toEqual([12, 8])
    expect(activosPorCategoria(C.sexo, 2, C, con({ periodo: 1 })).beneficios).toEqual([5, 3])
    expect(activosPorCategoria(C.comunas, 2, C, con({ linea: ['Pregrado'] })).beneficios).toEqual([5, 12])
    expect(activosPorCategoria(C.ies, 3, C, TODO)).toEqual({ beneficios: [14, 3, 0], programas: [2, 1, 0] })
  })

  it('no tienen convocatoria: el filtro no las cambia', () => {
    expect(activosPorCategoria(C.sexo, 2, C, con({ convocatoria: [0] })).beneficios).toEqual([12, 8])
  })
})

describe('destinos de Enlaza Mundos', () => {
  it('por país y por convocatoria, solo con la convocatoria', () => {
    expect(destinosPorPais(C, TODO)).toEqual([3, 2])
    expect(destinosPorPais(C, con({ convocatoria: [2] }))).toEqual([1, 2])
    expect(destinosPorPais(C, con({ programa: [0], linea: ['Pregrado'], periodo: 0 }))).toEqual([3, 2])
    expect(destinosPorConvocatoria(C, TODO)).toEqual([2, 0, 3])
  })
})

describe('indicadores', () => {
  it('resumen del periodo', () => {
    expect(resumir(C, TODO)).toEqual({
      activos: 20,
      registros: 22,
      monto: 10_750_000,
      mujeres: 12,
      activosSexo: 20,
      programas: 3,
      programasElegidos: 3,
      instituciones: 2,
    })
  })

  it('con filtros: la convocatoria cambia los estados pero no el monto, el sexo ni las instituciones', () => {
    const r = resumir(C, con({ convocatoria: [2] }))
    expect(r).toMatchObject({ activos: 9, registros: 10, monto: 10_750_000, mujeres: 12, programas: 2, instituciones: 2 })
    const pregrado = resumir(C, con({ linea: ['Pregrado'] }))
    expect(pregrado).toMatchObject({ activos: 17, monto: 9_500_000, mujeres: 10, activosSexo: 17, programasElegidos: 2 })
  })
})

describe('opciones de los filtros', () => {
  it('programas: los de las líneas elegidas, más los ya elegidos', () => {
    expect(opcionesPrograma(C.dim, TODO)).toEqual([0, 1, 2])
    expect(opcionesPrograma(C.dim, con({ linea: ['Pregrado'] }))).toEqual([0, 1])
    expect(opcionesPrograma(C.dim, con({ linea: ['Pregrado'], programa: [2] }))).toEqual([0, 1, 2])
  })

  it('convocatorias: las de los programas elegidos, de la más reciente a la más antigua', () => {
    expect(opcionesConvocatoria(C, TODO)).toEqual([2, 1, 0])
    expect(opcionesConvocatoria(C, con({ programa: [0] }))).toEqual([0])
    expect(opcionesConvocatoria(C, con({ programa: [0], convocatoria: [2] }))).toEqual([2, 0])
  })

  it('un clic agrega y otro quita', () => {
    expect(alternar([1, 2], 3)).toEqual([1, 2, 3])
    expect(alternar([1, 2, 3], 2)).toEqual([1, 3])
  })
})

describe('notas de las secciones', () => {
  it('dice qué filtros aplicados no usa una sección (el periodo siempre está aplicado)', () => {
    expect(filtrosQueNoAplican(['linea', 'programa', 'periodo', 'convocatoria'], TODO)).toEqual([])
    expect(filtrosQueNoAplican(['linea', 'programa', 'periodo'], TODO)).toEqual([])
    expect(filtrosQueNoAplican(['linea', 'programa', 'periodo'], con({ convocatoria: [1] }))).toEqual(['convocatoria'])
    expect(filtrosQueNoAplican(['convocatoria'], con({ linea: ['Pregrado'] }))).toEqual(['linea', 'periodo'])
  })

  it('arma la frase en singular o en plural', () => {
    expect(textoNoAplican([])).toBe('')
    expect(textoNoAplican(['periodo'])).toBe('No se aplica el filtro de periodo.')
    expect(textoNoAplican(['linea', 'programa', 'periodo'])).toBe('No se aplican los filtros de línea, programa y periodo.')
  })
})

describe('ventana de los gráficos que se recorren', () => {
  it('sin desplazamiento si caben todas', () => {
    expect(ventana(5, 10)).toBeNull()
    expect(ventana(10, 10)).toBeNull()
  })

  it('una serie cronológica arranca en lo más reciente', () => {
    expect(ventana(43, 10)).toEqual([33, 42])
    expect(ventana(43, 10, 40)).toEqual([33, 42])
  })

  it('si el periodo resaltado queda fuera, la ventana lo trae cerca del centro', () => {
    expect(ventana(43, 10, 5)).toEqual([1, 10])
    expect(ventana(43, 10, 0)).toEqual([0, 9])
  })

  it('una lista que empieza por lo más reciente arranca arriba', () => {
    expect(ventana(43, 10, -1, false)).toEqual([0, 9])
    expect(ventana(43, 10, 20, false)).toEqual([16, 25])
    expect(ventana(43, 10, 42, false)).toEqual([33, 42])
  })
})

describe('formatos', () => {
  it('montos en millones de pesos, con el formato de Colombia', () => {
    expect(millones(19_167_585_368)).toBe('$ 19.167,6 millones')
    expect(millonesCorto(1_379_963_176)).toBe('1.380,0')
    expect(millonesCorto(0)).toBe('0,0')
  })

  it('fecha de corte en palabras', () => {
    expect(fechaLarga('2026-11-09')).toBe('9 de noviembre de 2026')
    expect(fechaLarga('noviembre')).toBe('noviembre')
  })

  it('orden por valor: de mayor a menor, sin los ceros', () => {
    expect(ordenPorValor([3, 0, 5, 3])).toEqual([2, 0, 3])
  })
})
