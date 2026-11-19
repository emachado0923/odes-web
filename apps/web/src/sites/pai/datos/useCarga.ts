import { use, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ContextoSesionPai } from '../sesion/contexto'
import { esAborto, esErrorPai, mensajeDe } from './errores'

export type EstadoCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string; error: unknown }
  | { fase: 'listo'; datos: T }

/**
 * Carga datos con `cargar(signal)` al montar y cada vez que cambia `clave`.
 * Cancela la petición anterior. `setDatos` cambia los datos ya cargados (p.
 * ej., la fila de un indicador después de guardar) sin volver a pedirlos.
 * Si la carga falló porque la sesión venció (401), se repite sola cuando el
 * usuario vuelve a iniciar sesión (generacion de la sesión); lo que ya cargó
 * bien no se vuelve a pedir (la página, con lo que tenía, sigue igual).
 * (Parecido a repositorio/admin/datos/useCarga.ts.)
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
  const generacion = use(ContextoSesionPai)?.generacion ?? 0
  const [generacionVista, setGeneracionVista] = useState(generacion)

  // Volvió a iniciar sesión: se repite la carga que falló por la sesión vencida.
  if (generacion !== generacionVista) {
    setGeneracionVista(generacion)
    if (estado.fase === 'error' && esErrorPai(estado.error) && estado.error.estado === 401) setIntento((n) => n + 1)
  }

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
