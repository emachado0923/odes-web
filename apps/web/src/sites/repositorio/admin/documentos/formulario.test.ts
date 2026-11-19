import { describe, expect, it } from 'vitest'
import type { DocumentoAdmin } from '../../api-repositorio'
import { DESCRIPCION_PRUEBA, seisClaves } from '../pruebas/apiSimulada'
import {
  URL_VISTA_PREVIA,
  aDatos,
  agregarClave,
  contarPalabras,
  documentoVistaPrevia,
  faltasParaPublicar,
  hayCambios,
  sugerirClaves,
  validar,
  valoresIniciales,
  type ValoresFormulario,
} from './formulario'

function valores(parcial: Partial<ValoresFormulario> = {}): ValoresFormulario {
  return { ...valoresIniciales(null, 'Boletín'), titulo: 'Boletín de prueba', ...parcial }
}

/** Valores con todo lo que se exige para publicar: año, descripción de 30 palabras y 6 palabras clave. */
function completos(parcial: Partial<ValoresFormulario> = {}): ValoresFormulario {
  return valores({ anio: '2025', descripcion: DESCRIPCION_PRUEBA, claves: seisClaves([]), ...parcial })
}

/** Un texto de `n` palabras. */
function palabras(n: number): string {
  return Array.from({ length: n }, (_, i) => `palabra${i + 1}`).join(' ')
}

function doc(parcial: Partial<DocumentoAdmin> = {}): DocumentoAdmin {
  return {
    id: 'boletin-30-prueba-2025',
    orden: 4,
    titulo: 'Prueba',
    subtitulo: null,
    descripcion: null,
    categoria: 'Boletín',
    numero: '30',
    anio: 2025,
    mes: 3,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Acceso'],
    urlVer: '/api/repositorio/admin/documentos/boletin-30-prueba-2025/ver',
    urlDescarga: '/api/repositorio/admin/documentos/boletin-30-prueba-2025/descargar',
    urlEntradaBlog: null,
    nota: null,
    urlPortada: '/api/repositorio/admin/documentos/boletin-30-prueba-2025/portada?v=1',
    urlMiniatura: null,
    archivo: { tipo: 'application/pdf', bytes: 10, extension: 'pdf', sha256: 'x' },
    equivalenteEnEspanol: null,
    publicado: false,
    permiteDescarga: true,
    urlVerExterna: null,
    notasInternas: null,
    creadoEn: '2026-10-08T12:00:00.000Z',
    actualizadoEn: '2026-10-08T12:00:00.000Z',
    actualizadoPor: null,
    ...parcial,
  }
}

