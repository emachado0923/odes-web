/**
 * Cielo estrellado en un <canvas>, para la pantalla de ingreso de ODES
 * (adaptado de la maqueta «Pregúntale a OdeS»): estrellas que titilan y se
 * desplazan despacio hacia la derecha y, de vez en cuando, una estrella fugaz.
 *
 * - El lienzo ocupa su contenedor (CSS) y se vuelve a medir con un
 *   ResizeObserver; el dibujo se escala al devicePixelRatio (máximo 2). Al
 *   cambiar de tamaño, las estrellas que siguen dentro no se mueven: solo se
 *   agregan en la parte nueva (o se quitan las que quedaron fuera).
 * - Quieto («menos movimiento» o pausado por la persona) se dibuja una sola
 *   vez, y otra vez al cambiar de tamaño o de tema (data-bs-theme del kit).
 * - animarCielo devuelve los controles: fijarQuieto(…) y detener(), que
 *   cancela el cuadro pendiente y deja de observar.
 */

export interface OpcionesCielo {
  /** Área (px²) por estrella: más alto, menos estrellas (mínimo 30). */
  densidad: number
  radioMinimo: number
  radioVariable: number
  /** Opacidad máxima de las estrellas y de la estrella fugaz. */
  alfa: number
  alfaFugaz: number
  /** ms hasta la primera estrella fugaz y entre una y otra (más un azar de hasta otro tanto). */
  primeraFugaz: number
  cadaFugaz: number
  /**
   * Color de las estrellas como «r, g, b» (recibe el lienzo, para leer una
   * variable CSS heredada); si falta, blanco. Se consulta en cada cuadro y,
   * quieto, al cambiar el tema: así sigue al modo oscuro sin volver a crear el
   * cielo.
   */
  color?: (lienzo: HTMLCanvasElement) => string
}

export interface ControlCielo {
  fijarQuieto: (quieto: boolean) => void
  detener: () => void
}

interface Estrella {
  x: number
  y: number
  r: number
  fase: number
  vel: number
  vx: number
}

interface Fugaz {
  x: number
  y: number
  vida: number
}

const VUELTA = Math.PI * 2
/** Duración (ms) del recorrido de una estrella fugaz. */
const VIDA_FUGAZ = 900
const SIN_CONTROL: ControlCielo = { fijarQuieto: () => {}, detener: () => {} }

