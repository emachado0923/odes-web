import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS } from './calculos'
import { escribirEstado, leerEstado, slug } from './estado-url'
import type { MatriculaHistorica } from './tipos'

const c = {
  anios: [2000, 2001, 2025],
  dim: {
    ies: [
      { nombre: 'Universidad de Antioquia', corto: 'UdeA', caracter: 'Universidad', codigos: ['1201'] },
      { nombre: 'Instituto Tecnológico Metropolitano', corto: 'ITM', caracter: 'Universidad', codigos: ['3302'] },
    ],
    sector: ['Oficial', 'Privado'],
    nivel: ['Tecnológico', 'Universitario'],
    modalidad: ['Presencial', 'A distancia'],
    area: ['Ciencias de la salud'],
  },
} as unknown as MatriculaHistorica

const POR_DEFECTO = { anio: 2, seccion: 'composicion', modo: 'matriculados' }

describe('estado en la dirección', () => {
  it('sin nada elegido, la dirección queda limpia', () => {
    expect(escribirEstado(c, { ...POR_DEFECTO, filtros: FILTROS_VACIOS }, POR_DEFECTO)).toBe('')
    expect(leerEstado(c, '', POR_DEFECTO)).toEqual({ ...POR_DEFECTO, filtros: FILTROS_VACIOS })
  })

  it('va y vuelve: año, sección, modo y filtros por nombre', () => {
    const estado = { anio: 0, seccion: 'instituciones', modo: 'indice', filtros: { ...FILTROS_VACIOS, ies: [1, 0], modalidad: [1] } }
    const texto = escribirEstado(c, estado, POR_DEFECTO)
    expect(texto).toBe('?anio=2000&seccion=instituciones&modo=indice&ies=instituto-tecnologico-metropolitano%2Cuniversidad-de-antioquia&modalidad=a-distancia')
    expect(leerEstado(c, texto, POR_DEFECTO)).toEqual(estado)
  })

  it('ignora años y nombres que no existen', () => {
    expect(leerEstado(c, '?anio=1990&ies=no-existe,universidad-de-antioquia', POR_DEFECTO)).toEqual({
      ...POR_DEFECTO,
      filtros: { ...FILTROS_VACIOS, ies: [0] },
    })
  })

  it('el nombre sin tildes ni espacios', () => {
    expect(slug('Áreas de Conocimiento')).toBe('areas-de-conocimiento')
  })
})
