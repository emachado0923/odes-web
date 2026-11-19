import type { EstadoAsistente } from '../chat/protocolo'
import Icono from './Icono'

export type CargaEstado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; estado: EstadoAsistente }
  | { tipo: 'error' }

/**
 * Aviso según GET /api/odes/estado: IA aún no activada (modo búsqueda),
 * repositorio no disponible o servidor inalcanzable. Sin aviso si todo está bien.
 */
export default function AvisoEstado({ carga, onReintentar }: { carga: CargaEstado; onReintentar: () => void }) {
  if (carga.tipo === 'cargando') return null

  if (carga.tipo === 'error' || !carga.estado.repositorio.disponible) {
    const sinRepositorio = carga.tipo === 'listo'
    return (
      <div className="odes-aviso odes-aviso--error" role="alert">
        <Icono nombre="error" />
        <div className="odes-aviso__cuerpo">
          <p>
            {sinRepositorio
              ? 'El repositorio del Observatorio no está disponible en este momento, así que no puedo responder preguntas. Intenta de nuevo más tarde.'
              : 'No pude comprobar si el asistente está disponible. Revisa tu conexión e intenta de nuevo.'}
          </p>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={onReintentar}>
            <Icono nombre="refresh" />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (carga.estado.modo === 'busqueda') {
    return (
      <div className="odes-aviso odes-aviso--info">
        <Icono nombre="info" />
        <div className="odes-aviso__cuerpo">
          <p>
            La inteligencia artificial del asistente todavía no está activada. Por ahora te muestro los documentos del
            repositorio que coinciden con tu pregunta.
          </p>
        </div>
      </div>
    )
  }

  return null
}
