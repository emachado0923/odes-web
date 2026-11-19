import { Link } from 'react-router'
import { LOGO_OBSERVATORIO } from '../recursos/recursos'

/**
 * Cabecera azul de los tableros que llegaron como tableros estáticos del
 * Observatorio (matrícula 2025 y batería de indicadores): franja azul
 * (#0E5074) con filete magenta, el logo a la izquierda y el nombre del tablero
 * a la derecha (el h1 de la página). Sus estilos van en la hoja de cada
 * tablero (matricula/tablero-matricula.css, bateria/tablero-bateria.css),
 * bajo la clase del tablero. El resto de la rama lleva la cabecera magenta
 * (CabeceraTableros).
 *
 * Como en todo el sitio, el logo lleva al inicio con recarga completa
 * (reloadDocument): el CSS global de la plantilla no debe quedar cargado en
 * otra rama.
 */
export default function CabeceraAzul({ titulo }: { titulo: string }) {
  return (
    <header className="odes-header">
      <div className="odes-header-inner">
        <Link to="/" reloadDocument className="odes-header-logo">
          <img
            src={LOGO_OBSERVATORIO.src}
            alt="Observatorio de Sapiencia: ir al inicio"
            width={LOGO_OBSERVATORIO.ancho}
            height={LOGO_OBSERVATORIO.alto}
          />
        </Link>
        <h1 className="odes-titulo">{titulo}</h1>
      </div>
    </header>
  )
}
