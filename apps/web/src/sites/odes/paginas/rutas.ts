/** Rutas de las páginas de la rama ODES (ver OdesSitio.tsx). */

/** Pantalla de ingreso «¡Pregúntale a OdeS!». */
export const RUTA_INGRESO = '/odes'

/** Chat del asistente; se llega con el botón «Ingresar». */
export const RUTA_CHAT_ODES = '/odes/chat'

/** Estado de navegación que deja «Ingresar» para que el chat enfoque su campo. */
export interface EstadoDesdeIngreso {
  desdeIngreso: true
}

export function vieneDelIngreso(estado: unknown): estado is EstadoDesdeIngreso {
  return typeof estado === 'object' && estado !== null && (estado as Partial<EstadoDesdeIngreso>).desdeIngreso === true
}
