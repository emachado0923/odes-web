/**
 * Utilidades de texto de la búsqueda difusa, portadas 1:1 del bloque de
 * WordPress v4.2 (Septiembre/observatorio/repositorio/repositorio-bloque.html).
 * Si cambias algo aquí, cambia el comportamiento de la búsqueda: las pruebas
 * de busqueda.test.ts comparan con los resultados del bloque.
 */

/**
 * Minúsculas, sin tildes y sin puntuación: "S. F." = "s.f." = "sf",
 * "N.º 28" = "n 28".
 */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bs f\b/g, 'sf')
    .trim()
}

const COLADOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/** Orden alfabético en español, sin distinguir tildes ni mayúsculas, con números naturales. */
export function comparar(a: string, b: string): number {
  return COLADOR.compare(a, b)
}

/**
 * Palabras vacías: no cuentan en una búsqueda (salvo que solo haya de esas).
 * Se busca " palabra " dentro de la cadena, igual que el bloque.
 */
const VACIAS = ' a al con de del e el en la las lo los o para por que se sobre su sus u un una y '

export function esVacia(palabra: string): boolean {
  return VACIAS.includes(` ${palabra} `)
}

/** Palabras normalizadas de un texto. */
export function palabras(texto: unknown): string[] {
  const t = normalizar(texto)
  return t ? t.split(' ') : []
}

/** Palabras de una búsqueda, sin las vacías (de, la, y...) salvo que solo haya de esas. */
export function terminos(texto: unknown): string[] {
  const todas = palabras(texto)
  const utiles = todas.filter((p) => !esVacia(p))
  return utiles.length ? utiles : todas
}

/**
 * Palabras de un texto más cada par de palabras seguidas unidas:
 * "post secundaria" también es "postsecundaria".
 */
export function fichas(texto: unknown): string[] {
  const ps = palabras(texto)
  for (let i = 0, n = ps.length; i + 1 < n; i++) {
    if (!esVacia(ps[i]) && !esVacia(ps[i + 1])) ps.push(ps[i] + ps[i + 1])
  }
  return ps
}

const RE_PARTES = /[0-9A-Za-z\u00C0-\u024F]+|[^0-9A-Za-z\u00C0-\u024F\s]+/g
const RE_MAYUSCULA = /[A-Z\u00C0-\u00DE]/

/**
 * Siglas de los nombres de varias palabras en mayúscula:
 * "Objetivo de Desarrollo Sostenible" también es "ods". Las palabras vacías
 * en minúscula no cortan la sigla; solo cuentan las de 3 letras o más.
 */
export function siglas(texto: unknown): string[] {
  const lista: string[] = []
  let actual = ''
  for (const parte of String(texto ?? '').match(RE_PARTES) ?? []) {
    if (RE_MAYUSCULA.test(parte.charAt(0))) {
      actual += parte.charAt(0)
      continue
    }
    if (esVacia(normalizar(parte))) continue
    if (actual.length > 2) lista.push(normalizar(actual))
    actual = ''
  }
  if (actual.length > 2) lista.push(normalizar(actual))
  return lista
}
