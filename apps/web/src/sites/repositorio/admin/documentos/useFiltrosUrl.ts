import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { escribirFiltros, leerFiltros, type FiltrosAdmin } from './listado'

/**
 * Filtros del listado reflejados en la URL (con `replace`), como en la página
 * pública: al volver de editar un documento, la búsqueda y la página siguen
 * ahí. El estado vive en React para que el buscador responda sin esperar al
 * router; si la URL cambia por fuera (Atrás, un enlace), se vuelve a leer.
 *
 * `cambiar` vuelve a la página 1 salvo que el cambio sea la página misma.
 */
export function useFiltrosUrl(): [FiltrosAdmin, (cambio: Partial<FiltrosAdmin>) => void] {
  const [parametros, setParametros] = useSearchParams()
  const [filtros, setFiltros] = useState(() => leerFiltros(parametros))
  const escrita = useRef(escribirFiltros(leerFiltros(parametros)).toString())

  const actual = parametros.toString()
  useEffect(() => {
    if (actual === escrita.current) return
    escrita.current = actual
    setFiltros(leerFiltros(new URLSearchParams(actual)))
  }, [actual])

  useEffect(() => {
    const texto = escribirFiltros(filtros).toString()
    if (texto === escrita.current) return
    escrita.current = texto
    setParametros(new URLSearchParams(texto), { replace: true, preventScrollReset: true })
  }, [filtros, setParametros])

  const cambiar = useCallback((cambio: Partial<FiltrosAdmin>) => {
    setFiltros((f) => ({ ...f, pagina: 1, ...cambio }))
  }, [])

  return [filtros, cambiar]
}
