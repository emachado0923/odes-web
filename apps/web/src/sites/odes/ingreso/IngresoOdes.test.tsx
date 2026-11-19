import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IngresoOdes from '../paginas/IngresoOdes'
import { animarCielo, type OpcionesCielo } from './cielo'
import { PREGUNTAS } from './preguntas'

const OPCIONES: OpcionesCielo = {
  densidad: 2600,
  radioMinimo: 0.4,
  radioVariable: 1.3,
  alfa: 1,
  alfaFugaz: 1,
  primeraFugaz: 3000,
  cadaFugaz: 5000,
}

/** Contexto 2D falso: registra las estrellas dibujadas y el último color. */
function contextoFalso() {
  const ctx = {
    arcos: [] as { x: number; y: number }[],
    setTransform: vi.fn<() => void>(),
    clearRect: vi.fn<() => void>(),
    beginPath: vi.fn<() => void>(),
    arc: vi.fn<(x: number, y: number) => void>((x, y) => {
      ctx.arcos.push({ x, y })
    }),
    fill: vi.fn<() => void>(),
    moveTo: vi.fn<() => void>(),
    lineTo: vi.fn<() => void>(),
    stroke: vi.fn<() => void>(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  }
  return ctx
}

function usarContexto(ctx = contextoFalso()) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  return ctx
}

/** Lienzo con un tamaño CSS dado (jsdom no hace diseño). */
function lienzoDe(ancho: number, alto: number) {
  const lienzo = document.createElement('canvas')
  const medida = { ancho, alto }
  Object.defineProperty(lienzo, 'clientWidth', { get: () => medida.ancho })
  Object.defineProperty(lienzo, 'clientHeight', { get: () => medida.alto })
  return { lienzo, medida }
}

/** Cuadros de animación falsos: se guardan y se ejecutan a mano. */
function cuadrosFalsos() {
  const pendientes = new Map<number, FrameRequestCallback>()
  let siguiente = 0
  const pedir = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    siguiente += 1
    pendientes.set(siguiente, cb)
    return siguiente
  })
  const cancelar = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pendientes.delete(id)
  })
  /** Ejecuta el cuadro pendiente más antiguo, como haría el navegador. */
  function correr(t: number) {
    const [id, cb] = pendientes.entries().next().value as [number, FrameRequestCallback]
    pendientes.delete(id)
    cb(t)
  }
  return { pendientes, pedir, cancelar, correr }
}

/** prefers-reduced-motion simulado, con aviso de cambio como el navegador. */
function medios(inicial: boolean) {
  let activo = inicial
  const oyentes = new Set<() => void>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      get matches() {
        return activo && consulta.includes('reduce')
      },
      media: consulta,
      addEventListener: (_tipo: string, oyente: () => void) => oyentes.add(oyente),
      removeEventListener: (_tipo: string, oyente: () => void) => oyentes.delete(oyente),
    })),
  )
  return {
    cambiar(valor: boolean) {
      activo = valor
      act(() => oyentes.forEach((oyente) => oyente()))
    },
  }
}

function renderizar() {
  return render(
    <MemoryRouter>
      <IngresoOdes />
    </MemoryRouter>,
  )
}

const luna = () => document.querySelector('.odes-ingreso__luna') as SVGCircleElement

beforeEach(() => {
  // La pausa elegida se recuerda en la pestaña.
  sessionStorage.clear()
  // jsdom no implementa <canvas>: sin contexto, el cielo no hace nada.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-bs-theme')
})

