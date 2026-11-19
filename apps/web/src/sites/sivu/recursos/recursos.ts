/**
 * Archivos estáticos de la rama: pasan por Vite (nombre con hash, caché
 * larga en /assets/) y se sirven desde el propio servidor (CSP 'self').
 * - Logos: los blancos de la cabecera y el pie (los mismos de /principal,
 *   apps/web/principal/recursos/img) y el logo a color del panel morado (copia
 *   de Septiembre/observatorio/edificio-3d/logo).
 * - Rubik (latin y latin-ext, normal, variable 300–900): copias de
 *   Octubre/plantilla-sapiencia/fonts. Los @font-face están en sivu.css.
 *
 * El modelo (edificiofinal.glb) y el decodificador Draco no pasan por Vite:
 * están en public/sivu/ (ver URL_MODELO y RUTA_DRACO en ../rutas.ts).
 */
import logoObservatorioBlanco from './img/logo-observatorio-blanco.png'
import logoObservatorioColor from './img/logo-observatorio-sapiencia.png'
import logoSapienciaAlcaldiaBlanco from './img/logo-sapiencia-alcaldia-blanco.png'

export const LOGO_CABECERA = { src: logoObservatorioBlanco, ancho: 1319, alto: 390 }
export const LOGO_PANEL = { src: logoObservatorioColor, ancho: 720, alto: 213 }
export const LOGO_PIE = { src: logoSapienciaAlcaldiaBlanco, ancho: 720, alto: 255 }
