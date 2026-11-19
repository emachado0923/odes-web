/**
 * Enlaces que se dibujan en el chat: documentos citados, miniaturas y
 * enlaces del Markdown de las respuestas.
 *
 * Las URL de los documentos las arma el servidor (las copias propias de la
 * rama /repositorio, /api/repositorio/documentos/<id>/ver, o la URL externa
 * de los tableros y entradas). El cliente no las construye: solo comprueba
 * que sean http(s) o relativas antes de ponerlas en un href.
 */

/**
 * Carpeta pública de las miniaturas de los documentos. El indexador las
 * genera en apps/web/public/odes/portadas/<id>.webp y el servidor manda solo
 * el nombre del archivo (DocumentoResumen.portada).
 *
 * Cuando el índice se genera desde la base de la rama /repositorio, el
 * servidor manda además la URL de la miniatura guardada en la base
 * (DocumentoResumen.urlMiniatura, p. ej. /api/repositorio/documentos/<id>/miniatura?v=…),
 * que se prefiere: así también tienen miniatura los documentos agregados
 * desde la administración.
 */
export const RUTA_PORTADAS = '/odes/portadas/'

const ESQUEMA = /^([a-z][a-z\d+.-]*):/i

/** Caracteres de control (U+0000–U+001F y U+007F): nunca van en una URL válida. */
function tieneControles(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i)
    if (codigo < 0x20 || codigo === 0x7f) return true
  }
  return false
}

/**
 * Devuelve la URL si es segura para un href (http, https o relativa) y null
 * en cualquier otro caso (javascript:, data:, mailto:, vacía...).
 */
export function urlSegura(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const limpia = url.trim()
  if (limpia === '' || /\s/.test(limpia) || tieneControles(limpia)) return null
  const esquema = ESQUEMA.exec(limpia)?.[1]?.toLowerCase()
  if (esquema === undefined) return limpia
  return esquema === 'http' || esquema === 'https' ? limpia : null
}

/** ¿Lleva a otro sitio? (URL absoluta http(s) o "//dominio"). Las relativas son del propio sitio. */
export function esEnlaceExterno(url: string): boolean {
  return ESQUEMA.test(url) || url.startsWith('//')
}

/** URL de la miniatura de un documento, o null si no tiene (o el nombre no es un archivo simple). */
export function urlPortada(portada: string | undefined): string | null {
  if (!portada || !/^[\w.-]+$/.test(portada) || portada.startsWith('.')) return null
  return RUTA_PORTADAS + portada
}

/**
 * Miniaturas candidatas de un documento, en orden de preferencia: la de la
 * base del repositorio (urlMiniatura, si es una URL segura) y la estática de
 * /odes/portadas/. Si una no carga, la interfaz prueba la siguiente.
 */
export function urlsMiniatura(documento: { urlMiniatura?: string; portada?: string }): string[] {
  const candidatas = [urlSegura(documento.urlMiniatura), urlPortada(documento.portada)]
  return [...new Set(candidatas.filter((url): url is string => url !== null))]
}

/**
 * urlTransform de react-markdown: deja pasar solo enlaces http(s) y
 * relativos. Lo demás se convierte en '' (el enlace queda sin destino).
 */
export function transformarUrlMarkdown(url: string): string {
  return urlSegura(url) ?? ''
}
