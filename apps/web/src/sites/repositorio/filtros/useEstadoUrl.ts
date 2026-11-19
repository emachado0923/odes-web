import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router'
import { escribirEstado, leerEstado, validarSeleccion, type EstadoFiltros, type NombreFaceta } from './estado'

/**
 * Estado de la búsqueda y los filtros, reflejado en la URL.
 *
 * - El estado vive en React (el campo de texto responde sin esperar al
 *   router) y cada cambio se copia a la URL con `replace`: el enlace se puede
 *   compartir y, al volver con Atrás desde un documento, la búsqueda sigue ahí,
 *   sin llenar el historial con una entrada por tecla.
 * - Si la URL cambia por fuera (Atrás/Adelante dentro de la página, un enlace),
 *   el estado se vuelve a leer de ella.
 * - Los valores de la URL que no existen en los datos se ignoran.
 */
export function useEstadoUrl(
  existentes: Record<NombreFaceta, ReadonlySet<string>>,
): [EstadoFiltros, Dispatch<SetStateAction<EstadoFiltros>>] {
  const [parametros, setParametros] = useSearchParams()
  const leer = useCallback(
    (p: URLSearchParams): EstadoFiltros => {
      const estado = leerEstado(p)
      return { ...estado, seleccion: validarSeleccion(estado.seleccion, existentes) }
    },
    [existentes],
  )
  const [estado, setEstado] = useState(() => leer(parametros))
  const escrita = useRef(parametros.toString())

  // URL -> estado, cuando cambió por fuera.
  const actual = parametros.toString()
  useEffect(() => {
    if (actual === escrita.current) return
    escrita.current = actual
    setEstado(leer(new URLSearchParams(actual)))
  }, [actual, leer])

  // Estado -> URL.
  useEffect(() => {
    const siguiente = escribirEstado(estado, new URLSearchParams(escrita.current))
    const texto = siguiente.toString()
    if (texto === escrita.current) return
    escrita.current = texto
    setParametros(siguiente, { replace: true, preventScrollReset: true })
  }, [estado, setParametros])

  return [estado, setEstado]
}
