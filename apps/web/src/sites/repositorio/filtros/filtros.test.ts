import { describe, expect, it } from 'vitest'
import { indexar } from '../busqueda/indice'
import { comparar } from '../busqueda/texto'
import { CATEGORIAS_PRUEBA, documento, documentosReales } from '../pruebas/datos-prueba'
import {
  ESTADO_INICIAL,
  FACETAS,
  alternar,
  contarActivos,
  escribirEstado,
  leerEstado,
  seleccionVacia,
  validarSeleccion,
  type EstadoFiltros,
  type Seleccion,
} from './estado'
import { construirFacetas, opcionesVisibles } from './facetas'
import { filtrar } from './filtrar'
import { TEXTOS_FACETA } from './textos'

const docs = documentosReales()
const indice = indexar(docs)
const facetas = construirFacetas(indice, CATEGORIAS_PRUEBA)

function estado(parcial: Partial<Omit<EstadoFiltros, 'seleccion'>> & { seleccion?: Partial<Seleccion> } = {}): EstadoFiltros {
  return { ...ESTADO_INICIAL, ...parcial, seleccion: { ...seleccionVacia(), ...parcial.seleccion } }
}

/** Opciones del filtro Categoría ([texto, total], en su orden) para documentos con esas categorías. */
function categoriasDe(categorias: readonly string[], ordenConfigurado?: readonly string[]) {
  const lista = categorias.map((categoria, i) => documento({ id: `doc-${i}`, orden: i + 1, categoria }))
  return construirFacetas(indexar(lista), ordenConfigurado).categoria.map((o) => [o.texto, o.total])
}

describe('conteos de la carga inicial (sección 8 del encargo)', () => {
  it('372 documentos', () => {
    expect(indice).toHaveLength(372)
    expect(filtrar(indice, ESTADO_INICIAL).coinciden).toHaveLength(372)
  })

  it('por categoría, de la que tiene más productos a la que tiene menos', () => {
    expect(facetas.categoria.map((o) => [o.texto, o.total])).toEqual([
      ['Infografía', 89],
      ['Educación superior en cifras', 66],
      ['Estudio', 62],
      ['Informe dinámico', 54],
      ['Nota temática', 48],
      ['Boletín', 43],
      ['Informe de tendencias', 8],
      ['Otros productos', 2],
    ])
  })

  it('290 en español y 82 en inglés, todos a la vista (ya no se filtra por idioma)', () => {
    const idiomas = filtrar(indice, ESTADO_INICIAL).coinciden.map((c) => c.d.idioma)
    expect(idiomas.filter((i) => i === 'es')).toHaveLength(290)
    expect(idiomas.filter((i) => i === 'en')).toHaveLength(82)
  })

  it('64 tableros, 5 con entrada de blog y 6 con nota', () => {
    expect(docs.filter((d) => d.tipo === 'tablero')).toHaveLength(64)
    expect(docs.filter((d) => d.urlEntradaBlog)).toHaveLength(5)
    expect(docs.filter((d) => d.nota)).toHaveLength(6)
  })
})

