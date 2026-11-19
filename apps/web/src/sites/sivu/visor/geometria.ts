/**
 * Matemática pura del visor, extraída de script.js original (sin three.js ni
 * DOM) para poder probarla con Vitest. Mismas constantes y mismas fórmulas.
 */

/** Punto o vector 3D sencillo. */
export interface Punto3 {
  x: number
  y: number
  z: number
}

/* =========================================================
   CONSTANTES (idénticas al original)
========================================================= */

/** Margen extra de protegerCamara: 3,5 % del lado mayor (X/Z) del edificio. */
export const MARGEN_SEGURIDAD = 0.035

/** Enfoque de la puerta (doble clic). */
export const DISTANCIA_ENFOQUE_PUERTA = 4
export const ALTURA_ENFOQUE_PUERTA = 0.45
export const SUAVIZADO_ENFOQUE_PUERTA = 0.035
export const UMBRAL_LLEGADA_PUERTA = 0.03

/* =========================================================
   PROTEGER CÁMARA
========================================================= */

/**
 * Radio horizontal mínimo (respecto al centro del edificio) en la dirección
 * (dx, dz): la fórmula 1 / (|cos| / radioX + |sen| / radioZ) del original más
 * el margen del 3,5 %.
 */
export function calcularRadioSeguro(dx: number, dz: number, tamañoX: number, tamañoZ: number): number {
  const radioX = tamañoX / 2
  const radioZ = tamañoZ / 2

  const angulo = Math.atan2(dz, dx)
  const coseno = Math.abs(Math.cos(angulo))
  const seno = Math.abs(Math.sin(angulo))

  let radioSeguro: number

  if (coseno > 0.001 || seno > 0.001) {
    radioSeguro = 1 / (coseno / Math.max(radioX, 0.001) + seno / Math.max(radioZ, 0.001))
  } else {
    radioSeguro = Math.max(radioX, radioZ)
  }

  radioSeguro += Math.max(tamañoX, tamañoZ) * MARGEN_SEGURIDAD

  return radioSeguro
}

/**
 * Paso "sacar cámara del edificio" de protegerCamara. Recibe la posición
 * horizontal de la cámara relativa al centro del edificio y devuelve la nueva
 * (también relativa), o null si la cámara ya está fuera del radio seguro.
 */
export function corregirPosicionHorizontal(
  dx: number,
  dz: number,
  tamañoX: number,
  tamañoZ: number,
): { x: number; z: number } | null {
  const distanciaHorizontal = Math.sqrt(dx * dx + dz * dz)
  const radioSeguro = calcularRadioSeguro(dx, dz, tamañoX, tamañoZ)

  if (distanciaHorizontal >= radioSeguro) return null

  if (distanciaHorizontal > 0.001) {
    const factor = radioSeguro / distanciaHorizontal
    return { x: dx * factor, z: dz * factor }
  }

  return { x: radioSeguro, z: 0 }
}

/* =========================================================
   PUERTA
========================================================= */

/**
 * Elige el frente de la puerta: de sus ejes locales X y Z (ya en el mundo),
 * el más alineado con la dirección "hacia afuera" del edificio, apuntando
 * hacia afuera, aplanado (y = 0) y normalizado (como Vector3.normalize de
 * three.js: un vector nulo queda nulo).
 */
export function elegirDireccionPuerta(normalX: Punto3, normalZ: Punto3, haciaAfuera: Punto3): Punto3 {
  const punto = (a: Punto3, b: Punto3) => a.x * b.x + a.y * b.y + a.z * b.z

  const elegido = Math.abs(punto(normalX, haciaAfuera)) > Math.abs(punto(normalZ, haciaAfuera)) ? normalX : normalZ

  let direccion = { x: elegido.x, y: elegido.y, z: elegido.z }

  if (punto(direccion, haciaAfuera) < 0) {
    direccion = { x: -direccion.x, y: -direccion.y, z: -direccion.z }
  }

  direccion.y = 0

  const longitud = Math.sqrt(direccion.x * direccion.x + direccion.z * direccion.z) || 1

  return { x: direccion.x / longitud, y: 0, z: direccion.z / longitud }
}

/**
 * Distancia de la cámara inicial a la puerta: suficiente para ver la entrada
 * completa (4 × el ancho de la puerta), al menos 25 % del edificio y acotada
 * entre 18 % y 40 % del lado mayor.
 */
export function calcularDistanciaEntrada(mayor: number, tamañoPuertaX: number, tamañoPuertaZ: number): number {
  const distanciaPorPuerta = Math.max(tamañoPuertaX, tamañoPuertaZ) * 4.0
  const distanciaPorEdificio = mayor * 0.25

  let distanciaEntrada = Math.max(distanciaPorPuerta, distanciaPorEdificio)
  distanciaEntrada = Math.min(distanciaEntrada, mayor * 0.4)
  distanciaEntrada = Math.max(distanciaEntrada, mayor * 0.18)

  return distanciaEntrada
}

/* =========================================================
   NORMALIZACIÓN POR TIEMPO
========================================================= */

/**
 * Convierte un factor de interpolación "por fotograma" (pensado para 60 fps)
 * al equivalente para `fotogramas` fotogramas de 60 fps: 1 − (1 − f)^n.
 * Con n = 1 devuelve exactamente el factor original.
 */
export function factorPorFotogramas(factor: number, fotogramas: number): number {
  if (fotogramas === 1) return factor
  return 1 - Math.pow(1 - factor, fotogramas)
}
