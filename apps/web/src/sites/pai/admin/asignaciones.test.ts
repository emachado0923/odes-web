import { describe, expect, it } from 'vitest'
import { tableroPrueba } from './pruebas/datos'
import {
  alternarDependencia,
  alternarIndicador,
  alternarProceso,
  arbolAsignaciones,
  asignacionesDe,
  indicadorMarcado,
  marcaDependencia,
  marcaProceso,
  mismasAsignaciones,
  normalizar,
  resumenAsignaciones,
  seleccionDe,
  visiblesConBusqueda,
} from './asignaciones'

const arbol = arbolAsignaciones(tableroPrueba())
const [saf, dtf] = arbol
const [th, ac] = saf.procesos
const [gf] = dtf.procesos

describe('arbolAsignaciones', () => {
  it('arma dependencia -> proceso -> indicador en el orden del tablero', () => {
    expect(arbol.map((d) => d.sigla)).toEqual(['SAF', 'DTF'])
    expect(saf.procesos.map((p) => p.codigo)).toEqual(['SAF-TH', 'SAF-AC'])
    expect(th.indicadores.map((i) => i.codigo)).toEqual(['SAF-TH-01', 'SAF-TH-02'])
    expect(gf.indicadores.map((i) => i.id)).toEqual([1004, 1005])
  })

  it('omite las dependencias sin procesos', () => {
    const tablero = tableroPrueba()
    const otro = arbolAsignaciones({ ...tablero, dependencias: [...tablero.dependencias, { id: 9, sigla: 'X', nombre: 'Vacía' }] })
    expect(otro.map((d) => d.sigla)).toEqual(['SAF', 'DTF'])
  })
})

describe('marcas de tres estados', () => {
  it('proceso: marcado si está asignado completo o si están todos sus indicadores; parcial si solo algunos', () => {
    expect(marcaProceso(th, seleccionDe({ procesos: [11], indicadores: [] }))).toBe('marcado')
    expect(marcaProceso(th, seleccionDe({ procesos: [], indicadores: [1001, 1002] }))).toBe('marcado')
    expect(marcaProceso(th, seleccionDe({ procesos: [], indicadores: [1002] }))).toBe('parcial')
    expect(marcaProceso(th, seleccionDe({ procesos: [], indicadores: [] }))).toBe('vacio')
  })

  it('dependencia: marcada con todos sus procesos; parcial con alguno', () => {
    expect(marcaDependencia(saf, seleccionDe({ procesos: [11, 12], indicadores: [] }))).toBe('marcado')
    expect(marcaDependencia(saf, seleccionDe({ procesos: [11], indicadores: [] }))).toBe('parcial')
    expect(marcaDependencia(saf, seleccionDe({ procesos: [11], indicadores: [1003] }))).toBe('marcado')
    expect(marcaDependencia(saf, seleccionDe({ procesos: [], indicadores: [1001] }))).toBe('parcial')
    expect(marcaDependencia(dtf, seleccionDe({ procesos: [11], indicadores: [] }))).toBe('vacio')
  })

  it('un indicador se ve marcado si está suelto o si su proceso está asignado', () => {
    expect(indicadorMarcado(th, 1001, seleccionDe({ procesos: [11], indicadores: [] }))).toBe(true)
    expect(indicadorMarcado(th, 1001, seleccionDe({ procesos: [], indicadores: [1001] }))).toBe(true)
    expect(indicadorMarcado(th, 1002, seleccionDe({ procesos: [], indicadores: [1001] }))).toBe(false)
  })
})

