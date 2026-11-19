/**
 * El script del bloque de pertinencia, solo (jsdom): enlaces de EDITAR
 * ENLACES y el espacio del tablero de EDITAR TABLERO, vacío y con dirección
 * (del mismo sitio y de otro). Se corre el mismo script que en WordPress, como
 * lo corre el aplicativo: el módulo ?script de plugin-vite.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import bloque from './pertinencia-bloque.html?raw'
import ejecutarBloque from './pertinencia-bloque.html?script'

const TITULO_MARCO = 'Consulta del índice y el puntaje de pertinencia por programa'

/** Pone el bloque en la página tal cual (su script en línea no corre: innerHTML no ejecuta scripts). */
function montarBloque(urlTablero?: string): HTMLElement {
  const contenedor = document.createElement('div')
  contenedor.innerHTML = bloque
  document.body.append(contenedor)
  if (urlTablero !== undefined) {
    contenedor.querySelector('[data-odes-tablero-url]')!.setAttribute('data-odes-tablero-url', urlTablero)
  }
  return document.getElementById('odes-pertinencia')!
}

/** Direcciones de la plantilla de EDITAR ENLACES, por clave. */
function direccionesDeLaPlantilla(): Record<string, string> {
  const plantilla = document.querySelector<HTMLTemplateElement>('template[data-odes-enlaces]')!
  return Object.fromEntries(
    Array.from(plantilla.content.querySelectorAll('a[data-odes-enlace]'), (a) => [a.getAttribute('data-odes-enlace'), a.getAttribute('href')]),
  )
}

/** El <body> del documento del marco (en jsdom el marco empieza con un documento vacío). */
function cuerpoDe(marco: HTMLIFrameElement): HTMLElement {
  const doc = marco.contentDocument!
  if (doc.body) return doc.body
  const html = doc.documentElement ?? doc.appendChild(doc.createElement('html'))
  return html.appendChild(doc.createElement('body'))
}

