/** Textos derivados que se muestran en el chat (páginas, metadatos, esperas). */
import type { DocumentoResumen } from './protocolo'

/** "pág. 5", "págs. 5–7" o '' si no hay página (tableros, fichas de solo metadatos). */
export function textoPaginas(inicio: number | null, fin: number | null): string {
  if (inicio === null) return ''
  if (fin === null || fin <= inicio) return `pág. ${inicio}`
  return `págs. ${inicio}–${fin}`
}

/** "Boletín · 2024 · pág. 5": categoría, año y páginas, omitiendo lo que falte. */
export function metadatosDocumento(
  documento: Pick<DocumentoResumen, 'categoria' | 'anio'>,
  inicio: number | null = null,
  fin: number | null = null,
): string {
  return [documento.categoria, documento.anio, textoPaginas(inicio, fin)].filter((parte) => parte !== '').join(' · ')
}

/** Espera legible a partir de milisegundos: "unos segundos", "30 segundos", "1 minuto", "5 minutos". */
export function describirEspera(ms: number): string {
  const segundos = Math.ceil(ms / 1000)
  if (segundos <= 5) return 'unos segundos'
  if (segundos < 60) return `${segundos} segundos`
  const minutos = Math.ceil(segundos / 60)
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`
}
