/**
 * Diálogo modal accesible sobre <dialog> y showModal(): el navegador deja el
 * resto de la página inerte y atrapa el foco; Esc lo cierra. Al abrir, el
 * foco va a `enfoqueInicial` (o al primer control) y, al cerrar, vuelve a
 * donde estaba. Si el navegador no tiene showModal (jsdom), se abre con el
 * atributo open y Esc se atiende a mano.
 *
 * Se dibuja (portal) en la raíz visible de la administración (.ra-admin):
 * así se ve aunque la página que lo abre esté oculta, por ejemplo el aviso
 * de cambios sin guardar mientras se muestra "Su sesión venció".
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface PropsDialogo {
  abierto: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  /** Control que recibe el foco al abrir. */
  enfoqueInicial?: RefObject<HTMLElement | null>
  /** alertdialog para confirmaciones destructivas. */
  rol?: 'dialog' | 'alertdialog'
  /** id del texto que describe el diálogo (aria-describedby). */
  idDescripcion?: string
  /** Mientras es true, Esc no cierra (p. ej., durante una petición). */
  bloqueado?: boolean
}

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Dialogo({
  abierto,
  titulo,
  onCerrar,
  children,
  enfoqueInicial,
  rol = 'dialog',
  idDescripcion,
  bloqueado = false,
}: PropsDialogo) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()
  const cerrarRef = useRef(onCerrar)
  const bloqueadoRef = useRef(bloqueado)
  useEffect(() => {
    cerrarRef.current = onCerrar
    bloqueadoRef.current = bloqueado
  })

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo || !abierto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (typeof dialogo.showModal === 'function') {
      if (!dialogo.open) dialogo.showModal()
    } else {
      dialogo.setAttribute('open', '')
    }
    const destino = enfoqueInicial?.current ?? dialogo.querySelector<HTMLElement>(ENFOCABLES)
    destino?.focus()
    return () => {
      if (typeof dialogo.close === 'function' && dialogo.open) dialogo.close()
      else dialogo.removeAttribute('open')
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto, enfoqueInicial])

  if (!abierto) return null
  const raiz = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.ra-admin')
  const dialogo = (
    <dialog
      ref={ref}
      className="ra-dialogo"
      role={rol === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={idTitulo}
      aria-describedby={idDescripcion}
      onCancel={(evento) => {
        evento.preventDefault()
        if (!bloqueadoRef.current) cerrarRef.current()
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && typeof ref.current?.showModal !== 'function') {
          evento.preventDefault()
          if (!bloqueadoRef.current) cerrarRef.current()
        }
      }}
    >
      <div className="ra-dialogo-caja">
        <h2 className="ra-dialogo-titulo" id={idTitulo}>
          {titulo}
        </h2>
        {children}
      </div>
    </dialog>
  )
  return raiz ? createPortal(dialogo, raiz) : dialogo
}
