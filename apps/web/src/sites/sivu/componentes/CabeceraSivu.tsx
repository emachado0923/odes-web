import { Link } from 'react-router'
import { LOGO_CABECERA } from '../recursos/recursos'

/**
 * Cabecera del Observatorio, igual en todo el sitio (/principal, /odes,
 * /repositorio y /sivu): franja magenta con el logo en blanco a la izquierda y
 * el nombre de la aplicación a la derecha.
 *
 * El logo lleva al inicio con recarga completa (reloadDocument), como todo
 * enlace que sale de una rama.
 */
export default function CabeceraSivu({ nombre = 'Sistema de Visualización de Datos' }: { nombre?: string }) {
  return (
    <header className="sv-cabecera">
      <div className="sv-cabecera-interior">
        <Link to="/" reloadDocument className="sv-cabecera-logo">
          <img
            src={LOGO_CABECERA.src}
            alt="Observatorio de Sapiencia: ir al inicio"
            width={LOGO_CABECERA.ancho}
            height={LOGO_CABECERA.alto}
          />
        </Link>
        <p className="sv-cabecera-nombre">{nombre}</p>
      </div>
    </header>
  )
}
