import { describe, expect, it } from 'vitest'
import {
  delAnio,
  FILTROS_VACIOS,
  filtrar,
  indice,
  matrizPorAnio,
  opcionesDisponibles,
  ordenPorValor,
  participacion,
  porCategoria,
  programasDelAnio,
  referenciaFiltrada,
  referenciaSexo,
  resumenAnio,
  seriePorAnio,
  sexoPorAnio,
  textoRecorte,
  variacion,
} from './calculos'
import type { FilaHistorica, MatriculaHistorica } from './tipos'

/** Dos años, dos instituciones (una oficial, una privada) y tres programas. */
function conjunto(): MatriculaHistorica {
  const filas: FilaHistorica[] = [
    // año, programa, nivel, modalidad, área, nbc, sector, F, M, NB, T
    [0, 0, 2, 0, 0, 0, 0, 60, 40, 0, 0], // 2000 · UdeA · universitario · presencial · oficial
    [0, 1, 1, 1, 1, 1, 1, 10, 30, 0, 0], // 2000 · EAFIT · tecnológico · virtual · privado
    [1, 0, 2, 0, 0, 0, 0, 70, 50, 0, 0], // 2001 · UdeA
    [1, 1, 1, 1, 1, 1, 1, 15, 25, 0, 0], // 2001 · EAFIT
    [1, 2, 4, 0, 0, 0, 1, 5, 5, 1, 0], //   2001 · EAFIT · maestría
  ]
  const cubo = (v: number) => [0, 1, 2, 3, 4, 5].map(() => [0, 1].map(() => [0, 1, 2, 3].map(() => [v, v * 2])))
  return {
    meta: { municipio: 'Medellín', desde: 2000, hasta: 2001, fuente: 'SNIES', generado: '2026-11-25', regla: '', fueraDelDatoAnual: [0, 0] },
    anios: [2000, 2001],
    dim: {
      ies: [
        { nombre: 'Universidad de Antioquia', corto: 'UdeA', caracter: 'Universidad', codigos: ['1201'] },
        { nombre: 'Universidad EAFIT', corto: 'EAFIT', caracter: 'Universidad', codigos: ['1712'] },
      ],
      programa: [
        { codigo: '1', nombre: 'Medicina', ies: 0 },
        { codigo: '2', nombre: 'Tecnología en Sistemas', ies: 1 },
        { codigo: '3', nombre: 'Maestría en Finanzas', ies: 1 },
      ],
      nivel: ['Formación técnica profesional', 'Tecnológico', 'Universitario', 'Especialización', 'Maestría', 'Doctorado'],
      nivelAcad: ['Pregrado', 'Posgrado'],
      acadDeNivel: [0, 0, 0, 1, 1, 1],
      modalidad: ['Presencial', 'Virtual'],
      area: ['Ciencias de la salud', 'Ingeniería'],
      nbc: ['Medicina', 'Sistemas'],
      sector: ['Oficial', 'Privado'],
      sexo: ['Femenino', 'Masculino', 'No binario', 'Trans'],
    },
    filas,
    referencia: {
      Antioquia: { total: [1000, 2000], cubo: cubo(10) },
      Colombia: { total: [10000, 20000], cubo: cubo(100) },
    },
  }
}

