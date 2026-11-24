import type { CSSProperties } from 'react'

const PORCENTAJE = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 0 })

/**
 * Avance de una subida: nombre del archivo, barra (role progressbar) y
 * porcentaje. `progreso` va de 0 a 1 (el de subirArchivo). Con `alCancelar`,
 * un botón «Cancelar». Al llegar a 100 % dice «Procesando…» mientras el
 * servidor responde.
 */
export default function ProgresoSubida({
  nombre,
  progreso,
  alCancelar,
}: {
  nombre: string
  progreso: number
  alCancelar?: () => void
}) {
  const fraccion = Number.isFinite(progreso) ? Math.min(1, Math.max(0, progreso)) : 0
  const texto = fraccion >= 1 ? 'Procesando…' : PORCENTAJE.format(fraccion)
  const entero = Math.round(fraccion * 100)
  return (
    <div className="crm-progreso">
      <div className="crm-progreso-cabeza">
        <span className="crm-progreso-nombre">{nombre}</span>
        <span className="crm-progreso-cifra crm-num" aria-hidden="true">
          {texto}
        </span>
      </div>
      <div
        className="crm-progreso-barra"
        role="progressbar"
        aria-label={`Subiendo ${nombre}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={entero}
        aria-valuetext={texto}
        style={{ '--crm-progreso': `${entero}%` } as CSSProperties}
      >
        <span className="crm-progreso-relleno" />
      </div>
      {alCancelar ? (
        <button
          type="button"
          className="crm-boton crm-boton-fantasma crm-boton-sm crm-progreso-cancelar"
          aria-label={`Cancelar la subida de ${nombre}`}
          onClick={alCancelar}
        >
          Cancelar
        </button>
      ) : null}
    </div>
  )
}
