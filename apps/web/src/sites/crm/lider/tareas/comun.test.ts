import { describe, expect, it } from 'vitest'
import { LIMITES_CRM, type EventoTareaCrm } from '../../api-crm'
import { elegirArchivos, estadoNoSubidos, idDeRuta, noSubidosDe, textoEvento, textoNoSubidos } from './comun'

function evento(cambios: Partial<EventoTareaCrm>): EventoTareaCrm {
  return {
    id: 1,
    tipo: 'creada',
    actor: 'lider',
    personaNombre: null,
    deEstado: null,
    aEstado: null,
    detalle: null,
    creadoEn: '2026-11-20T15:00:00.000Z',
    ...cambios,
  }
}

function archivo(nombre: string, bytes = 20): File {
  return new File(['x'.repeat(bytes)], nombre, { type: 'application/pdf', lastModified: 1 })
}

describe('textoEvento', () => {
  it('cuenta cada evento con el primer nombre de quien lo hizo', () => {
    expect(textoEvento(evento({ tipo: 'creada', personaNombre: 'José David Ramírez Abraham' }))).toBe('José creó la tarea')
    expect(textoEvento(evento({ tipo: 'reasignada', detalle: 'Luciana' }))).toBe('Se reasignó a Luciana')
    expect(textoEvento(evento({ tipo: 'estado', actor: 'responsable', personaNombre: 'Juliana Cardona', aEstado: 'en_proceso' }))).toBe(
      'Juliana la pasó a En proceso',
    )
    expect(textoEvento(evento({ tipo: 'adjunto', personaNombre: 'José Ramírez', detalle: 'informe.pdf' }))).toBe('José subió «informe.pdf»')
    expect(textoEvento(evento({ tipo: 'entregable', actor: 'responsable', personaNombre: 'Juliana', detalle: 'acta.docx' }))).toBe(
      'Juliana subió el entregable «acta.docx»',
    )
    expect(textoEvento(evento({ tipo: 'archivo_quitado', personaNombre: 'José', detalle: 'viejo.pdf' }))).toBe('José quitó «viejo.pdf»')
    expect(textoEvento(evento({ tipo: 'terminada', actor: 'responsable', personaNombre: 'Juliana' }))).toBe('Juliana la terminó')
    expect(textoEvento(evento({ tipo: 'devuelta', personaNombre: 'José', detalle: 'Falta el anexo.' }))).toBe('José la devolvió: Falta el anexo.')
    expect(textoEvento(evento({ tipo: 'aviso' }))).toBe('Se le avisó por correo')
  })

  it('sin nombre, empieza con mayúscula', () => {
    expect(textoEvento(evento({ tipo: 'adjunto', detalle: 'informe.pdf' }))).toBe('Subió «informe.pdf»')
    expect(textoEvento(evento({ tipo: 'terminada', personaNombre: '  ' }))).toBe('La terminó')
  })
})

describe('elegirArchivos', () => {
  it('deja los válidos, dice por qué no los demás y no repite los ya elegidos', () => {
    const informe = archivo('informe.pdf')
    const { aceptados, errores } = elegirArchivos([informe, archivo('acta.zip'), archivo('vacio.pdf', 0)], 0, LIMITES_CRM.maxAdjuntos)
    expect(aceptados).toEqual([informe])
    expect(errores).toHaveLength(2)
    expect(errores[0]).toMatch(/«acta\.zip» no se puede subir/)
    expect(errores[1]).toMatch(/«vacio\.pdf» está vacío/)

    expect(elegirArchivos([informe], 1, LIMITES_CRM.maxAdjuntos, [informe])).toEqual({ aceptados: [], errores: [] })
  })

  it('no pasa del máximo contando los que ya hay', () => {
    const { aceptados, errores } = elegirArchivos([archivo('a.pdf'), archivo('b.pdf'), archivo('c.pdf')], 8, 10)
    expect(aceptados.map((a) => a.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(errores).toEqual(['Una tarea lleva hasta 10 adjuntos: no se agregó «c.pdf».'])
  })
})

describe('textos y rutas', () => {
  it('textoNoSubidos concuerda en singular y plural', () => {
    expect(textoNoSubidos(['a.pdf'])).toBe('La tarea se creó, pero no se subió: «a.pdf». Súbalo desde aquí y use «Avisar».')
    expect(textoNoSubidos(['a.pdf', 'b.xlsx'])).toBe('La tarea se creó, pero no se subieron: «a.pdf» y «b.xlsx». Súbalos desde aquí y use «Avisar».')
  })

  it('idDeRuta solo acepta enteros positivos', () => {
    expect(idDeRuta('42')).toBe(42)
    expect(idDeRuta('0')).toBeNull()
    expect(idDeRuta('4.2')).toBeNull()
    expect(idDeRuta('abc')).toBeNull()
    expect(idDeRuta(undefined)).toBeNull()
  })

  it('noSubidosDe lee lo que deja estadoNoSubidos y nada más', () => {
    expect(noSubidosDe(estadoNoSubidos(['a.pdf']))).toEqual(['a.pdf'])
    expect(noSubidosDe(null)).toEqual([])
    expect(noSubidosDe({ noSubidos: 'a.pdf' })).toEqual([])
    expect(noSubidosDe({ noSubidos: ['a.pdf', 3] })).toEqual(['a.pdf'])
  })
})
