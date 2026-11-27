/**
 * Las versiones del botón de accesos del Observatorio (SIVU, Repositorio y
 * ODES) para comparar en /componentes. Todas salen de la misma plantilla
 * (accesos.html, accesos.css y accesos.js, que es el mismo para todas): cada
 * versión cambia el icono del círculo, el color, el tamaño y la sombra, y si
 * se abre con el cursor o con la página. Cada una es un componente completo,
 * con su id raíz (odes-accesos-<n>), que se descarga y se pega por separado.
 */
import type { Componente } from '..'
import plantillaCss from './accesos.css?raw'
import plantillaHtml from './accesos.html?raw'
import js from './accesos.js?raw'
import ejecutar from './accesos.js?ejecutar'

/** Iconos del círculo, del mismo trazo que los de los accesos (24 x 24, línea de 2). */
const ICONOS = {
  casita:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  edificio:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
  cuadricula:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
} as const

/** Colores: fondo de la barra, texto e iconos, y el realce al pasar por un acceso (contrastes en el comentario). */
const COLORES = {
  // Blanco sobre morado 5,5:1; sobre el realce, 7,5:1.
  morado: { nombre: 'morado de la entidad', fondo: '#9b48a4', tinta: '#fff', realce: 'rgba(0,0,0,.2)', borde: '' },
  // Blanco sobre azul 12,2:1.
  azul: { nombre: 'azul de CTi', fondo: '#163854', tinta: '#fff', realce: 'rgba(255,255,255,.14)', borde: '' },
  // Azul oscuro sobre naranja 5,3:1; sobre el realce, 7,4:1. El naranja contra la página blanca, 3,1:1.
  naranja: { nombre: 'naranja del Observatorio', fondo: '#f26623', tinta: '#062130', realce: 'rgba(255,255,255,.3)', borde: '' },
  // Morado sobre blanco 5,5:1; sobre el realce, 4,9:1.
  blanco: { nombre: 'blanco con borde morado', fondo: '#fff', tinta: '#9b48a4', realce: '#f7f0f7', borde: '#9b48a4' },
} as const

/** Tamaño del círculo (y alto de la barra) y sombra. */
const PRESENCIAS = {
  discreta: { tam: '48px', sombra: '0 3px 8px -2px rgba(6,33,48,.3),0 1px 2px rgba(6,33,48,.14)', clase: '' },
  media: { tam: '56px', sombra: '0 6px 16px -4px rgba(6,33,48,.38),0 2px 4px rgba(6,33,48,.16)', clase: '' },
  // Como los botones flotantes del bloque principal: 64 px, aro interior y su sombra.
  anillo: { tam: '64px', sombra: '0 4px 8px 3px rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.3)', clase: ' odes-ac--anillo' },
  visible: { tam: '68px', sombra: '0 12px 28px -6px rgba(6,33,48,.45),0 4px 8px -2px rgba(6,33,48,.2)', clase: '' },
} as const

const COMO = {
  cursor:
    'Se abre al pasar el cursor, al tocarlo o con Enter desde el teclado; se cierra al tocar fuera o con Escape.',
  pagina:
    'Arriba de la pagina esta abierto; se encoge en circulo al bajar y se vuelve a abrir al subir. Tocar el circulo\n  tambien lo abre o lo cierra.',
} as const

interface Version {
  n: number
  nombre: string
  descripcion: string
  icono: keyof typeof ICONOS
  color: keyof typeof COLORES
  presencia: keyof typeof PRESENCIAS
  modo: keyof typeof COMO
  /** El icono gira al abrirse ("+" a "x"). */
  giro?: boolean
}

const VERSIONES: readonly Version[] = [
  {
    n: 1,
    nombre: 'Casita morada, con el cursor',
    descripcion:
      'Casita en un círculo morado de 64 px con aro blanco, como los botones flotantes del bloque principal. Se abre al pasar el cursor o al tocarla.',
    icono: 'casita',
    color: 'morado',
    presencia: 'anillo',
    modo: 'cursor',
  },
  {
    n: 2,
    nombre: 'Casita azul, con la página',
    descripcion:
      'Casita en un círculo azul de CTi de 56 px. Arriba de la página está abierta; se encoge al bajar y se abre al subir. Tocarla también la abre.',
    icono: 'casita',
    color: 'azul',
    presencia: 'media',
    modo: 'pagina',
  },
  {
    n: 3,
    nombre: 'Edificio azul, con el cursor',
    descripcion:
      'El edificio de SIVU en un círculo azul de CTi de 56 px. Se abre al pasar el cursor o al tocarlo.',
    icono: 'edificio',
    color: 'azul',
    presencia: 'media',
    modo: 'cursor',
  },
  {
    n: 4,
    nombre: 'Cuadrícula naranja, con la página',
    descripcion:
      'Cuadrícula de accesos en un círculo naranja del Observatorio, más discreto (48 px), con el texto en azul oscuro. Arriba de la página está abierta; se encoge al bajar y se abre al subir.',
    icono: 'cuadricula',
    color: 'naranja',
    presencia: 'discreta',
    modo: 'pagina',
  },
  {
    n: 5,
    nombre: '«+» con borde morado, con el cursor',
    descripcion:
      'El clásico «+» de los botones flotantes, en blanco con borde morado (48 px). Gira a «×» al abrirse, con el cursor o al tocarlo.',
    icono: 'mas',
    color: 'blanco',
    presencia: 'discreta',
    modo: 'cursor',
    giro: true,
  },
  {
    n: 6,
    nombre: 'Casita morada grande, con la página',
    descripcion:
      'Casita en un círculo morado más grande (68 px) y con más sombra. Arriba de la página está abierta; se encoge al bajar y se abre al subir.',
    icono: 'casita',
    color: 'morado',
    presencia: 'visible',
    modo: 'pagina',
  },
]

function armar(version: Version): Componente {
  const raiz = `odes-accesos-${version.n}`
  const color = COLORES[version.color]
  const presencia = PRESENCIAS[version.presencia]
  const clases = ` odes-ac--${version.modo}${presencia.clase}${version.giro ? ' odes-ac--giro' : ''}`
  // El borde (version blanca) es una sombra interior, para que no cambie el tamaño del círculo.
  const sombra = color.borde ? `inset 0 0 0 2px ${color.borde},${presencia.sombra}` : presencia.sombra
  const variables = [
    `/* Version ${version.n}: ${color.nombre}, ${presencia.tam}. Para cambiar el color, el tamano o la sombra, edita estas variables */`,
    `#${raiz}{--odes-ac-tam:${presencia.tam};--odes-ac-fondo:${color.fondo};--odes-ac-tinta:${color.tinta};--odes-ac-realce:${color.realce};--odes-ac-sombra:${sombra}}`,
    '',
  ].join('\n')
  return {
    slug: `accesos-${version.n}`,
    nombre: `Versión ${version.n}: ${version.nombre}`,
    descripcion: version.descripcion,
    html: plantillaHtml
      .replaceAll('{{n}}', String(version.n))
      .replace('{{nombre}}', version.nombre)
      .replace('{{como}}', COMO[version.modo])
      .replace('{{clases}}', clases)
      .replace('{{modo}}', version.modo)
      .replace('{{icono}}', ICONOS[version.icono]),
    css: variables + plantillaCss.replaceAll('#odes-ac-raiz', `#${raiz}`),
    js,
    ejecutar,
    vista: 'pagina',
  }
}

export const VERSIONES_ACCESOS: readonly Componente[] = VERSIONES.map(armar)
