/**
 * Título de la pestaña del navegador. CrmSitio pinta un solo <title> (React
 * 19 lo sube al <head>); cada página dice el suyo con useTituloCrm y vuelve al
 * de la rama al salir. Así nunca quedan dos <title> a la vez.
 *
 *   useTituloCrm('Tablero de Ana')  →  «Tablero de Ana · Tareas de la Oficina de Planeación»
 */
import { createContext, use, useEffect } from 'react'

export const TITULO_CRM = 'Tareas de la Oficina de Planeación'

export const ContextoTituloCrm = createContext<(titulo: string | null) => void>(() => {})

export function tituloDocumento(titulo: string | null): string {
  return titulo ? `${titulo} · ${TITULO_CRM}` : TITULO_CRM
}

export function useTituloCrm(titulo: string | null | undefined): void {
  const poner = use(ContextoTituloCrm)
  const valor = titulo?.trim() || null
  useEffect(() => {
    poner(valor)
    return () => poner(null)
  }, [poner, valor])
}
