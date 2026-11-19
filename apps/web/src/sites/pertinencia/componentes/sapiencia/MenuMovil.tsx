import { type CSSProperties, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MENU_PRINCIPAL } from '../../datos/sapiencia-oficial'
import { FormularioBusqueda } from './BuscadorSapiencia'
import { ColumnasPanel } from './MenuPrincipal'
import { IconoTriangulo } from './iconos'

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Panel del menú en tablet y celular (≤ 1140 px), que abre la hamburguesa de
 * la cabecera: la lista azul del sitio (ítems de 56 px, letra blanca) con los
 * submenús en acordeón y, debajo, el buscador ("Buscar..").
 *
 * Diferencias deliberadas con el sitio oficial, que en ese rango tiene fallas
 * de maquetación: la lista ocupa todo el ancho (allá queda corrida 160 px a la
 * derecha, y de 769 a 1140 px sale en píldoras horizontales) y el panel cubre
 * el resto de la pantalla con su propio desplazamiento (allá se bloquea la
 * página y la lista larga queda cortada).
 *
 * Mientras está abierto: la página no se desplaza (overflow del body), el foco
 * da la vuelta entre la hamburguesa y el panel (Tab / Mayús+Tab), y Escape lo
 * cierra y devuelve el foco a la hamburguesa. Se cierra solo si la ventana
 * pasa a escritorio.
 */
export default function MenuMovil({
  id,
  abierto,
  onCerrar,
  hamburguesa,
  cabecera,
}: {
  id: string
  abierto: boolean
  onCerrar: (devolverFoco: boolean) => void
  hamburguesa: RefObject<HTMLButtonElement | null>
  cabecera: RefObject<HTMLElement | null>
}) {
  const prefijo = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState<number | null>(null)
  const [arriba, setArriba] = useState(0)
  // Al cerrarse, el acordeón vuelve a quedar plegado (ajuste de estado durante el render al cambiar la prop,
  // el patrón que recomienda React en lugar de un efecto).
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (!abierto) setSub(null)
  }

  // Borde superior del panel: el borde inferior de la cabecera blanca en la pantalla.
  useLayoutEffect(() => {
    if (!abierto) return
    // oxlint-disable-next-line react/set-state-in-effect -- medir el DOM antes de pintar es justo para lo que sirve este efecto
    setArriba(Math.max(0, Math.round(cabecera.current?.getBoundingClientRect().bottom ?? 0)))
  }, [abierto, cabecera])

  useEffect(() => {
    if (!abierto) return
    const body = document.body
    const overflowAntes = body.style.overflow
    body.style.overflow = 'hidden'

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCerrar(true)
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      // La hamburguesa y lo enfocable del panel, sin lo que está dentro de un submenú cerrado ([hidden]).
      const elementos = [hamburguesa.current, ...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter(
        (el): el is HTMLElement => el !== null && !el.closest('[hidden]'),
      )
      if (elementos.length === 0) return
      const primero = elementos[0]
      const ultimo = elementos[elementos.length - 1]
      const activo = document.activeElement
      if (e.shiftKey && (activo === primero || !elementos.includes(activo as HTMLElement))) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (activo === ultimo || !elementos.includes(activo as HTMLElement))) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', tecla)

    const escritorio = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1141px)') : null
    const alCambiar = (e: MediaQueryListEvent) => {
      if (e.matches) onCerrar(false)
    }
    escritorio?.addEventListener('change', alCambiar)

    return () => {
      body.style.overflow = overflowAntes
      document.removeEventListener('keydown', tecla)
      escritorio?.removeEventListener('change', alCambiar)
    }
  }, [abierto, onCerrar, hamburguesa])

  return (
    <div
      ref={panel}
      id={id}
      className="pe-sap-movil"
      hidden={!abierto}
      style={{ '--pe-sap-movil-arriba': `${arriba}px` } as CSSProperties}
    >
      <nav aria-label="Menú principal de sapiencia.gov.co">
        <ul className="pe-sap-movil-lista">
          {MENU_PRINCIPAL.map((item, i) => {
            const idSub = `${prefijo}-sub-${i}`
            return (
              <li key={item.texto} className="pe-sap-movil-item">
                {item.columnas?.length ? (
                  <>
                    <button
                      type="button"
                      className="pe-sap-movil-enlace"
                      aria-expanded={sub === i}
                      aria-controls={idSub}
                      onClick={() => setSub((s) => (s === i ? null : i))}
                    >
                      {item.texto}
                      <span className="pe-sap-movil-indicador">
                        <IconoTriangulo />
                      </span>
                    </button>
                    <div id={idSub} className="pe-sap-movil-sub" hidden={sub !== i}>
                      <ColumnasPanel columnas={item.columnas} prefijo={`${prefijo}-${i}`} />
                    </div>
                  </>
                ) : (
                  <a className="pe-sap-movil-enlace" href={item.url}>
                    {item.texto}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      <FormularioBusqueda variante="movil" />
    </div>
  )
}
