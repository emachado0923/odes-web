import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { irA } from '../navegacion'
import { LOGO_PANEL } from '../recursos/recursos'
import { ID_TABLEROS, RUTA_DRACO, URL_MODELO, URL_TABLERO_BATERIA } from '../rutas'
import { ESTADO_INICIAL_VISOR, estadoDatos, type EstadoVisor } from '../visor/estado'
import { VisorEdificio } from '../visor/VisorEdificio'
import BarraControles from './BarraControles'
import EstadoCarga from './EstadoCarga'
import Icono from './Icono'

/** Título del panel morado (el mismo del bloque del Observatorio). */
export const TITULO_SIVU = 'Sistema de Visualización de Datos de Sapiencia'

/** Lo que tapa el panel nunca pasa del 60 % de la escena (igual que el bloque). */
const MAXIMO_TAPADO = 0.6
/** Milisegundos que se ve el aviso de "Ctrl + rueda". */
const DURACION_AVISO = 1600
/** Pausa entre la llegada a la puerta y la apertura del tablero. */
const PAUSA_TABLERO = 500
/** Si la llegada a la puerta no se detecta en este tiempo, el tablero se abre igual. */
const ESPERA_MAXIMA_TABLERO = 8000

function coincideMedio(consulta: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches
}

const esMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

/**
 * Píxeles de la izquierda de la escena que tapa el panel (0 si el panel va
 * arriba, sin superponerse).
 */
function medirTapado(panel: HTMLElement, escena: HTMLElement): number {
  const rEscena = escena.getBoundingClientRect()
  const rPanel = panel.getBoundingClientRect()
  const superpuesto =
    rPanel.right > rEscena.left + 1 &&
    rPanel.left < rEscena.right - 1 &&
    rPanel.top < rEscena.bottom - 1 &&
    rPanel.bottom > rEscena.top + 1
  if (!superpuesto || !rEscena.width) return 0
  return Math.max(0, Math.min(rPanel.right - rEscena.left, rEscena.width * MAXIMO_TAPADO))
}

/**
 * Bloque del edificio: el port a React de
 * Septiembre/observatorio/edificio-3d/edificio-3d-bloque.html (v1.2).
 *
 * En pantallas anchas el panel morado (logo, título, "Ingresar" y "Conoce
 * más") va encima de la escena, a la izquierda, y el edificio se centra en la
 * zona libre de la derecha; en angostas el panel va arriba y la escena debajo.
 *
 * - "Ingresar" lleva la cámara a la puerta (la misma animación del doble
 *   clic) y, al llegar, abre el tablero de la batería de indicadores. Si el
 *   edificio aún carga, la animación arranca al terminar; sin WebGL, el
 *   tablero se abre de una vez.
 * - "Conoce más" baja a los tableros de información.
 * - El motor (VisorEdificio) se crea en un efecto de layout y se libera en su
 *   cleanup; "Reintentar" lo vuelve a crear desde cero.
 */
