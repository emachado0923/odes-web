/**
 * Avance (fracción) con su porcentaje y una barra `progress` del kit,
 * coloreada por nivel (seguimiento.ts). El color nunca es la única señal: el
 * porcentaje se ve siempre. Sin dato, solo el texto `vacio`.
 */
import { formatoPorcentaje } from '../datos/formatos'
import { anchoBarra, claseProgreso } from './seguimiento'

export default function BarraAvance({
  fraccion,
  etiqueta,
  vacio = '—',
}: {
  fraccion: number | null
  /** Nombre accesible de la barra ("Logro del Bimestre 2 en SAF"). */
  etiqueta: string
  vacio?: string
}) {
  if (fraccion === null || !Number.isFinite(fraccion)) {
    return (
      <span className="pai-avance pai-avance-vacio">
        <span className="pai-avance-valor">{vacio}</span>
      </span>
    )
  }
  const texto = formatoPorcentaje(fraccion)
  const ancho = anchoBarra(fraccion)
  return (
    <span className="pai-avance">
      <span className="pai-avance-valor" aria-hidden="true">
        {texto}
      </span>
      <span
        className={`progress ${claseProgreso(fraccion)}`}
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ancho}
        aria-valuetext={texto}
      >
        <span className="progress-bar" style={{ width: `${ancho}%` }} />
      </span>
    </span>
  )
}
