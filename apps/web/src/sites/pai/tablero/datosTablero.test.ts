import { describe, expect, it } from 'vitest'
import { agruparIndicadores, buscarIndicador, conEvidencias, reemplazarIndicador } from './datosTablero'
import { tableroPrueba } from './datosPruebaTablero'

describe('agruparIndicadores (proceso -> acción)', () => {
  const tablero = tableroPrueba()

  it('agrupa en el orden del tablero, con la dependencia y el resumen de cada proceso', () => {
    const grupos = agruparIndicadores(tablero, tablero.indicadores)
    expect(grupos.map((g) => [g.proceso?.codigo, g.dependencia?.sigla, g.total])).toEqual([
      ['SAF-TH', 'SAF', 2],
      ['SAF-AC', 'SAF', 1],
      ['OPE-PPEP', 'OPE', 1],
    ])
    expect(grupos[0].acciones.map((a) => [a.accion?.orden, a.indicadores.map((i) => i.codigo)])).toEqual([
      [1, ['SAF-TH-01']],
      [2, ['SAF-TH-02']],
    ])
    expect(grupos[0].resumen?.avanceAnual).toBe(0.625)
  })

  it('solo con los indicadores filtrados (los procesos sin indicadores no aparecen)', () => {
    const grupos = agruparIndicadores(
      tablero,
      tablero.indicadores.filter((i) => i.codigo === 'SAF-TH-02'),
    )
    expect(grupos).toHaveLength(1)
    expect(grupos[0].acciones).toHaveLength(1)
    expect(grupos[0].acciones[0].accion?.descripcion).toBe('Capacitar a los servidores')
  })

  it('tolera un proceso o una acción que no están en el catálogo', () => {
    const raro = { ...tablero.indicadores[0], id: 99, procesoId: 77, accionId: 7777 }
    const [grupo] = agruparIndicadores(tablero, [raro])
    expect(grupo.proceso).toBeNull()
    expect(grupo.dependencia).toBeNull()
    expect(grupo.acciones[0].accion).toBeNull()
  })
})

describe('actualizar el tablero sin volver a pedirlo', () => {
  it('reemplazarIndicador cambia solo esa fila (y no copia si no está)', () => {
    const tablero = tableroPrueba()
    const nuevo = { ...tablero.indicadores[0], avances: [2, 1, 0, 1.5, null, null] }
    const actualizado = reemplazarIndicador(tablero, nuevo)
    expect(actualizado.indicadores[0].avances[3]).toBe(1.5)
    expect(actualizado.indicadores[1]).toBe(tablero.indicadores[1])
    expect(tablero.indicadores[0].avances[3]).toBeNull()
    expect(reemplazarIndicador(tablero, { ...nuevo, id: 999 })).toBe(tablero)
  })

  it('conEvidencias cambia el conteo de (indicador, bimestre)', () => {
    const tablero = tableroPrueba()
    const actualizado = conEvidencias(tablero, 2, 4, 3)
    expect(buscarIndicador(actualizado, 2)?.evidencias).toEqual([0, 0, 2, 3, 0, 0])
    expect(conEvidencias(tablero, 2, 4, 1)).toBe(tablero)
    expect(conEvidencias(tablero, 999, 1, 1)).toBe(tablero)
    expect(buscarIndicador(tablero, 999)).toBeNull()
  })
})
