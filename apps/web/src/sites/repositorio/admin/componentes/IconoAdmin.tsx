/**
 * Íconos de la administración: los de la página pública (componentes/Icono)
 * más algunos propios, con los mismos trazados de Material Symbols.
 * Decorativos: aria-hidden y sin foco.
 */
import Icono, { type NombreIcono } from '../../componentes/Icono'

const TRAZOS_ADMIN = {
  agregar: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
  'flecha-arriba': 'M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z',
  ordenar:
    'M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z',
  subir:
    'M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
  borrar:
    'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
  salir:
    'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z',
  imagen:
    'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z',
  editar:
    'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
  historial:
    'M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z',
  arriba: 'M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z',
  abajo: 'M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z',
  aviso:
    'm40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z',
} as const

export type NombreIconoAdmin = keyof typeof TRAZOS_ADMIN | NombreIcono

function esPropio(nombre: string): nombre is keyof typeof TRAZOS_ADMIN {
  return Object.hasOwn(TRAZOS_ADMIN, nombre)
}

export default function IconoAdmin({ nombre, className }: { nombre: NombreIconoAdmin; className?: string }) {
  if (!esPropio(nombre)) return <Icono nombre={nombre} className={className} />
  return (
    <svg className={className} viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d={TRAZOS_ADMIN[nombre]} />
    </svg>
  )
}
