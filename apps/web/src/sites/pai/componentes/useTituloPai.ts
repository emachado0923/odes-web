import { useEffect } from 'react'
import { NOMBRE_PAI } from '../rutas'

/** Título de la pestaña: "Tablero · Plan de Acción Institucional · Sapiencia". */
export function tituloPai(pagina?: string): string {
  return [pagina, NOMBRE_PAI, 'Sapiencia'].filter(Boolean).join(' · ')
}

/**
 * Pone el título de la pestaña mientras la página está montada. Cada página
 * del PAI lo llama una vez (el sitio no pone uno propio, para no pisarlo).
 */
export function useTituloPai(pagina?: string): void {
  useEffect(() => {
    const anterior = document.title
    document.title = tituloPai(pagina)
    return () => {
      document.title = anterior
    }
  }, [pagina])
}
