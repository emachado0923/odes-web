import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentoPublico } from '../api-repositorio'
import { documento } from '../pruebas/datos-prueba'
import TarjetaDocumento from './TarjetaDocumento'

/**
 * Enlace por su texto. (jsdom calcula el nombre accesible sin el espacio
 * inicial de los <span> internos: "Descargardocumento"; Chrome sí lo
 * conserva, comprobado en su árbol de accesibilidad.)
 */
function enlace(texto: string): HTMLElement {
  const encontrado = screen.queryAllByRole('link').find((a) => a.textContent?.replace(/\s+/g, ' ').trim() === texto)
  if (!encontrado) throw new Error(`No hay un enlace "${texto}"`)
  return encontrado
}

/** Textos de todos los enlaces accesibles (la portada no cuenta: es aria-hidden). */
function textosEnlaces(): string[] {
  return screen.queryAllByRole('link').map((a) => a.textContent?.replace(/\s+/g, ' ').trim() ?? '')
}

function boton(texto: string): HTMLElement {
  const encontrado = screen.queryAllByRole('button').find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto)
  if (!encontrado) throw new Error(`No hay un botón "${texto}"`)
  return encontrado
}

function renderizar(...args: Parameters<typeof TarjetaDocumento>) {
  const r = render(
    <div className="repositorio">
      <TarjetaDocumento {...args[0]} />
    </div>,
  )
  return { ...r, tarjeta: r.container.querySelector('article')! }
}

/** Clases de las etiquetas de arriba de la tarjeta (los hijos de .rp-meta), en orden. */
function etiquetas(tarjeta: Element): string[] {
  return [...tarjeta.querySelector('.rp-meta')!.children].map((e) => e.className)
}

/** Lo que se ve en pantalla: el texto sin los .rp-oculto, que solo leen los lectores de pantalla. */
function textoVisible(elemento: Element): string {
  const copia = elemento.cloneNode(true) as Element
  copia.querySelectorAll('.rp-oculto').forEach((oculto) => oculto.remove())
  return copia.textContent ?? ''
}

