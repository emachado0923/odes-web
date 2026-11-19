import { Link } from 'react-router'
import { LOGO_CABECERA } from '../rutas'

/**
 * Cabecera del Observatorio, igual en todo el sitio (/principal, /odes,
 * /repositorio, /sivu y /tableros): franja magenta con el logo en blanco a la
 * izquierda y el nombre del tablero a la derecha (el h1 de la página).
 *
 * El logo lleva al inicio con recarga completa (reloadDocument): el CSS
 * global de la plantilla no debe quedar cargado en otra rama.
 */
export default function CabeceraTableros({ titulo }: { titulo: string }) {
  return (
    <header className="tb-cabecera">
      <div className="tb-cabecera-interior">
        <Link to="/" reloadDocument className="tb-cabecera-logo">
          <img src={LOGO_CABECERA.src} alt="Observatorio de Sapiencia: ir al inicio" width={LOGO_CABECERA.ancho} height={LOGO_CABECERA.alto} />
        </Link>
        <h1 className="tb-cabecera-titulo">{titulo}</h1>
      </div>
    </header>
  )
}
