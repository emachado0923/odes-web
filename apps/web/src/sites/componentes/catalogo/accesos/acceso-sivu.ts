/**
 * El botón de acceso a SIVU (elegido de las versiones de /componentes: la 3
 * de la segunda ronda, con un filete blanco, más grande y abriéndose al
 * bajar): un círculo de 92 px con la fachada del edificio de SIVU, fijo abajo
 * a la izquierda, del que sale una barra azul de 64 px con «Ir a SIVU». Arriba
 * de la página es solo el círculo; al bajar se abre y al subir se encoge. Todo
 * el botón es un enlace a SIVU.
 *
 * El HTML es acceso-sivu.html; el CSS, la plantilla accesos.css con estas
 * variables delante (y la foto, edificio.webp, dentro como data:); el script,
 * accesos.js. accesos.html es la barra con varios accesos (SIVU, Repositorio y
 * ODES) que abre y cierra el círculo, de la primera ronda: el CSS y el script
 * la siguen sirviendo para cuando se sumen los otros dos.
 */
import type { Componente } from '..'
import plantillaCss from './accesos.css?raw'
import js from './accesos.js?raw'
import ejecutar from './accesos.js?ejecutar'
import html from './acceso-sivu.html?raw'
import foto from './edificio.webp?inline'

const RAIZ = 'odes-acceso-sivu'

/**
 * Azul de CTi (#163854): blanco encima, 12,2:1; la línea de abajo, al 88 %,
 * 9,8:1. El círculo (92 px) es más alto que la barra (64 px): la foto va en un
 * marco azul con un filete blanco de 2 px, y el círculo lleva su propia sombra.
 */
const VARIABLES = [
  '/* Color, tamanos, letra y sombra del boton (y la foto del edificio). Para cambiarlos, edita estas variables */',
  `#${RAIZ}{--odes-ac-tam:92px;--odes-ac-alto:64px;--odes-ac-marco:12px;--odes-ac-filete:2px;--odes-ac-fondo:#163854;--odes-ac-tinta:#fff;--odes-ac-realce:transparent;--odes-ac-letra:1.125rem;--odes-ac-letra-detalle:.8125rem;--odes-ac-sombra:0 10px 24px -6px rgba(6,33,48,.45),0 3px 6px -1px rgba(6,33,48,.2);--odes-ac-foto:url("${foto}")}`,
  '',
].join('\n')

export const ACCESO_SIVU: Componente = {
  slug: 'acceso-sivu',
  nombre: 'Botón de acceso a SIVU',
  descripcion:
    'Un círculo con el edificio de SIVU, fijo abajo a la izquierda, del que sale una barra azul con «Ir a SIVU». Arriba de la página es solo el círculo; al bajar se abre y al subir se encoge (también se abre al pasar el cursor). Todo el botón es un enlace a SIVU. Desplázate dentro del marco para verlo.',
  html,
  css: VARIABLES + plantillaCss.replaceAll('#odes-ac-raiz', `#${RAIZ}`),
  js,
  ejecutar,
  vista: 'pagina',
}
