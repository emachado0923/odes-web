import { describe, expect, it } from 'vitest'
import { documento, documentosReales } from '../pruebas/datos-prueba'
import { ESTADO_INICIAL } from '../filtros/estado'
import { filtrar } from '../filtros/filtrar'
import { indexar, indexarDocumento, puntaje } from './indice'
import { calcularParecido, distancia, parecido } from './parecido'
import { trozosResaltados } from './resaltar'
import { comparar, esVacia, fichas, normalizar, palabras, siglas, terminos } from './texto'

const indice = indexar(documentosReales())

/** Resultado de buscar `q` en los 372 documentos reales (orden "Relevancia"). */
function buscar(q: string) {
  return filtrar(indice, { ...ESTADO_INICIAL, q }).coinciden
}
const ids = (q: string) => buscar(q).map((c) => c.d.doc.id)
const titulos = (q: string) => buscar(q).map((c) => c.d.titulo)

describe('texto', () => {
  it('normaliza sin tildes, mayúsculas ni puntuación ("S. F." = "sf")', () => {
    expect(normalizar('Educación  Postsecundaria, MEDELLÍN')).toBe('educacion postsecundaria medellin')
    expect(normalizar('S. F.')).toBe('sf')
    expect(normalizar('s.f.')).toBe('sf')
    expect(normalizar('N.º 28')).toBe('n 28')
    expect(normalizar('¿Qué es SINERGIA?')).toBe('que es sinergia')
    expect(normalizar(null)).toBe('')
    expect(palabras('  ')).toEqual([])
  })

  it('quita las palabras vacías salvo que solo haya de esas', () => {
    expect(terminos('la deserción de los estudiantes')).toEqual(['desercion', 'estudiantes'])
    expect(terminos('de la')).toEqual(['de', 'la'])
    expect(esVacia('para')).toBe(true)
    expect(esVacia('')).toBe(false)
  })

  it('une pares de palabras seguidas ("post secundaria" → "postsecundaria")', () => {
    expect(fichas('Educación post secundaria')).toEqual(['educacion', 'post', 'secundaria', 'educacionpost', 'postsecundaria'])
    // Las palabras vacías no se unen.
    expect(fichas('Acceso a la educación')).toEqual(['acceso', 'a', 'la', 'educacion'])
  })

  it('arma siglas de nombres en mayúscula (3 letras o más)', () => {
    expect(siglas('Objetivos de Desarrollo Sostenible')).toEqual(['ods'])
    expect(siglas('Ciencia Tecnología e Innovación')).toEqual(['cti'])
    // La puntuación corta la sigla (como en el bloque).
    expect(siglas('Ciencia, Tecnología e Innovación')).toEqual([])
    expect(siglas('Instituciones de Educación Superior públicas')).toEqual(['ies'])
    expect(siglas('Medellín')).toEqual([])
    expect(siglas('acceso a la educación')).toEqual([])
  })

  it('compara en español, sin tildes ni mayúsculas y con números naturales', () => {
    expect(comparar('Boletín 2', 'boletin 10')).toBeLessThan(0)
    expect(comparar('Árbol', 'arbol')).toBe(0)
  })
})

