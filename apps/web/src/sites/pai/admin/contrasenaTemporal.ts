/**
 * Generador de contraseñas temporales para las cuentas nuevas o
 * restablecidas (probado en usuarios.test.tsx). Usa el generador
 * criptográfico del navegador y un alfabeto sin caracteres que se confunden
 * al dictarlos o copiarlos a mano (0/O, 1/l/I).
 */
import { LIMITES_PAI } from '../api-pai'

export const ALFABETO_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Longitud por defecto: holgada sobre el mínimo de 12. */
export const LONGITUD_TEMPORAL = 16

export function generarContrasenaTemporal(
  longitud = LONGITUD_TEMPORAL,
  aleatorio: (destino: Uint32Array<ArrayBuffer>) => void = (destino) => {
    crypto.getRandomValues(destino)
  },
): string {
  const largo = Math.max(LIMITES_PAI.minContrasena, longitud)
  const valores = new Uint32Array(largo)
  aleatorio(valores)
  // 2^32 no es múltiplo del alfabeto: se descartan los valores del último tramo incompleto.
  const limite = Math.floor(0x1_0000_0000 / ALFABETO_TEMPORAL.length) * ALFABETO_TEMPORAL.length
  let resultado = ''
  let i = 0
  while (resultado.length < largo) {
    if (i >= valores.length) {
      aleatorio(valores)
      i = 0
    }
    const valor = valores[i++]
    if (valor < limite) resultado += ALFABETO_TEMPORAL[valor % ALFABETO_TEMPORAL.length]
  }
  return resultado
}
