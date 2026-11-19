import { RUTA_BATERIA } from '../rutas'

/**
 * Direcciones de la batería de indicadores dentro del sitio (React Router):
 *
 *   /tableros/bateria-indicadores                          inicio (mapa de indicadores)
 *   /tableros/bateria-indicadores/<vista>                   una vista
 *   /tableros/bateria-indicadores/<vista>?v=<variante>      una variante de la vista
 *   /tableros/bateria-indicadores/glosario | /catalogo      glosario y catálogo
 *
 * El tablero estático navegaba con el hash (index.html#/sa-fondo-epm?v=comunas):
 * rutaDesdeDireccionAntigua traduce esas direcciones para que los enlaces
 * guardados sigan llevando a la misma vista.
 */
export interface RutaBateria {
  vista: string
  variante: string | null
}

const INICIO = 'inicio'

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto)
  } catch {
    return texto
  }
}

const PATRON_RUTA_BATERIA = new RegExp(`^${RUTA_BATERIA}(?:/|$)`, 'i')

/** ¿La dirección es del tablero? (/tableros/bateria-indicadores[/…], sin distinguir mayúsculas, como React Router). */
export function esRutaBateria(pathname: string): boolean {
  return PATRON_RUTA_BATERIA.test(pathname)
}

/** Dirección de una vista (y su variante) del tablero. */
export function rutaVista(vista: string = INICIO, variante?: string | null): string {
  const camino = vista && vista !== INICIO ? `${RUTA_BATERIA}/${encodeURIComponent(vista)}` : RUTA_BATERIA
  return variante ? `${camino}?v=${encodeURIComponent(variante)}` : camino
}

/** Vista y variante de una dirección del tablero (la ruta, sin distinguir mayúsculas, y ?v=). */
export function leerRuta(pathname: string, search: string): RutaBateria {
  const resto = esRutaBateria(pathname) ? pathname.slice(RUTA_BATERIA.length) : ''
  const [primera] = resto.split('/').filter(Boolean)
  const variante = new URLSearchParams(search).get('v')
  return { vista: primera ? decodificar(primera) : INICIO, variante: variante || null }
}

/**
 * Dirección nueva para una del tablero estático, o null si no lo es:
 * /tableros/bateria-indicadores/index.html y la raíz del tablero con un hash
 * de la forma #/<vista>?v=<variante>. Un hash sin barra (#contenido, el
 * enlace "Saltar al contenido") no es una dirección antigua.
 */
export function rutaDesdeDireccionAntigua(pathname: string, hash: string): string | null {
  if (!esRutaBateria(pathname)) return null
  const resto = pathname.slice(RUTA_BATERIA.length).replace(/\/+$/, '')
  const esIndex = /^\/index\.html$/i.test(resto)
  const ruta = /^#\//.test(hash) ? hash.slice(2) : null
  if (!esIndex && (resto !== '' || ruta === null)) return null
  const [camino = '', consulta = ''] = (ruta ?? '').split('?')
  const [vista] = camino.split('/').filter(Boolean)
  return rutaVista(vista ? decodificar(vista) : INICIO, new URLSearchParams(consulta).get('v'))
}