describe('parecido difuso', () => {
  it('distancia OSA (intercambio de dos letras = 1)', () => {
    expect(distancia('educacion', 'eudcacion', 2)).toBe(1)
    expect(distancia('educacion', 'eduacacion', 2)).toBe(1)
    expect(distancia('acceso', 'acesso', 2)).toBe(2)
    expect(distancia('desercion', 'insercion', 2)).toBe(2)
    expect(distancia('abc', 'abcdef', 2)).toBe(3)
  })

  it('igual, prefijo y pedazo de palabra', () => {
    expect(calcularParecido('acceso', 'acceso')).toBe(1)
    expect(calcularParecido('permanen', 'permanencia')).toBe(0.9)
    expect(calcularParecido('pe', 'permanencia')).toBe(0.6)
    expect(calcularParecido('secundaria', 'postsecundaria')).toBe(0.7)
    expect(calcularParecido('ma', 'tema')).toBe(0)
  })

  it('1 error en palabras de 4 o 5 letras, 2 en las de 6 o más (con la primera letra igual)', () => {
    expect(calcularParecido('beca', 'bica')).toBeCloseTo(0.65)
    expect(calcularParecido('bec', 'bic')).toBe(0)
    expect(calcularParecido('becas', 'bicos')).toBe(0)
    expect(calcularParecido('expectatvas', 'expectativas')).toBeCloseTo(0.65)
    expect(calcularParecido('finaciacion', 'financiacion')).toBeCloseTo(0.65)
    expect(calcularParecido('educasion', 'edukacion')).toBeCloseTo(0.5)
    // Con dos errores la primera letra debe coincidir.
    expect(calcularParecido('insercion', 'desercion')).toBe(0)
  })

  it('palabra a medio escribir con un error', () => {
    expect(calcularParecido('permamen', 'permanencia')).toBe(0.4)
  })

  it('los números solo cuentan completos o al comienzo', () => {
    expect(calcularParecido('2021', '2021')).toBe(1)
    expect(calcularParecido('20', '2021')).toBe(0.9)
    expect(calcularParecido('21', '2021')).toBe(0)
    expect(calcularParecido('2012', '2021')).toBe(0)
    expect(calcularParecido('covid', 'covid19')).toBe(0.9)
    expect(calcularParecido('codiv', 'covid19')).toBe(0)
  })

  it('la versión con memoria da lo mismo', () => {
    for (const [p, w] of [['acceso', 'acesso'], ['21', '2021'], ['permanen', 'permanencia']]) {
      expect(parecido(p, w)).toBe(calcularParecido(p, w))
      expect(parecido(p, w)).toBe(calcularParecido(p, w))
    }
  })
})

describe('puntaje y pesos', () => {
  const d = indexarDocumento(
    documento({
      titulo: 'Acceso a la educación',
      subtitulo: 'Financiación y permanencia',
      descripcion: '  Analiza la cobertura de los programas   en las comunas de Medellín. ',
      categoria: 'Boletín',
      numero: '7',
      anio: 2019,
      claves: ['Permanencia', 'Objetivos de Desarrollo Sostenible'],
    }),
    0,
  )

  it('pesos: título 3, claves 2,5, categoría 2, subtítulo 1,5, descripción 1, número 1, año 1', () => {
    expect(puntaje(d, ['acceso'], 'acceso')).toBe(3 + 2)
    expect(puntaje(d, ['permanencia'], 'permanencia')).toBe(2.5)
    expect(puntaje(d, ['boletin'], 'boletin')).toBe(2)
    expect(puntaje(d, ['financiacion'], 'financiacion')).toBe(1.5)
    expect(puntaje(d, ['cobertura'], 'cobertura')).toBe(1)
    expect(puntaje(d, ['7'], '7')).toBe(1)
    expect(puntaje(d, ['2019'], '2019')).toBe(1)
    expect(puntaje(d, ['ods'], 'ods')).toBe(2.5)
  })

  it('la descripción se indexa con los espacios colapsados ("" si no tiene)', () => {
    expect(d.descripcion).toBe('Analiza la cobertura de los programas en las comunas de Medellín.')
    expect(indexarDocumento(documento({ descripcion: null }), 0).descripcion).toBe('')
  })

  it('una palabra que solo está en la descripción encuentra el documento, por debajo de uno que la tiene en el título', () => {
    // El que la tiene en la descripción es el más reciente: sin el peso, iría primero.
    const lista = indexar([
      documento({
        id: 'en-descripcion',
        orden: 1,
        titulo: 'Panorama de la oferta educativa',
        descripcion: 'Presenta la georreferenciación de las sedes de educación postsecundaria de la ciudad.',
      }),
      documento({ id: 'en-titulo', orden: 2, titulo: 'Georreferenciación de las sedes educativas' }),
      documento({ id: 'en-subtitulo', orden: 3, titulo: 'Sedes educativas', subtitulo: 'Georreferenciación por comuna' }),
      documento({ id: 'sin-la-palabra', orden: 4, titulo: 'Matrícula en educación superior', descripcion: 'Resume la matrícula.' }),
    ])
    const r = filtrar(lista, { ...ESTADO_INICIAL, q: 'georreferenciación' }).coinciden
    // Título 3 (+2 por la frase), subtítulo 1,5 y descripción 1.
    expect(r.map((c) => [c.d.doc.id, c.puntos])).toEqual([
      ['en-titulo', 3 + 2],
      ['en-subtitulo', 1.5],
      ['en-descripcion', 1],
    ])
  })

  it('suma lo mejor de cada palabra; 0 si alguna no aparece; +2 si la frase está en el título', () => {
    expect(puntaje(d, ['acceso', 'educacion'], 'acceso educacion')).toBe(3 + 3)
    // La frase son las palabras útiles seguidas: "la educación" sí está en el título, "acceso educación" no.
    expect(puntaje(d, ['la', 'educacion'], 'la educacion')).toBe(3 + 3 + 2)
    expect(puntaje(d, ['acceso', 'zzz'], 'acceso zzz')).toBe(0)
  })

  it('"S. F." y "sin fecha" encuentran los documentos sin año', () => {
    const sinFecha = indexarDocumento(documento({ anio: null }), 0)
    expect(puntaje(sinFecha, terminos('S. F.'), 'sf')).toBe(1)
    expect(puntaje(sinFecha, terminos('sin fecha'), 'sin fecha')).toBe(2)
  })
})

