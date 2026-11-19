/**
 * Filtro de casillas (Categoría, Año, Palabra clave), como el del bloque
 * v4.2: un botón que abre un panel con su propio buscador difuso y la lista
 * de opciones. Se puede marcar más de una (O dentro del filtro). Con
 * conTotal = false (Palabra clave) las opciones no dicen cuántos documentos
 * tienen: es solo un selector de palabras.
 *
 * Teclado:
 * - Flecha abajo en el botón abre el panel y enfoca su buscador.
 * - Flecha abajo en el buscador pasa a la primera casilla; flechas arriba y
 *   abajo recorren las casillas (arriba desde la primera vuelve al buscador).
 * - Enter en el buscador marca o desmarca la primera opción que se ve.
 * - Esc borra la búsqueda del panel y, si ya está vacía, cierra el panel y
 *   devuelve el foco al botón.
 * El panel se cierra al pasar con Tab a otra parte o al hacer clic fuera.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { alternar, type NombreFaceta } from '../filtros/estado'
import { MAX_SIN_BUSCADOR, opcionesVisibles, type OpcionFaceta } from '../filtros/facetas'
import { TEXTOS_FACETA, textoOpciones } from '../filtros/textos'
import Icono from './Icono'

interface Props {
  nombre: NombreFaceta
  opciones: readonly OpcionFaceta[]
  seleccion: readonly string[]
  abierta: boolean
  onAbrir: (nombre: NombreFaceta) => void
  onCerrar: (nombre: NombreFaceta) => void
  onCambiar: (nombre: NombreFaceta, valores: string[]) => void
  /** Mostrar cuántos documentos tiene cada opción (por defecto, sí). */
  conTotal?: boolean
}

/** Con puntero fino (ratón) el clic en el botón enfoca el buscador; en pantallas táctiles no (no abre el teclado). */
function punteroFino(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
}

/** Pausa antes de anunciar cuántas opciones quedan mientras se escribe. */
const PAUSA_ANUNCIO = 400

