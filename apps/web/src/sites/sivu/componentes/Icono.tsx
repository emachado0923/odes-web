/**
 * Íconos de la rama: los mismos trazados (Material Icons / Symbols) que el
 * bloque del edificio y el repositorio, en SVG en línea. Son decorativos:
 * aria-hidden y sin foco; el texto accesible va en el botón o el enlace.
 */
const ICONOS = {
  ingresar: {
    caja: '0 0 24 24',
    trazo: 'M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z',
  },
  flecha: { caja: '0 0 24 24', trazo: 'm12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z' },
  flechaAbajo: { caja: '0 0 24 24', trazo: 'm20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z' },
  girar360: {
    caja: '0 0 24 24',
    trazo:
      'M12 7C6.48 7 2 9.24 2 12c0 2.24 2.94 4.13 7 4.77V20l4-4-4-4v2.73c-3.15-.56-5-1.9-5-2.73 0-1.06 3.04-3 8-3s8 1.94 8 3c0 .73-1.46 1.89-4 2.53v2.05c3.53-.77 6-2.53 6-4.58 0-2.76-4.48-5-10-5z',
  },
  pausa: { caja: '0 0 24 24', trazo: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' },
  reproducir: { caja: '0 0 24 24', trazo: 'M8 5v14l11-7z' },
  girarIzquierda: {
    caja: '0 0 24 24',
    trazo:
      'M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z',
  },
  girarDerecha: {
    caja: '0 0 24 24',
    trazo:
      'M15.55 5.55 11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42 1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z',
  },
  acercar: { caja: '0 0 24 24', trazo: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z' },
  alejar: { caja: '0 0 24 24', trazo: 'M19 13H5v-2h14v2z' },
  tablero: {
    caja: '0 -960 960 960',
    trazo:
      'M280-280h80v-200h-80v200Zm320 0h80v-400h-80v400Zm-160 0h80v-120h-80v120Zm0-200h80v-80h-80v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z',
  },
  externo: {
    caja: '0 -960 960 960',
    trazo:
      'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z',
  },
  reloj: {
    caja: '0 -960 960 960',
    trazo:
      'm612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z',
  },
} as const

export type NombreIcono = keyof typeof ICONOS

export default function Icono({ nombre, className }: { nombre: NombreIcono; className?: string }) {
  const { caja, trazo } = ICONOS[nombre]
  return (
    <svg className={className} viewBox={caja} aria-hidden="true" focusable="false">
      <path d={trazo} />
    </svg>
  )
}
