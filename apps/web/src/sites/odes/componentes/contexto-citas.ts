import { createContext } from 'react'
import type { Fuente } from '../chat/conversacion'

/** Lo que necesita cada número volado de una respuesta para enlazar con su fuente. */
export interface ValorContextoCitas {
  idRespuesta: string
  fuentes: ReadonlyMap<number, Fuente>
  /** Lleva el foco a la fuente n de la lista "Fuentes" y despliega su texto citado. */
  irAFuente: (indice: number) => void
}

export const ContextoCitas = createContext<ValorContextoCitas | null>(null)

/** id del elemento de la lista "Fuentes" para la fuente n de una respuesta. */
export function idFuente(idRespuesta: string, indice: number): string {
  return `odes-fuente-${idRespuesta}-${indice}`
}

/** true si la persona pidió menos movimiento (desplazamientos sin animación). */
export function prefiereMenosMovimiento(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
