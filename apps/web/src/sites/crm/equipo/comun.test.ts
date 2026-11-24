import { describe, expect, it } from 'vitest'
import type { EventoTareaCrm } from '../api-crm'
import { tareaMuestra } from '../ui/muestras'
import { nombreLider, partesResumen, primerNombre, textoEvento, textoSinPendientes } from './comun'

const LIDER = 'José David Ramírez Abraham'
const ANA = 'Ana María Restrepo Gil'

function evento(cambios: Partial<EventoTareaCrm> & Pick<EventoTareaCrm, 'tipo' | 'actor'>): EventoTareaCrm {
  return { id: 1, personaNombre: null, deEstado: null, aEstado: null, detalle: null, creadoEn: '2026-11-20T15:00:00.000Z', ...cambios }
}

describe('textos de las vistas del equipo', () => {
  it('nombra al líder por su primer nombre o, si no se sabe, como «el líder»', () => {
    expect(primerNombre(LIDER)).toBe('José')
    expect(primerNombre(null)).toBe('')
    expect(nombreLider(LIDER)).toEqual({ sujeto: 'José', nombre: 'José', a: 'a José' })
    expect(nombreLider(null)).toEqual({ sujeto: 'El líder', nombre: 'el líder', a: 'al líder' })
  })

  it('resume lo abierto (las vencidas aparte) y, sin nada abierto, lo dice', () => {
    const tareas = [
      tareaMuestra({ id: 1, titulo: 'Uno' }),
      tareaMuestra({ id: 2, titulo: 'Dos', vencida: true }),
      tareaMuestra({ id: 3, titulo: 'Tres', estado: 'en_proceso', vencida: true }),
      tareaMuestra({ id: 4, titulo: 'Cuatro', estado: 'terminada' }),
      tareaMuestra({ id: 5, titulo: 'Cinco' }),
    ]
    expect(partesResumen(tareas).map((parte) => parte.texto)).toEqual(['3 pendientes', '1 en proceso', '2 vencidas'])
    expect(textoSinPendientes(0)).toBe('No tiene tareas pendientes.')
    expect(textoSinPendientes(4)).toBe('No tiene tareas pendientes. Terminó 4 tareas en los últimos 30 días.')
  })

  it('cuenta el historial en frases: el líder por su nombre, la persona del tablero sin nombrarla', () => {
    const contexto = { lider: LIDER, persona: ANA }
    expect(textoEvento(evento({ tipo: 'creada', actor: 'lider', personaNombre: LIDER }), contexto)).toBe('José creó la tarea')
    expect(textoEvento(evento({ tipo: 'estado', actor: 'responsable', personaNombre: ANA, aEstado: 'en_proceso' }), contexto)).toBe(
      'Pasó a En proceso',
    )
    expect(textoEvento(evento({ tipo: 'entregable', actor: 'responsable', personaNombre: ANA, detalle: 'informe.pdf' }), contexto)).toBe(
      'Subió «informe.pdf»',
    )
    expect(textoEvento(evento({ tipo: 'devuelta', actor: 'lider', detalle: 'Falta la firma.' }), contexto)).toBe('José la devolvió: Falta la firma.')
    expect(textoEvento(evento({ tipo: 'devuelta', actor: 'lider' }), { lider: null, persona: ANA })).toBe('El líder la devolvió')
    // Lo que hizo otra persona (antes de una reasignación) va con su nombre.
    expect(textoEvento(evento({ tipo: 'terminada', actor: 'responsable', personaNombre: 'Carlos Andrés Mejía Duque' }), contexto)).toBe(
      'Carlos terminó la tarea',
    )
    expect(textoEvento(evento({ tipo: 'aviso', actor: 'responsable' }), contexto)).toBe('Se le avisó a José por correo')
  })
})
