import { Fragment, type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react'
import { type ColumnaMenu, MENU_PRINCIPAL } from '../../datos/sapiencia-oficial'
import EnlaceOficial from './EnlaceOficial'
import { IconoTriangulo } from './iconos'

/** Espera antes de cerrar un panel al sacar el mouse (el "hover intent" del sitio: 300 ms). */
const ESPERA_CIERRE = 300
/** Espera antes de abrir al pasar el mouse (intervalo del sitio: 100 ms; evita abrir al cruzar la barra). */
const ESPERA_APERTURA = 100

/** Columnas de un panel: títulos (si hay) y listas de enlaces. */
export function ColumnasPanel({ columnas, prefijo }: { columnas: readonly ColumnaMenu[]; prefijo: string }) {
  return columnas.map((columna, c) => (
    <div key={c} className={`pe-sap-mega-columna pe-sap-mega-columna--${columna.estilo}`}>
      {columna.grupos.map((grupo, g) => {
        const idTitulo = `${prefijo}-${c}-${g}`
        return (
          <Fragment key={g}>
            {grupo.titulo && (
              <p id={idTitulo} className="pe-sap-mega-titulo">
                {grupo.titulo}
              </p>
            )}
            <ul className="pe-sap-mega-lista" aria-labelledby={grupo.titulo ? idTitulo : undefined}>
              {grupo.enlaces.map((enlace) => (
                <li key={enlace.url}>
                  <EnlaceOficial className="pe-sap-mega-enlace" enlace={enlace} />
                </li>
              ))}
            </ul>
          </Fragment>
        )
      })}
    </div>
  ))
}

/**
 * Menú principal de escritorio (≥ 1141 px): la barra azul redondeada con los
 * ocho ítems del sitio y sus paneles desplegables (mega menú).
 *
 * Comportamiento (el del sitio, más teclado completo):
 * - Los ítems con submenú son botones (aria-expanded, aria-controls). El panel
 *   se abre al pasar el mouse (100 ms) y se cierra al salir (300 ms); también
 *   con clic, Enter o Espacio. Un clic sobre un panel abierto con el mouse lo
 *   deja fijo; otro clic lo cierra.
 * - Flecha abajo abre el panel y lleva el foco a su primer enlace.
 * - Escape cierra y devuelve el foco al botón; un clic fuera del menú o sacar
 *   el foco del ítem también lo cierran. Solo hay un panel abierto a la vez.
 * - Los paneles cerrados quedan inertes (inert): ni foco ni lectores.
 */
export default function MenuPrincipal() {
  const prefijo = useId()
  const [abierto, setAbierto] = useState<number | null>(null)
  const porMouse = useRef(false)
  const nav = useRef<HTMLElement>(null)
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const paneles = useRef<(HTMLDivElement | null)[]>([])
  const temporizador = useRef<number | undefined>(undefined)
  const enfocarPrimero = useRef(false)

  const cancelarTemporizador = () => window.clearTimeout(temporizador.current)

  useEffect(() => cancelarTemporizador, [])

  useEffect(() => {
    if (abierto === null) return
    if (enfocarPrimero.current) {
      enfocarPrimero.current = false
      paneles.current[abierto]?.querySelector<HTMLAnchorElement>('a')?.focus()
    }
    const fuera = (e: globalThis.PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setAbierto(null)
    }
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dentro = nav.current?.contains(document.activeElement)
      const boton = botones.current[abierto]
      setAbierto(null)
      if (dentro) boton?.focus()
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const entrar = (i: number, tieneSub: boolean) => (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    cancelarTemporizador()
    temporizador.current = window.setTimeout(() => {
      if (tieneSub) {
        porMouse.current = true
        setAbierto(i)
      } else {
        setAbierto(null)
      }
    }, ESPERA_APERTURA)
  }

  const salir = (i: number) => (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType !== 'mouse') return
    const li = e.currentTarget
    cancelarTemporizador()
    temporizador.current = window.setTimeout(() => {
      // Abierto con el mouse y sin el foco adentro: se cierra.
      if (li.contains(document.activeElement)) return
      setAbierto((a) => (a === i && porMouse.current ? null : a))
    }, ESPERA_CIERRE)
  }

  const alternar = (i: number) => {
    cancelarTemporizador()
    if (abierto === i && !porMouse.current) {
      setAbierto(null)
    } else {
      porMouse.current = false
      setAbierto(i)
    }
  }

  const teclaBoton = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      cancelarTemporizador()
      porMouse.current = false
      if (abierto === i) paneles.current[i]?.querySelector<HTMLAnchorElement>('a')?.focus()
      else {
        enfocarPrimero.current = true
        setAbierto(i)
      }
    }
  }

  return (
    <nav ref={nav} className="pe-sap-menu" aria-label="Menú principal de sapiencia.gov.co">
      <ul className="pe-sap-menu-barra">
        {MENU_PRINCIPAL.map((item, i) => {
          const tieneSub = Boolean(item.columnas?.length)
          const estaAbierto = abierto === i
          const idPanel = `${prefijo}-panel-${i}`
          return (
            <li
              key={item.texto}
              className={`pe-sap-menu-item${item.panelDerecha ? ' pe-sap-menu-item--derecha' : ''}${estaAbierto ? ' is-abierto' : ''}`}
              onPointerEnter={entrar(i, tieneSub)}
              onPointerLeave={salir(i)}
              onBlur={(e) => {
                // El foco pasó a otro elemento fuera del ítem (Tab): se cierra. Sin relatedTarget (clic en una zona
                // sin foco) no se hace nada: de los clics fuera del menú se encarga el pointerdown del documento.
                const destino = e.relatedTarget as Node | null
                if (estaAbierto && destino && !e.currentTarget.contains(destino)) setAbierto(null)
              }}
            >
              {tieneSub ? (
                <>
                  <button
                    ref={(b) => {
                      botones.current[i] = b
                    }}
                    type="button"
                    className="pe-sap-menu-enlace"
                    aria-expanded={estaAbierto}
                    aria-controls={idPanel}
                    onClick={() => alternar(i)}
                    onKeyDown={teclaBoton(i)}
                  >
                    {item.texto}
                    <span className="pe-sap-menu-indicador">
                      <IconoTriangulo />
                    </span>
                  </button>
                  <div
                    ref={(p) => {
                      paneles.current[i] = p
                    }}
                    id={idPanel}
                    className={`pe-sap-mega pe-sap-mega--${item.columnas!.length}-columnas`}
                    inert={!estaAbierto}
                  >
                    <ColumnasPanel columnas={item.columnas!} prefijo={`${prefijo}-${i}`} />
                  </div>
                </>
              ) : (
                <a className="pe-sap-menu-enlace" href={item.url}>
                  {item.texto}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
