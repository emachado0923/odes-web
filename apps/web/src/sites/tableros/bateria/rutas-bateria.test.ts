import { describe, expect, it } from 'vitest'
import { esRutaBateria, leerRuta, rutaDesdeDireccionAntigua, rutaVista } from './rutas-bateria'

const RAIZ = '/tableros/bateria-indicadores'

describe('rutas de la batería de indicadores', () => {
  it('arma la dirección de cada vista: el inicio es la raíz del tablero y la variante va en ?v=', () => {
    expect(rutaVista()).toBe(RAIZ)
    expect(rutaVista('inicio')).toBe(RAIZ)
    expect(rutaVista('sa-fondo-epm')).toBe(`${RAIZ}/sa-fondo-epm`)
    expect(rutaVista('sa-fondo-epm', 'comunas')).toBe(`${RAIZ}/sa-fondo-epm?v=comunas`)
    expect(rutaVista('glosario', null)).toBe(`${RAIZ}/glosario`)
    expect(rutaVista('vista con espacio', 'a&b')).toBe(`${RAIZ}/vista%20con%20espacio?v=a%26b`)
  })

  it('lee la vista y la variante de la dirección', () => {
    expect(leerRuta(RAIZ, '')).toEqual({ vista: 'inicio', variante: null })
    expect(leerRuta(`${RAIZ}/`, '')).toEqual({ vista: 'inicio', variante: null })
    expect(leerRuta(`${RAIZ}/sa-fondo-epm`, '?v=comunas')).toEqual({ vista: 'sa-fondo-epm', variante: 'comunas' })
    expect(leerRuta(`${RAIZ}/sa-fondo-epm/`, '?v=')).toEqual({ vista: 'sa-fondo-epm', variante: null })
    expect(leerRuta('/Tableros/Bateria-Indicadores/catalogo', '')).toEqual({ vista: 'catalogo', variante: null })
    expect(leerRuta(`${RAIZ}/vista%20con%20espacio`, '?v=a%26b')).toEqual({ vista: 'vista con espacio', variante: 'a&b' })
    // Una codificación inválida no rompe la lectura.
    expect(leerRuta(`${RAIZ}/%E0%A4%A`, '')).toEqual({ vista: '%E0%A4%A', variante: null })
  })

  it('ida y vuelta: lo que arma rutaVista se lee igual', () => {
    for (const [vista, variante] of [
      ['inicio', null],
      ['sa-fondo-epm', 'comunas'],
      ['ctx-icu', 'medellin'],
    ] as const) {
      const [camino, consulta = ''] = rutaVista(vista, variante).split('?')
      expect(leerRuta(camino, consulta ? `?${consulta}` : '')).toEqual({ vista, variante })
    }
  })

  it('reconoce solo las direcciones del tablero', () => {
    expect(esRutaBateria(RAIZ)).toBe(true)
    expect(esRutaBateria(`${RAIZ}/sa-fondo-epm`)).toBe(true)
    expect(esRutaBateria('/TABLEROS/BATERIA-INDICADORES')).toBe(true)
    expect(esRutaBateria(`${RAIZ}-2`)).toBe(false)
    expect(esRutaBateria('/tableros/matricula-2025')).toBe(false)
  })

  it('traduce las direcciones del tablero estático (index.html y el hash #/vista?v=variante)', () => {
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/index.html`, '#/sa-fondo-epm?v=comunas')).toBe(`${RAIZ}/sa-fondo-epm?v=comunas`)
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/index.html`, '')).toBe(RAIZ)
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/INDEX.HTML`, '#/glosario')).toBe(`${RAIZ}/glosario`)
    expect(rutaDesdeDireccionAntigua(RAIZ, '#/sa-fondo-epm')).toBe(`${RAIZ}/sa-fondo-epm`)
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/`, '#/inicio')).toBe(RAIZ)
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/`, '#/')).toBe(RAIZ)
  })

  it('no toca las direcciones nuevas ni el enlace "Saltar al contenido"', () => {
    expect(rutaDesdeDireccionAntigua(RAIZ, '')).toBeNull()
    expect(rutaDesdeDireccionAntigua(RAIZ, '#contenido')).toBeNull()
    expect(rutaDesdeDireccionAntigua(`${RAIZ}/sa-fondo-epm`, '#/otra')).toBeNull()
    expect(rutaDesdeDireccionAntigua('/tableros/matricula-2025', '#/sa-fondo-epm')).toBeNull()
  })
})
