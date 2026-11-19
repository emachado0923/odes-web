import type { CSSProperties } from 'react'
import { categoriaEstado, COLOR_ESTADO, estadoLegible } from './estados'

/**
 * El estado de un beneficio o de un periodo, con el color de su categoría (los
 * mismos del tablero) y el texto como lo dice la base, puesto para leer.
 * `pleno`: fondo del color pleno (sobre fondos oscuros); si no, fondo tenue.
 */
export default function ChipEstado({ estado, pleno = false, className }: { estado: string; pleno?: boolean; className?: string }) {
  const categoria = categoriaEstado(estado)
  const c = COLOR_ESTADO[categoria]
  const estilo = { '--e-color': c.color, '--e-sobre': c.sobre, '--e-suave': c.suave, '--e-texto': c.texto } as CSSProperties
  const texto = estadoLegible(estado)
  return (
    <span
      className={`vc-chip-estado${pleno ? ' vc-chip-estado-pleno' : ''}${className ? ` ${className}` : ''}`}
      style={estilo}
      title={texto === categoria ? undefined : `Categoría: ${categoria}`}
    >
      <i aria-hidden="true" />
      {texto}
    </span>
  )
}
