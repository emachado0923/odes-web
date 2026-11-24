/**
 * Colores de las personas: el círculo de cada una sale de la paleta de
 * Sapiencia (azul, azul hondo, magenta, cian y sus tintes; sin los colores de
 * estado, que significan otra cosa) y se elige por su id, así que es siempre
 * el mismo. Ocho variantes alternadas, llenas y suaves: con ids seguidos, el
 * equipo de ocho no repite color.
 *
 * Contraste de las iniciales sobre su fondo (WCAG): todas 5:1 o más.
 */
export interface ColorPersona {
  /** Fondo del círculo. */
  fondo: string
  /** Iniciales. */
  texto: string
  /** Aro al pasar o enfocar la tarjeta de la persona. */
  anillo: string
}

export const COLORES_PERSONA: readonly ColorPersona[] = [
  { fondo: '#0E5074', texto: '#FFFFFF', anillo: '#0E5074' }, // azul (8,7:1)
  { fondo: '#CEEDF9', texto: '#0B3A56', anillo: '#3AB6E6' }, // cian suave (9,8:1)
  { fondo: '#921C8D', texto: '#FFFFFF', anillo: '#921C8D' }, // magenta (7,6:1)
  { fondo: '#D8E3E9', texto: '#0E5074', anillo: '#0E5074' }, // azul suave (6,7:1)
  { fondo: '#3AB6E6', texto: '#0B3A56', anillo: '#3AB6E6' }, // cian (5,1:1)
  { fondo: '#EEDBED', texto: '#921C8D', anillo: '#921C8D' }, // magenta suave (5,8:1)
  { fondo: '#0B3A56', texto: '#C4E9F8', anillo: '#0B3A56' }, // azul hondo (9,3:1)
  { fondo: '#D3A4D1', texto: '#17313F', anillo: '#921C8D' }, // magenta medio (6,5:1)
]

/** Color de la persona con este id (cualquier entero, también negativo). */
export function colorPersona(semilla: number): ColorPersona {
  const n = COLORES_PERSONA.length
  const i = ((Math.trunc(semilla) % n) + n) % n
  return COLORES_PERSONA[Number.isFinite(i) ? i : 0]
}
