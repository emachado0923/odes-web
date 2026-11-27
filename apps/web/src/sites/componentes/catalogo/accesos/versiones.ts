/**
 * Las versiones del botón de acceso a SIVU para comparar en /componentes
 * (segunda ronda): un círculo con el edificio de SIVU, fijo abajo a la
 * izquierda, que está abierto arriba de la página («Ir a SIVU»), se encoge al
 * bajar y se abre al subir. Todo el botón es un solo enlace.
 *
 * Todas salen de la misma plantilla (acceso-sivu.html y accesos.css) y usan el
 * mismo script (accesos.js). Cada versión cambia el recorte de la imagen, el
 * color de la barra y el tamaño del círculo frente al alto de la barra. Cada
 * una es un componente completo, con su id raíz (odes-accesos-<n>), que se
 * descarga y se pega por separado.
 *
 * accesos.html es la barra con varios accesos (SIVU, Repositorio y ODES) que
 * abre y cierra el círculo, de la primera ronda; el CSS y el script la
 * siguen sirviendo para cuando se sumen los otros dos.
 */
import type { Componente } from '..'
import plantillaCss from './accesos.css?raw'
import js from './accesos.js?raw'
import ejecutar from './accesos.js?ejecutar'
import plantillaHtml from './acceso-sivu.html?raw'
import edificio from './edificio.webp?inline'
import entrada from './entrada.webp?inline'

/**
 * Recortes de la imagen del edificio de SIVU (160 x 160, WebP), dentro del CSS
 * como data: para no depender de Medios de WordPress ni de otro sitio.
 */
const FOTOS = {
  edificio: { nombre: 'la fachada completa (mural, letrero y portal)', datos: edificio },
  entrada: { nombre: 'la entrada (ventanales y portal magenta)', datos: entrada },
} as const

/** Colores de la barra: fondo y texto (contraste del nombre y de la línea de abajo, al 88 %). */
const COLORES = {
  // 12,2:1 y 9,8:1.
  azul: { nombre: 'azul de CTi', fondo: '#163854', tinta: '#fff' },
  // El magenta del portal del edificio. 6,3:1 y 5,2:1.
  magenta: { nombre: 'magenta del portal', fondo: '#b40a83', tinta: '#fff' },
  // 5,5:1 y 4,6:1.
  morado: { nombre: 'morado de la entidad', fondo: '#9b48a4', tinta: '#fff' },
  // 5,3:1 y 4,7:1. El naranja contra la página blanca, 3,1:1.
  naranja: { nombre: 'naranja del Observatorio', fondo: '#f26623', tinta: '#062130' },
} as const

/** Sombras: la del círculo grande es más honda, porque sobresale de la barra. */
const SOMBRA = '0 6px 16px -4px rgba(6,33,48,.38),0 2px 4px rgba(6,33,48,.16)'
const SOMBRA_GRANDE = '0 10px 24px -6px rgba(6,33,48,.45),0 3px 6px -1px rgba(6,33,48,.2)'

interface Version {
  n: number
  nombre: string
  descripcion: string
  foto: keyof typeof FOTOS
  color: keyof typeof COLORES
  /** Diámetro del círculo y alto de la barra, en px. */
  tam: number
  alto: number
}

const VERSIONES: readonly Version[] = [
  {
    n: 1,
    nombre: 'Fachada en barra azul',
    descripcion:
      'La fachada del edificio (mural, letrero y portal) en un círculo de 68 px enmarcado por la barra azul de CTi, del mismo alto.',
    foto: 'edificio',
    color: 'azul',
    tam: 68,
    alto: 68,
  },
  {
    n: 2,
    nombre: 'Entrada en barra magenta',
    descripcion:
      'La entrada del edificio (ventanales y portal) en un círculo de 68 px, en una barra del mismo magenta del portal.',
    foto: 'entrada',
    color: 'magenta',
    tam: 68,
    alto: 68,
  },
  {
    n: 3,
    nombre: 'Fachada grande sobre barra azul',
    descripcion:
      'Un círculo de 80 px con la fachada, más alto que la barra azul de 56 px, que sale de detrás de él.',
    foto: 'edificio',
    color: 'azul',
    tam: 80,
    alto: 56,
  },
  {
    n: 4,
    nombre: 'Entrada grande sobre barra morada',
    descripcion:
      'Un círculo de 80 px con la entrada del edificio sobre una barra morada de la entidad de 56 px.',
    foto: 'entrada',
    color: 'morado',
    tam: 80,
    alto: 56,
  },
  {
    n: 5,
    nombre: 'Fachada en barra naranja',
    descripcion:
      'La fachada en un círculo de 72 px, en la barra naranja del Observatorio, con el texto en azul oscuro.',
    foto: 'edificio',
    color: 'naranja',
    tam: 72,
    alto: 72,
  },
]

const COMUN =
  ' Arriba de la página está abierta con «Ir a SIVU»; se encoge al bajar y se abre al subir o al pasar el cursor. Un toque lleva a SIVU.'

function armar(version: Version): Componente {
  const raiz = `odes-accesos-${version.n}`
  const color = COLORES[version.color]
  const foto = FOTOS[version.foto]
  const grande = version.tam > version.alto
  const clases = ` odes-ac--pagina odes-ac--uno odes-ac--foto${grande ? ' odes-ac--grande' : ''}`
  const variables = [
    `/* Version ${version.n}: ${color.nombre}, circulo de ${version.tam} px y barra de ${version.alto} px, con ${foto.nombre}.`,
    '   Para cambiar el color, los tamanos o la sombra, edita estas variables */',
    `#${raiz}{--odes-ac-tam:${version.tam}px;--odes-ac-alto:${version.alto}px;--odes-ac-fondo:${color.fondo};--odes-ac-tinta:${color.tinta};--odes-ac-realce:transparent;--odes-ac-sombra:${grande ? SOMBRA_GRANDE : SOMBRA};--odes-ac-foto:url("${foto.datos}")}`,
    '',
  ].join('\n')
  return {
    slug: `accesos-${version.n}`,
    nombre: `Versión ${version.n}: ${version.nombre}`,
    descripcion: version.descripcion + COMUN,
    html: plantillaHtml.replaceAll('{{n}}', String(version.n)).replace('{{nombre}}', version.nombre).replace('{{clases}}', clases),
    css: variables + plantillaCss.replaceAll('#odes-ac-raiz', `#${raiz}`),
    js,
    ejecutar,
    vista: 'pagina',
  }
}

export const VERSIONES_ACCESOS: readonly Componente[] = VERSIONES.map(armar)
