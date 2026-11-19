/**
 * De dónde salen los datos de la ventanilla. 'carga': las fichas cargadas del Power BI, con fecha de corte
 * (CORTE_DATOS). 'sapiencia': en vivo desde la base de Sapiencia (FONDOS_CONSULTA_ORIGEN=sapiencia en el
 * servidor). La pantalla lo pregunta al abrir y cada pieza toma de aquí sus textos sobre el corte.
 */
import { createContext, useContext } from 'react'
import { CORTE_DATOS } from './ficha'

export type OrigenDatos = 'carga' | 'sapiencia'

export const OrigenDatosContexto = createContext<OrigenDatos>('carga')

export interface TextosOrigen {
  /** Aviso bajo el buscador. */
  aviso: string
  /** Complemento del total girado: «…, según el corte del 9 de noviembre de 2026». */
  segun: string
  /** Punto a revisar cuando un documento no tiene beneficios. */
  sinResultados: string
}

export function textosOrigen(origen: OrigenDatos): TextosOrigen {
  if (origen === 'sapiencia') {
    return {
      aviso: 'Datos en vivo de la base de Sapiencia.',
      segun: 'según la base de Sapiencia en este momento',
      sinResultados: 'La consulta es en vivo: si el beneficio se registró en la base de Sapiencia, ya debería aparecer.',
    }
  }
  return {
    aviso: `Información con corte al ${CORTE_DATOS}.`,
    segun: `según el corte del ${CORTE_DATOS}`,
    sinResultados: `La información tiene corte al ${CORTE_DATOS}: lo registrado después todavía no aparece.`,
  }
}

export const useTextosOrigen = (): TextosOrigen => textosOrigen(useContext(OrigenDatosContexto))