describe('opciones de los filtros', () => {
  it('solo hay tres filtros de casillas: Categoría, Año y Palabra clave (ya no Idioma)', () => {
    expect(FACETAS).toEqual(['categoria', 'anio', 'clave'])
    expect(Object.keys(facetas)).toEqual(['categoria', 'anio', 'clave'])
    expect(Object.keys(seleccionVacia())).toEqual(['categoria', 'anio', 'clave'])
    expect(Object.values(TEXTOS_FACETA).map((t) => t.etiqueta)).toEqual(['Categoría', 'Año', 'Palabra clave'])
  })

  it('Categoría: más productos primero; a igualdad, el orden configurado y luego el alfabético', () => {
    // 3 de Estudio; 2 de Nota temática, Informe dinámico, Alfa y Zeta; 1 de Boletín.
    const categorias = [
      'Boletín',
      'Zeta',
      'Alfa',
      'Informe dinámico',
      'Nota temática',
      'Estudio',
      'Zeta',
      'Estudio',
      'Alfa',
      'Nota temática',
      'Informe dinámico',
      'Estudio',
    ]
    expect(categoriasDe(categorias, CATEGORIAS_PRUEBA)).toEqual([
      ['Estudio', 3],
      // Empate: manda el orden configurado (Nota temática antes que Informe dinámico, al revés del alfabético)...
      ['Nota temática', 2],
      ['Informe dinámico', 2],
      // ...y las que no están configuradas van después, por orden alfabético.
      ['Alfa', 2],
      ['Zeta', 2],
      // Boletín es la primera del orden configurado, pero es la que tiene menos productos.
      ['Boletín', 1],
    ])
    // Sin orden configurado, los empates se resuelven por orden alfabético.
    expect(categoriasDe(categorias)).toEqual([
      ['Estudio', 3],
      ['Alfa', 2],
      ['Informe dinámico', 2],
      ['Nota temática', 2],
      ['Zeta', 2],
      ['Boletín', 1],
    ])
    // El orden configurado se compara sin tildes ni mayúsculas.
    expect(categoriasDe(['Nota temática', 'Informe dinámico'], ['NOTA TEMATICA', 'informe dinamico'])).toEqual([
      ['Nota temática', 1],
      ['Informe dinámico', 1],
    ])
  })

  it('sin orden configurado, Categoría también va por número de productos (en los datos reales no hay empates)', () => {
    expect(construirFacetas(indice).categoria).toEqual(facetas.categoria)
  })

  it('a igualdad de productos, una categoría que no está en el orden configurado va al final', () => {
    const f = construirFacetas(indexar([documento({ id: 'a', categoria: 'Zeta' }), documento({ id: 'b', categoria: 'Estudio' }), documento({ id: 'c', categoria: 'Alfa' })]), ['Estudio'])
    expect(f.categoria.map((o) => o.texto)).toEqual(['Estudio', 'Alfa', 'Zeta'])
  })

  it('años del más reciente al más antiguo y "Sin fecha" al final', () => {
    const anios = facetas.anio.map((o) => o.texto)
    expect(anios[0]).toBe('2024')
    expect(anios.at(-1)).toBe('Sin fecha')
    expect(facetas.anio.at(-1)).toMatchObject({ valor: 'sf', total: 54 })
    const numeros = anios.slice(0, -1).map(Number)
    expect(numeros).toEqual([...numeros].sort((a, b) => b - a))
  })

  it('palabras clave en orden alfabético, sin distinguir tildes ni mayúsculas (pedido del Observatorio, 14-nov-2026)', () => {
    const textos = facetas.clave.map((o) => o.texto)
    expect(textos).toEqual([...textos].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })))
    expect(facetas.clave[0]).toMatchObject({ valor: 'acceso', texto: 'Acceso', total: 83 })
  })

  it('buscador del panel: difuso, sin tildes, siglas y "sf"', () => {
    const textos = (nombre: keyof typeof facetas, q: string) => opcionesVisibles(facetas[nombre], q).map((o) => o.texto)
    expect(textos('categoria', 'bol')).toEqual(['Boletín'])
    expect(textos('categoria', 'infografia')).toEqual(['Infografía'])
    // En el orden del filtro: Informe dinámico (54) tiene más productos que Informe de tendencias (8).
    expect(textos('categoria', 'informe')).toEqual(['Informe dinámico', 'Informe de tendencias'])
    expect(textos('anio', 'sf')).toEqual(['Sin fecha'])
    expect(textos('anio', 'sin')).toEqual(['Sin fecha'])
    expect(textos('clave', 'acesso')).toContain('Acceso')
    expect(textos('clave', 'xyzzy')).toEqual([])
    expect(opcionesVisibles(facetas.anio, '')).toHaveLength(facetas.anio.length)
  })
})

