import { Link } from 'react-router'
import { LOGO_CABECERA } from '../recursos/recursos'

/**
 * Cabecera del Observatorio (/principal, /odes y /sivu): franja magenta con el
 * logo en blanco a la izquierda y el nombre de la aplicación a la derecha. En
 * /repositorio solo la usa la administración; la página pública lleva la de
 * la entidad (src/compartido/sapiencia).
 *
 * El logo lleva al inicio con recarga completa (reloadDocument), como todo
 * enlace que sale de una rama.
 */
export default function CabeceraRepositorio({ nombre = 'Repositorio de productos' }: { nombre?: string }) {
  return (
    <header className="rp-cabecera">
      <div className="rp-cabecera-interior">
        <Link to="/" reloadDocument className="rp-cabecera-logo">
          <img
            src={LOGO_CABECERA.src}
            alt="Observatorio de Sapiencia: ir al inicio"
            width={LOGO_CABECERA.ancho}
            height={LOGO_CABECERA.alto}
          />
        </Link>
        <p className="rp-cabecera-nombre">{nombre}</p>
      </div>
    </header>
  )
}
