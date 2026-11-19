/**
 * Estados de un beneficio: las nueve categorías del tablero de los fondos
 * (apps/server/datos/tableros/fondos-2026/etl_fondos.py, MAPA_ESTADO) con los
 * mismos colores (TableroFondos.tsx, COLOR_ESTADO). Las bases escriben el
 * estado de muchas formas («SUSPENSION TEMPORAL», «COBRO DEL 100%»…): aquí se
 * agrupan para pintar igual lo que significa lo mismo.
 */

export const CATEGORIAS_ESTADO = [
  'Activo',
  'Suspensión',
  'Finalizó los giros',
  'Graduado',
  'Periodo de gracia',
  'Proceso de consolidación',
  'Cobro o condonación (PACC)',
  'Desertor',
  'Terminación o cancelación',
  'Sin dato',
] as const

export type CategoriaEstado = (typeof CATEGORIAS_ESTADO)[number]

export interface ColorEstado {
  /** Color pleno, el mismo del tablero. */
  color: string
  /** Texto legible sobre el color pleno. */
  sobre: string
  /** Fondo tenue para chips y celdas. */
  suave: string
  /** Tono oscuro, legible (4,5:1 o más) sobre blanco y sobre `suave`. */
  texto: string
}

export const COLOR_ESTADO: Record<CategoriaEstado, ColorEstado> = {
  Activo: { color: '#0B3A56', sobre: '#FFFFFF', suave: '#E3EBF0', texto: '#0B3A56' },
  Suspensión: { color: '#ED7203', sobre: '#17313F', suave: '#FDEBD9', texto: '#9A4A00' },
  'Finalizó los giros': { color: '#3AB6E6', sobre: '#0B2A3A', suave: '#E1F3FB', texto: '#0B6A93' },
  Graduado: { color: '#2EA14E', sobre: '#0B2A14', suave: '#E0F3E5', texto: '#1B6B33' },
  'Periodo de gracia': { color: '#9B48A4', sobre: '#FFFFFF', suave: '#F2E5F4', texto: '#7A2F83' },
  'Proceso de consolidación': { color: '#CDA3D1', sobre: '#3A1440', suave: '#F6EEF7', texto: '#5E3A63' },
  'Cobro o condonación (PACC)': { color: '#F8DB1B', sobre: '#3D3300', suave: '#FEF8D2', texto: '#6B5900' },
  Desertor: { color: '#C62F2F', sobre: '#FFFFFF', suave: '#F9E1E1', texto: '#A02020' },
  'Terminación o cancelación': { color: '#6B747A', sobre: '#FFFFFF', suave: '#ECEEEF', texto: '#4A5257' },
  'Sin dato': { color: '#B8C2C9', sobre: '#17313F', suave: '#F1F4F6', texto: '#4F5D66' },
}

/** Sin tildes, en mayúsculas y con un solo espacio: para comparar estados y etiquetas. */
export function claveTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const MAPA: Record<string, CategoriaEstado> = {
  ACTIVO: 'Activo',
  'SUSPENSION TEMPORAL': 'Suspensión',
  'SUSPENSION ESPECIAL': 'Suspensión',
  'SUSPENSION VOLUNTARIA': 'Suspensión',
  SUSPENSION: 'Suspensión',
  'PERIODO DE GRACIA': 'Periodo de gracia',
  'EN PERIODO DE GRACIA': 'Periodo de gracia',
  FINALIZACION: 'Finalizó los giros',
  FINALIZA: 'Finalizó los giros',
  // Enlaza Mundos: cada fila es un giro; «NO ACTIVO» es un periodo ya girado y cerrado.
  'NO ACTIVO': 'Finalizó los giros',
  GRADUADO: 'Graduado',
  CONDONADO: 'Cobro o condonación (PACC)',
  NOTIFICADO: 'Cobro o condonación (PACC)',
  DESERTOR: 'Desertor',
  CANCELACION: 'Terminación o cancelación',
  'TERMINACION ESPECIAL': 'Terminación o cancelación',
  'TERMINACION BECA': 'Terminación o cancelación',
  'RENUNCIA A BECA': 'Terminación o cancelación',
  'TERMINACION DEL CREDITO': 'Terminación o cancelación',
  'PROCESO DE CONSOLIDACION': 'Proceso de consolidación',
}

/** Categoría de un estado escrito como venga en la base. */
export function categoriaEstado(texto: string | null | undefined): CategoriaEstado {
  const k = claveTexto(texto ?? '')
  if (!k) return 'Sin dato'
  const exacta = MAPA[k]
  if (exacta) return exacta
  if (k.includes('SUSPEN')) return 'Suspensión'
  if (k.includes('GRACIA')) return 'Periodo de gracia'
  if (k.includes('CONSOLID')) return 'Proceso de consolidación'
  if (k.includes('CONDON') || k.includes('COBRO') || k.includes('NOTIFIC') || k.includes('ACTO EN FIRME')) return 'Cobro o condonación (PACC)'
  if (k.includes('GRADU')) return 'Graduado'
  if (k.includes('DESERT')) return 'Desertor'
  if (k.includes('TERMINA') || k.includes('CANCEL') || k.includes('RENUNCIA')) return 'Terminación o cancelación'
  if (k.includes('FINALIZ')) return 'Finalizó los giros'
  if (k.startsWith('ACTIV')) return 'Activo'
  return 'Sin dato'
}

const LEGIBLE: Record<string, string> = {
  'SUSPENSION TEMPORAL': 'Suspensión temporal',
  'SUSPENSION ESPECIAL': 'Suspensión especial',
  'SUSPENSION VOLUNTARIA': 'Suspensión voluntaria',
  SUSPENSION: 'Suspensión',
  FINALIZACION: 'Finalización',
  FINALIZA: 'Finalización',
  CANCELACION: 'Cancelación',
  'TERMINACION ESPECIAL': 'Terminación especial',
  'TERMINACION BECA': 'Terminación de la beca',
  'TERMINACION DEL CREDITO': 'Terminación del crédito',
  'RENUNCIA A BECA': 'Renuncia a la beca',
  'PROCESO DE CONSOLIDACION': 'Proceso de consolidación',
  'CONDONACION TOTAL': 'Condonación total',
  'EN PERIODO DE GRACIA': 'Periodo de gracia',
}

/** El estado para leer: «SUSPENSION TEMPORAL» → «Suspensión temporal». No cambia lo que dice la base. */
export function estadoLegible(texto: string | null | undefined): string {
  const limpio = (texto ?? '').replaceAll(/\s+/g, ' ').trim()
  if (!limpio) return 'Sin dato'
  const conocido = LEGIBLE[claveTexto(limpio)]
  if (conocido) return conocido
  return limpio === limpio.toUpperCase() ? limpio.charAt(0) + limpio.slice(1).toLowerCase() : limpio
}
