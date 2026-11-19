/**
 * Íconos de línea de la ventanilla (24 × 24, trazo de 1,75). Decorativos:
 * aria-hidden; el texto accesible lo pone quien los usa. Si falta alguno,
 * defínalo en su propio componente: este archivo es compartido.
 */
const TRAZOS = {
  buscar: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm9 16-3.9-3.9',
  copiar: 'M9 9h10v11H9zM5 15V4h10',
  listo: 'm5 12.5 4.5 4.5L19 7.5',
  telefono: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  correo: 'M3.5 6h17v12h-17zm0 .5 8.5 6.5 8.5-6.5',
  ubicacion: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  birrete: 'm2.5 9 9.5-4.5L21.5 9 12 13.5 2.5 9Zm4 2.2v4.3c1.4 1.3 3.3 2 5.5 2s4.1-.7 5.5-2v-4.3M21.5 9v5.5',
  billete: 'M3 7h18v10H3zm9 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4m12-4v4',
  calendario: 'M4 6h16v14H4zm0 4h16M8 3.5v4m8-4v4',
  chevron: 'm6 9 6 6 6-6',
  usuario: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-3.4 3.8-5.5 7.5-5.5s6.7 2.1 7.5 5.5',
  documento: 'M6 3h8l4 4v14H6zm8 0v4h4M9 12h6m-6 4h6',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.2 2',
  alerta: 'M12 4 2.5 20h19L12 4Zm0 6v4.5m0 3v.2',
  banco: 'M3 9.5 12 4l9 5.5v1H3v-1Zm2 2v6.5m4.7-6.5v6.5m4.6-6.5v6.5M19 11.5v6.5M3 20h18',
  mundo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  cerrar: 'm6 6 12 12M18 6 6 18',
  arriba: 'M12 19V5m-6 6 6-6 6 6',
  lista: 'M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.2M4 12h.2M4 17.5h.2',
  tabla: 'M3.5 5h17v14h-17zm0 4.7h17m-17 4.6h17M9 5v14',
} as const

export type NombreIcono = keyof typeof TRAZOS

export default function Icono({ nombre, tamano = 18, className }: { nombre: NombreIcono; tamano?: number; className?: string }) {
  return (
    <svg
      className={className ? `vc-icono ${className}` : 'vc-icono'}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  )
}
