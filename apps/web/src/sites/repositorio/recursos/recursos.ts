/**
 * Archivos estáticos de la rama: pasan por Vite (nombre con hash, caché
 * larga en /assets/) y se sirven desde el propio servidor (CSP 'self').
 * - Logos: los blancos de la cabecera y el pie (los mismos de /principal,
 *   apps/web/principal/recursos/img) y el logo a color de la portada (copia de
 *   Septiembre/observatorio/repositorio/logo).
 * - Rubik (latin y latin-ext, normal, variable 300–900): copias de
 *   Octubre/plantilla-sapiencia/fonts. Los @font-face están en repositorio.css.
 */
import logoObservatorioBlanco from './img/logo-observatorio-blanco.png'
import logoObservatorioColor from './img/logo-observatorio-sapiencia.png'
import logoSapienciaAlcaldiaBlanco from './img/logo-sapiencia-alcaldia-blanco.png'

export const LOGO_CABECERA = { src: logoObservatorioBlanco, ancho: 1319, alto: 390 }
export const LOGO_PORTADA = { src: logoObservatorioColor, ancho: 720, alto: 213 }
export const LOGO_PIE = { src: logoSapienciaAlcaldiaBlanco, ancho: 720, alto: 255 }
