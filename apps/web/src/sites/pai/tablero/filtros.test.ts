import { describe, expect, it } from 'vitest'
import { vigenciaPrueba } from '../pruebas/datosPrueba'
import { tableroPrueba } from './datosPruebaTablero'
import {
  ajustarFiltros,
  escribirFiltros,
  filtrarIndicadores,
  hayFiltros,
  igualesFiltros,
  leerFiltros,
  normalizarBusqueda,
  opcionesFiltros,
} from './filtros'

const tablero = tableroPrueba()
const codigos = (filtros: Parameters<typeof filtrarIndicadores>[1], t = tablero) =>
  filtrarIndicadores(t, filtros).map((i) => i.codigo)

describe('leerFiltros (URL -> filtros)', () => {
  it('sin tablero revisa solo la forma: ids enteros positivos, estado y tipo conocidos, textos no vacíos', () => {
    const p = new URLSearchParams(
      'dependencia=2&proceso=abc&riesgo=-1&estado=reportado&tipo=otro&programa=%20&linea=1.%20Creemos&q=%C3%ADndice&otro=1',
    )
    expect(leerFiltros(p)).toEqual({ dependencia: 2, estado: 'reportado', linea: '1. Creemos', q: 'índice' })
    expect(leerFiltros(new URLSearchParams('estado=futuro&tipo=proyecto'))).toEqual({ tipo: 'proyecto' })
  })

  it('con tablero descarta los valores que no existen en él', () => {
    const p = new URLSearchParams('dependencia=999&proceso=10&riesgo=12345&programa=No%20existe&dimension=Cobertura')
    // dimension=Cobertura solo la tiene OPE-PPEP (20): el proceso 10 (SAF-TH) choca con ella y se quita.
    expect(leerFiltros(p, tablero)).toEqual({ dimension: 'Cobertura' })
  })

  it('quita el proceso que no es de la dependencia elegida y el riesgo que no es del proceso', () => {
    expect(leerFiltros(new URLSearchParams('dependencia=2&proceso=10'), tablero)).toEqual({ dependencia: 2 })
    expect(leerFiltros(new URLSearchParams('proceso=10&riesgo=200'), tablero)).toEqual({ proceso: 10 })
    expect(leerFiltros(new URLSearchParams('proceso=10&riesgo=101'), tablero)).toEqual({ proceso: 10, riesgo: 101 })
  })

  it('sin bimestre abierto el filtro de estado no se conserva', () => {
    const cerrado = tableroPrueba({ vigencia: vigenciaPrueba({ bimestreAbierto: null }) })
    expect(leerFiltros(new URLSearchParams('estado=pendiente'), cerrado)).toEqual({})
    expect(leerFiltros(new URLSearchParams('estado=pendiente'), tablero)).toEqual({ estado: 'pendiente' })
  })

  it('escribirFiltros conserva los demás parámetros y omite los vacíos; ida y vuelta', () => {
    const base = new URLSearchParams('pestana=2&dependencia=1')
    const p = escribirFiltros({ proceso: 10, q: 'plan', estado: null, tipo: undefined, programa: '' }, base)
    expect(p.toString()).toBe('pestana=2&proceso=10&q=plan')
    expect(leerFiltros(p, tablero)).toEqual({ proceso: 10, q: 'plan' })
    expect(hayFiltros({})).toBe(false)
    expect(hayFiltros({ q: '   ' })).toBe(false)
    expect(hayFiltros({ tipo: 'proyecto' })).toBe(true)
    expect(igualesFiltros({ proceso: 10, q: null }, { proceso: 10 })).toBe(true)
  })
})