describe('alternar', () => {
  it('marcar un proceso lo asigna completo y quita sus indicadores sueltos; desmarcarlo lo quita todo', () => {
    const conProceso = alternarProceso(seleccionDe({ procesos: [], indicadores: [1001, 1004] }), th)
    expect(asignacionesDe(conProceso, arbol)).toEqual({ procesos: [11], indicadores: [1004] })
    expect(asignacionesDe(alternarProceso(conProceso, th), arbol)).toEqual({ procesos: [], indicadores: [1004] })
  })

  it('desmarcar un indicador de un proceso completo deja sueltos los demás', () => {
    const seleccion = alternarIndicador(seleccionDe({ procesos: [11], indicadores: [] }), th, 1001)
    expect(asignacionesDe(seleccion, arbol)).toEqual({ procesos: [], indicadores: [1002] })
  })

  it('marcar uno por uno todos los indicadores de un proceso lo asigna completo', () => {
    let seleccion = seleccionDe({ procesos: [], indicadores: [] })
    seleccion = alternarIndicador(seleccion, gf, 1004)
    expect(asignacionesDe(seleccion, arbol)).toEqual({ procesos: [], indicadores: [1004] })
    seleccion = alternarIndicador(seleccion, gf, 1005)
    expect(asignacionesDe(seleccion, arbol)).toEqual({ procesos: [21], indicadores: [] })
    expect(marcaProceso(gf, seleccion)).toBe('marcado')
  })

  it('la dependencia marca todos sus procesos, o los desmarca si ya estaban todos', () => {
    const marcada = alternarDependencia(seleccionDe({ procesos: [], indicadores: [1001] }), saf)
    expect(asignacionesDe(marcada, arbol)).toEqual({ procesos: [11, 12], indicadores: [] })
    expect(asignacionesDe(alternarDependencia(marcada, saf), arbol)).toEqual({ procesos: [], indicadores: [] })
  })

  it('conserva los ids que no están en el árbol (otra vigencia)', () => {
    const seleccion = alternarProceso(seleccionDe({ procesos: [999], indicadores: [5000] }), ac)
    expect(asignacionesDe(seleccion, arbol)).toEqual({ procesos: [12, 999], indicadores: [5000] })
  })

  it('no modifica la selección de entrada', () => {
    const original = seleccionDe({ procesos: [11], indicadores: [] })
    alternarIndicador(original, th, 1001)
    alternarDependencia(original, dtf)
    expect([...original.procesos]).toEqual([11])
    expect([...original.indicadores]).toEqual([])
  })
})

describe('resúmenes y búsqueda', () => {
  it('mismasAsignaciones no depende del orden', () => {
    expect(mismasAsignaciones({ procesos: [2, 1], indicadores: [] }, { procesos: [1, 2], indicadores: [] })).toBe(true)
    expect(mismasAsignaciones({ procesos: [1], indicadores: [] }, { procesos: [1], indicadores: [3] })).toBe(false)
  })

  it('resumenAsignaciones', () => {
    expect(resumenAsignaciones({ procesos: [], indicadores: [] })).toBe('Sin asignaciones')
    expect(resumenAsignaciones({ procesos: [1], indicadores: [] })).toBe('1 proceso completo')
    expect(resumenAsignaciones({ procesos: [1, 2], indicadores: [3, 4, 5] })).toBe(
      '2 procesos completos y 3 indicadores sueltos',
    )
    expect(resumenAsignaciones({ procesos: [], indicadores: [7] })).toBe('1 indicador suelto')
  })

  it('normalizar quita tildes y mayúsculas', () => {
    expect(normalizar('  Gestión HUMANA ')).toBe('gestion humana')
  })

  it('visiblesConBusqueda: procesos o dependencias que coinciden (con todo) e indicadores sueltos (con su proceso)', () => {
    expect(visiblesConBusqueda(arbol, '  ')).toBeNull()
    const porProceso = visiblesConBusqueda(arbol, 'talento')!
    expect([...porProceso.procesos]).toEqual([11])
    expect([...porProceso.indicadores]).toEqual([1001, 1002])
    const porIndicador = visiblesConBusqueda(arbol, 'condonados')!
    expect([...porIndicador.procesos]).toEqual([21])
    expect([...porIndicador.indicadores]).toEqual([1005])
    const porDependencia = visiblesConBusqueda(arbol, 'dtf')!
    expect([...porDependencia.indicadores]).toEqual([1004, 1005])
    expect(visiblesConBusqueda(arbol, 'atencion')!.procesos.has(12)).toBe(true)
  })
})