describe('pantalla de ingreso de ODES', () => {
  it('muestra la franja de la maqueta con «Ingresar» hacia el chat', () => {
    renderizar()
    const banda = screen.getByRole('region', { name: '¡Pregúntale a OdeS!' })
    expect(within(banda).getByRole('img', { name: 'Cara de OdeS' })).toHaveAttribute('src', '/odes/img/odes-cara.webp')
    expect(within(banda).getByText('Consulta los estudios y cifras del Observatorio de Sapiencia')).toBeInTheDocument()
    expect(within(banda).getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/odes/chat')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'odes-contenido')
  })

  it('las cuatro preguntas: la elegida queda marcada, la línea avanza y su respuesta aparece', () => {
    renderizar()
    const botones = PREGUNTAS.map((p) => screen.getByRole('button', { name: p.rotulo }))
    const respuesta = document.getElementById('odes-ingreso-respuesta') as HTMLElement
    expect(respuesta).toHaveAttribute('aria-live', 'polite')
    expect(botones.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect(respuesta).toHaveTextContent(PREGUNTAS[0].respuesta)

    fireEvent.click(botones[2])
    expect(botones.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
    expect(respuesta).toHaveTextContent(PREGUNTAS[2].respuesta)
    expect(botones[2]).toHaveAttribute('aria-controls', 'odes-ingreso-respuesta')
    expect((botones[0].parentElement as HTMLElement).style.getPropertyValue('--odes-nodo')).toBe('2')
    // La región que anuncia es la misma: solo cambia su texto.
    expect(document.getElementById('odes-ingreso-respuesta')).toBe(respuesta)
    // Las cuatro respuestas, invisibles y ocultas al lector, dan a la caja el alto de la más larga.
    const moldes = [...document.querySelectorAll('.odes-ingreso__respuesta-molde')]
    expect(moldes.map((m) => m.textContent)).toEqual(PREGUNTAS.map((p) => p.respuesta))
    expect(moldes.every((m) => m.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(respuesta.parentElement).toBe(moldes[0].parentElement)
  })

  it('el cielo se anima en los dos lienzos y se detiene al salir de la página', () => {
    medios(false)
    usarContexto()
    const { pendientes, pedir } = cuadrosFalsos()
    const { unmount } = renderizar()
    expect(pedir).toHaveBeenCalledTimes(2)
    expect(pendientes.size).toBe(2)
    unmount()
    expect(pendientes.size).toBe(0)
  })

  it('«Pausar animaciones» detiene estrellas, nebulosas y luna, y «Reanudar» las vuelve a mover', () => {
    medios(false)
    usarContexto()
    const { pendientes } = cuadrosFalsos()
    renderizar()
    const cielo = document.querySelector('.odes-cielo') as HTMLElement
    const banda = document.querySelector('.odes-banda') as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: 'Pausar animaciones' }))
    expect(pendientes.size).toBe(0)
    // Las nebulosas se detienen con estas clases (cielo-fondo.css y banda.css).
    expect(cielo).toHaveClass('odes-cielo--quieto')
    expect(banda).toHaveClass('odes-banda--quieta')
    // La luna conserva su animación (se congela donde va, no salta al inicio).
    expect(luna().querySelector('animateMotion')).not.toBeNull()
    // La pausa se recuerda en la pestaña (también vale en el chat).
    expect(sessionStorage.getItem('odes:animaciones-pausadas')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Reanudar animaciones' }))
    expect(pendientes.size).toBe(2)
    expect(cielo).not.toHaveClass('odes-cielo--quieto')
    expect(sessionStorage.getItem('odes:animaciones-pausadas')).toBeNull()
  })

  it('«reducir movimiento»: todo quieto, sin botón de pausa, y se respeta aunque cambie con la página abierta', () => {
    const preferencia = medios(false)
    usarContexto()
    const { pendientes } = cuadrosFalsos()
    renderizar()
    expect(luna().querySelector('animateMotion')).not.toBeNull()
    expect(pendientes.size).toBe(2)

    preferencia.cambiar(true)
    expect(pendientes.size).toBe(0)
    expect(luna().querySelector('animateMotion')).toBeNull()
    expect(luna()).toHaveAttribute('cx', '170')
    expect(luna()).toHaveAttribute('cy', '207.4')
    expect(screen.queryByRole('button', { name: /animaciones/ })).not.toBeInTheDocument()

    preferencia.cambiar(false)
    expect(pendientes.size).toBe(2)
  })

  it('con «reducir movimiento» desde el inicio no se pide ningún cuadro de animación', () => {
    medios(true)
    usarContexto()
    const { pedir } = cuadrosFalsos()
    renderizar()
    expect(pedir).not.toHaveBeenCalled()
  })
})

describe('animarCielo', () => {
  it('quieto: dibuja una vez, sin pedir cuadros de animación', () => {
    const ctx = usarContexto()
    const { pedir } = cuadrosFalsos()
    const cielo = animarCielo(lienzoDe(0, 0).lienzo, OPCIONES, true)
    // Lienzo sin tamaño: el mínimo de 30 estrellas.
    expect(ctx.arc).toHaveBeenCalledTimes(30)
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(pedir).not.toHaveBeenCalled()
    cielo.detener()
  })

  it('animado: cada cuadro pide el siguiente; detener cancela el pendiente y quita el mismo oyente de resize', () => {
    const ctx = usarContexto()
    const { pendientes, cancelar, correr } = cuadrosFalsos()
    const poner = vi.spyOn(window, 'addEventListener')
    const quitar = vi.spyOn(window, 'removeEventListener')

    const cielo = animarCielo(lienzoDe(0, 0).lienzo, OPCIONES, false)
    correr(16)
    expect(ctx.arc).toHaveBeenCalledTimes(30)
    expect(pendientes.size).toBe(1)

    // jsdom no tiene ResizeObserver: se escucha el resize de la ventana.
    const oyente = poner.mock.calls.find(([tipo]) => tipo === 'resize')?.[1]
    expect(oyente).toBeTypeOf('function')
    cielo.detener()
    expect(cancelar).toHaveBeenCalled()
    expect(pendientes.size).toBe(0)
    expect(quitar).toHaveBeenCalledWith('resize', oyente)
  })

  it('con ResizeObserver: al crecer conserva las estrellas que ya estaban y solo agrega en la parte nueva', () => {
    const ctx = usarContexto()
    cuadrosFalsos()
    let avisar = () => {}
    const desconectar = vi.fn<() => void>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          avisar = cb
        }
        observe() {}
        disconnect = desconectar
      },
    )
    const { lienzo, medida } = lienzoDe(300, 300)
    const cielo = animarCielo(lienzo, { ...OPCIONES, densidad: 1000 }, true)
    const antes = ctx.arcos.splice(0)
    expect(antes).toHaveLength(90)

    medida.alto = 600
    avisar()
    const despues = ctx.arcos.splice(0)
    expect(despues).toHaveLength(180)
    expect(despues.slice(0, 90)).toEqual(antes)
    expect(despues.slice(90).every((e) => e.y >= 300)).toBe(true)

    // Al encoger se quitan solo las que quedaron fuera.
    medida.alto = 150
    avisar()
    const encogido = ctx.arcos.splice(0)
    expect(encogido).toEqual(antes.filter((e) => e.y <= 150))

    cielo.detener()
    expect(desconectar).toHaveBeenCalledTimes(1)
  })

  it('fijarQuieto detiene y reanuda sin volver a repartir las estrellas', () => {
    const ctx = usarContexto()
    const { pendientes } = cuadrosFalsos()
    const cielo = animarCielo(lienzoDe(0, 0).lienzo, OPCIONES, true)
    const antes = ctx.arcos.splice(0)

    cielo.fijarQuieto(false)
    expect(pendientes.size).toBe(1)
    cielo.fijarQuieto(true)
    expect(pendientes.size).toBe(0)
    // Quieto se dibuja de nuevo en el mismo lugar (las estrellas no se movieron: el cuadro no corrió).
    expect(ctx.arcos).toEqual(antes)
    cielo.detener()
  })

  it('quieto, se repinta con el color nuevo al cambiar el tema del kit', async () => {
    const ctx = usarContexto()
    let rgb = '168, 63, 145'
    const cielo = animarCielo(lienzoDe(0, 0).lienzo, { ...OPCIONES, color: () => rgb }, true)
    expect(ctx.fillStyle).toBe('rgba(168, 63, 145, 1)')

    rgb = '255, 255, 255'
    document.documentElement.setAttribute('data-bs-theme', 'dark')
    await waitFor(() => expect(ctx.fillStyle).toBe('rgba(255, 255, 255, 1)'))
    cielo.detener()
  })

  it('sin contexto 2D no hace nada', () => {
    const { pedir } = cuadrosFalsos()
    const cielo = animarCielo(document.createElement('canvas'), OPCIONES, false)
    expect(() => {
      cielo.fijarQuieto(true)
      cielo.detener()
    }).not.toThrow()
    expect(pedir).not.toHaveBeenCalled()
  })
})
