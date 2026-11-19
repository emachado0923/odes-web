import { describe, expect, it } from 'vitest'
import { FICHAS_EJEMPLO, FICHAS_EJEMPLO_UNA } from './ejemplo-fichas'
import { categoriaEstado, COLOR_ESTADO, CATEGORIAS_ESTADO, estadoLegible } from './estados'
import {
  aNumero,
  campo,
  cortoPrograma,
  formatoDocumento,
  indiceColumna,
  nombrePrograma,
  nombrePropio,
  oracionLegible,
  partirPeriodo,
  pesos,
  pesosCortos,
  resumenBeneficio,
  seccion,
  tablaHistorial,
  tituloLegible,
} from './ficha'

const [EPM, MB, EM, EVENTOS] = FICHAS_EJEMPLO
const [FA] = FICHAS_EJEMPLO_UNA

describe('estados de la ventanilla', () => {
  it('agrupa las formas en que las bases escriben un estado en las nueve categorías del tablero', () => {
    expect(categoriaEstado('ACTIVO')).toBe('Activo')
    expect(categoriaEstado('SUSPENSION TEMPORAL')).toBe('Suspensión')
    expect(categoriaEstado('SUSPENSIÓN ESPECIAL')).toBe('Suspensión')
    expect(categoriaEstado('FINALIZACION')).toBe('Finalizó los giros')
    expect(categoriaEstado('NO ACTIVO')).toBe('Finalizó los giros')
    expect(categoriaEstado('EN PERÍODO DE GRACIA')).toBe('Periodo de gracia')
    expect(categoriaEstado('PROCESO DE CONSOLIDACIÓN')).toBe('Proceso de consolidación')
    expect(categoriaEstado('NOTIFICADO')).toBe('Cobro o condonación (PACC)')
    expect(categoriaEstado('CONDONACIÓN TOTAL')).toBe('Cobro o condonación (PACC)')
    expect(categoriaEstado('COBRO DEL 100%')).toBe('Cobro o condonación (PACC)')
    expect(categoriaEstado('PASO AL COBRO')).toBe('Cobro o condonación (PACC)')
    expect(categoriaEstado('GRADUADO')).toBe('Graduado')
    expect(categoriaEstado('DESERTOR')).toBe('Desertor')
    expect(categoriaEstado('TERMINACION DEL CRÉDITO')).toBe('Terminación o cancelación')
    expect(categoriaEstado('RENUNCIA A BECA')).toBe('Terminación o cancelación')
  })

  it('lo vacío o desconocido queda como «Sin dato», nunca como activo', () => {
    expect(categoriaEstado('')).toBe('Sin dato')
    expect(categoriaEstado(null)).toBe('Sin dato')
    expect(categoriaEstado('ALGO NUEVO')).toBe('Sin dato')
    // «NO ACTIVO» e «INACTIVO» no son activos.
    expect(categoriaEstado('INACTIVO')).toBe('Sin dato')
  })

  it('cada categoría tiene sus cuatro tonos', () => {
    for (const categoria of CATEGORIAS_ESTADO) {
      const c = COLOR_ESTADO[categoria]
      for (const tono of [c.color, c.sobre, c.suave, c.texto]) expect(tono).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('pone el estado para leer sin cambiar lo que dice', () => {
    expect(estadoLegible('SUSPENSION TEMPORAL')).toBe('Suspensión temporal')
    expect(estadoLegible('ACTIVO')).toBe('Activo')
    expect(estadoLegible('COBRO DEL 100%')).toBe('Cobro del 100%')
    expect(estadoLegible('')).toBe('Sin dato')
    expect(estadoLegible('Ya legible')).toBe('Ya legible')
  })
})

describe('lectura de una ficha', () => {
  it('nombra los programas y deja pasar una clave desconocida', () => {
    expect(nombrePrograma('EPM')).toBe('Fondo EPM')
    expect(cortoPrograma('PUAP PP')).toBe('PUAP Presupuesto Participativo')
    expect(nombrePrograma('OTRO')).toBe('OTRO')
  })

  it('busca campos y secciones por etiqueta, sin distinguir tildes ni mayúsculas', () => {
    expect(campo(EPM, 'Correo')).toBe('maria.ficticia@ejemplo.org')
    expect(campo(EPM, 'ies actual')).toBe('INSTITUCION UNIVERSITARIA ITM')
    expect(campo(EPM, 'Telefono', 'Datos personales')).toBe('6045550103')
    expect(campo(EPM, 'No existe')).toBe('')
    expect(seccion(EPM, 'información académica')).toHaveLength(6)
    expect(seccion(EPM, 'Destino')).toEqual([])
  })

  it('encuentra columnas por nombre', () => {
    const tabla = tablaHistorial(EPM)!
    expect(indiceColumna(tabla, 'Periodo')).toBe(0)
    expect(indiceColumna(tabla, 'No está', 'monto total')).toBe(9)
    expect(indiceColumna(tabla, 'No está')).toBe(-1)
  })

  it('lee números y pesos', () => {
    expect(aNumero('$ 3.800.000')).toBe(3_800_000)
    expect(aNumero('6')).toBe(6)
    expect(aNumero('4,15')).toBe(4.15)
    expect(aNumero('')).toBeNull()
    expect(aNumero('PRESENCIAL')).toBeNull()
    expect(aNumero(null)).toBeNull()
    expect(pesos(3_800_000)).toBe('$ 3.800.000')
    expect(pesosCortos(31_100_435)).toBe('$ 31,1 millones')
    expect(pesosCortos(1_000_000)).toBe('$ 1,0 millón')
    expect(pesosCortos(950_000)).toBe('$ 950 mil')
    expect(pesosCortos(800)).toBe('$ 800')
  })

  it('da formato al documento solo si son dígitos', () => {
    expect(formatoDocumento('1000547866')).toBe('1.000.547.866')
    expect(formatoDocumento('AB123456')).toBe('AB123456')
    expect(formatoDocumento('123')).toBe('123')
    // Sin perder dígitos en números largos ni ceros a la izquierda.
    expect(formatoDocumento('999000111999000333')).toBe('999.000.111.999.000.333')
    expect(formatoDocumento('0012345')).toBe('0.012.345')
  })

  it('pasa a nombre propio el nombre de una persona, sin reponerle tildes', () => {
    expect(nombrePropio('MARIA FERNANDA RESTREPO DE LA OSSA')).toBe('Maria Fernanda Restrepo de la Ossa')
    expect(nombrePropio('JOSE SEBASTIAN GOMEZ')).toBe('Jose Sebastian Gomez')
    expect(nombrePropio('Ya Tiene minúsculas')).toBe('Ya Tiene minúsculas')
    expect(nombrePropio('')).toBe('')
    expect(nombrePropio(null)).toBe('')
  })

  it('pone para leer instituciones, programas y lugares: mayúscula inicial, tildes conocidas y siglas', () => {
    expect(tituloLegible('INSTITUCION UNIVERSITARIA ITM')).toBe('Institución Universitaria ITM')
    expect(tituloLegible('UNIVERSIDAD EAFIT')).toBe('Universidad EAFIT')
    expect(tituloLegible('INGENIERIA DE SISTEMAS E INFORMATICA')).toBe('Ingeniería de Sistemas e Informática')
    expect(tituloLegible('TECNOLOGIA EN GESTION DE SERVICIOS GASTRONOMICOS')).toBe('Tecnología en Gestión de Servicios Gastronómicos')
    expect(tituloLegible('UNIVERSIDAD CATOLICA LUIS AMIGO (FUNLAM)')).toBe('Universidad Católica Luis Amigó (FUNLAM)')
    expect(tituloLegible('FUNDACION UNIVERSITARIA MARIA CANO')).toBe('Fundación Universitaria María Cano')
    expect(tituloLegible('MEDELLIN')).toBe('Medellín')
    expect(tituloLegible('LAURELES-ESTADIO')).toBe('Laureles-Estadio')
    expect(tituloLegible('SAN SEBASTIAN DE PALMITAS')).toBe('San Sebastián de Palmitas')
    expect(tituloLegible('ESPAÑA')).toBe('España')
    expect(tituloLegible('ESPANA')).toBe('España')
    // Lo que ya trae minúsculas se respeta tal cual.
    expect(tituloLegible('Universidad de Antioquia')).toBe('Universidad de Antioquia')
    expect(tituloLegible(null)).toBe('')
  })

  it('pone para leer un valor corriente: solo la primera mayúscula, con tildes', () => {
    expect(oracionLegible('MATRICULA Y SOSTENIMIENTO')).toBe('Matrícula y sostenimiento')
    expect(oracionLegible('CEDULA DE CIUDADANIA')).toBe('Cédula de ciudadanía')
    expect(oracionLegible('PASANTIA DE INVESTIGACION')).toBe('Pasantía de investigación')
    expect(oracionLegible('CC')).toBe('CC')
    expect(oracionLegible('CONVENIO ICETEX')).toBe('Convenio ICETEX')
    expect(oracionLegible('Renovado')).toBe('Renovado')
    expect(oracionLegible('')).toBe('')
  })

  it('parte un periodo', () => {
    expect(partirPeriodo('2024-1')).toEqual({ anio: 2024, parte: 1 })
    expect(partirPeriodo('2025-3')).toEqual({ anio: 2025, parte: 3 })
    expect(partirPeriodo('sin periodo')).toBeNull()
  })
})

describe('resumen de un beneficio', () => {
  it('pregrado: periodos, estado del último periodo y total del campo «Total desembolsado»', () => {
    const r = resumenBeneficio(EPM)
    expect(r.periodos).toHaveLength(13)
    expect(r.primerPeriodo).toBe('2019-2')
    expect(r.ultimoPeriodo).toBe('2025-2')
    expect(r.estadoActual).toBe('NOTIFICADO')
    expect(r.categoriaActual).toBe('Cobro o condonación (PACC)')
    expect(r.columnaMonto).toBe('Monto total')
    expect(r.girosRealizados).toBe(8)
    expect(r.girosPendientes).toBe(0)
    // El total del campo coincide con la suma por periodo (así es en las bases de pregrado).
    const suma = r.periodos.reduce((a, p) => a + (p.monto ?? 0), 0)
    expect(r.totalGirado).toBe(suma)
    expect(r.periodos[3]).toMatchObject({ periodo: '2021-1', estado: 'SUSPENSION TEMPORAL', categoria: 'Suspensión', monto: null })
  })

  it('sin campo de total usa el acumulado de la tabla; sin acumulado, la suma por periodo', () => {
    const mb = resumenBeneficio(MB)
    expect(mb.totalGirado).toBe(16_000_000)
    expect(mb.estadoActual).toBe('GRADUADO')
    const fa = resumenBeneficio(FA)
    expect(fa.totalGirado).toBe(40_400_000)
    expect(fa.columnaMonto).toBe('Girado en el periodo')
    const em = resumenBeneficio(EM)
    expect(em.periodos).toHaveLength(1)
    expect(em.totalGirado).toBe(31_100_435)
    expect(em.categoriaActual).toBe('Cobro o condonación (PACC)')
  })

  it('la ficha de eventos no tiene periodos ni total', () => {
    const r = resumenBeneficio(EVENTOS)
    expect(r.periodos).toEqual([])
    expect(r.totalGirado).toBeNull()
    expect(r.estadoActual).toBe('')
    expect(r.categoriaActual).toBe('Sin dato')
  })

  it('una ficha sin tablas no rompe nada', () => {
    const r = resumenBeneficio({ p: 'EPM', c: '2020-1', n: 'X', e: 'ACTIVO', s: [], t: [] })
    expect(r).toMatchObject({ periodos: [], primerPeriodo: null, ultimoPeriodo: null, estadoActual: 'ACTIVO', categoriaActual: 'Activo', totalGirado: null })
  })
})
