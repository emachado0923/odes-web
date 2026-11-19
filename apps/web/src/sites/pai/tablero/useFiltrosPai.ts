/**
 * Filtros del tablero en la URL (patrón de repositorio/filtros/useEstadoUrl):
 *
 * - El estado vive en React (el campo de búsqueda responde sin esperar al
 *   router) y cada cambio se copia a la URL con `replace`: el enlace se puede
 *   compartir y, al volver de una ficha con Atrás, los filtros siguen ahí, sin
 *   una entrada de historial por tecla.
 * - Si la URL cambia por fuera (Atrás/Adelante, el enlace del seguimiento),
 *   el estado se vuelve a leer de ella.
 * - Los valores desconocidos se ignoran (leerFiltros): primero solo por su
 *   forma y, cuando llega el tablero, también contra sus datos.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FiltrosTableroPai, TableroPai } from '../api-pai'
import { escribirFiltros, igualesFiltros, leerFiltros } from './filtros'

export function useFiltrosPai(
  tablero: TableroPai | null,
): [FiltrosTableroPai, (filtros: FiltrosTableroPai) => void] {
  const [parametros, setParametros] = useSearchParams()
  const [filtros, setFiltrosEstado] = useState<FiltrosTableroPai>(() => leerFiltros(parametros, tablero ?? undefined))
  const escrita = useRef(parametros.toString())
  const actual = parametros.toString()

  // URL -> estado, cuando cambió por fuera.
  useEffect(() => {
    if (actual === escrita.current) return
    escrita.current = actual
    setFiltrosEstado(leerFiltros(new URLSearchParams(actual), tablero ?? undefined))
  }, [actual, tablero])

  // Llegó (o cambió) el tablero: descartar los valores que no existen en él
  // (ajuste durante el render, sin un efecto que vuelva a renderizar).
  const [tableroVisto, setTableroVisto] = useState(tablero)
  if (tablero !== tableroVisto) {
    setTableroVisto(tablero)
    if (tablero) {
      const validos = leerFiltros(escribirFiltros(filtros), tablero)
      if (!igualesFiltros(filtros, validos)) setFiltrosEstado(validos)
    }
  }

  // Estado -> URL. Solo cuando cambian los filtros: setParametros cambia de
  // identidad con cada cambio de la URL, y si fuera dependencia este efecto
  // correría con los filtros viejos justo después de Atrás o de un enlace y
  // volvería a escribir la URL anterior (dos navegaciones de más).
  const fijarParametros = useRef(setParametros)
  useEffect(() => {
    fijarParametros.current = setParametros
  }, [setParametros])
  useEffect(() => {
    const siguiente = escribirFiltros(filtros, new URLSearchParams(escrita.current))
    const texto = siguiente.toString()
    if (texto === escrita.current) return
    escrita.current = texto
    fijarParametros.current(siguiente, { replace: true, preventScrollReset: true })
  }, [filtros])

  const setFiltros = useCallback((siguientes: FiltrosTableroPai) => setFiltrosEstado(siguientes), [])
  return [filtros, setFiltros]
}