describe('TarjetaDocumento', () => {
  it('documento propio: título h2, etiquetas, portada, ver y descargar con nombre limpio', () => {
    const { tarjeta } = renderizar({
      documento: documento({ subtitulo: 'Corrección de cifras', claves: ['Acceso', 'acceso', 'Permanencia'] }),
    })
    const titulo = screen.getByRole('heading', { level: 2, name: 'Fe de erratas del Boletín N.º 19' })
    expect(titulo).toHaveAttribute('id', 'rp-doc-boletin-19-fe-de-erratas')
    expect(titulo).toHaveAttribute('tabindex', '-1')
    expect(titulo).not.toHaveAttribute('lang')
    // El título va antes de las etiquetas en el HTML.
    const meta = tarjeta.querySelector('.rp-meta')!
    expect(titulo.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(meta.textContent).toBe('Tipo de producto: BoletínAño de publicación: 2020')
    // El subtítulo no se muestra (pedido del Observatorio, 14-nov-2026).
    expect(screen.queryByText('Corrección de cifras')).toBeNull()
    expect(tarjeta.querySelector('.rp-subtitulo')).toBeNull()

    const img = tarjeta.querySelector('.rp-portada img')!
    expect(img).toHaveAttribute('src', '/api/repositorio/documentos/boletin-19-fe-de-erratas/portada')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '720')
    expect(img).toHaveAttribute('height', '720')
    expect(tarjeta.querySelector('.rp-portada')).toHaveAttribute('aria-hidden', 'true')
    expect(tarjeta.querySelector('.rp-portada')).toHaveAttribute('tabindex', '-1')

    const ver = enlace('Ver documento')
    expect(ver).toHaveAttribute('href', '/api/repositorio/documentos/boletin-19-fe-de-erratas/ver')
    expect(ver).not.toHaveAttribute('target')
    expect(ver).toHaveAccessibleDescription('Fe de erratas del Boletín N.º 19')
    const descargar = enlace('Descargar documento')
    expect(descargar).toHaveAttribute('href', '/api/repositorio/documentos/boletin-19-fe-de-erratas/descargar')
    expect(descargar).toHaveAttribute('download', 'Boletín 19 - Fe de erratas del Boletín N.º 19.pdf')

    // Palabras clave sin repetidas; sin onClave son etiquetas, no botones.
    const claves = within(screen.getByRole('list', { name: 'Palabras clave' })).getAllByRole('listitem')
    expect(claves.map((li) => li.textContent)).toEqual(['Acceso', 'Permanencia'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /entrada del blog/ })).not.toBeInTheDocument()
  })

  it('arriba solo dos etiquetas: tipo de producto y año, cada una con su texto oculto', () => {
    const { tarjeta } = renderizar({ documento: documento() })
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])

    // En pantalla, "Boletín" y "2020"; el lector de pantalla oye también qué es cada uno.
    const tipo = tarjeta.querySelector('.rp-categoria')!
    expect(tipo.querySelector('.rp-oculto')!.textContent).toBe('Tipo de producto: ')
    expect(tipo.textContent).toBe('Tipo de producto: Boletín')
    expect(textoVisible(tipo)).toBe('Boletín')

    const anio = tarjeta.querySelector('.rp-anio')!
    expect(anio.querySelector('.rp-oculto')!.textContent).toBe('Año de publicación: ')
    expect(anio.textContent).toBe('Año de publicación: 2020')
    expect(textoVisible(anio)).toBe('2020')
    // El ícono del calendario es decorativo.
    expect(anio.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sin año: la etiqueta del año dice "Sin fecha" (ya no la abreviatura "S. F.")', () => {
    const { tarjeta } = renderizar({ documento: documento({ anio: null }) })
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])
    const anio = tarjeta.querySelector('.rp-anio')!
    expect(anio.textContent).toBe('Año de publicación: Sin fecha')
    expect(textoVisible(anio)).toBe('Sin fecha')
    expect(screen.getByText('Sin fecha')).toBe(anio)
    expect(anio.querySelector('abbr')).toBeNull()
    expect(tarjeta).not.toHaveTextContent(/S\.\s*F\./)
  })

  it('descripción: párrafo propio con los espacios colapsados, entre el título y las palabras clave', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        subtitulo: 'Corrección de cifras',
        descripcion: '  Corrige las cifras de cobertura\n  publicadas   en el boletín anterior.  ',
      }),
    })
    const descripcion = tarjeta.querySelector('.rp-descripcion')!
    expect(descripcion.tagName).toBe('P')
    expect(descripcion.textContent).toBe('Corrige las cifras de cobertura publicadas en el boletín anterior.')
    expect(descripcion).not.toHaveAttribute('lang')

    const titulo = screen.getByRole('heading', { level: 2 })
    const tituloClaves = tarjeta.querySelector('.rp-claves-titulo')!
    expect(titulo.compareDocumentPosition(descripcion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(descripcion.compareDocumentPosition(tituloClaves) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin descripción (null o solo espacios) no hay párrafo vacío', () => {
    for (const descripcion of [null, ' \n ']) {
      const { tarjeta, unmount } = renderizar({ documento: documento({ descripcion }) })
      expect(tarjeta.querySelector('.rp-descripcion')).toBeNull()
      unmount()
    }
  })

  it('tablero externo: "Abrir tablero" en pestaña nueva, sin descarga ni etiqueta de formato', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        tipo: 'tablero',
        categoria: 'Informe dinámico',
        numero: null,
        anio: null,
        urlVer: 'https://app.powerbi.com/view?r=abc',
        urlDescarga: '/api/x/descargar',
        archivo: null,
      }),
    })
    const abrir = enlace('Abrir tablero (se abre en una pestaña nueva)')
    expect(abrir).toHaveAttribute('href', 'https://app.powerbi.com/view?r=abc')
    expect(abrir).toHaveAttribute('target', '_blank')
    expect(abrir).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: /Descargar/ })).not.toBeInTheDocument()
    // Arriba, como en todas las tarjetas, solo el tipo de producto y el año.
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])
    expect(tarjeta.querySelector('.rp-meta')!.textContent).toBe(
      'Tipo de producto: Informe dinámicoAño de publicación: Sin fecha',
    )
    expect(screen.queryByText('Tablero interactivo')).not.toBeInTheDocument()
  })

  it('solo entrada de blog: "Ver entrada", sin descarga, sin etiqueta de formato ni enlace aparte al blog', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        tipo: 'entrada',
        urlVer: 'https://sapiencia.gov.co/odes-estado/',
        urlEntradaBlog: 'https://sapiencia.gov.co/odes-estado/',
        archivo: null,
      }),
    })
    expect(enlace('Ver entrada (se abre en una pestaña nueva)')).toBeInTheDocument()
    expect(textosEnlaces()).toEqual(['Ver entrada (se abre en una pestaña nueva)'])
    expect(screen.queryByRole('link', { name: /Descargar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ver entrada del blog/ })).not.toBeInTheDocument()
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])
    expect(screen.queryByText('Entrada de blog')).not.toBeInTheDocument()
  })

  it('no muestra N.º, formato, "En inglés" ni el enlace al blog aunque el documento los tenga', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        titulo: 'Trends report',
        numero: 'N.º 7',
        idioma: 'en',
        urlEntradaBlog: 'https://sapiencia.gov.co/entrada/',
      }),
    })
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])
    for (const clase of ['.rp-numero', '.rp-formato', '.rp-idioma', '.rp-blog']) {
      expect(tarjeta.querySelector(clase)).toBeNull()
    }
    expect(tarjeta).not.toHaveTextContent(/N\.º|En inglés|Tablero interactivo|Entrada de blog/)
    // Solo ver y descargar el documento: ningún enlace va a la entrada del blog.
    expect(textosEnlaces()).toEqual(['Ver documento', 'Descargar documento'])
    expect(screen.queryByRole('link', { name: /entrada del blog/ })).not.toBeInTheDocument()
    expect(tarjeta.querySelector('a[href="https://sapiencia.gov.co/entrada/"]')).toBeNull()
  })

  it('versión en inglés: lang="en" en título y descripción, sin etiqueta "En inglés" ni subtítulo', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        idioma: 'en',
        titulo: 'Trends report',
        subtitulo: 'Megatrends',
        descripcion: 'The report describes the trends that will shape higher education in Medellín.',
      }),
    })
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('lang', 'en')
    expect(screen.queryByText('Megatrends')).toBeNull()
    expect(tarjeta.querySelector('.rp-descripcion')).toHaveAttribute('lang', 'en')
    // Las etiquetas siguen en español y no dicen el idioma.
    expect(etiquetas(tarjeta)).toEqual(['rp-categoria', 'rp-anio'])
    expect(tarjeta.querySelector('.rp-meta')).not.toHaveAttribute('lang')
    expect(tarjeta.querySelector('.rp-idioma')).toBeNull()
    expect(tarjeta).not.toHaveTextContent(/inglés/i)
  })

  it('nota con ícono y sin archivo: sin descarga', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        nota: 'El archivo está en OneDrive de Sapiencia: al abrirlo puede pedir iniciar sesión.',
        urlVer: 'https://sapiencia-my.sharepoint.com/x',
        urlDescarga: null,
        archivo: null,
      }),
    })
    const nota = tarjeta.querySelector('.rp-nota')!
    expect(nota).toHaveTextContent('El archivo está en OneDrive de Sapiencia: al abrirlo puede pedir iniciar sesión.')
    expect(nota.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('link', { name: /Descargar/ })).not.toBeInTheDocument()
  })

  it('palabras clave como botones que alternan el filtro (aria-pressed)', () => {
    const onClave = vi.fn<(valor: string) => void>()
    renderizar({
      documento: documento({ claves: ['Acceso', 'Educación superior'] }),
      onClave,
      clavesActivas: new Set(['educacion superior']),
    })
    const acceso = boton('Filtrar por Acceso')
    const superior = boton('Filtrar por Educación superior')
    expect(acceso).toHaveAttribute('aria-pressed', 'false')
    expect(superior).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(acceso)
    expect(onClave).toHaveBeenCalledWith('acceso')
  })

  it('resalta la búsqueda con <mark> en título, descripción y claves (el subtítulo no se muestra)', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        subtitulo: 'Erratas corregidas',
        descripcion: 'Corrige las erratas de las cifras publicadas en el boletín anterior.',
        claves: ['Erratas'],
      }),
      consulta: ['erratas'],
    })
    expect([...tarjeta.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['erratas', 'erratas', 'Erratas'])
    const descripcion = tarjeta.querySelector('.rp-descripcion')!
    expect([...descripcion.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['erratas'])
    expect(descripcion.textContent).toBe('Corrige las erratas de las cifras publicadas en el boletín anterior.')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Fe de erratas del Boletín N.º 19')
  })

  it('avisa al descargar', () => {
    const onDescargar = vi.fn<(d: DocumentoPublico) => void>()
    const d = documento()
    renderizar({ documento: d, onDescargar })
    const descargar = enlace('Descargar documento')
    descargar.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(descargar)
    expect(onDescargar).toHaveBeenCalledWith(d)
  })

  it('descarta URL peligrosas y muestra un cuadro sin portada', () => {
    const { tarjeta } = renderizar({
      documento: documento({
        urlVer: 'javascript:alert(1)',
        urlDescarga: '//otro-sitio.example/archivo.pdf',
        urlEntradaBlog: 'data:text/html,hola',
        urlPortada: null,
      }),
    })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(tarjeta.querySelector('a')).toBeNull()
    expect(tarjeta.querySelector('.rp-portada img')).toBeNull()
    expect(tarjeta.querySelector('.rp-portada .rp-portada-icono')).not.toBeNull()
    expect(tarjeta.querySelector('.rp-acciones')).toBeNull()
  })
})
