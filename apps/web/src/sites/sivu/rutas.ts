/** Ruta de la rama. */
export const RUTA_SIVU = '/sivu'

/** Modelo 3D y decodificador Draco (apps/web/public/sivu/, sin pasar por Vite). */
export const URL_MODELO = '/sivu/edificiofinal.glb'
export const RUTA_DRACO = '/sivu/draco/'

/** id del <main>: destino del enlace "Saltar al contenido". */
export const ID_CONTENIDO = 'contenido'

/** id de la sección de tableros: destino del botón "Conoce más". */
export const ID_TABLEROS = 'tableros'

/**
 * Tablero de la batería de indicadores: "Ingresar" lo abre al terminar la
 * animación hacia la puerta. Es una ruta de la rama /tableros (otra rama: se
 * llega con recarga completa). Ver src/sites/tableros/bateria/LEEME.md.
 */
export const URL_TABLERO_BATERIA = '/tableros/bateria-indicadores'
