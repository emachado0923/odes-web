import { useEffect, useRef, useState } from 'react'
import Icono from './iconos'

/**
 * Botón pequeño que copia un valor (documento, celular, correo) al
 * portapapeles y lo confirma un momento. `que` nombra lo copiado para el
 * lector de pantalla: «Copiar el celular».
 */
export default function Copiar({ valor, que, className }: { valor: string; que: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (reloj.current && clearTimeout(reloj.current)), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
    } catch {
      return // sin permiso o sin portapapeles: no se confirma lo que no pasó
    }
    setCopiado(true)
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = setTimeout(() => setCopiado(false), 1600)
  }

  return (
    <button
      type="button"
      className={className ? `vc-copiar ${className}` : 'vc-copiar'}
      data-copiado={copiado ? '1' : undefined}
      onClick={() => void copiar()}
      aria-label={`Copiar ${que}`}
      title={copiado ? 'Copiado' : `Copiar ${que}`}
    >
      <Icono nombre={copiado ? 'listo' : 'copiar'} tamano={15} />
      <span className="vc-sr" role="status">
        {copiado ? 'Copiado' : ''}
      </span>
    </button>
  )
}
