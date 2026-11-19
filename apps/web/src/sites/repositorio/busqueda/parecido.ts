/**
 * Parecido entre una palabra buscada y una palabra del texto (búsqueda
 * difusa), portado 1:1 del bloque v4.2.
 *
 * Compara palabra por palabra, sin tildes ni mayúsculas (ver texto.ts), y
 * acepta errores de escritura: una letra de diferencia en palabras de 4 o 5
 * letras y dos en las más largas (letra de más, de menos, cambiada o dos
 * letras al revés: distancia OSA). Con dos errores la primera letra debe
 * coincidir. También sirven las palabras a medio escribir ("permanen") y los
 * pedazos de palabra ("secundaria" en "postsecundaria"). Los números solo
 * cuentan completos o al comienzo de una palabra: "21" no encuentra "2021".
 */

/**
 * Distancia OSA (Damerau–Levenshtein restringida): cuántas letras hay que
 * agregar, quitar, cambiar o voltear para pasar de `a` a `b`. Deja de contar
 * al pasar de `max` (devuelve max + 1).
 */
export function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let antes: number[] = []
  let previa: number[] = []
  for (let j = 0; j <= b.length; j++) previa.push(j)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    let menor = i
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(
        previa[j] + 1,
        fila[j - 1] + 1,
        previa[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1),
      )
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        v = Math.min(v, antes[j - 2] + 1)
      }
      fila.push(v)
      if (v < menor) menor = v
    }
    if (menor > max) return max + 1
    antes = previa
    previa = fila
  }
  return previa[b.length]
}

const RE_NUMERO = /^\d+$/
const RE_DIGITO = /\d/

/** Qué tanto se parece la palabra buscada `p` a la palabra del texto `w`: 1 igual, 0 nada. */
export function calcularParecido(p: string, w: string): number {
  if (p === w) return 1
  const numero = RE_NUMERO.test(p)
  if (w.indexOf(p) === 0) return numero || p.length > 2 ? 0.9 : 0.6
  if (numero || RE_DIGITO.test(w)) return 0
  if (p.length > 2 && w.indexOf(p) > 0) return 0.7
  const max = p.length < 4 ? 0 : p.length < 6 ? 1 : 2
  if (!max) return 0
  const d = distancia(p, w, max)
  // Con dos errores la primera letra debe coincidir ("insercion" no es "desercion").
  if (d <= max && (d === 1 || p.charAt(0) === w.charAt(0))) return 0.8 - 0.15 * d
  // Palabra a medio escribir con un error: se compara con el comienzo de la del texto.
  if (p.length > 4 && w.length > p.length) {
    for (let largo = p.length - 1; largo <= p.length + 1; largo++) {
      if (distancia(p, w.slice(0, largo), 1) <= 1) return 0.4
    }
  }
  return 0
}

/** Máximo de pares guardados; al llenarse, la memoria se vacía (igual que el bloque). */
const MAXIMO_MEMORIA = 40000
let memoria = new Map<string, number>()

/** calcularParecido con memoria: cada par (búsqueda, palabra) se calcula una sola vez. */
export function parecido(p: string, w: string): number {
  const clave = `${p} ${w}`
  let valor = memoria.get(clave)
  if (valor === undefined) {
    if (memoria.size >= MAXIMO_MEMORIA) memoria = new Map()
    valor = calcularParecido(p, w)
    memoria.set(clave, valor)
  }
  return valor
}