describe('búsquedas en los 372 documentos reales (sección 8 del encargo)', () => {
  it('"sinergia" encuentra el Boletín "Avances y retos en la estrategia de Sinergia…"', () => {
    expect(titulos('sinergia')[0]).toMatch(/^Avances y retos en la estrategia de Sinergia/)
    expect(ids('sinergia')).toEqual(['boletin-avances-retos-estrategia-sinergia-entre-tres-2016', 'boletin-que-es-sinergia-2015'])
  })

  it('"issues note 23" encuentra exactamente 1 documento', () => {
    expect(ids('issues note 23')).toEqual(['nota-tematica-23-en-main-generative-artificial-intelligences-gai-their-2023'])
  })

  it('"fe de erratas" encuentra el Boletín 19', () => {
    const r = buscar('fe de erratas')
    expect(r).toHaveLength(1)
    expect(r[0].d.titulo).toBe('Fe de erratas del Boletín N.º 19')
    expect(r[0].d.numero).toBe('19')
  })

  it('"convocatoria 2018-2" encuentra 6 (el "2" vale como prefijo de número, como en el bloque)', () => {
    const r = titulos('convocatoria 2018-2')
    expect(r).toHaveLength(6)
    expect(r.slice(0, 3).every((t) => t.includes('2018-2'))).toBe(true)
  })
})

describe('versiones en inglés, tableros y entradas', () => {
  it('"inglés" y "english" encuentran las 82 versiones en inglés', () => {
    expect(buscar('english')).toHaveLength(82)
    expect(buscar('inglés')).toHaveLength(82)
    expect(buscar('ingles').every((c) => c.d.idioma === 'en')).toBe(true)
  })

  it('nombres en inglés de los tipos', () => {
    const tiposEn = (q: string) => new Set(buscar(q).map((c) => `${c.d.categoria}|${c.d.idioma}`))
    expect(tiposEn('issues note')).toEqual(new Set(['nota tematica|en']))
    expect(tiposEn('infographic')).toEqual(new Set(['infografia|en']))
    // "bulletin" también se parece a "boletín" (2 errores, misma primera letra).
    expect(tiposEn('bulletin')).toEqual(new Set(['boletin|en', 'boletin|es']))
    expect(buscar('dynamic report').every((c) => c.d.idioma === 'en')).toBe(true)
    expect(buscar('trends report').map((c) => c.d.categoria)).toEqual(Array(3).fill('informe de tendencias'))
  })

  it('"other products" encuentra la versión en inglés de Otros productos', () => {
    const lista = indexar([
      documento({ id: 'otros-es', orden: 1, categoria: 'Otros productos', idioma: 'es', titulo: 'Notas de redes' }),
      documento({ id: 'otros-en', orden: 2, categoria: 'Otros productos', idioma: 'en', titulo: 'Social media notes' }),
    ])
    const r = filtrar(lista, { ...ESTADO_INICIAL, q: 'other products' }).coinciden
    expect(r.map((c) => c.d.doc.id)).toEqual(['otros-en'])
  })

  it('"tablero interactivo" encuentra los 64 tableros y "entrada blog" solo el producto que es una entrada', () => {
    const tableros = buscar('tablero interactivo')
    expect(tableros).toHaveLength(64)
    expect(tableros.every((c) => c.d.doc.tipo === 'tablero')).toBe(true)
    // Los 4 documentos que tienen enlace al blog ya no cuentan como entrada.
    const entradas = buscar('entrada blog')
    expect(entradas.map((c) => c.d.doc.id)).toEqual(['boletin-estado-actual-educacion-superior-medellin-2016'])
    expect(entradas[0].d.doc.tipo).toBe('entrada')
  })

  it('"entrada blog" no marca un documento por tener enlace al blog', () => {
    const enlace = 'https://sapiencia.gov.co/blog/fe-de-erratas/'
    const conEnlace = indexarDocumento(documento({ tipo: 'documento', urlEntradaBlog: enlace }), 0)
    const entrada = indexarDocumento(documento({ tipo: 'entrada', urlEntradaBlog: enlace }), 1)
    expect(puntaje(conEnlace, ['entrada', 'blog'], 'entrada blog')).toBe(0)
    expect(puntaje(entrada, ['entrada', 'blog'], 'entrada blog')).toBe(2 + 2)
  })
})

