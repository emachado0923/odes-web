import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Edificio3D from './Edificio3D'

/*
 * Edificio3D con el motor real (VisorEdificio + OrbitControls) y un renderizador
 * falso (jsdom no tiene WebGL). La descarga del .glb queda pendiente.
 */
vi.mock('three', async (importOriginal) => {
  const real = await importOriginal<typeof import('three')>()

  class WebGLRenderer {
    readonly domElement = document.createElement('canvas')
    outputColorSpace = ''
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }

  return { ...real, WebGLRenderer }
})

type Opciones = boolean | AddEventListenerOptions | EventListenerOptions | undefined
interface Oyente {
  tipo: string
  oyente: EventListenerOrEventListenerObject | null
  captura: boolean
}

const captura = (opciones: Opciones) => (typeof opciones === 'boolean' ? opciones : Boolean(opciones?.capture))

/**
 * Registra en orden los oyentes que se agregan y se quitan de document y
 * devuelve los que siguen registrados. El orden importa: OrbitControls se
 * desconecta antes de conectarse al construirse, y esa baja previa no cuenta.
 */
function vigilarOyentesDeDocument(): () => string[] {
  const registrados: Oyente[] = []
  const agregar = document.addEventListener.bind(document)
  const quitar = document.removeEventListener.bind(document)
  const igual = (a: Oyente, b: Oyente) => a.tipo === b.tipo && a.oyente === b.oyente && a.captura === b.captura

  vi.spyOn(document, 'addEventListener').mockImplementation((tipo: string, oyente, opciones?: Opciones) => {
    const nuevo = { tipo, oyente, captura: captura(opciones) }
    if (!registrados.some((o) => igual(o, nuevo))) registrados.push(nuevo)
    agregar(tipo, oyente, opciones)
  })
  vi.spyOn(document, 'removeEventListener').mockImplementation((tipo: string, oyente, opciones?: Opciones) => {
    const quitado = { tipo, oyente, captura: captura(opciones) }
    const i = registrados.findIndex((o) => igual(o, quitado))
    if (i !== -1) registrados.splice(i, 1)
    quitar(tipo, oyente, opciones)
  })

  return () =>
    registrados
      // React registra selectionchange en document una sola vez y para siempre (no es del visor).
      .filter((o) => o.tipo !== 'selectionchange')
      .map((o) => `${o.tipo}${o.captura ? ' (captura)' : ''}`)
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new DOMException('Cancelada', 'AbortError')))
        }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Edificio3D', () => {
  it('al desmontarse quita de document todos los oyentes del visor, también el de teclado de OrbitControls', () => {
    const registrados = vigilarOyentesDeDocument()

    const { container, unmount } = render(<Edificio3D />)

    expect(container.querySelector('.ed-lienzo canvas')).not.toBeNull()
    // OrbitControls registra keydown en captura sobre canvas.getRootNode() (document).
    expect(registrados()).toContain('keydown (captura)')
    expect(registrados()).toContain('visibilitychange')

    unmount()

    expect(registrados()).toEqual([])
  })

  it('publica lo que tapa el panel (--ed-libre, --ed-centro) y lo vuelve a medir al cambiar de tamaño', () => {
    const observadores = new Map<Element, ResizeObserverCallback>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly #callback: ResizeObserverCallback
        constructor(callback: ResizeObserverCallback) {
          this.#callback = callback
        }
        observe(elemento: Element) {
          observadores.set(elemento, this.#callback)
        }
        unobserve() {}
        disconnect() {}
      },
    )
    const rect = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: 600, width, height: 600 }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('ed-panel')) return rect(32, 450)
      if (this.classList.contains('ed-lienzo')) return rect(0, 1100)
      return rect(0, 0)
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1100)

    const { container } = render(<Edificio3D />)
    const raiz = container.querySelector<HTMLElement>('.ed-edificio')
    const panel = container.querySelector('.ed-panel')
    if (!raiz || !panel) throw new Error('Falta el bloque o el panel')

    expect(raiz.style.getPropertyValue('--ed-libre')).toBe('482px')
    expect(raiz.style.getPropertyValue('--ed-centro')).toBe('71.91%')

    // Pantalla angosta: el panel pasa arriba y ya no tapa la escena.
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('ed-panel')) return { left: 0, right: 1100, top: 0, bottom: 300, width: 1100, height: 300 } as DOMRect
      if (this.classList.contains('ed-lienzo')) return { left: 0, right: 1100, top: 300, bottom: 900, width: 1100, height: 600 } as DOMRect
      return rect(0, 0)
    })
    act(() => observadores.get(panel)?.([], {} as ResizeObserver))
    expect(raiz.style.getPropertyValue('--ed-libre')).toBe('0px')
    expect(raiz.style.getPropertyValue('--ed-centro')).toBe('50.00%')
  })
})