describe('series y cortes', () => {
  const c = conjunto()

  it('suma los cuatro sexos por año', () => {
    expect(seriePorAnio(c, c.filas)).toEqual([140, 171])
  })

  it('filtra por institución a través del programa', () => {
    const eafit = filtrar(c, { ...FILTROS_VACIOS, ies: [1] })
    expect(seriePorAnio(c, eafit)).toEqual([40, 51])
  })

  it('combina filtros de distintas dimensiones', () => {
    const f = filtrar(c, { ...FILTROS_VACIOS, sector: [1], nivel: [1] })
    expect(seriePorAnio(c, f)).toEqual([40, 40])
  })

  it('agrupa un año por categoría y por año y categoría', () => {
    expect(porCategoria(c, delAnio(c.filas, 1), 'ies')).toEqual([120, 51])
    expect(matrizPorAnio(c, c.filas, 'sector')).toEqual([
      [100, 120],
      [40, 51],
    ])
    expect(sexoPorAnio(c, c.filas)[2]).toEqual([0, 1])
  })

  it('ordena de mayor a menor y deja fuera las categorías vacías', () => {
    expect(ordenPorValor([5, 0, 9, 5])).toEqual([2, 0, 3])
  })

  it('resume el año elegido', () => {
    const r = resumenAnio(c, c.filas, 1, seriePorAnio(c, c.filas))
    expect(r).toMatchObject({ matriculados: 171, anterior: 140, ies: 2, programas: 3, mujeres: 90 })
    expect(r.variacion).toBeCloseTo(22.14, 2)
    expect(r.pctMujeres).toBeCloseTo(52.63, 2)
    expect(resumenAnio(c, c.filas, 0, [140, 171]).variacion).toBeNull()
  })

  it('arma la tabla de programas del año, de mayor a menor', () => {
    expect(programasDelAnio(c.filas, 1).map((p) => [p.programa, p.matriculados])).toEqual([
      [0, 120],
      [1, 40],
      [2, 11],
    ])
  })

  it('filtra por programa', () => {
    expect(seriePorAnio(c, filtrar(c, { ...FILTROS_VACIOS, programa: [2] }))).toEqual([0, 11])
    expect(textoRecorte(c, { ...FILTROS_VACIOS, programa: [2] })).toBe('Maestría en Finanzas (Universidad EAFIT)')
    expect(referenciaFiltrada(c, 'Colombia', { ...FILTROS_VACIOS, programa: [2] })).toBeNull()
  })

  it('nombra el recorte de los filtros para títulos y descargas', () => {
    expect(textoRecorte(c, FILTROS_VACIOS)).toBe('')
    expect(textoRecorte(c, { ...FILTROS_VACIOS, ies: [0], modalidad: [0] })).toBe('Universidad de Antioquia · Presencial')
    expect(textoRecorte(c, { ...FILTROS_VACIOS, ies: [0, 1] })).toBe('Universidad de Antioquia y Universidad EAFIT')
    expect(textoRecorte(c, { ...FILTROS_VACIOS, nivel: [0, 1, 2] })).toBe('3 niveles de formación')
  })

  it('solo ofrece opciones con matrícula según los demás filtros', () => {
    expect(opcionesDisponibles(c, { ...FILTROS_VACIOS, ies: [0] }, 'nivel').sort()).toEqual([2])
    // La opción elegida queda aunque no tenga matrícula con el resto.
    expect(opcionesDisponibles(c, { ...FILTROS_VACIOS, ies: [0], nivel: [4] }, 'nivel').sort()).toEqual([2, 4])
  })
})

describe('comparación', () => {
  const c = conjunto()

  it('calcula variación, índice y participación', () => {
    expect(variacion([100, 110, 0, 50], 1)).toBeCloseTo(10)
    expect(variacion([100, 110, 0, 50], 3)).toBeNull()
    expect(indice([50, 75, 100])).toEqual([100, 150, 200])
    expect(indice([0, 5])).toEqual([null, null])
    expect(participacion([10, 20], [100, 0])).toEqual([10, null])
  })

  it('usa el total de la referencia sin filtros y el cubo con nivel o sector', () => {
    expect(referenciaFiltrada(c, 'Antioquia', FILTROS_VACIOS)).toEqual([1000, 2000])
    // Un nivel y un sector: 4 sexos × 10 (y × 20 el segundo año).
    expect(referenciaFiltrada(c, 'Antioquia', { ...FILTROS_VACIOS, nivel: [2], sector: [0] })).toEqual([40, 80])
    expect(referenciaFiltrada(c, 'Colombia', { ...FILTROS_VACIOS, sector: [1] })).toEqual([2400, 4800])
  })

  it('no compara con filtros de institución, modalidad o área', () => {
    expect(referenciaFiltrada(c, 'Colombia', { ...FILTROS_VACIOS, ies: [0] })).toBeNull()
    expect(referenciaSexo(c, 'Colombia', { ...FILTROS_VACIOS, area: [1] })).toBeNull()
    expect(referenciaSexo(c, 'Antioquia', { ...FILTROS_VACIOS, nivel: [0] })?.[0]).toEqual([20, 40])
  })
})
