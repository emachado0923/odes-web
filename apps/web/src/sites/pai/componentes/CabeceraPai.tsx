import { Link } from 'react-router'
import { LOGO_CABECERA, NOMBRE_PAI } from '../rutas'

/**
 * Cabecera del Observatorio, igual en todo el sitio (/principal, /odes,
 * /repositorio, /sivu, /tableros y /pai): franja magenta con el logo en blanco
 * a la izquierda y el nombre de la aplicación a la derecha.
 *
 * El nombre es un párrafo, no el h1: cada página tiene su propio h1 (Tablero,
 * Usuarios…). El logo lleva al inicio con recarga completa (reloadDocument):
 * el CSS global de la plantilla no debe quedar cargado en otra rama.
 */
export default function CabeceraPai() {
  return (
    <header className="pai-cabecera">
      <div className="pai-cabecera-interior">
        <Link to="/" reloadDocument className="pai-cabecera-logo">
          <img
            src={LOGO_CABECERA.src}
            alt="Observatorio de Sapiencia: ir al inicio"
            width={LOGO_CABECERA.ancho}
            height={LOGO_CABECERA.alto}
          />
        </Link>
        <p className="pai-cabecera-titulo">
          {NOMBRE_PAI}
          <span className="pai-cabecera-sigla"> (PAI)</span>
        </p>
      </div>
    </header>
  )
}