export default function FacetaCasillas({
  nombre,
  opciones,
  seleccion,
  abierta,
  onAbrir,
  onCerrar,
  onCambiar,
  conTotal = true,
}: Props) {
  const textos = TEXTOS_FACETA[nombre]
  const sinBuscador = opciones.length <= MAX_SIN_BUSCADOR
  const [q, setQ] = useState('')
  const [anuncio, setAnuncio] = useState('')
  const nodo = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const listo = useRef<HTMLButtonElement>(null)
  const casillas = useRef(new Map<string, HTMLInputElement>())
  const temporizador = useRef<number | undefined>(undefined)
  const enfocarAlAbrir = useRef(false)

  // Al cerrarse (por cualquier motivo, también cuando lo cierra el padre al
  // abrir otro filtro) se borran la búsqueda y el anuncio del panel.
  const [abiertaAntes, setAbiertaAntes] = useState(abierta)
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta)
    if (!abierta) {
      if (q) setQ('')
      if (anuncio) setAnuncio('')
    }
  }
  // …y se cancela el anuncio que esperaba la pausa: si no, llegaría después y
  // la región diría "1 opción" con todas las opciones a la vista (el bloque
  // hace lo mismo en cerrar()). Antes de pintar, en el mismo turno del cierre.
  useLayoutEffect(() => {
    if (!abierta) window.clearTimeout(temporizador.current)
  }, [abierta])

  const visibles = useMemo(() => opcionesVisibles(opciones, q), [opciones, q])
  const visiblesSet = useMemo(() => new Set(visibles.map((o) => o.valor)), [visibles])
  const marcadas = opciones.filter((o) => seleccion.includes(o.valor))

  const casillasVisibles = () =>
    visibles.map((o) => casillas.current.get(o.valor)).filter((c): c is HTMLInputElement => Boolean(c))

  const enfocarPanel = () => {
    const destino = sinBuscador ? (casillasVisibles()[0] ?? listo.current) : campo.current
    destino?.focus()
  }

  // El panel se muestra después del render: ahí recibe el foco si se pidió.
  useEffect(() => {
    if (abierta && enfocarAlAbrir.current) {
      enfocarAlAbrir.current = false
      enfocarPanel()
    }
  })

  // Clic fuera del filtro: se cierra.
  useEffect(() => {
    if (!abierta) return
    const fuera = (evento: MouseEvent) => {
      if (nodo.current && !nodo.current.contains(evento.target as Node)) onCerrar(nombre)
    }
    document.addEventListener('click', fuera)
    return () => document.removeEventListener('click', fuera)
  }, [abierta, nombre, onCerrar])

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  function abrir(enfocar: boolean) {
    enfocarAlAbrir.current = enfocar
    onAbrir(nombre)
  }

  function cerrar(devolverFoco: boolean) {
    onCerrar(nombre)
    if (devolverFoco) boton.current?.focus()
  }

  /** Cambia la búsqueda del panel; `anunciar` = avisar (con pausa) cuántas opciones quedan. */
  function cambiarQ(valor: string, anunciar: boolean) {
    setQ(valor)
    const n = opcionesVisibles(opciones, valor).length
    window.clearTimeout(temporizador.current)
    if (!n || !anunciar) {
      setAnuncio(n ? '' : textoOpciones(0))
      return
    }
    temporizador.current = window.setTimeout(() => setAnuncio(textoOpciones(n)), PAUSA_ANUNCIO)
  }

  function teclas(evento: KeyboardEvent<HTMLDivElement>) {
    const tecla = evento.key
    const objetivo = evento.target
    if (tecla === 'Escape' || tecla === 'Esc') {
      if (objetivo === campo.current && q) cambiarQ('', true)
      else if (abierta) cerrar(true)
      else return
      evento.preventDefault()
      return
    }
    if (objetivo === boton.current) {
      if (tecla === 'ArrowDown' && !abierta) {
        evento.preventDefault()
        abrir(true)
      }
      return
    }
    const lista = casillasVisibles()
    if (objetivo === campo.current) {
      if (tecla === 'ArrowDown' && lista.length) {
        evento.preventDefault()
        lista[0].focus()
      }
      if (tecla === 'Enter') {
        evento.preventDefault()
        if (visibles.length) onCambiar(nombre, alternar(seleccion, visibles[0].valor))
      }
      return
    }
    const i = lista.indexOf(objetivo as HTMLInputElement)
    if (i === -1) return
    if (tecla === 'ArrowDown' && i + 1 < lista.length) {
      evento.preventDefault()
      lista[i + 1].focus()
    } else if (tecla === 'ArrowUp' && (i || !sinBuscador)) {
      evento.preventDefault()
      ;(i ? lista[i - 1] : campo.current)?.focus()
    }
  }

  /**
   * Se cierra al pasar con Tab a otra parte de la página. No se cierra si el
   * foco pasa a un ancestro del filtro: es lo que hace el navegador en el
   * mousedown sobre algo no enfocable (el texto o el número de una opción)
   * cuando hay un ancestro con tabindex, como el <main tabIndex={-1}> de la
   * página; cerrar ahí haría que el clic no llegara a la casilla. Si el clic
   * fue fuera del filtro, ya lo cierra el listener de 'click' del documento.
   */
  function salir(evento: FocusEvent<HTMLDivElement>) {
    const siguiente = evento.relatedTarget as Node | null
    const raiz = nodo.current
    if (!abierta || !siguiente || !raiz || raiz.contains(siguiente) || siguiente.contains(raiz)) return
    onCerrar(nombre)
  }

  function desmarcar() {
    onCambiar(nombre, [])
    ;(casillasVisibles()[0] ?? campo.current)?.focus()
  }

  const idEtiqueta = `rp-${nombre}-etiqueta`
  const idBoton = `rp-${nombre}-boton`
  const idPanel = `rp-${nombre}-panel`

  return (
    <div className="rp-campo rp-faceta" data-faceta={nombre} ref={nodo} onKeyDown={teclas} onBlur={salir}>
      <span className="rp-etiqueta" id={idEtiqueta}>
        {textos.etiqueta}
      </span>
      <div className="rp-desplegable">
        <button
          type="button"
          ref={boton}
          className={marcadas.length ? 'rp-abrir rp-activo' : 'rp-abrir'}
          id={idBoton}
          aria-expanded={abierta}
          aria-controls={idPanel}
          aria-labelledby={`${idEtiqueta} ${idBoton}`}
          onClick={() => (abierta ? cerrar(false) : abrir(punteroFino()))}
        >
          <span className="rp-valor">{marcadas.length ? marcadas.map((o) => o.texto).join(', ') : textos.todas}</span>
          <span className="rp-cuenta" hidden={marcadas.length < 2}>
            {marcadas.length}
            <span className="rp-oculto"> {textos.marcadas}</span>
          </span>
          <Icono nombre="flecha" />
        </button>
        <div className="rp-panel" id={idPanel} hidden={!abierta}>
          <div className="rp-buscar" hidden={sinBuscador}>
            <Icono nombre="buscar" />
            <input
              ref={campo}
              className="rp-entrada"
              type="search"
              placeholder={textos.buscar}
              aria-label={textos.buscar}
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e: ChangeEvent<HTMLInputElement>) => cambiarQ(e.target.value, true)}
            />
          </div>
          <fieldset className="rp-opciones">
            <legend className="rp-oculto">{textos.leyenda}</legend>
            {opciones.map((o) => (
              <label key={o.valor} className="rp-opcion" hidden={!visiblesSet.has(o.valor)}>
                <input
                  ref={(el) => {
                    if (el) casillas.current.set(o.valor, el)
                    else casillas.current.delete(o.valor)
                  }}
                  className="rp-casilla"
                  type="checkbox"
                  value={o.valor}
                  checked={seleccion.includes(o.valor)}
                  onChange={() => onCambiar(nombre, alternar(seleccion, o.valor))}
                />
                <span className="rp-opcion-texto">{o.texto}</span>
                {conTotal && (
                  <>
                    <span className="rp-opcion-total" aria-hidden="true">
                      {o.total}
                    </span>
                    <span className="rp-oculto">{` (${o.total} ${o.total === 1 ? 'documento' : 'documentos'})`}</span>
                  </>
                )}
              </label>
            ))}
          </fieldset>
          <p className={visibles.length ? 'rp-estado-opciones rp-oculto' : 'rp-estado-opciones'} role="status" aria-live="polite">
            {anuncio}
          </p>
          <div className="rp-panel-pie">
            <button type="button" className="rp-texto-boton rp-desmarcar" hidden={!marcadas.length} onClick={desmarcar}>
              Quitar selección
            </button>
            <button type="button" className="rp-listo" ref={listo} onClick={() => cerrar(true)}>
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