describe('filtrar', () => {
  const n = (e: EstadoFiltros) => filtrar(indice, e).coinciden.length

  it('O dentro de un filtro, Y entre filtros', () => {
    expect(n(estado({ seleccion: { categoria: ['boletin'] } }))).toBe(43)
    expect(n(estado({ seleccion: { categoria: ['boletin', 'estudio'] } }))).toBe(105)
    expect(n(estado({ seleccion: { anio: ['sf'] } }))).toBe(54)
    expect(n(estado({ seleccion: { categoria: ['boletin'], anio: ['2016'] } }))).toBe(6)
    expect(n(estado({ seleccion: { categoria: ['boletin'], anio: ['2016', '2017'] } }))).toBe(13)
    expect(n(estado({ seleccion: { categoria: ['boletin', 'estudio'], anio: ['2020'] } }))).toBe(10)
    // Boletín, año por año, suma sus 43.
    const porAnio = facetas.anio.map((o) => n(estado({ seleccion: { categoria: ['boletin'], anio: [o.valor] } })))
    expect(porAnio.reduce((a, b) => a + b, 0)).toBe(43)
  })

  it('palabra clave: basta con tener una de las marcadas', () => {
    const acceso = n(estado({ seleccion: { clave: ['acceso'] } }))
    const ambas = n(estado({ seleccion: { clave: ['acceso', 'expectativas'] } }))
    expect(acceso).toBe(83)
    expect(ambas).toBeGreaterThan(acceso)
  })

  it('búsqueda y filtros a la vez', () => {
    const r = filtrar(indice, estado({ q: 'sinergia', seleccion: { anio: ['2015'] } }))
    expect(r.coinciden.map((c) => c.d.doc.id)).toEqual(['boletin-que-es-sinergia-2015'])
    expect(r).toMatchObject({ consulta: ['sinergia'], activos: 1, filtrando: true })
    expect(filtrar(indice, ESTADO_INICIAL)).toMatchObject({ activos: 0, filtrando: false, consulta: [] })
  })

  it('órdenes: Más recientes, Más antiguos, Título (A–Z) y Relevancia', () => {
    const orden = (e: EstadoFiltros) => filtrar(indice, e).coinciden.map((c) => c.d.doc.orden)
    const recientes = orden(estado({ orden: 'reciente' }))
    expect(recientes.slice(0, 3)).toEqual([1, 2, 3])
    expect(orden(estado({ orden: 'antiguo' }))).toEqual([...recientes].reverse())
    // Sin búsqueda, Relevancia = Más recientes.
    expect(orden(estado({ orden: 'relevancia' }))).toEqual(recientes)
    const titulos = filtrar(indice, estado({ orden: 'titulo' })).coinciden.map((c) => c.d.titulo)
    expect(titulos.every((t, i) => i === 0 || comparar(titulos[i - 1], t) <= 0)).toBe(true)
    // Con búsqueda, Relevancia pone primero el mayor puntaje.
    const puntos = filtrar(indice, estado({ q: 'educacion superior' })).coinciden.map((c) => c.puntos)
    expect(puntos).toEqual([...puntos].sort((a, b) => b - a))
  })

  it('"Más recientes" sigue el campo orden aunque la API los mande desordenados', () => {
    const desordenados = indexar([documento({ id: 'b', orden: 2 }), documento({ id: 'c', orden: 3 }), documento({ id: 'a', orden: 1 })])
    expect(filtrar(desordenados, ESTADO_INICIAL).coinciden.map((c) => c.d.doc.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('estado en la URL', () => {
  it('lee búsqueda, filtros (repetidos) y orden', () => {
    const e = leerEstado(new URLSearchParams('q=fe+de+erratas&categoria=boletin&categoria=estudio&anio=sf&orden=titulo'))
    expect(e).toEqual({
      q: 'fe de erratas',
      seleccion: { categoria: ['boletin', 'estudio'], anio: ['sf'], clave: [] },
      orden: 'titulo',
    })
  })

  it('ignora un orden desconocido, valores vacíos y repetidos', () => {
    const e = leerEstado(new URLSearchParams('orden=raro&clave=&clave=acceso&clave=acceso'))
    expect(e.orden).toBe('relevancia')
    expect(e.seleccion.clave).toEqual(['acceso'])
  })

  it('un enlace viejo con ?idioma= se lee sin filtro de idioma: se ven los dos idiomas', () => {
    const e = leerEstado(new URLSearchParams('idioma=en&clave=acceso&idioma=es'))
    expect(e).toEqual(estado({ seleccion: { clave: ['acceso'] } }))
    expect(e.seleccion).not.toHaveProperty('idioma')
    const r = filtrar(indice, leerEstado(new URLSearchParams('idioma=en')))
    expect(r.coinciden).toHaveLength(372)
    expect(r).toMatchObject({ activos: 0, filtrando: false })
  })

  it('escribe solo lo que no es por defecto y conserva otros parámetros', () => {
    expect(escribirEstado(ESTADO_INICIAL).toString()).toBe('')
    const e = estado({ q: 'acceso', orden: 'antiguo', seleccion: { anio: ['sf'], clave: ['acceso', 'expectativas'] } })
    const p = escribirEstado(e, new URLSearchParams('utm=x&q=viejo'))
    expect(p.toString()).toBe('utm=x&q=acceso&anio=sf&clave=acceso&clave=expectativas&orden=antiguo')
    expect(leerEstado(p)).toEqual(e)
  })

  it('al escribir borra ?idioma= y conserva los demás parámetros ajenos', () => {
    const base = new URLSearchParams('utm_source=correo&idioma=en&q=viejo&ref=boletin&idioma=es')
    expect(escribirEstado(ESTADO_INICIAL, base).toString()).toBe('utm_source=correo&ref=boletin')
    expect(escribirEstado(estado({ seleccion: { categoria: ['boletin'] } }), base).toString()).toBe(
      'utm_source=correo&ref=boletin&categoria=boletin',
    )
    // Como hace useEstadoUrl: leer un enlace viejo y volver a escribirlo lo deja sin idioma.
    const viejo = new URLSearchParams('q=acceso&idioma=en&categoria=boletin&utm=x&orden=titulo')
    expect(escribirEstado(leerEstado(viejo), viejo).toString()).toBe('utm=x&q=acceso&categoria=boletin&orden=titulo')
  })

  it('descarta los valores que no existen en los datos', () => {
    const existentes = {
      categoria: new Set(['boletin']),
      anio: new Set(['2020']),
      clave: new Set(['acceso']),
    }
    expect(validarSeleccion({ categoria: ['boletin', 'x'], anio: ['1990'], clave: ['acceso'] }, existentes)).toEqual({
      categoria: ['boletin'],
      anio: [],
      clave: ['acceso'],
    })
  })

  it('alternar y contar marcadas', () => {
    expect(alternar(['a'], 'b')).toEqual(['a', 'b'])
    expect(alternar(['a', 'b'], 'a')).toEqual(['b'])
    expect(contarActivos({ categoria: ['a'], anio: ['b', 'c'], clave: ['d'] })).toBe(4)
    expect(contarActivos(seleccionVacia())).toBe(0)
  })
})
