/**
 * Archivos estáticos de la rama: pasan por Vite (nombre con hash, caché larga
 * en /assets/; los de menos de 4 kB van en línea como data:) y se sirven desde
 * el propio servidor (CSP 'self'): nada se pide a sapiencia.gov.co.
 *
 * - img/oficial/: copias de las imágenes de la cabecera y el pie oficiales de
 *   sapiencia.gov.co (descargadas el 26 de octubre de 2026). Los logos van al
 *   tamaño del sitio (allá no hay versiones más grandes); los íconos de las
 *   redes, reducidos de los PNG de 512 px del sitio al doble del tamaño en que
 *   se muestran (nítidos en pantallas 2x). Los íconos pequeños (teléfono,
 *   correo, reloj, lupa, persona, mundo, banderas) son SVG en línea
 *   (componentes/sapiencia/iconos.tsx).
 * - Rubik (latin y latin-ext, normal, variable 300–900): copias de las de
 *   /sivu (Octubre/plantilla-sapiencia/fonts). Los @font-face están en
 *   pertinencia.css. Arial, la otra letra del sitio oficial, es del sistema.
 */
import iconoGoogleMaps from './img/oficial/icono-google-maps.png'
import logoColombiaCo from './img/oficial/logo-colombia-co.png'
import logoColombiaCompra from './img/oficial/logo-colombia-compra-eficiente.png'
import logoGovco from './img/oficial/logo-govco.png'
import logoSapienciaColor from './img/oficial/logo-sapiencia-alcaldia-color.png'
import logoSapienciaPie from './img/oficial/logo-sapiencia-alcaldia-pie.png'
import redFacebook from './img/oficial/red-facebook.png'
import redInstagram from './img/oficial/red-instagram.png'
import redLinkedin from './img/oficial/red-linkedin.png'
import redTiktok from './img/oficial/red-tiktok.png'
import redX from './img/oficial/red-x.png'
import redYoutube from './img/oficial/red-youtube.png'
import type { RedSocial } from '../datos/sapiencia-oficial'

export interface Imagen {
  src: string
  /** Tamaño en que se muestra en el sitio oficial (px CSS). */
  ancho: number
  alto: number
}

/** Sapiencia y Alcaldía de Medellín a color (logo de la cabecera; 232 × 84, el del sitio). */
export const LOGO_SAPIENCIA: Imagen = { src: logoSapienciaColor, ancho: 232, alto: 84 }
/** Sapiencia y Alcaldía en blanco, con el filete magenta y el escudo a color (logo del pie; 245 × 88). */
export const LOGO_SAPIENCIA_PIE: Imagen = { src: logoSapienciaPie, ancho: 245, alto: 88 }
/** GOV.CO en blanco (barra de arriba a 110 px de ancho; pie a 129 × 26). */
export const LOGO_GOVCO: Imagen = { src: logoGovco, ancho: 129, alto: 26 }
export const LOGO_COLOMBIA_CO: Imagen = { src: logoColombiaCo, ancho: 192, alto: 33 }
/** Colombia Compra Eficiente (SECOP), debajo de "Procesos Contractuales" a 160 px de ancho. */
export const LOGO_COLOMBIA_COMPRA: Imagen = { src: logoColombiaCompra, ancho: 158, alto: 57 }
/** Pin de Google Maps de las direcciones (48 × 48). */
export const ICONO_GOOGLE_MAPS: Imagen = { src: iconoGoogleMaps, ancho: 48, alto: 48 }

/** Íconos de las redes del pie (blancos con el logo calado), al tamaño del sitio. */
export const ICONOS_REDES: Record<RedSocial, Imagen> = {
  linkedin: { src: redLinkedin, ancho: 25, alto: 24 },
  x: { src: redX, ancho: 25, alto: 24 },
  youtube: { src: redYoutube, ancho: 25, alto: 24 },
  facebook: { src: redFacebook, ancho: 25, alto: 26 },
  instagram: { src: redInstagram, ancho: 27, alto: 28 },
  tiktok: { src: redTiktok, ancho: 27, alto: 28 },
}
