/**
 * Íconos de la cabecera y el pie oficiales de sapiencia.gov.co, en SVG en
 * línea (más nítidos que los PNG de 14–20 px del sitio y sin pedir archivos).
 * Todos son decorativos (aria-hidden): el texto del botón o del enlace dice
 * qué hace.
 *
 * - Lupa: la misma del sitio (Font Awesome 4 "search", SIL OFL 1.1).
 * - Íconos del panel de accesibilidad: los mismos del panel oficial (Font
 *   Awesome 4: search-plus, search-minus, barcode, adjust, eye, lightbulb-o,
 *   link, font, undo y comment; SIL OFL 1.1).
 * - Persona, mundo, teléfono, correo, reloj, banderas y el triángulo del menú:
 *   dibujados aquí siguiendo los PNG del sitio (mismo tamaño y color).
 */
import type { SVGProps } from 'react'

type PropsIcono = SVGProps<SVGSVGElement>

function Svg({ children, className, ...props }: PropsIcono) {
  return (
    <svg className={className ? `pe-sap-icono ${className}` : 'pe-sap-icono'} aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  )
}

/** Lupa del buscador (Font Awesome 4 "search"; la del sitio: 14,86 × 16 px). */
export function IconoLupa(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 1664 1792" {...props}>
      <path
        fill="currentColor"
        d="M1152 832q0-185-131.5-316.5t-316.5-131.5-316.5 131.5-131.5 316.5 131.5 316.5 316.5 131.5 316.5-131.5 131.5-316.5zm512 832q0 52-38 90t-90 38q-54 0-90-38l-343-342q-179 124-399 124-143 0-273.5-55.5t-225-150-150-225-55.5-273.5 55.5-273.5 150-225 225-150 273.5-55.5 273.5 55.5 225 150 150 225 55.5 273.5q0 220-124 399l343 343q37 37 37 90z"
      />
    </Svg>
  )
}

/** Persona con los brazos abiertos de "Opciones de Accesibilidad" (16 × 20 px, blanco, contorno). */
export function IconoPersona(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 16 20" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="2.7" r="1.95" />
        <path d="M1.3 6.3c4.5 1.2 8.9 1.2 13.4 0M5.7 7.4l.3 4.9-1.6 6.5M10.3 7.4 10 12.3l1.6 6.5M6 12.3h4" />
      </g>
    </Svg>
  )
}

/** Mundo de "Idioma" (20 × 20 px, blanco, contorno). */
export function IconoMundo(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 20 20" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="10" cy="10" r="8.75" />
        <ellipse cx="10" cy="10" rx="4.1" ry="8.75" />
        <path d="M10 1.25v17.5M1.25 10h17.5M2.7 5.5h14.6M2.7 14.5h14.6" />
      </g>
    </Svg>
  )
}

/** Triángulo hacia abajo de los ítems con submenú (el "arrow-down" de Dashicons del sitio). */
export function IconoTriangulo(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 8 5" {...props}>
      <path fill="currentColor" d="M0 0h8L4 5z" />
    </Svg>
  )
}

/** Teléfono del pie (contorno celeste, como icon-phone.png del sitio: 17 × 18,2 px). */
export function IconoTelefono(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 14 15" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.1 1.6 4.9 1.3l1.2 3-1.4 1.2c.7 1.8 2 3.3 3.7 4.2l1.3-1.4 3 1.3-.2 2c-.1 1-1 1.8-2 1.7C5.6 12.8 1.7 8.8 1.3 4c-.1-1.1.7-2.2 1.8-2.4Z" />
        <path d="M8.3 1.2a5 5 0 0 1 4.6 4.6M8.2 3.4A2.8 2.8 0 0 1 10.7 6" />
      </g>
    </Svg>
  )
}

/** Sobre del pie (contorno celeste, como icon-email.png: 17 × 13,3 px). */
export function IconoCorreo(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 14 11" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round">
        <rect x=".55" y=".55" width="12.9" height="9.9" />
        <path d="m.8.9 6.2 5.3L13.2.9M.8 10.2l4.6-4.8M13.2 10.2 8.6 5.4" />
      </g>
    </Svg>
  )
}

/** Reloj del pie (contorno celeste, como icon-clock.png: 17 × 17 px). */
export function IconoReloj(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 15 15" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <circle cx="7.5" cy="7.5" r="6.8" />
        <path d="M7.5 2.6v4.9l3.2 3.1M7.5 1v1M7.5 13v1M1 7.5h1M13 7.5h1" />
      </g>
    </Svg>
  )
}

