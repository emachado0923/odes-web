import { useCallback, useState, useSyncExternalStore } from 'react'

const CONSULTA = '(prefers-reduced-motion: reduce)'

function consulta(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA) : null
}

function suscribir(avisar: () => void): () => void {
  const lista = consulta()
  if (!lista || typeof lista.addEventListener !== 'function') return () => {}
  lista.addEventListener('change', avisar)
  return () => lista.removeEventListener('change', avisar)
}

/**
 * true si la persona pidió «reducir movimiento» en su sistema. A diferencia de
 * prefiereMenosMovimiento() (contexto-citas.ts), sigue el cambio con la
 * página abierta.
 */
export function useMenosMovimiento(): boolean {
  return useSyncExternalStore(suscribir, () => consulta()?.matches ?? false)
}

const CLAVE_PAUSA = 'odes:animaciones-pausadas'

function leerPausa(): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE_PAUSA) === '1'
  } catch {
    return false
  }
}

/**
 * Pausa de las animaciones elegida con BotonPausa. Se recuerda en la pestaña
 * (sessionStorage), así quien pausó en la pantalla de ingreso no tiene que
 * volver a hacerlo en el chat.
 */
export function usePausaAnimaciones(): [boolean, (pausado: boolean) => void] {
  const [pausado, setPausado] = useState(leerPausa)
  const cambiar = useCallback((valor: boolean) => {
    setPausado(valor)
    try {
      if (valor) window.sessionStorage.setItem(CLAVE_PAUSA, '1')
      else window.sessionStorage.removeItem(CLAVE_PAUSA)
    } catch {
      // Sin almacenamiento la pausa vale solo para esta página.
    }
  }, [])
  return [pausado, cambiar]
}
