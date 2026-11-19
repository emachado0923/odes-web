import { useCallback, useEffect, useState } from 'react'
import type { ListadoPublico } from '../api-repositorio'
import { FalloListado, obtenerListado } from './cliente'

export type EstadoListado =
  | { fase: 'cargando'; intento: number }
  | { fase: 'listo'; intento: number; listado: ListadoPublico }
  | { fase: 'error'; intento: number; fallo: FalloListado }

/**
 * Carga el listado público al montar la página y cada vez que se llama a
 * `reintentar`. Cancela la petición en curso al desmontar o al reintentar.
 */
export function useListado(): { estado: EstadoListado; reintentar: () => void } {
  const [estado, setEstado] = useState<EstadoListado>({ fase: 'cargando', intento: 0 })
  const intento = estado.intento

  useEffect(() => {
    const control = new AbortController()
    obtenerListado(control.signal).then(
      (listado) => {
        if (!control.signal.aborted) setEstado({ fase: 'listo', intento, listado })
      },
      (error: unknown) => {
        if (control.signal.aborted) return
        const fallo =
          error instanceof FalloListado ? error : new FalloListado('datos', 'No se pudieron leer los documentos.')
        if (!(error instanceof FalloListado)) console.error('[Repositorio] Error al cargar los documentos:', error)
        setEstado({ fase: 'error', intento, fallo })
      },
    )
    return () => control.abort()
  }, [intento])

  const reintentar = useCallback(() => {
    setEstado((actual) => ({ fase: 'cargando', intento: actual.intento + 1 }))
  }, [])

  return { estado, reintentar }
}