/** Bandera de Estados Unidos (menú "Idioma": Inglés), 24 × 24 px como la del sitio. */
export function BanderaIngles(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 24 24" {...props}>
      <rect x="1" y="5" width="22" height="14" fill="#fff" />
      <path fill="#d22f27" d="M1 5h22v1.08H1zM1 7.15h22v1.08H1zM1 9.31h22v1.08H1zM1 11.46h22v1.08H1zM1 13.62h22v1.08H1zM1 15.77h22v1.08H1zM1 17.92h22V19H1z" />
      <rect x="1" y="5" width="10" height="7.54" fill="#3c3b6e" />
      <g fill="#fff">
        <circle cx="2.7" cy="6.5" r=".45" />
        <circle cx="5" cy="6.5" r=".45" />
        <circle cx="7.3" cy="6.5" r=".45" />
        <circle cx="9.6" cy="6.5" r=".45" />
        <circle cx="3.85" cy="8.4" r=".45" />
        <circle cx="6.15" cy="8.4" r=".45" />
        <circle cx="8.45" cy="8.4" r=".45" />
        <circle cx="2.7" cy="10.3" r=".45" />
        <circle cx="5" cy="10.3" r=".45" />
        <circle cx="7.3" cy="10.3" r=".45" />
        <circle cx="9.6" cy="10.3" r=".45" />
      </g>
      <rect x="1.25" y="5.25" width="21.5" height="13.5" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth=".5" />
    </Svg>
  )
}

/** Bandera de Colombia (menú "Idioma": Español). */
export function BanderaEspanol(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 24 24" {...props}>
      <rect x="1" y="5" width="22" height="7" fill="#fcd116" />
      <rect x="1" y="12" width="22" height="3.5" fill="#003893" />
      <rect x="1" y="15.5" width="22" height="3.5" fill="#ce1126" />
      <rect x="1.25" y="5.25" width="21.5" height="13.5" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth=".5" />
    </Svg>
  )
}

/** Acceso universal de la pestaña del panel de accesibilidad (círculo con la persona, 32 px). */
export function IconoAccesoUniversal(props: PropsIcono) {
  return (
    <Svg viewBox="0 0 100 100" {...props}>
      <g fill="currentColor">
        <path d="M50 0a50 50 0 1 0 0 100A50 50 0 0 0 50 0Zm0 8a42 42 0 1 1 0 84 42 42 0 0 1 0-84Z" />
        <circle cx="50" cy="27" r="7.5" />
        <path d="M24.6 37.3c-1.9-.5-3 1-3.2 2.2-.3 1.6.6 3.1 2.2 3.5 6 1.5 11.4 2.6 16.8 3.2-.1 19.8-2.4 24.2-5 30.8-.7 1.9.2 4 2.1 4.7 1.9.7 4-.2 4.7-2.1 1.8-4.5 3.4-8.2 4.5-15.8h6.6c1.1 7.6 2.7 11.3 4.5 15.8.7 1.9 2.8 2.8 4.7 2.1 1.9-.7 2.8-2.8 2.1-4.7-2.6-6.6-4.9-11-5-30.8 5.4-.6 10.8-1.7 16.8-3.2 1.6-.4 2.5-1.9 2.2-3.5-.4-1.7-2-2.7-3.7-2.3-19.6 4.6-26.3 4.6-46.1.1Z" />
      </g>
    </Svg>
  )
}

/* ----- Panel de accesibilidad (Font Awesome 4, viewBox 448, como en el panel oficial) ----- */

const LUPA_FA =
  'M288 208c0-61.75-50.25-112-112-112s-112 50.25-112 112 50.25 112 112 112 112-50.25 112-112zM416 416c0 17.75-14.25 32-32 32-8.5 0-16.75-3.5-22.5-9.5l-85.75-85.5c-29.25 20.25-64.25 31-99.75 31-97.25 0-176-78.75-176-176s78.75-176 176-176 176 78.75 176 176c0 35.5-10.75 70.5-31 99.75l85.75 85.75c5.75 5.75 9.25 14 9.25 22.5z'

