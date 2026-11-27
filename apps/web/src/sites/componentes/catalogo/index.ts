/**
 * Catálogo de /componentes: bloques listos para pegar en un "Raw HTML" de
 * WPBakery en sapiencia.gov.co. Cada componente vive en su carpeta con sus
 * partes por separado (importadas como texto con ?raw):
 *
 *   <slug>/<slug>.html  el contenido, con un solo elemento raíz id="odes-<slug>"
 *   <slug>/<slug>.css   los estilos, todos bajo #odes-<slug>
 *   <slug>/<slug>.js    opcional: el script, encerrado en una función
 *
 * El bloque completo (lo que se pega en WordPress) lo arma armarBloque()
 * juntando las tres partes. Las reglas de WordPress las vigila
 * catalogo.test.ts para cada componente de la lista.
 *
 * Para agregar uno: crear su carpeta con sus partes y sumarlo a FICHAS.
 *
 * Script en la vista previa: la CSP del sitio no deja correr scripts en línea.
 * Si el componente necesita su script para verse bien (como el botón de
 * acceso a SIVU), se importa también con ?ejecutar (plugin scriptsDelCatalogo de
 * vite.config.ts) y se pasa en `ejecutar`: la ficha lo corre después de poner
 * el contenido. Sin `ejecutar`, la vista previa muestra solo HTML y CSS.
 *
 * Varias versiones de un mismo componente (para comparar) van en un Grupo: una
 * sola ficha con un selector de versión; cada versión es un componente completo.
 */
import cssCifras from './cifras/cifras.css?raw'
import htmlCifras from './cifras/cifras.html?raw'
import jsCifras from './cifras/cifras.js?raw'
import cssTresLados from './tres-lados/tres-lados.css?raw'
import htmlTresLados from './tres-lados/tres-lados.html?raw'
import { ACCESO_SIVU } from './accesos/acceso-sivu'

export interface Componente {
  /** Nombre de los archivos y del id raíz (odes-<slug>). */
  slug: string
  nombre: string
  descripcion: string
  html: string
  css: string
  /** El script, si el componente lo necesita. */
  js?: string
  /** El mismo script como función, para que la vista previa lo corra (ver arriba). */
  ejecutar?: () => void
  /**
   * 'pagina': un componente fijo en la ventana (un botón flotante). La vista
   * previa lo muestra en un marco con una página de muestra que se desplaza.
   */
  vista?: 'pagina'
}

/** Varias versiones de un componente en una sola ficha, con un selector. */
export interface Grupo {
  id: string
  nombre: string
  descripcion: string
  versiones: readonly Componente[]
}

export type Ficha = Componente | Grupo

export const esGrupo = (ficha: Ficha): ficha is Grupo => 'versiones' in ficha

export const FICHAS: readonly Ficha[] = [
  {
    slug: 'tres-lados',
    nombre: 'Formación en CTi',
    descripcion:
      'La sección «Medellín potencia la formación en CTi» de la página principal: tres triángulos azules con una cifra, qué mide, un dato de contexto y el año, el botón «Conoce más» y la fuente. En pantallas anchas van en fila, el del medio más abajo; en angostas, uno debajo de otro.',
    html: htmlTresLados,
    css: cssTresLados,
  },
  {
    slug: 'cifras',
    nombre: 'Fichas de cifras',
    descripcion:
      'Las cinco fichas de «El Observatorio en cifras» de la página principal: cifra, qué mide, periodo y, al girarlas, su descripción y su fuente. Cinco por fila en pantallas anchas; 3 + 2, 2 + 2 + 1 o una por fila en las más angostas.',
    html: htmlCifras,
    css: cssCifras,
    js: jsCifras,
  },
  ACCESO_SIVU,
]

/** Todos los componentes, con cada versión de los grupos por separado (las reglas de WordPress valen para todos). */
export const COMPONENTES: readonly Componente[] = FICHAS.flatMap((ficha) => (esGrupo(ficha) ? ficha.versiones : [ficha]))

/** Id del elemento raíz del componente: todos sus estilos van bajo él. */
export function idRaiz(componente: Pick<Componente, 'slug'>): string {
  return `odes-${componente.slug}`
}

/**
 * El bloque completo, para pegar tal cual en un "Raw HTML" de WPBakery:
 * estilos, contenido y, si lo hay, el script. El <meta charset> solo sirve al
 * abrir el archivo suelto en un navegador (evita tildes rotas); dentro de
 * WordPress se ignora.
 */
export function armarBloque(componente: Componente): string {
  const incluye = componente.js ? 'estilos, contenido y script' : 'estilos y contenido'
  const partes = [
    '<meta charset="utf-8"><!-- Solo sirve al abrir este archivo suelto en un navegador (evita tildes rotas). Dentro de WordPress se ignora. -->',
    [
      '<!--',
      `  COMPONENTE ${componente.nombre.toUpperCase()} (OdeS) · catálogo /componentes del aplicativo`,
      '',
      `  Donde va: pegar COMPLETO en un elemento "Raw HTML" de WPBakery. Incluye ${incluye}.`,
      `  Todos los estilos van bajo #${idRaiz(componente)} para no tocar el tema.`,
      '-->',
    ].join('\n'),
    `<style>\n${componente.css.trim()}\n</style>`,
    componente.html.trim(),
  ]
  if (componente.js) partes.push(`<script>\n${componente.js.trim()}\n</script>`)
  return `${partes.join('\n')}\n`
}

export interface Archivo {
  nombre: string
  tipo: string
  contenido: string
}

/** Las partes que se descargan por separado (el script solo si el componente lo tiene). */
export function partes(componente: Componente): { html: Archivo; css: Archivo; js: Archivo | null; bloque: Archivo } {
  const { slug } = componente
  return {
    html: { nombre: `${slug}.html`, tipo: 'text/html;charset=utf-8', contenido: componente.html },
    css: { nombre: `${slug}.css`, tipo: 'text/css;charset=utf-8', contenido: componente.css },
    js: componente.js ? { nombre: `${slug}.js`, tipo: 'text/javascript;charset=utf-8', contenido: componente.js } : null,
    bloque: { nombre: `${slug}-bloque.html`, tipo: 'text/html;charset=utf-8', contenido: armarBloque(componente) },
  }
}

/** Descarga un archivo generado en el navegador (Blob y un enlace con download). */
export function descargar(archivo: Archivo): void {
  const url = URL.createObjectURL(new Blob([archivo.contenido], { type: archivo.tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = archivo.nombre
  enlace.hidden = true
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  // Se libera después: algunos navegadores leen la URL justo después del clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