describe('filtrarIndicadores', () => {
  it('sin filtros devuelve todos, en el orden del tablero', () => {
    expect(codigos({})).toEqual(['SAF-TH-01', 'SAF-TH-02', 'SAF-AC-01', 'OPE-PPEP-16'])
  })

  it('por dependencia, proceso, tipo, programa, línea y dimensión (atributos del proceso)', () => {
    expect(codigos({ dependencia: 1 })).toEqual(['SAF-TH-01', 'SAF-TH-02', 'SAF-AC-01'])
    expect(codigos({ proceso: 11 })).toEqual(['SAF-AC-01'])
    expect(codigos({ tipo: 'proyecto' })).toEqual(['OPE-PPEP-16'])
    expect(codigos({ programa: 'Educación superior para todos' })).toEqual(['OPE-PPEP-16'])
    expect(codigos({ linea: '1. Creemos en la educación' })).toEqual(['SAF-TH-01', 'SAF-TH-02', 'OPE-PPEP-16'])
    expect(codigos({ dimension: 'Talento humano' })).toEqual(['SAF-TH-01', 'SAF-TH-02'])
    expect(codigos({ dependencia: 1, linea: '1. Creemos en la educación' })).toEqual(['SAF-TH-01', 'SAF-TH-02'])
  })

  it('por riesgo: los indicadores cuya acción cubre el riesgo', () => {
    expect(codigos({ riesgo: 100 })).toEqual(['SAF-TH-01'])
    expect(codigos({ riesgo: 101 })).toEqual(['SAF-TH-02'])
  })

  it('por estado en el bimestre abierto (sin bimestre abierto no aplica)', () => {
    expect(codigos({ estado: 'pendiente' })).toEqual(['SAF-TH-01', 'OPE-PPEP-16'])
    expect(codigos({ estado: 'reportado' })).toEqual(['SAF-TH-02'])
    expect(codigos({ estado: 'sin_meta' })).toEqual(['SAF-AC-01'])
    const cerrado = tableroPrueba({ vigencia: vigenciaPrueba({ bimestreAbierto: null }) })
    expect(codigos({ estado: 'pendiente' }, cerrado)).toHaveLength(4)
  })

  it('búsqueda en el código o en el nombre, sin distinguir mayúsculas ni tildes', () => {
    expect(codigos({ q: 'indice' })).toEqual(['SAF-AC-01'])
    expect(codigos({ q: 'ÍNDICE  de' })).toEqual(['SAF-AC-01'])
    expect(codigos({ q: 'saf-th' })).toEqual(['SAF-TH-01', 'SAF-TH-02'])
    expect(codigos({ q: 'ppep-16' })).toEqual(['OPE-PPEP-16'])
    expect(codigos({ q: 'acompanada' })).toEqual(['OPE-PPEP-16'])
    expect(codigos({ q: 'no existe' })).toEqual([])
    expect(codigos({ q: '   ' })).toHaveLength(4)
    expect(normalizarBusqueda('  Índice   de  Satisfacción ')).toBe('indice de satisfaccion')
  })
})

describe('opciones dependientes', () => {
  it('sin filtros: todas las dependencias, procesos, riesgos, programas, líneas y dimensiones (ordenados)', () => {
    const o = opcionesFiltros(tablero, {})
    expect(o.dependencias.map((d) => d.sigla)).toEqual(['SAF', 'OPE'])
    expect(o.procesos.map((p) => p.codigo)).toEqual(['SAF-TH', 'SAF-AC', 'OPE-PPEP'])
    expect(o.riesgos.map((r) => r.id)).toEqual([100, 101, 110, 200])
    expect(o.programas).toEqual(['Educación superior para todos'])
    expect(o.lineas).toEqual(['1. Creemos en la educación', '2. Creemos en la seguridad'])
    expect(o.dimensiones).toEqual(['Cobertura', 'Talento humano'])
  })

  it('la dependencia acota los procesos y los demás catálogos; el proceso acota los riesgos', () => {
    const porDependencia = opcionesFiltros(tablero, { dependencia: 1 })
    expect(porDependencia.dependencias).toHaveLength(2)
    expect(porDependencia.procesos.map((p) => p.codigo)).toEqual(['SAF-TH', 'SAF-AC'])
    expect(porDependencia.riesgos.map((r) => r.id)).toEqual([100, 101, 110])
    expect(porDependencia.programas).toEqual([])
    expect(porDependencia.dimensiones).toEqual(['Talento humano'])
    const porProceso = opcionesFiltros(tablero, { dependencia: 1, proceso: 10 })
    expect(porProceso.procesos.map((p) => p.codigo)).toEqual(['SAF-TH', 'SAF-AC'])
    expect(porProceso.riesgos.map((r) => r.id)).toEqual([100, 101])
  })

  it('cada lista no se acota con su propio filtro (se puede cambiar de línea sin limpiar)', () => {
    const o = opcionesFiltros(tablero, { linea: '2. Creemos en la seguridad' })
    expect(o.lineas).toEqual(['1. Creemos en la educación', '2. Creemos en la seguridad'])
    expect(o.procesos.map((p) => p.codigo)).toEqual(['SAF-AC'])
  })

  it('ajustarFiltros: al cambiar la dependencia se quitan el proceso y el riesgo de la anterior', () => {
    const antes = { dependencia: 1, proceso: 10, riesgo: 100, estado: 'pendiente' as const, q: 'plan' }
    expect(ajustarFiltros(tablero, { ...antes, dependencia: 2 }, 'dependencia')).toEqual({
      dependencia: 2,
      estado: 'pendiente',
      q: 'plan',
    })
  })

  it('ajustarFiltros conserva el filtro recién elegido y quita lo que choca con él', () => {
    // Con la línea 2 solo queda SAF-AC: elegir esa línea quita el proceso SAF-TH (no al revés).
    expect(ajustarFiltros(tablero, { proceso: 10, linea: '2. Creemos en la seguridad' }, 'linea')).toEqual({
      linea: '2. Creemos en la seguridad',
    })
    expect(ajustarFiltros(tablero, { proceso: 11, linea: '2. Creemos en la seguridad' }, 'proceso')).toEqual({
      proceso: 11,
      linea: '2. Creemos en la seguridad',
    })
    expect(ajustarFiltros(tablero, { tipo: 'proyecto', proceso: 10 }, 'tipo')).toEqual({ tipo: 'proyecto' })
  })
})