/**
 * Resultados del bloque v4.2 (calculados con su script sobre los mismos 372
 * documentos): cantidad y primer resultado en orden "Relevancia".
 */
const DEL_BLOQUE: Record<string, [number, string | null]> = {
  '21': [3, 'nota-tematica-21-tendencias-manana-empleo-2023'],
  'educacion superior': [115, 'infografia-cambios-generados-vida-personas-despues-realizar'],
  desercion: [18, 'estudio-panorama-desercion-personas-beneficiarias-programas-sapiencia-2023'],
  'insercion laboral': [6, 'boletin-8-insercion-laboral-analisis-oferta-demanda-mercado-2018'],
  permanen: [28, 'infografia-matricula-cero-contribucion-acceso-permanencia-educacion-2023'],
  'post secundaria': [54, 'boletin-29-resultados-preliminares-estudios-educacion-postsecundaria-2024'],
  ods: [6, 'nota-tematica-15-universidades-medellin-impacto-ods-2022'],
  'inglés boletín': [1, 'boletin-24-en-general-landscape-labor-market-medellin-2022'],
  'infographic 2023': [0, null],
  'dynamic report': [25, 'informe-dinamico-en-dynamic-report-strategic-intelligence-may-2023'],
  'sin fecha': [54, 'infografia-en-female-leadership-higher-education-institutions-colombia'],
  'n 28': [0, null],
  expectatvas: [27, 'estudio-expectativas-estudiantes-grado-11-medellin-continuidad-2024'],
  finaciacion: [44, 'infografia-financiacion-estudios-personas-matriculadas-educacion-trabajo'],
  'de la': [185, 'estudio-seguimiento-continuidad-educacion-postsecundaria-bachilleres-medellin'],
  'medellin a la u': [114, 'estudio-expectativas-estudiantes-grado-11-medellin-continuidad-2024'],
  'matricula cero': [10, 'estudio-matricula-cero-2023'],
  'mujeres stem': [6, 'boletin-13-evolucion-proyeccion-matricula-programas-stem-2019'],
  'covid-19': [27, 'boletin-17-covid-19-efecto-catalizador-educacion-2020'],
  ETDH: [15, 'infografia-en-financing-studies-people-enrolled-education-work'],
  CLEI: [6, 'infografia-en-first-study-expectations-clei-5-6'],
  'cuarta revolución industrial': [20, 'boletin-11-medellin-hacia-cuarta-revolucion-industrial-2019'],
}

describe('mismos resultados que el bloque v4.2', () => {
  for (const [q, [n, primero]] of Object.entries(DEL_BLOQUE)) {
    it(`"${q}" → ${n}`, () => {
      const r = ids(q)
      expect(r).toHaveLength(n)
      expect(r[0] ?? null).toBe(primero)
    })
  }
})

describe('resaltado', () => {
  const marcas = (texto: string, q: string) =>
    trozosResaltados(texto, terminos(q))
      .filter((t) => t.marca)
      .map((t) => t.texto)

  it('marca las palabras que se parecen a lo buscado, conservando el texto original', () => {
    expect(marcas('Educación postsecundaria en Medellín', 'educacion medellin')).toEqual(['Educación', 'Medellín'])
    expect(marcas('Acceso y permanencia', 'permanen')).toEqual(['permanencia'])
    expect(marcas('Expectativas 2024', 'expectatvas 20')).toEqual(['Expectativas', '2024'])
    expect(trozosResaltados('Acceso y permanencia', terminos('acceso')).map((t) => t.texto).join('')).toBe(
      'Acceso y permanencia',
    )
  })

  it('no marca con palabras de una letra ni sin búsqueda', () => {
    expect(marcas('Acceso a la U', 'u')).toEqual([])
    expect(trozosResaltados('Acceso', [])).toEqual([{ texto: 'Acceso', marca: false }])
  })
})
