import { Link } from 'react-router'
import { NOMBRE_ASISTENTE } from '../chat/protocolo'

/**
 * Cabecera del Observatorio, igual en todo el sitio (/principal, /odes,
 * /repositorio y /sivu): franja magenta con el logo en blanco a la izquierda y
 * el nombre de la aplicación a la derecha.
 *
 * El logo lleva al inicio de Sapiencia con recarga completa (reloadDocument):
 * el CSS global del kit no debe quedar cargado en otra rama.
 */
export default function CabeceraOdes() {
  return (
    <header className="odes-header">
      <div className="odes-header-inner">
        <Link to="/" reloadDocument className="odes-header-logo">
          <img
            src="/odes/img/logo-observatorio-blanco.png"
            alt="Observatorio de Sapiencia: ir al inicio"
            width={1319}
            height={390}
          />
        </Link>
        <p className="odes-header-nombre">{NOMBRE_ASISTENTE}</p>
      </div>
    </header>
  )
}
