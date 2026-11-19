import type { NombreFaceta } from './estado'

export interface TextosFaceta {
  /** Etiqueta visible sobre el botón. */
  etiqueta: string
  /** Valor del botón sin nada marcado. */
  todas: string
  /** Para lectores de pantalla, después del número de marcadas. */
  marcadas: string
  /** Leyenda (oculta) del grupo de casillas. */
  leyenda: string
  /** Placeholder y nombre del buscador del panel. */
  buscar: string
}

export const TEXTOS_FACETA: Readonly<Record<NombreFaceta, TextosFaceta>> = {
  categoria: { etiqueta: 'Categoría', todas: 'Todas', marcadas: 'seleccionadas', leyenda: 'Categorías', buscar: 'Buscar categoría' },
  anio: { etiqueta: 'Año', todas: 'Todos', marcadas: 'seleccionados', leyenda: 'Años', buscar: 'Buscar año' },
  clave: { etiqueta: 'Palabra clave', todas: 'Todas', marcadas: 'seleccionadas', leyenda: 'Palabras clave', buscar: 'Buscar palabra clave' },
}

/** "N de M documentos coinciden" y variantes (como el bloque). */
export interface Conteo {
  coinciden: number
  total: number
  filtrando: boolean
}

/** Texto del aviso de "Mostrar más". */
export function textoSeMuestran(mostradas: number, coinciden: number): string {
  return `Se muestran ${mostradas} de ${coinciden} documentos.`
}

/** Mensaje del buscador de un panel. */
export function textoOpciones(n: number): string {
  return n ? `${n} ${n === 1 ? 'opción' : 'opciones'}` : 'Ninguna opción coincide.'
}
