/**
 * Avisa antes de perder cambios sin guardar (registro de cambiosPendientes.ts):
 * - al salir a otra página de la rama por un enlace, con Atrás o Adelante
 *   (también el gesto del trackpad o el botón de Android): useBlocker
 *   detiene la navegación y pregunta (Seguir editando / Salir sin guardar);
 * - al recargar, cerrar la pestaña o salir del sitio: beforeunload (el
 *   navegador muestra su propio aviso), solo mientras haya cambios.
 * Los cambios de la consulta en la misma página (filtros del tablero) no se
 * detienen: no desmontan lo que se está editando. Una navegación con el
 * estado ESTADO_SIN_GUARDIA (p. ej., la del cierre de sesión ya confirmado)
 * tampoco.
 */
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'
import { esSinGuardia, useRegistroCambios } from './cambiosPendientes'
import ModalPai from './ModalPai'

export default function GuardiaCambios() {
  const registro = useRegistroCambios()
  const hay = useSyncExternalStore(registro.suscribir, registro.hay)
  const idAviso = useId()
  const refSeguir = useRef<HTMLButtonElement>(null)

  const debeDetener = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      registro.hay() && currentLocation.pathname !== nextLocation.pathname && !esSinGuardia(nextLocation.state),
    [registro],
  )
  const bloqueador = useBlocker(debeDetener)

  useEffect(() => {
    if (!hay) return
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
      // Navegadores antiguos: hace falta asignar returnValue.
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [hay])

  const detenido = bloqueador.state === 'blocked'
  return (
    <ModalPai
      abierto={detenido}
      titulo="Hay cambios sin guardar"
      rol="alertdialog"
      idDescripcion={idAviso}
      onCerrar={() => bloqueador.reset?.()}
      enfoqueInicial={refSeguir}
      pie={
        <>
          <button ref={refSeguir} type="button" className="btn btn-primary" onClick={() => bloqueador.reset?.()}>
            Seguir editando
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={() => bloqueador.proceed?.()}>
            Salir sin guardar
          </button>
        </>
      }
    >
      <p id={idAviso} className="mb-0">
        Si sale de esta página ahora, se perderán los cambios que no ha guardado.
      </p>
    </ModalPai>
  )
}