export function animarCielo(lienzo: HTMLCanvasElement, opciones: OpcionesCielo, quietoAlInicio: boolean): ControlCielo {
  const ctx = lienzo.getContext('2d')
  if (!ctx) return SIN_CONTROL
  const contexto = ctx

  let quieto = quietoAlInicio
  let ancho = 0
  let alto = 0
  let estrellas: Estrella[] = []
  let fugaz: Fugaz | null = null
  let proxima = opciones.primeraFugaz
  let ultimo = 0
  let cuadro = 0

  const cantidad = () => Math.max(30, Math.round((ancho * alto) / opciones.densidad))

  /** Una estrella al azar dentro del rectángulo [x0, x1) × [y0, y1). */
  function estrella(x0: number, x1: number, y0: number, y1: number): Estrella {
    return {
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
      r: opciones.radioMinimo + Math.random() * opciones.radioVariable,
      fase: Math.random() * VUELTA,
      vel: 0.4 + Math.random() * 1.6,
      vx: 0.004 + Math.random() * 0.02,
    }
  }

  /**
   * Ajusta el cielo a un tamaño nuevo. La primera vez (o si antes no tenía
   * área) lo llena entero; después conserva las estrellas que siguen dentro y
   * completa la densidad solo en las franjas nuevas (abajo y a la derecha).
   */
  function ajustar(nuevoAncho: number, nuevoAlto: number) {
    const viejoAncho = ancho
    const viejoAlto = alto
    ancho = nuevoAncho
    alto = nuevoAlto
    if (viejoAncho * viejoAlto === 0) {
      estrellas = Array.from({ length: cantidad() }, () => estrella(0, ancho, 0, alto))
      return
    }
    estrellas = estrellas.filter((e) => e.y <= alto && e.x <= ancho + 2)
    const abajo = alto > viejoAlto ? ancho * (alto - viejoAlto) : 0
    const derecha = ancho > viejoAncho ? (ancho - viejoAncho) * Math.min(alto, viejoAlto) : 0
    const nuevas = Math.round((abajo + derecha) / opciones.densidad)
    for (let i = 0; i < nuevas; i++) {
      estrellas.push(
        Math.random() * (abajo + derecha) < abajo
          ? estrella(0, ancho, viejoAlto, alto)
          : estrella(viejoAncho, ancho, 0, Math.min(alto, viejoAlto)),
      )
    }
  }

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelesAncho = Math.round(lienzo.clientWidth * dpr)
    const pixelesAlto = Math.round(lienzo.clientHeight * dpr)
    // Reasignar el tamaño borra y vuelve a reservar el lienzo: solo si cambió.
    if (lienzo.width !== pixelesAncho || lienzo.height !== pixelesAlto) {
      lienzo.width = pixelesAncho
      lienzo.height = pixelesAlto
    }
    contexto.setTransform(dpr, 0, 0, dpr, 0, 0)
    ajustar(lienzo.clientWidth, lienzo.clientHeight)
  }

  function dibujar(t: number, dt: number) {
    const rgb = opciones.color?.(lienzo) || '255, 255, 255'
    const pintura = (a: number) => `rgba(${rgb}, ${a})`
    contexto.clearRect(0, 0, ancho, alto)
    for (const e of estrellas) {
      if (!quieto) {
        e.x += e.vx * dt
        if (e.x > ancho + 2) e.x = -2
      }
      const a = quieto ? opciones.alfa : opciones.alfa * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin((t / 1000) * e.vel + e.fase)))
      contexto.fillStyle = pintura(a)
      contexto.beginPath()
      contexto.arc(e.x, e.y, e.r, 0, VUELTA)
      contexto.fill()
    }
    if (quieto) return
    proxima -= dt
    if (!fugaz && proxima <= 0) {
      fugaz = { x: Math.random() * ancho * 0.6, y: Math.random() * alto * 0.5, vida: 0 }
      proxima = opciones.cadaFugaz + Math.random() * opciones.cadaFugaz
    }
    if (fugaz) {
      fugaz.vida += dt
      const p = fugaz.vida / VIDA_FUGAZ
      const x = fugaz.x + p * 220
      const y = fugaz.y + p * 90
      contexto.strokeStyle = pintura(Math.max(0, 1 - p) * opciones.alfaFugaz)
      contexto.lineWidth = 1.4
      contexto.lineCap = 'round'
      contexto.beginPath()
      contexto.moveTo(x - 46, y - 19)
      contexto.lineTo(x, y)
      contexto.stroke()
      if (p >= 1) fugaz = null
    }
  }

  function ciclo(t: number) {
    const dt = Math.min(64, t - ultimo)
    ultimo = t
    dibujar(t, dt)
    cuadro = window.requestAnimationFrame(ciclo)
  }

  // Cambiar el tamaño borra el lienzo, y el observador corre antes de pintar:
  // se redibuja de inmediato también cuando está animado.
  function redibujar() {
    medir()
    dibujar(quieto ? 0 : ultimo, 0)
  }

  function fijarQuieto(nuevo: boolean) {
    if (nuevo === quieto) return
    quieto = nuevo
    window.cancelAnimationFrame(cuadro)
    cuadro = 0
    fugaz = null
    if (quieto) dibujar(0, 0)
    else cuadro = window.requestAnimationFrame(ciclo)
  }

  medir()
  const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redibujar)
  if (observador) observador.observe(lienzo)
  else window.addEventListener('resize', redibujar)
  // Quieto no hay cuadros: el cambio de tema del kit se repinta aquí.
  const tema =
    opciones.color && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          if (quieto) dibujar(0, 0)
        })
      : null
  tema?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] })
  if (quieto) dibujar(0, 0)
  else cuadro = window.requestAnimationFrame(ciclo)

  return {
    fijarQuieto,
    detener: () => {
      window.cancelAnimationFrame(cuadro)
      observador?.disconnect()
      tema?.disconnect()
      window.removeEventListener('resize', redibujar)
    },
  }
}