function mensaje(marco: HTMLIFrameElement, origin: string, data: unknown, source: Window | null = marco.contentWindow) {
  window.dispatchEvent(new MessageEvent('message', { origin, data, source }))
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('script del bloque: enlaces', () => {
  it('pone en cada botón la dirección de la plantilla, sin target (misma pestaña)', () => {
    const raiz = montarBloque()
    ejecutarBloque()

    const direcciones = direccionesDeLaPlantilla()
    const enlaces = Array.from(raiz.querySelectorAll('a'))
    expect(enlaces).toHaveLength(6)
    for (const enlace of enlaces) {
      expect(enlace).toHaveAttribute('href', direcciones[enlace.getAttribute('data-odes-enlace')!])
      expect(enlace).not.toHaveAttribute('target')
    }
  })

  it('un href vacío, "#" o con otro protocolo deja el botón sin enlace', () => {
    const raiz = montarBloque()
    const plantilla = document.querySelector<HTMLTemplateElement>('template[data-odes-enlaces]')!.content
    plantilla.querySelector('[data-odes-enlace="resolucion"]')!.setAttribute('href', '#')
    plantilla.querySelector('[data-odes-enlace="infografia"]')!.setAttribute('href', '')
    plantilla.querySelector('[data-odes-enlace="cine-cuoc"]')!.setAttribute('href', 'javascript:alert(1)')
    plantilla.querySelector('[data-odes-enlace="indice-cine"]')!.setAttribute('href', ' /documentos/indice.pdf ')
    ejecutarBloque()

    const href = (clave: string) => raiz.querySelector(`a[data-odes-enlace="${clave}"]`)!.getAttribute('href')
    expect(href('resolucion')).toBeNull()
    expect(href('infografia')).toBeNull()
    expect(href('cine-cuoc')).toBeNull()
    expect(href('indice-cine')).toBe('/documentos/indice.pdf')
    expect(href('conoce-mas')).toBe('https://www.google.com')
  })
})

describe('script del bloque: tablero', () => {
  it('sin dirección deja el recuadro punteado "Espacio para el tablero de control"', () => {
    const raiz = montarBloque('')
    ejecutarBloque()

    expect(raiz).toHaveAttribute('data-odes-iniciado')
    expect(raiz.querySelector('iframe')).toBeNull()
    expect(raiz.querySelector('.odes-espacio-tablero')).toHaveTextContent('Espacio para el tablero de control')
    expect(raiz.querySelector('.odes-esqueleto')).toHaveAttribute('aria-hidden', 'true')
  })

  it('una dirección que no es http(s) se ignora: queda el recuadro', () => {
    const raiz = montarBloque('javascript:alert(1)')
    ejecutarBloque()
    expect(raiz.querySelector('iframe')).toBeNull()
    expect(raiz.querySelector('.odes-espacio-tablero')).not.toBeNull()
  })

  it('con dirección del mismo sitio: el marco reemplaza el recuadro y se ajusta al alto del contenido del tablero', () => {
    const raiz = montarBloque('/tableros/pertinencia/index.html')
    ejecutarBloque()

    const marco = raiz.querySelector<HTMLIFrameElement>('[data-odes-tablero-url] > iframe')!
    expect(marco).toHaveAttribute('title', TITULO_MARCO)
    expect(marco).toHaveAttribute('loading', 'lazy')
    expect(marco).toHaveAttribute('src', '/tableros/pertinencia/index.html')
    expect(marco).toHaveClass('odes-tablero-marco')
    expect(marco.parentElement).toHaveClass('odes-tablero--con-marco')
    expect(raiz.querySelector('.odes-espacio-tablero')).toBeNull()

    // El tablero de adentro: #root con su contenido (bottom 900 px) y una lista abierta que baja más (1200 px).
    const doc = marco.contentDocument!
    const ventana = marco.contentWindow! as Window & typeof globalThis
    cuerpoDe(marco).innerHTML = '<div id="root"><main id="tablero"><div class="dropdown-menu show"></div></main></div>'
    vi.spyOn(doc.getElementById('tablero')!, 'getBoundingClientRect').mockReturnValue({ bottom: 900 } as DOMRect)
    const lista = doc.querySelector('.dropdown-menu')!
    const fondoLista = vi.spyOn(lista, 'getBoundingClientRect').mockReturnValue({ bottom: 1200 } as DOMRect)
    const observados: Element[] = []
    ventana.ResizeObserver = class {
      observe(elemento: Element) {
        observados.push(elemento)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    marco.dispatchEvent(new Event('load'))
    // Lista abierta: su borde inferior + 16 px de aire.
    expect(marco.style.height).toBe('1216px')
    expect(observados).toContain(doc.getElementById('tablero'))

    // Se cierra la lista: vuelve al contenido.
    fondoLista.mockReturnValue({ bottom: 0 } as DOMRect)
    lista.remove()
    marco.dispatchEvent(new Event('load'))
    expect(marco.style.height).toBe('916px')
  })

  it('mismo sitio pero sin #root que medir: alto fijo del CSS (el marco se desplaza)', () => {
    const raiz = montarBloque('/otra-cosa.html')
    ejecutarBloque()
    const marco = raiz.querySelector('iframe')!
    expect(marco.style.height).toBe('340px')
    cuerpoDe(marco).innerHTML = '<p>Sin #root</p>'
    marco.dispatchEvent(new Event('load'))
    expect(marco.style.height).toBe('')
  })

  it('con dirección de otro sitio: alto de carga hasta que el propio marco avise su alto, desde su sitio', () => {
    const raiz = montarBloque('https://tableros.ejemplo.org/pertinencia/index.html')
    ejecutarBloque()
    const marco = raiz.querySelector('iframe')!
    expect(marco).toHaveAttribute('src', 'https://tableros.ejemplo.org/pertinencia/index.html')
    expect(marco.style.height).toBe('340px')

    const origen = 'https://tableros.ejemplo.org'
    mensaje(marco, 'https://otro.ejemplo.org', { tipo: 'pe-tablero-alto', alto: 900 })
    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: 900 }, window)
    mensaje(marco, origen, { tipo: 'otro', alto: 900 })
    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: '900' })
    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: Number.NaN })
    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: 50 })
    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: 1e9 })
    mensaje(marco, origen, 'pe-tablero-alto:900')
    expect(marco.style.height).toBe('340px')

    mensaje(marco, origen, { tipo: 'pe-tablero-alto', alto: 1234.2 })
    expect(marco.style.height).toBe('1235px')
  })

  it('con dirección de otro sitio: si no avisa su alto a los 8 s de cargar, queda el alto fijo del CSS', () => {
    vi.useFakeTimers()
    try {
      const raiz = montarBloque('https://tableros.ejemplo.org/pertinencia/index.html')
      ejecutarBloque()
      const marco = raiz.querySelector('iframe')!
      marco.dispatchEvent(new Event('load'))
      vi.advanceTimersByTime(7999)
      expect(marco.style.height).toBe('340px')
      vi.advanceTimersByTime(1)
      expect(marco.style.height).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('con dirección de otro sitio: si ya avisó su alto, lo conserva pasados los 8 s', () => {
    vi.useFakeTimers()
    try {
      const raiz = montarBloque('https://tableros.ejemplo.org/pertinencia/index.html')
      ejecutarBloque()
      const marco = raiz.querySelector('iframe')!
      marco.dispatchEvent(new Event('load'))
      mensaje(marco, 'https://tableros.ejemplo.org', { tipo: 'pe-tablero-alto', alto: 341 })
      vi.advanceTimersByTime(10000)
      expect(marco.style.height).toBe('341px')
    } finally {
      vi.useRealTimers()
    }
  })

  it('si el bloque sale de la página, deja de escuchar a la ventana', () => {
    const raiz = montarBloque('https://tableros.ejemplo.org/pertinencia/index.html')
    const quitar = vi.spyOn(window, 'removeEventListener')
    ejecutarBloque()
    const marco = raiz.querySelector('iframe')!

    raiz.parentElement!.remove()
    mensaje(marco, 'https://tableros.ejemplo.org', { tipo: 'pe-tablero-alto', alto: 900 })

    expect(marco.style.height).toBe('340px')
    expect(quitar).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('corre una sola vez por bloque: volver a llamarlo no duplica el marco ni los oyentes', () => {
    const raiz = montarBloque('https://tableros.ejemplo.org/pertinencia/index.html')
    const agregar = vi.spyOn(window, 'addEventListener')
    ejecutarBloque()
    const marco = raiz.querySelector('iframe')
    ejecutarBloque()
    ejecutarBloque()

    expect(raiz.querySelectorAll('iframe')).toHaveLength(1)
    expect(raiz.querySelector('iframe')).toBe(marco)
    expect(agregar.mock.calls.filter(([tipo]) => tipo === 'message')).toHaveLength(1)
  })
})