export default function Edificio3D() {
  const refRaiz = useRef<HTMLElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)
  const refLienzo = useRef<HTMLDivElement>(null)
  const refControles = useRef<HTMLDivElement>(null)
  const refAviso = useRef<HTMLParagraphElement>(null)
  const refTextoEstado = useRef<HTMLParagraphElement>(null)
  const refBotonReintentar = useRef<HTMLButtonElement>(null)
  const refBotonGiro = useRef<HTMLButtonElement>(null)
  const refMotor = useRef<VisorEdificio | null>(null)
  const refTapado = useRef(0)
  const refFocoEnEstado = useRef(false)
  const idTitulo = useId()

  const [estado, setEstado] = useState<EstadoVisor>(ESTADO_INICIAL_VISOR)
  const [intento, setIntento] = useState(0)
  const [esperandoIngreso, setEsperandoIngreso] = useState(false)
  const refEsperandoIngreso = useRef(false)
  const [anuncio, setAnuncio] = useState('')
  const [tactil] = useState(() => coincideMedio('(hover: none) and (pointer: coarse)'))

  /* ---------- "Ingresar": al llegar a la puerta se abre el tablero ---------- */
  const refAlTablero = useRef(false)
  const temporizadorTablero = useRef(0)
  const abrirTablero = useCallback((pausa = 0) => {
    window.clearTimeout(temporizadorTablero.current)
    refAlTablero.current = false
    temporizadorTablero.current = window.setTimeout(() => irA(URL_TABLERO_BATERIA), pausa)
  }, [])
  /** La animación empezó: si la llegada no se detecta (movimiento reducido, se detuvo antes), se abre igual. */
  const esperarLlegada = useCallback(() => {
    window.clearTimeout(temporizadorTablero.current)
    const espera = coincideMedio('(prefers-reduced-motion: reduce)') ? PAUSA_TABLERO : ESPERA_MAXIMA_TABLERO
    temporizadorTablero.current = window.setTimeout(() => {
      if (refAlTablero.current) abrirTablero()
    }, espera)
  }, [abrirTablero])
  const refEsperarLlegada = useRef(esperarLlegada)
  useLayoutEffect(() => {
    refEsperarLlegada.current = esperarLlegada
  }, [esperarLlegada])
  useEffect(() => () => window.clearTimeout(temporizadorTablero.current), [])

  /* ---------- Anuncios para lectores de pantalla (se vacía antes para que se repitan) ---------- */
  const temporizadorAnuncio = useRef(0)
  const anunciar = useCallback((texto: string) => {
    window.clearTimeout(temporizadorAnuncio.current)
    setAnuncio('')
    temporizadorAnuncio.current = window.setTimeout(() => setAnuncio(texto), 60)
  }, [])

  /* ---------- Aviso de "Ctrl + rueda", junto al puntero ---------- */
  const temporizadorAviso = useRef(0)
  const avisarRueda = useCallback((evento: WheelEvent) => {
    const aviso = refAviso.current
    const lienzo = refLienzo.current
    if (!aviso || !lienzo) return
    aviso.textContent = esMac()
      ? 'Para acercar o alejar, usa ⌘ + rueda del ratón o pellizca el trackpad.'
      : 'Para acercar o alejar, usa Ctrl + rueda del ratón.'
    // Debajo del puntero (la página se mueve con esta misma rueda y un aviso
    // fijo arriba quedaría fuera de la vista), pero nunca encima de la barra:
    // si no cabe, va arriba del puntero.
    const r = lienzo.getBoundingClientRect()
    const techoBarra = refControles.current?.getBoundingClientRect().top ?? r.bottom
    const tope = techoBarra - r.top - aviso.offsetHeight - 8
    let y = evento.clientY - r.top + 24
    if (y > tope) y = evento.clientY - r.top - aviso.offsetHeight - 16
    aviso.style.top = `${Math.max(16, Math.min(y, tope))}px`
    aviso.classList.add('ed-visible')
    window.clearTimeout(temporizadorAviso.current)
    temporizadorAviso.current = window.setTimeout(() => aviso.classList.remove('ed-visible'), DURACION_AVISO)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(temporizadorAnuncio.current)
      window.clearTimeout(temporizadorAviso.current)
    },
    [],
  )

  /* ---------- Motor 3D ----------
     useLayoutEffect y no useEffect: al salir de la página, el cleanup de un
     efecto de layout corre con el lienzo todavía en el documento, y
     OrbitControls quita sus oyentes del nodo raíz del lienzo. */
  useLayoutEffect(() => {
    const lienzo = refLienzo.current
    if (!lienzo) return

    const motor: VisorEdificio = new VisorEdificio(lienzo, {
      urlModelo: URL_MODELO,
      rutaDecodificadorDraco: RUTA_DRACO,
      alCambiarEstado: (nuevo) => {
        setEstado(nuevo)
        // "Ingresar" se pulsó antes de que el edificio estuviera listo: la
        // animación arranca apenas lo esté (con un error, se olvida).
        if (!refEsperandoIngreso.current || !(nuevo.listo || nuevo.fase === 'error')) return
        refEsperandoIngreso.current = false
        setEsperandoIngreso(false)
        if (nuevo.listo && motor.enfocarPuerta()) refEsperarLlegada.current()
        else if (refAlTablero.current) irA(URL_TABLERO_BATERIA)
      },
      alUsarRuedaSinTecla: avisarRueda,
    })
    motor.fijarZonaTapada(refTapado.current)
    refMotor.current = motor

    return () => {
      motor.dispose()
      if (refMotor.current === motor) refMotor.current = null
    }
  }, [intento, avisarRueda])

  /* ---------- Zona libre: lo que el panel deja sin tapar ----------
     --ed-libre (px tapados) y --ed-centro (centro de la zona libre) ubican la
     tarjeta de carga, la barra y el aviso; el motor corre la vista. */
  useLayoutEffect(() => {
    const raiz = refRaiz.current
    const panel = refPanel.current
    const lienzo = refLienzo.current
    if (!raiz || !panel || !lienzo) return

    const medir = () => {
      const tapado = medirTapado(panel, lienzo)
      const ancho = lienzo.clientWidth || 1
      refTapado.current = tapado
      raiz.style.setProperty('--ed-libre', `${Math.round(tapado)}px`)
      raiz.style.setProperty('--ed-centro', `${(50 + (tapado / 2 / ancho) * 100).toFixed(2)}%`)
      refMotor.current?.fijarZonaTapada(tapado)
    }

    medir()
    window.addEventListener('resize', medir)
    if (typeof ResizeObserver !== 'function') return () => window.removeEventListener('resize', medir)

    const observador = new ResizeObserver(medir)
    observador.observe(raiz)
    observador.observe(panel)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  /* ---------- Foco al cambiar de estado ---------- */
  useLayoutEffect(() => {
    // La tarjeta de carga desaparece: si tenía el foco, pasa a la barra de la
    // misma escena, sin mover la página.
    if (estado.listo && refFocoEnEstado.current) {
      refFocoEnEstado.current = false
      refBotonGiro.current?.focus({ preventScroll: true })
    }
    // Falló mientras el foco estaba en el mensaje: al botón de reintentar.
    if (estado.fase === 'error' && document.activeElement === refTextoEstado.current) {
      refBotonReintentar.current?.focus()
    }
  }, [estado.listo, estado.fase])

  /* ---------- La cámara llegó a la entrada ---------- */
  const refEnfocandoAntes = useRef(false)
  useEffect(() => {
    if (refEnfocandoAntes.current && !estado.enfocandoPuerta && estado.listo) {
      if (refAlTablero.current) {
        anunciar('Abriendo el tablero de la batería de indicadores.')
        abrirTablero(PAUSA_TABLERO)
      } else {
        anunciar('Vista de la entrada del edificio.')
      }
    }
    refEnfocandoAntes.current = estado.enfocandoPuerta
  }, [estado.enfocandoPuerta, estado.listo, anunciar, abrirTablero])

  const reintentar = useCallback(() => {
    // El botón desaparece: el foco pasa al mensaje de carga en vez de perderse en <body>.
    if (document.activeElement === refBotonReintentar.current) refTextoEstado.current?.focus()
    setEstado(ESTADO_INICIAL_VISOR)
    setIntento((n) => n + 1)
  }, [])

  /** En celular la escena queda debajo del panel: llevarla a la pantalla para que se vea la animación. */
  const verEscena = useCallback(() => {
    const lienzo = refLienzo.current
    if (!lienzo) return
    const r = lienzo.getBoundingClientRect()
    const altoVista = window.innerHeight || document.documentElement.clientHeight
    const comportamiento: ScrollBehavior = coincideMedio('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth'
    if (r.bottom > altoVista) {
      // Bajar lo justo, sin sacar de la pantalla el botón Ingresar (que conserva el foco).
      const boton = refPanel.current?.querySelector('.ed-ingresar')?.getBoundingClientRect()
      const margen = boton ? Math.max(0, boton.top - 8) : r.bottom - altoVista
      window.scrollBy({ top: Math.min(r.bottom - altoVista, margen), behavior: comportamiento })
    } else if (r.top < 0) {
      lienzo.scrollIntoView({ behavior: comportamiento, block: 'nearest' })
    }
  }, [])

  const ingresar = () => {
    refAlTablero.current = true
    if (estado.listo) {
      verEscena()
      if (refMotor.current?.enfocarPuerta()) esperarLlegada()
      else if (!estado.enfocandoPuerta) abrirTablero()
      return
    }
    if (estado.fase === 'error') {
      // Sin WebGL no hay animación que esperar: el tablero se abre de una vez.
      if (estado.error?.tipo === 'webgl') {
        abrirTablero()
        return
      }
      reintentar()
    }
    refEsperandoIngreso.current = true
    setEsperandoIngreso(true)
    verEscena()
    anunciar('El edificio se está cargando; la vista irá a la entrada al terminar.')
  }

  const conocerMas = (evento: MouseEvent<HTMLAnchorElement>) => {
    const destino = document.getElementById(ID_TABLEROS)
    if (!destino) return
    evento.preventDefault()
    const comportamiento: ScrollBehavior = coincideMedio('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth'
    destino.scrollIntoView({ behavior: comportamiento, block: 'start' })
    destino.focus({ preventScroll: true })
  }

  const clases = ['ed-edificio']
  if (estado.listo) clases.push('ed-listo')
  if (estado.fase === 'error') clases.push('ed-error')
  if (esperandoIngreso) clases.push('ed-esperando')
  if (estado.enfocandoPuerta) clases.push('ed-enfocando')

  return (
    <section ref={refRaiz} className={clases.join(' ')} aria-labelledby={idTitulo} data-estado={estadoDatos(estado)}>
      <div ref={refPanel} className="ed-panel">
        <div className="ed-logo">
          <img
            src={LOGO_PANEL.src}
            alt="Observatorio de Sapiencia"
            width={LOGO_PANEL.ancho}
            height={LOGO_PANEL.alto}
            decoding="async"
          />
        </div>
        <h1 id={idTitulo} className="ed-titulo">
          {TITULO_SIVU}
        </h1>
        <div className="ed-acciones">
          <button type="button" className="ed-boton ed-ingresar" onClick={ingresar}>
            <Icono nombre="ingresar" />
            <span>Ingresar</span>
          </button>
          <a href={`#${ID_TABLEROS}`} className="ed-boton ed-boton-borde ed-conoce" onClick={conocerMas}>
            <span>Conoce más</span>
            <Icono nombre="flechaAbajo" />
          </a>
        </div>
      </div>

      <div className="ed-escena">
        <div
          ref={refLienzo}
          className="ed-lienzo"
          role="img"
          aria-hidden={estado.listo ? undefined : true}
          aria-label="Modelo en 3D de la sede de Sapiencia: edificio gris de tres pisos con la entrada en magenta, rodeado de árboles y calles."
          data-enfoque={estado.enfocandoPuerta ? 'puerta' : undefined}
        />

        <EstadoCarga
          estado={estado}
          refTexto={refTextoEstado}
          refBoton={refBotonReintentar}
          onReintentar={reintentar}
          onFoco={(dentro) => {
            refFocoEnEstado.current = dentro
          }}
        />

        <p ref={refAviso} className="ed-aviso" aria-hidden="true" />

        {estado.listo && (
          <BarraControles
            ref={refControles}
            refBotonGiro={refBotonGiro}
            rotacionActiva={estado.rotacionActiva}
            tactil={tactil}
            onAlternarRotacion={() => refMotor.current?.alternarRotacion()}
            onGirar={(sentido) => refMotor.current?.girar(sentido)}
            onAcercar={() => refMotor.current?.acercar()}
            onAlejar={() => refMotor.current?.alejar()}
          />
        )}
      </div>

      <p className="ed-sr" role="status">
        {anuncio}
      </p>
    </section>
  )
}
