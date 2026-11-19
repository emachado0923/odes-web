/**
 * Modal del kit (marcado `modal` de Bootstrap) dibujado por React, sin el
 * data-API de script.js: `modal fade show d-block` + `modal-backdrop`.
 *
 * - Accesible: role dialog (o alertdialog), aria-modal, título enlazado
 *   (aria-labelledby), foco atrapado dentro (Tab y Mayús+Tab dan la vuelta),
 *   Escape cierra (salvo `bloqueado`), y al cerrar el foco vuelve a donde
 *   estaba (o, si ese control ya no existe, a `enfoqueFinal` o al <main>).
 * - La trampa no depende de dónde esté el foco: Tab y Escape se oyen en el
 *   documento mientras el modal está abierto, y el foco que sale hacia la
 *   página (detrás del modal) vuelve a él. Así sigue funcionando cuando el
 *   control enfocado se deshabilita o desaparece (el navegador deja el foco
 *   en <body>), p. ej., «Guardar» mientras guarda. Con varios modales
 *   abiertos (una confirmación encima de otro), solo responde el de arriba.
 *   No se mete con lo que está fuera de la rama (el panel de accesibilidad
 *   del kit) ni con un modal oculto (la sesión venció y la página quedó
 *   debajo del ingreso).
 * - No se cierra al pulsar fuera (evita perder lo escrito); el que lo abre
 *   decide si avisa de cambios sin guardar antes de llamar a onCerrar.
 * - Se dibuja en su lugar (sin portal): si la sesión vence, la página queda
 *   oculta bajo el ingreso con el modal y lo escrito, y vuelve igual.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { ID_CONTENIDO } from '../rutas'

/** Lo que recibe el foco con Tab (sin lo que tiene tabindex="-1", p. ej. las pestañas no elegidas). */
const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(', ')

/** Modales abiertos, del más antiguo al más reciente (el último es el de arriba). */
const pila: HTMLElement[] = []

export interface PropsModalPai {
  abierto: boolean
  titulo: ReactNode
  onCerrar: () => void
  children: ReactNode
  /** Botones del pie (modal-footer). */
  pie?: ReactNode
  tamano?: 'sm' | 'lg' | 'xl'
  /** Control que recibe el foco al abrir (por defecto, el primero del cuerpo). */
  enfoqueInicial?: RefObject<HTMLElement | null>
  /** Recibe el foco al cerrar si el control que lo tenía antes de abrir ya no existe. */
  enfoqueFinal?: RefObject<HTMLElement | null>
  /** Mientras es true (p. ej., guardando), Escape y la X no cierran. */
  bloqueado?: boolean
  /** alertdialog para confirmaciones. */
  rol?: 'dialog' | 'alertdialog'
  /** id del texto que describe el modal (aria-describedby). */
  idDescripcion?: string
}

function visibles(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => !el.closest('[hidden]'))
}

export default function ModalPai({
  abierto,
  titulo,
  onCerrar,
  children,
  pie,
  tamano,
  enfoqueInicial,
  enfoqueFinal,
  bloqueado = false,
  rol = 'dialog',
  idDescripcion,
}: PropsModalPai) {
  const ref = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  // Los manejadores del documento leen siempre lo último (sin volver a registrarse).
  const actual = useRef({ onCerrar, bloqueado })
  useEffect(() => {
    actual.current = { onCerrar, bloqueado }
  })

  useEffect(() => {
    const dialogo = ref.current
    if (!abierto || !dialogo) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const cuerpo = dialogo.querySelector<HTMLElement>('.modal-body')
    const destino = enfoqueInicial?.current ?? cuerpo?.querySelector<HTMLElement>(ENFOCABLES) ?? dialogo
    // Primero arriba de la pila: así el modal de abajo no le devuelve el foco a sí mismo.
    pila.push(dialogo)
    document.body.classList.add('modal-open')
    destino.focus()

    /** ¿Este modal es el de arriba y se ve? (oculto, p. ej., bajo el ingreso cuando venció la sesión). */
    const activo = () => pila[pila.length - 1] === dialogo && dialogo.isConnected && !dialogo.closest('[hidden]')
    /** La rama (lo que queda detrás del modal); fuera de ella no se toca el foco. */
    const raiz = () => dialogo.closest<HTMLElement>('.pai') ?? document.body

    function alTeclear(evento: KeyboardEvent) {
      if (evento.defaultPrevented || evento.isComposing || !activo() || !dialogo) return
      if (evento.key !== 'Escape' && evento.key !== 'Tab') return
      const enfocado = document.activeElement
      // El foco está en otra parte (fuera de la rama, p. ej., el panel de accesibilidad del kit): no se toca.
      if (enfocado instanceof HTMLElement && enfocado !== document.body && !raiz().contains(enfocado)) return
      if (evento.key === 'Escape') {
        evento.preventDefault()
        if (!actual.current.bloqueado) actual.current.onCerrar()
        return
      }
      const enfocables = visibles(dialogo)
      if (enfocables.length === 0) {
        evento.preventDefault()
        dialogo.focus()
        return
      }
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const dentro = enfocado instanceof Node && dialogo.contains(enfocado)
      if (!dentro) {
        // El control enfocado se deshabilitó o desapareció (foco en <body>): se vuelve al modal.
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && (enfocado === primero || enfocado === dialogo)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && enfocado === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    function alEnfocar(evento: FocusEvent) {
      if (!activo() || !dialogo) return
      const objetivo = evento.target
      if (!(objetivo instanceof Node) || dialogo.contains(objetivo) || !raiz().contains(objetivo)) return
      // El foco llegó a la página detrás del modal: vuelve a él.
      ;(visibles(dialogo)[0] ?? dialogo).focus()
    }

    document.addEventListener('keydown', alTeclear)
    document.addEventListener('focusin', alEnfocar)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('focusin', alEnfocar)
      const posicion = pila.lastIndexOf(dialogo)
      if (posicion >= 0) pila.splice(posicion, 1)
      if (pila.length === 0) document.body.classList.remove('modal-open')
      const disponible = (el: HTMLElement | null | undefined): el is HTMLElement =>
        !!el && el.isConnected && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled
      if (disponible(anterior) && anterior !== document.body) anterior.focus()
      else {
        // El destino se lee al cerrar (puede haberse dibujado después de abrir, p. ej., un aviso).
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        const respaldo = enfoqueFinal?.current ?? document.getElementById(ID_CONTENIDO)
        if (disponible(respaldo)) respaldo.focus({ preventScroll: true })
      }
    }
    // enfoqueInicial / enfoqueFinal son refs: no cambian.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  if (!abierto) return null

  const clasesDialogo = ['modal-dialog', 'modal-dialog-centered', 'modal-dialog-scrollable', tamano && `modal-${tamano}`]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        ref={ref}
        className="modal fade show d-block pai-modal"
        role={rol}
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescripcion}
        tabIndex={-1}
      >
        <div className={clasesDialogo}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id={idTitulo}>
                {titulo}
              </h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} disabled={bloqueado} />
            </div>
            <div className="modal-body">{children}</div>
            {pie && <div className="modal-footer">{pie}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  )
}
