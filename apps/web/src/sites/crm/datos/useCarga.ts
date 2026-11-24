/**
 * Carga datos con `cargar(signal)` al montar y cada vez que cambia algún valor
 * de `deps` (comparados con Object.is, como en useEffect).
 *
 * - Cancela la petición anterior al cambiar `deps` y al desmontar: una
 *   respuesta vieja nunca pisa una nueva.
 * - `recargar()` vuelve a pedir con las mismas `deps` y CONSERVA `datos`
 *   mientras carga (y si la recarga falla): el tablero no parpadea.
 * - Al cambiar `deps`, `datos` vuelve a null (no se ve, p. ej., el tablero de
 *   otra persona mientras llega el nuevo), salvo con { conservarAlCambiar:
 *   true }, útil para filtros y búsquedas.
 * - `ponerDatos(actualizar)` cambia los datos ya cargados (p. ej., la tarea
 *   que se acaba de mover) sin volver a pedirlos.
 * - `error` es el último error (úselo con mensajeDe); las cancelaciones no
 *   cuentan como error.
 *
 *   const { estado, datos, error, recargar } = useCarga(
 *     (signal) => apiEquipo.tablero(personaId, todas, signal),
 *     [personaId, todas],
 *   )
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { esCancelacion } from './clienteCrm'

export type EstadoCarga = 'cargando' | 'listo' | 'error'

export interface ResultadoCarga<T> {
  estado: EstadoCarga
  /** Los últimos datos buenos de estas deps (null si todavía no hay). */
  datos: T | null
  error: unknown
  recargar: () => void
  ponerDatos: (actualizar: (anterior: T | null) => T | null) => void
}

export interface OpcionesCarga {
  /** Conservar los datos anteriores mientras cargan los de las deps nuevas. */
  conservarAlCambiar?: boolean
}

interface Interno<T> {
  deps: readonly unknown[]
  /** Sube cada vez que cambian las deps: dispara la carga. */
  version: number
  estado: EstadoCarga
  datos: T | null
  error: unknown
}

function mismasDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((valor, i) => Object.is(valor, b[i]))
}

export function useCarga<T>(
  cargar: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  opciones: OpcionesCarga = {},
): ResultadoCarga<T> {
  const [interno, setInterno] = useState<Interno<T>>(() => ({
    deps,
    version: 0,
    estado: 'cargando',
    datos: null,
    error: null,
  }))
  const [intento, setIntento] = useState(0)

  // Deps nuevas: se ajusta el estado durante el render (patrón de React para
  // derivar de valores anteriores), antes de pintar datos que ya no son.
  let actual = interno
  if (!mismasDeps(interno.deps, deps)) {
    actual = {
      deps,
      version: interno.version + 1,
      estado: 'cargando',
      datos: opciones.conservarAlCambiar ? interno.datos : null,
      error: null,
    }
    setInterno(actual)
  }

  // La función de carga cambia en cada render: se lee la última al cargar.
  const cargarRef = useRef(cargar)
  useEffect(() => {
    cargarRef.current = cargar
  })

  const { version } = actual
  useEffect(() => {
    const control = new AbortController()
    let vigente = true
    cargarRef.current(control.signal).then(
      (datos) => {
        if (vigente) setInterno((previo) => (previo.version === version ? { ...previo, estado: 'listo', datos, error: null } : previo))
      },
      (error: unknown) => {
        if (!vigente || esCancelacion(error)) return
        setInterno((previo) => (previo.version === version ? { ...previo, estado: 'error', error } : previo))
      },
    )
    return () => {
      vigente = false
      control.abort()
    }
  }, [version, intento])

  const recargar = useCallback(() => {
    setInterno((previo) => ({ ...previo, estado: 'cargando', error: null }))
    setIntento((n) => n + 1)
  }, [])

  const ponerDatos = useCallback((actualizar: (anterior: T | null) => T | null) => {
    setInterno((previo) => ({ ...previo, datos: actualizar(previo.datos) }))
  }, [])

  return { estado: actual.estado, datos: actual.datos, error: actual.error, recargar, ponerDatos }
}