describe('validar (mismas reglas que el servidor)', () => {
  it('un documento con título y categoría es válido', () => {
    expect(validar(valores(), { creando: true })).toEqual({})
  })

  it('exige título y categoría y limita los largos', () => {
    const e = validar(valores({ titulo: '   ', categoria: '', subtitulo: 'x'.repeat(401), nota: 'n'.repeat(301) }), {
      creando: false,
    })
    expect(e.titulo).toBe('Escriba el título.')
    expect(e.categoria).toBe('Elija la categoría.')
    expect(e.subtitulo).toMatch(/Máximo 400 caracteres \(tiene 401\)/)
    expect(e.nota).toMatch(/Máximo 300/)
    expect(validar(valores({ titulo: 't'.repeat(301) }), { creando: false }).titulo).toMatch(/Máximo 300/)
  })

  it('tableros y entradas necesitan la URL externa; un documento no', () => {
    expect(validar(valores({ tipo: 'tablero' }), { creando: false }).urlVerExterna).toMatch(/tablero necesita la URL/)
    expect(validar(valores({ tipo: 'entrada' }), { creando: false }).urlVerExterna).toMatch(/entrada necesita la URL/)
    expect(validar(valores({ tipo: 'documento' }), { creando: false }).urlVerExterna).toBeUndefined()
    expect(
      validar(valores({ tipo: 'tablero', urlVerExterna: 'https://app.powerbi.com/view?r=abc' }), { creando: false }),
    ).toEqual({})
  })

  it('solo acepta URL http(s) completas', () => {
    for (const mala of ['javascript:alert(1)', 'www.sapiencia.gov.co', 'ftp://x.org/a', '/ruta']) {
      expect(validar(valores({ urlVerExterna: mala }), { creando: false }).urlVerExterna).toMatch(/https:\/\//)
      expect(validar(valores({ urlEntradaBlog: mala }), { creando: false }).urlEntradaBlog).toMatch(/https:\/\//)
    }
  })

  it('año de 4 cifras entre 1900 y 2100 (vacío solo en un borrador); el mes solo con año', () => {
    expect(validar(valores({ anio: '' }), { creando: false }).anio).toBeUndefined()
    expect(validar(valores({ anio: '1899' }), { creando: false }).anio).toBe('Escriba un año entre 1900 y 2100.')
    expect(validar(valores({ anio: '20a4' }), { creando: false }).anio).toBeDefined()
    expect(validar(valores({ anio: '', mes: '5' }), { creando: false }).mes).toBe('El mes solo se puede indicar si hay año.')
    // Publicado, el año es obligatorio.
    expect(validar(completos({ anio: '' }), { creando: false, publicado: true }).anio).toBe(
      'Para publicar, indique el año de publicación.',
    )
  })

  it('la descripción: máximo 700 caracteres, también en un borrador', () => {
    expect(validar(valores({ descripcion: 'd'.repeat(701) }), { creando: false }).descripcion).toBe(
      'Máximo 700 caracteres (tiene 701).',
    )
    expect(validar(valores({ descripcion: 'd'.repeat(700) }), { creando: false }).descripcion).toBeUndefined()
    // En un borrador puede estar vacía o ser corta.
    expect(validar(valores({ descripcion: '' }), { creando: false }).descripcion).toBeUndefined()
    expect(validar(valores({ descripcion: palabras(10) }), { creando: false }).descripcion).toBeUndefined()
  })

  it('máximo 6 palabras clave', () => {
    const siete = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(validar(valores({ claves: siete }), { creando: false }).claves).toBe('Máximo 6 palabras clave.')
    expect(validar(valores({ claves: siete.slice(0, 6) }), { creando: false }).claves).toBeUndefined()
  })

  it('el identificador solo se revisa al crear', () => {
    expect(validar(valores({ id: 'Boletín 30' }), { creando: true }).id).toMatch(/Solo minúsculas/)
    expect(validar(valores({ id: 'boletin-30-2025' }), { creando: true }).id).toBeUndefined()
    expect(validar(valores({ id: 'Boletín 30' }), { creando: false }).id).toBeUndefined()
  })

  it('la posición es un entero desde 1', () => {
    expect(validar(valores({ orden: '0' }), { creando: false }).orden).toBeDefined()
    expect(validar(valores({ orden: '2.5' }), { creando: false }).orden).toBeDefined()
    expect(validar(valores({ orden: '12' }), { creando: false }).orden).toBeUndefined()
  })
})

describe('lo que se exige para publicar (mismas reglas que el servidor)', () => {
  it('contarPalabras: fragmentos separados por espacios, tabulaciones o saltos de línea', () => {
    expect(contarPalabras('')).toBe(0)
    expect(contarPalabras('   \n ')).toBe(0)
    expect(contarPalabras(' uno  dos\ttres\ncuatro ')).toBe(4)
    expect(contarPalabras(DESCRIPCION_PRUEBA)).toBe(30)
  })

  it('un documento con año, descripción de 50 a 70 palabras y 6 palabras clave puede publicarse', () => {
    expect(faltasParaPublicar(completos())).toEqual({})
    expect(faltasParaPublicar(completos({ descripcion: palabras(25) }))).toEqual({})
    expect(faltasParaPublicar(completos({ descripcion: palabras(35) }))).toEqual({})
  })

  it('sin año, sin descripción y sin palabras clave: un error en cada campo', () => {
    expect(faltasParaPublicar(valores({ anio: '  ', descripcion: ' ', claves: [] }))).toEqual({
      anio: 'Para publicar, indique el año de publicación.',
      descripcion: 'Para publicar, escriba la descripción (unas 30 palabras).',
      claves: 'Para publicar, el documento necesita 6 palabras clave (tiene 0).',
    })
  })

  it('la descripción debe tener entre 25 y 35 palabras (se piden 30)', () => {
    expect(faltasParaPublicar(completos({ descripcion: palabras(24) })).descripcion).toBe(
      'La descripción tiene 24 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
    )
    expect(faltasParaPublicar(completos({ descripcion: `${DESCRIPCION_PRUEBA} ${palabras(6)}` })).descripcion).toBe(
      'La descripción tiene 36 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
    )
  })

  it('exactamente 6 palabras clave (las vacías no cuentan)', () => {
    const seis = seisClaves([])
    expect(faltasParaPublicar(completos({ claves: seis.slice(0, 5) })).claves).toBe(
      'Para publicar, el documento necesita 6 palabras clave (tiene 5).',
    )
    expect(faltasParaPublicar(completos({ claves: [...seis.slice(0, 5), '   '] })).claves).toMatch(/\(tiene 5\)/)
    expect(faltasParaPublicar(completos({ claves: [...seis, 'Séptima'] })).claves).toMatch(/\(tiene 7\)/)
  })

  it('los tableros y las entradas se publican con las mismas reglas que los documentos', () => {
    for (const tipo of ['documento', 'tablero', 'entrada'] as const) {
      expect(faltasParaPublicar(completos({ tipo }))).toEqual({})
      expect(faltasParaPublicar(completos({ tipo, anio: '' }))).toEqual({
        anio: 'Para publicar, indique el año de publicación.',
      })
    }
  })

  it('validar las exige solo si el documento está (o va a quedar) publicado: un borrador puede quedar incompleto', () => {
    const incompleto = valores({ anio: '', descripcion: palabras(10), claves: ['Acceso'] })
    expect(validar(incompleto, { creando: false })).toEqual({})
    expect(validar(incompleto, { creando: false, publicado: false })).toEqual({})
    expect(validar(incompleto, { creando: false, publicado: true })).toEqual({
      anio: 'Para publicar, indique el año de publicación.',
      descripcion: 'La descripción tiene 10 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
      claves: 'Para publicar, el documento necesita 6 palabras clave (tiene 1).',
    })
    expect(validar(completos(), { creando: false, publicado: true })).toEqual({})
  })

  it('en un publicado, los errores de formato se muestran en lugar de lo que falta para publicar', () => {
    const publicado = { creando: false, publicado: true }
    expect(validar(completos({ anio: '20a4' }), publicado).anio).toBe('Escriba un año entre 1900 y 2100.')
    expect(validar(completos({ claves: [...seisClaves([]), 'Séptima'] }), publicado).claves).toBe('Máximo 6 palabras clave.')
    expect(validar(completos({ descripcion: 'd'.repeat(701) }), publicado).descripcion).toBe('Máximo 700 caracteres (tiene 701).')
    // Y se suman a lo que falta en los demás campos.
    expect(validar(completos({ titulo: '', anio: '' }), publicado)).toEqual({
      titulo: 'Escriba el título.',
      anio: 'Para publicar, indique el año de publicación.',
    })
  })
})

describe('aDatos', () => {
  it('limpia los textos, convierte números y deja null lo vacío', () => {
    const d = aDatos(
      valores({ titulo: '  Boletín   de prueba ', subtitulo: ' ', numero: ' 30 ', anio: '2025', mes: '3', id: 'boletin-30' }),
      null,
    )
    expect(d).toMatchObject({
      id: 'boletin-30',
      titulo: 'Boletín de prueba',
      subtitulo: null,
      numero: '30',
      anio: 2025,
      mes: 3,
      permiteDescarga: true,
      urlVerExterna: null,
    })
  })

  it('tableros y entradas nunca llevan descarga', () => {
    expect(aDatos(valores({ tipo: 'tablero', permiteDescarga: true, urlVerExterna: 'https://x.org' }), null).permiteDescarga).toBe(
      false,
    )
  })

  it('al editar no envía el id y envía la posición solo si cambió', () => {
    const original = doc()
    const sinCambio = aDatos(valoresIniciales(original), original)
    expect(sinCambio.id).toBeUndefined()
    expect(sinCambio.orden).toBeNull()
    expect(aDatos({ ...valoresIniciales(original), orden: '1' }, original).orden).toBe(1)
  })

  it('sin año, el mes se envía null', () => {
    expect(aDatos(valores({ anio: '', mes: '4' }), null).mes).toBeNull()
  })

  it('las notas internas conservan los saltos de línea', () => {
    expect(aDatos(valores({ notasInternas: ' línea 1\r\nlínea 2 ' }), null).notasInternas).toBe('línea 1\nlínea 2')
  })

  it('la descripción va en una sola línea, sin espacios de más; vacía, null', () => {
    expect(aDatos(valores({ descripcion: '  Una   descripción\r\nde prueba ' }), null).descripcion).toBe(
      'Una descripción de prueba',
    )
    expect(aDatos(valores({ descripcion: ' \n ' }), null).descripcion).toBeNull()
  })

  it('la descripción guardada llega al formulario (sin descripción, vacía)', () => {
    expect(valoresIniciales(doc({ descripcion: DESCRIPCION_PRUEBA })).descripcion).toBe(DESCRIPCION_PRUEBA)
    expect(valoresIniciales(doc()).descripcion).toBe('')
    expect(valoresIniciales(null).descripcion).toBe('')
    const original = doc({ descripcion: DESCRIPCION_PRUEBA })
    expect(aDatos(valoresIniciales(original), original).descripcion).toBe(DESCRIPCION_PRUEBA)
  })
})

describe('palabras clave', () => {
  const existentes = ['Educación superior', 'Acceso', 'Deserción']

  it('usa la forma que ya existe en el repositorio (tildes y mayúsculas)', () => {
    const r = agregarClave([], 'educacion  SUPERIOR', existentes)
    expect(r.claves).toEqual(['Educación superior'])
    expect(r.aviso).toMatch(/como ya está escrita en el repositorio/)
  })

  it('una palabra nueva se agrega tal cual (limpia) y se avisa que es nueva', () => {
    const r = agregarClave(['Acceso'], '  Inteligencia   artificial ', existentes)
    expect(r.claves).toEqual(['Acceso', 'Inteligencia artificial'])
    expect(r.aviso).toMatch(/palabra clave nueva/)
  })

  it('no repite una palabra que ya está (sin contar tildes)', () => {
    const r = agregarClave(['Deserción'], 'desercion', existentes)
    expect(r.agregada).toBe(false)
    expect(r.claves).toEqual(['Deserción'])
  })

  it('no pasa de 6', () => {
    const seis = ['a', 'b', 'c', 'd', 'e', 'f']
    const r = agregarClave(seis, 'Acceso', existentes)
    expect(r.agregada).toBe(false)
    expect(r.claves).toHaveLength(6)
    expect(r.aviso).toBe('Ya tiene 6 palabras clave, el máximo.')
    expect(agregarClave(seis.slice(0, 5), 'Acceso', existentes).claves).toHaveLength(6)
  })

  it('sugerencias: primero las que empiezan igual, luego por uso; sin las ya elegidas', () => {
    const lista = [
      { texto: 'Matrícula', documentos: 25 },
      { texto: 'Acceso a la educación', documentos: 3 },
      { texto: 'Acceso', documentos: 30 },
      { texto: 'Educación superior', documentos: 40 },
      { texto: 'Tasa de acceso', documentos: 9 },
    ]
    expect(sugerirClaves('acc', lista, []).map((s) => s.texto)).toEqual(['Acceso', 'Acceso a la educación', 'Tasa de acceso'])
    expect(sugerirClaves('acc', lista, ['ACCESO']).map((s) => s.texto)).toEqual(['Acceso a la educación', 'Tasa de acceso'])
    expect(sugerirClaves('educ', lista, [], 1)).toHaveLength(1)
    expect(sugerirClaves('   ', lista, [])).toEqual([])
  })
})

describe('hayCambios', () => {
  it('detecta cambios en textos y en el orden de las palabras clave', () => {
    const a = valores({ claves: ['A', 'B'] })
    expect(hayCambios(a, { ...a })).toBe(false)
    expect(hayCambios(a, { ...a, titulo: 'Otro' })).toBe(true)
    expect(hayCambios(a, { ...a, descripcion: 'Otra descripción' })).toBe(true)
    expect(hayCambios(a, { ...a, claves: ['B', 'A'] })).toBe(true)
  })
})

describe('vista previa', () => {
  it('con archivo propio muestra «Ver» y «Descargar» (sin destino real)', () => {
    const v = documentoVistaPrevia(valoresIniciales(doc()), doc(), { archivoPendiente: null, quitarArchivo: false })
    expect(v.urlVer).toBe(URL_VISTA_PREVIA)
    expect(v.urlDescarga).toBe(URL_VISTA_PREVIA)
    expect(v.urlPortada).toBe(doc().urlPortada)
  })

  it('un tablero abre su URL externa y no tiene descarga', () => {
    const v = documentoVistaPrevia(
      valores({ tipo: 'tablero', urlVerExterna: 'https://app.powerbi.com/view?r=1', permiteDescarga: true }),
      null,
      { archivoPendiente: null, quitarArchivo: false },
    )
    expect(v.urlVer).toBe('https://app.powerbi.com/view?r=1')
    expect(v.urlDescarga).toBeNull()
  })

  it('un tablero o una entrada con archivo propio (convertido desde «Documento») abre igual la URL externa, como la API pública', () => {
    // Misma regla que aDocumento del servidor (alcance público): para tableros
    // y entradas manda urlVerExterna aunque haya archivo.
    for (const tipo of ['tablero', 'entrada'] as const) {
      const original = doc()
      const v = documentoVistaPrevia(
        { ...valoresIniciales(original), tipo, urlVerExterna: 'https://app.powerbi.com/view?r=tablero', permiteDescarga: true },
        original,
        { archivoPendiente: null, quitarArchivo: false },
      )
      expect(v.urlVer).toBe('https://app.powerbi.com/view?r=tablero')
      expect(v.urlDescarga).toBeNull()
    }
  })

  it('al quitar el archivo desaparecen «Ver» y «Descargar»; un archivo pendiente los muestra', () => {
    const sin = documentoVistaPrevia(valoresIniciales(doc()), doc(), { archivoPendiente: null, quitarArchivo: true })
    expect(sin.urlVer).toBe('')
    expect(sin.urlDescarga).toBeNull()
    const nuevo = documentoVistaPrevia(valores(), null, {
      archivoPendiente: { extension: 'pdf', tipo: 'application/pdf', bytes: 5 },
      quitarArchivo: false,
    })
    expect(nuevo.urlDescarga).toBe(URL_VISTA_PREVIA)
    expect(nuevo.archivo?.extension).toBe('pdf')
  })

  it('usa lo escrito: título vacío, año inválido', () => {
    const v = documentoVistaPrevia(valores({ titulo: '', anio: '20' }), null, { archivoPendiente: null, quitarArchivo: false })
    expect(v.titulo).toBe('Documento sin título')
    expect(v.anio).toBeNull()
  })

  it('muestra la descripción escrita, en una sola línea (vacía, ninguna)', () => {
    const extras = { archivoPendiente: null, quitarArchivo: false }
    expect(documentoVistaPrevia(valores({ descripcion: ' Una\n  descripción ' }), null, extras).descripcion).toBe(
      'Una descripción',
    )
    expect(documentoVistaPrevia(valores({ descripcion: '' }), null, extras).descripcion).toBeNull()
  })
})
