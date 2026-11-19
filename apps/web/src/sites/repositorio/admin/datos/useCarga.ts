import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { esAborto, mensajeDe } from './clienteAdmin'

export type EstadoCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string; error: unknown }
  | { fase: 'listo'; datos: T }

/**
 * Carga datos con `cargar(signal)` al montar y cada vez que cambia `clave`.
 * Cancela la petición anterior. `setDatos` cambia los datos ya cargados (p.
 * ej., tras publicar un documento) sin volver a pedirlos.
 */
export function useCarga<T>(
  cargar: (signal: AbortSignal) => Promise<T>,
  clave: string,
): {
  estado: EstadoCarga<T>
  recargar: () => void
  setDatos: Dispatch<SetStateAction<T>>
} {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const control = new AbortController()
    setEstado((previo) => (previo.fase === 'cargando' ? previo : { fase: 'cargando' }))
    cargar(control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setEstado({ fase: 'listo', datos })
      })
      .catch((error: unknown) => {
        if (esAborto(error) || control.signal.aborted) return
        setEstado({ fase: 'error', mensaje: mensajeDe(error), error })
      })
    return () => control.abort()
    // `cargar` cambia en cada render; `clave` dice cuándo hay que volver a pedir.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])
  const setDatos = useCallback<Dispatch<SetStateAction<T>>>((valor) => {
    setEstado((previo) => {
      if (previo.fase !== 'listo') return previo
      const datos = typeof valor === 'function' ? (valor as (anterior: T) => T)(previo.datos) : valor
      return { fase: 'listo', datos }
    })
  }, [])

  return { estado, recargar, setDatos }
}
