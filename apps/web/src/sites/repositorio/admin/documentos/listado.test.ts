import { describe, expect, it } from 'vitest'
import type { DocumentoAdmin } from '../../api-repositorio'
import { documentosReales } from '../../pruebas/datos-prueba'
import {
  FILTROS_INICIALES,
  POR_PAGINA,
  escribirFiltros,
  filtrarDocumentos,
  hayFiltros,
  indexarAdmin,
  leerFiltros,
  paginar,
  resumir,
  type FiltrosAdmin,
} from './listado'

/** Los 372 productos reales como DocumentoAdmin (dos despublicados). */
const docs: DocumentoAdmin[] = documentosReales().map((d, i) => ({
  ...d,
  urlPortada: i === 3 ? null : d.urlPortada,
  publicado: i !== 5 && i !== 6,
  permiteDescarga: d.urlDescarga !== null,
  urlVerExterna: d.archivo ? null : d.urlVer,
  notasInternas: null,
  creadoEn: '2026-10-08T12:00:00.000Z',
  actualizadoEn: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T12:00:00.000Z`,
  actualizadoPor: null,
}))
const indice = indexarAdmin(docs)
const filtrar = (f: Partial<FiltrosAdmin>) => filtrarDocumentos(indice, { ...FILTROS_INICIALES, ...f })

describe('listado de la administración', () => {
  it('sin filtros: todos, en el orden «Más recientes»', () => {
    const filas = filtrar({})
    expect(filas).toHaveLength(372)
    expect(filas.slice(0, 3).map((f) => f.doc.orden)).toEqual([1, 2, 3])
  })

  it('filtra por categoría, estado, tipo, idioma y lo que falta', () => {
    expect(filtrar({ categoria: 'Boletín' })).toHaveLength(43)
    expect(filtrar({ estado: 'despublicado' })).toHaveLength(2)
    expect(filtrar({ estado: 'publicado' })).toHaveLength(370)
    expect(filtrar({ tipo: 'tablero' })).toHaveLength(64)
    expect(filtrar({ idioma: 'en' })).toHaveLength(82)
    // Documentos (no tableros ni entradas) sin archivo: los 6 estudios de OneDrive.
    expect(filtrar({ falta: 'archivo' })).toHaveLength(6)
    expect(filtrar({ falta: 'portada' })).toHaveLength(1)
    expect(filtrar({ categoria: 'Infografía', idioma: 'en' }).every((f) => f.doc.categoria === 'Infografía')).toBe(true)
  })

  it('filtra por una palabra clave exacta (sin tildes ni mayúsculas), no por la búsqueda difusa', () => {
    const conClave = (texto: string) => docs.filter((d) => d.claves.includes(texto)).length
    const beneficiarios = conClave('Beneficiarios')
    expect(beneficiarios).toBeGreaterThan(0)
    const filas = filtrar({ clave: 'Beneficiarios' })
    expect(filas).toHaveLength(beneficiarios)
    expect(filas.every((f) => f.doc.claves.includes('Beneficiarios'))).toBe(true)
    // La búsqueda difusa trae más (también coincide en títulos, subtítulos…).
    expect(filtrar({ q: 'Beneficiarios' }).length).toBeGreaterThan(beneficiarios)
    expect(filtrar({ clave: '  beneficiarios ' })).toHaveLength(beneficiarios)
    expect(filtrar({ clave: 'educacion SUPERIOR' })).toHaveLength(conClave('Educación superior'))
    expect(filtrar({ clave: 'no existe' })).toHaveLength(0)
    // Se combina con los demás filtros.
    expect(filtrar({ clave: 'Beneficiarios', idioma: 'en' }).every((f) => f.doc.idioma === 'en')).toBe(true)
  })

  it('busca con el motor de la página pública (difuso, sin tildes) y por identificador', () => {
    expect(filtrar({ q: 'sinergia' })[0].doc.titulo).toMatch(/Sinergia/)
    expect(filtrar({ q: 'issues note 23' })).toHaveLength(1)
    expect(filtrar({ q: 'convocatoria 2018-2' })).toHaveLength(6)
    const porId = filtrar({ q: docs[10].id })
    expect(porId[0].doc.id).toBe(docs[10].id)
  })

  it('ordena por columna y dirección; con búsqueda, por relevancia', () => {
    const titulos = filtrar({ orden: 'titulo', dir: 'asc' }).map((f) => f.doc.titulo)
    expect(titulos[0].localeCompare(titulos[1], 'es', { sensitivity: 'base' })).toBeLessThanOrEqual(0)
    const anios = filtrar({ orden: 'anio', dir: 'desc' }).map((f) => f.doc.anio ?? -1)
    expect(anios[0]).toBeGreaterThanOrEqual(anios[anios.length - 1])
    expect(filtrar({ orden: 'estado', dir: 'asc' })[0].doc.publicado).toBe(false)
    const conBusqueda = filtrar({ q: 'deserción' })
    expect(conBusqueda[0].puntos).toBeGreaterThanOrEqual(conBusqueda[conBusqueda.length - 1].puntos)
  })

  it('cuenta publicados, despublicados y lo que falta', () => {
    expect(resumir(docs)).toEqual({
      total: 372,
      publicados: 370,
      despublicados: 2,
      sinArchivo: 6,
      sinPortada: 1,
      sinDestino: 0,
    })
  })

  it(`pagina de a ${POR_PAGINA} y ajusta una página fuera de rango`, () => {
    const p = paginar(docs, 8)
    expect(p.paginas).toBe(8)
    expect(p.elementos).toHaveLength(22)
    expect([p.desde, p.hasta]).toEqual([351, 372])
    expect(paginar(docs, 99).pagina).toBe(8)
    expect(paginar([], 1)).toMatchObject({ paginas: 1, desde: 0, hasta: 0 })
  })

  it('los filtros van y vuelven de la URL; los valores desconocidos se ignoran', () => {
    const f: FiltrosAdmin = {
      ...FILTROS_INICIALES,
      q: 'matrícula',
      categoria: 'Boletín',
      clave: 'Educación superior',
      estado: 'despublicado',
      tipo: 'tablero',
      idioma: 'en',
      falta: 'portada',
      orden: 'anio',
      dir: 'desc',
      pagina: 3,
    }
    expect(leerFiltros(escribirFiltros(f))).toEqual(f)
    expect(escribirFiltros(FILTROS_INICIALES).toString()).toBe('')
    expect(leerFiltros(new URLSearchParams('estado=raro&tipo=x&orden=nada&pagina=-2'))).toEqual(FILTROS_INICIALES)
    expect(hayFiltros(FILTROS_INICIALES)).toBe(false)
    expect(hayFiltros({ ...FILTROS_INICIALES, idioma: 'es' })).toBe(true)
    expect(hayFiltros({ ...FILTROS_INICIALES, clave: 'Acceso' })).toBe(true)
    expect(escribirFiltros({ ...FILTROS_INICIALES, clave: 'Fondos Sapiencia' }).toString()).toBe('clave=Fondos+Sapiencia')
  })
})