const TRAZOS_ACCESIBILIDAD = {
  aumentar:
    'M256 200v16c0 4.25-3.75 8-8 8h-56v56c0 4.25-3.75 8-8 8h-16c-4.25 0-8-3.75-8-8v-56h-56c-4.25 0-8-3.75-8-8v-16c0-4.25 3.75-8 8-8h56v-56c0-4.25 3.75-8 8-8h16c4.25 0 8 3.75 8 8v56h56c4.25 0 8 3.75 8 8z' +
    LUPA_FA,
  disminuir: 'M256 200v16c0 4.25-3.75 8-8 8h-144c-4.25 0-8-3.75-8-8v-16c0-4.25 3.75-8 8-8h144c4.25 0 8 3.75 8 8z' + LUPA_FA,
  grises:
    'M15.75 384h-15.75v-352h15.75v352zM31.5 383.75h-8v-351.75h8v351.75zM55 383.75h-7.75v-351.75h7.75v351.75zM94.25 383.75h-7.75v-351.75h7.75v351.75zM133.5 383.75h-15.5v-351.75h15.5v351.75zM165 383.75h-7.75v-351.75h7.75v351.75zM180.75 383.75h-7.75v-351.75h7.75v351.75zM196.5 383.75h-7.75v-351.75h7.75v351.75zM235.75 383.75h-15.75v-351.75h15.75v351.75zM275 383.75h-15.75v-351.75h15.75v351.75zM306.5 383.75h-15.75v-351.75h15.75v351.75zM338 383.75h-15.75v-351.75h15.75v351.75zM361.5 383.75h-15.75v-351.75h15.75v351.75zM408.75 383.75h-23.5v-351.75h23.5v351.75zM424.5 383.75h-8v-351.75h8v351.75zM448 384h-15.75v-352h15.75v352z',
  altoContraste: 'M192 360v-272c-75 0-136 61-136 136s61 136 136 136zM384 224c0 106-86 192-192 192s-192-86-192-192 86-192 192-192 192 86 192 192z',
  contrasteNegativo:
    'M416 240c-23.75-36.75-56.25-68.25-95.25-88.25 10 17 15.25 36.5 15.25 56.25 0 61.75-50.25 112-112 112s-112-50.25-112-112c0-19.75 5.25-39.25 15.25-56.25-39 20-71.5 51.5-95.25 88.25 42.75 66 111.75 112 192 112s149.25-46 192-112zM236 144c0-6.5-5.5-12-12-12-41.75 0-76 34.25-76 76 0 6.5 5.5 12 12 12s12-5.5 12-12c0-28.5 23.5-52 52-52 6.5 0 12-5.5 12-12zM448 240c0 6.25-2 12-5 17.25-46 75.75-130.25 126.75-219 126.75s-173-51.25-219-126.75c-3-5.25-5-11-5-17.25s2-12 5-17.25c46-75.5 130.25-126.75 219-126.75s173 51.25 219 126.75c3 5.25 5 11 5 17.25z',
  fondoClaro:
    'M184 144c0 4.25-3.75 8-8 8s-8-3.75-8-8c0-17.25-26.75-24-40-24-4.25 0-8-3.75-8-8s3.75-8 8-8c23.25 0 56 12.25 56 40zM224 144c0-50-50.75-80-96-80s-96 30-96 80c0 16 6.5 32.75 17 45 4.75 5.5 10.25 10.75 15.25 16.5 17.75 21.25 32.75 46.25 35.25 74.5h57c2.5-28.25 17.5-53.25 35.25-74.5 5-5.75 10.5-11 15.25-16.5 10.5-12.25 17-29 17-45zM256 144c0 25.75-8.5 48-25.75 67s-40 45.75-42 72.5c7.25 4.25 11.75 12.25 11.75 20.5 0 6-2.25 11.75-6.25 16 4 4.25 6.25 10 6.25 16 0 8.25-4.25 15.75-11.25 20.25 2 3.5 3.25 7.75 3.25 11.75 0 16.25-12.75 24-27.25 24-6.5 14.5-21 24-36.75 24s-30.25-9.5-36.75-24c-14.5 0-27.25-7.75-27.25-24 0-4 1.25-8.25 3.25-11.75-7-4.5-11.25-12-11.25-20.25 0-6 2.25-11.75 6.25-16-4-4.25-6.25-10-6.25-16 0-8.25 4.5-16.25 11.75-20.5-2-26.75-24.75-53.5-42-72.5s-25.75-41.25-25.75-67c0-68 64.75-112 128-112s128 44 128 112z',
  subrayar:
    'M364 304c0-6.5-2.5-12.5-7-17l-52-52c-4.5-4.5-10.75-7-17-7-7.25 0-13 2.75-18 8 8.25 8.25 18 15.25 18 28 0 13.25-10.75 24-24 24-12.75 0-19.75-9.75-28-18-5.25 5-8.25 10.75-8.25 18.25 0 6.25 2.5 12.5 7 17l51.5 51.75c4.5 4.5 10.75 6.75 17 6.75s12.5-2.25 17-6.5l36.75-36.5c4.5-4.5 7-10.5 7-16.75zM188.25 127.75c0-6.25-2.5-12.5-7-17l-51.5-51.75c-4.5-4.5-10.75-7-17-7s-12.5 2.5-17 6.75l-36.75 36.5c-4.5 4.5-7 10.5-7 16.75 0 6.5 2.5 12.5 7 17l52 52c4.5 4.5 10.75 6.75 17 6.75 7.25 0 13-2.5 18-7.75-8.25-8.25-18-15.25-18-28 0-13.25 10.75-24 24-24 12.75 0 19.75 9.75 28 18 5.25-5 8.25-10.75 8.25-18.25zM412 304c0 19-7.75 37.5-21.25 50.75l-36.75 36.5c-13.5 13.5-31.75 20.75-50.75 20.75-19.25 0-37.5-7.5-51-21.25l-51.5-51.75c-13.5-13.5-20.75-31.75-20.75-50.75 0-19.75 8-38.5 22-52.25l-22-22c-13.75 14-32.25 22-52 22-19 0-37.5-7.5-51-21l-52-52c-13.75-13.75-21-31.75-21-51 0-19 7.75-37.5 21.25-50.75l36.75-36.5c13.5-13.5 31.75-20.75 50.75-20.75 19.25 0 37.5 7.5 51 21.25l51.5 51.75c13.5 13.5 20.75 31.75 20.75 50.75 0 19.75-8 38.5-22 52.25l22 22c13.75-14 32.25-22 52-22 19 0 37.5 7.5 51 21l52 52c13.75 13.75 21 31.75 21 51z',
  legible:
    'M181.25 139.75l-42.5 112.5c24.75 0.25 49.5 1 74.25 1 4.75 0 9.5-0.25 14.25-0.5-13-38-28.25-76.75-46-113zM0 416l0.5-19.75c23.5-7.25 49-2.25 59.5-29.25l59.25-154 70-181h32c1 1.75 2 3.5 2.75 5.25l51.25 120c18.75 44.25 36 89 55 133 11.25 26 20 52.75 32.5 78.25 1.75 4 5.25 11.5 8.75 14.25 8.25 6.5 31.25 8 43 12.5 0.75 4.75 1.5 9.5 1.5 14.25 0 2.25-0.25 4.25-0.25 6.5-31.75 0-63.5-4-95.25-4-32.75 0-65.5 2.75-98.25 3.75 0-6.5 0.25-13 1-19.5l32.75-7c6.75-1.5 20-3.25 20-12.5 0-9-32.25-83.25-36.25-93.5l-112.5-0.5c-6.5 14.5-31.75 80-31.75 89.5 0 19.25 36.75 20 51 22 0.25 4.75 0.25 9.5 0.25 14.5 0 2.25-0.25 4.5-0.5 6.75-29 0-58.25-5-87.25-5-3.5 0-8.5 1.5-12 2-15.75 2.75-31.25 3.5-47 3.5z',
  restablecer:
    'M384 224c0 105.75-86.25 192-192 192-57.25 0-111.25-25.25-147.75-69.25-2.5-3.25-2.25-8 0.5-10.75l34.25-34.5c1.75-1.5 4-2.25 6.25-2.25 2.25 0.25 4.5 1.25 5.75 3 24.5 31.75 61.25 49.75 101 49.75 70.5 0 128-57.5 128-128s-57.5-128-128-128c-32.75 0-63.75 12.5-87 34.25l34.25 34.5c4.75 4.5 6 11.5 3.5 17.25-2.5 6-8.25 10-14.75 10h-112c-8.75 0-16-7.25-16-16v-112c0-6.5 4-12.25 10-14.75 5.75-2.5 12.75-1.25 17.25 3.5l32.5 32.25c35.25-33.25 83-53 132.25-53 105.75 0 192 86.25 192 192z',
  comentario:
    'M448 224c0 88.5-100.25 160-224 160-12.25 0-24.5-0.75-36.25-2-32.75 29-71.75 49.5-115 60.5-9 2.5-18.75 4.25-28.5 5.5-5.5 0.5-10.75-3.5-12-9.5v-0.25c-1.25-6.25 3-10 6.75-14.5 15.75-17.75 33.75-32.75 45.5-74.5-51.5-29.25-84.5-74.5-84.5-125.25 0-88.25 100.25-160 224-160s224 71.5 224 160z',
} as const

export type TrazoAccesibilidad = keyof typeof TRAZOS_ACCESIBILIDAD

/** Ícono de una opción del panel de accesibilidad. */
export function IconoAccesibilidad({ trazo, ...props }: PropsIcono & { trazo: TrazoAccesibilidad }) {
  return (
    <Svg viewBox="0 0 448 448" {...props}>
      <path fill="currentColor" d={TRAZOS_ACCESIBILIDAD[trazo]} />
    </Svg>
  )
}
