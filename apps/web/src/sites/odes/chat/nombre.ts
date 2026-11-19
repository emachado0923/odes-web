/**
 * Nombre de la persona y saludo inicial.
 *
 * Privacidad (Ley 1581 de 2012): el nombre solo sirve para saludar en esta
 * pantalla. Se guarda en sessionStorage junto con la conversación (se borra
 * al cerrar la pestaña) y NUNCA se envía al servidor ni a la API: el historial
 * que se manda (conversacion.ts → construirHistorial) solo lleva preguntas y
 * respuestas, no los mensajes de bienvenida.
 */

export const LONGITUD_MAXIMA_NOMBRE = 40

/** Signos que se aceptan dentro de un nombre además de letras: espacio, apóstrofos, guion y punto. */
const FUERA_DE_NOMBRE = /[^\p{L}\p{M} '’.-]/gu
const BORDES = /^[\s'’.-]+|[\s'’.-]+$/gu

/**
 * Limpia lo que la persona escribió como nombre: solo letras (con tildes y
 * de cualquier alfabeto), espacios, apóstrofos, guiones y puntos; espacios
 * repetidos colapsados y como máximo LONGITUD_MAXIMA_NOMBRE caracteres.
 * Devuelve '' si no queda ninguna letra.
 */
export function sanitizarNombre(entrada: string): string {
  const limpio = entrada
    .normalize('NFC')
    .replace(FUERA_DE_NOMBRE, ' ')
    .replace(/\s+/g, ' ')
    .replace(BORDES, '')
  const recortado = Array.from(limpio).slice(0, LONGITUD_MAXIMA_NOMBRE).join('').replace(BORDES, '')
  return /\p{L}/u.test(recortado) ? recortado : ''
}

/** "¡Buenos días!" (5:00–11:59), "¡Buenas tardes!" (12:00–18:59) o "¡Buenas noches!", con la hora local. */
export function saludoPorHora(fecha = new Date()): string {
  const hora = fecha.getHours()
  if (hora >= 5 && hora < 12) return '¡Buenos días!'
  if (hora >= 12 && hora < 19) return '¡Buenas tardes!'
  return '¡Buenas noches!'
}
