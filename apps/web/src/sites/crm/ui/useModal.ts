/**
 * Lo común de Dialogo y PanelLateral: un <dialog> abierto con showModal() (el
 * resto de la página queda inerte y el foco no se escapa).
 *
 * - Al abrir, el foco va al elemento con `data-autofocus` o, si no hay, al
 *   primer control del cuerpo, luego al del pie y por último al botón de
 *   cerrar. Al cerrar vuelve a donde estaba.
 * - Escape cierra (llama alCerrar) salvo `bloqueado` (p. ej., mientras se
 *   guarda). Si el navegador lo cierra por su cuenta (Chrome lo hace al
 *   segundo Escape seguido), se avisa igual, o se vuelve a abrir si está
 *   bloqueado.
 * - Sin showModal (jsdom), se abre con el atributo `open` y Escape se atiende
 *   a mano.
 * - Mientras está abierto se registra en ProveedorAvisos: el de más arriba
 *   (`esSuperior`) pinta los avisos, que fuera del modal quedarían inertes.
 */
import { use, useEffect, useId, useRef, type KeyboardEvent, type SyntheticEvent } from 'react'
import { ContextoRegionAvisos } from './avisos'

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModal({ abierto, alCerrar, bloqueado }: { abierto: boolean; alCerrar: () => void; bloqueado: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const cerrarRef = useRef(alCerrar)
  const bloqueadoRef = useRef(bloqueado)
  useEffect(() => {
    cerrarRef.current = alCerrar
    bloqueadoRef.current = bloqueado
  })

  const region = use(ContextoRegionAvisos)
  const registrar = region?.registrarModal
  useEffect(() => {
    if (!abierto || !registrar) return
    return registrar(id)
  }, [abierto, registrar, id])
  const esSuperior = region ? region.modales[region.modales.length - 1] === id : false

  useEffect(() => {
    const dialogo = ref.current
    if (!abierto || !dialogo) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (typeof dialogo.showModal === 'function') {
      if (!dialogo.open) dialogo.showModal()
    } else {
      dialogo.setAttribute('open', '')
    }
    const destino =
      dialogo.querySelector<HTMLElement>('[data-autofocus]') ??
      dialogo.querySelector<HTMLElement>(`.crm-modal-cuerpo :is(${ENFOCABLES})`) ??
      dialogo.querySelector<HTMLElement>(`.crm-modal-pie :is(${ENFOCABLES})`) ??
      dialogo.querySelector<HTMLElement>(ENFOCABLES)
    destino?.focus()
    return () => {
      if (typeof dialogo.close === 'function') {
        if (dialogo.open) dialogo.close()
      } else {
        dialogo.removeAttribute('open')
      }
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto])

  /** Escape (evento cancel del <dialog>). */
  function alCancelar(evento: SyntheticEvent<HTMLDialogElement>) {
    evento.preventDefault()
    if (!bloqueadoRef.current) cerrarRef.current()
  }

  /** El navegador cerró el diálogo sin pasar por alCerrar. */
  function alCerrarNativo() {
    const dialogo = ref.current
    // Abierto otra vez (StrictMode lo cierra y lo abre al montar): el aviso es viejo.
    if (!dialogo || dialogo.open) return
    if (bloqueadoRef.current) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal()
      return
    }
    cerrarRef.current()
  }

  /** Escape a mano donde no hay showModal (jsdom). */
  function alTecla(evento: KeyboardEvent<HTMLDialogElement>) {
    if (evento.key !== 'Escape' || typeof ref.current?.showModal === 'function') return
    evento.preventDefault()
    if (!bloqueadoRef.current) cerrarRef.current()
  }

  return { ref, idTitulo: `${id}-titulo`, idDescripcion: `${id}-descripcion`, alCancelar, alCerrarNativo, alTecla, esSuperior }
}
