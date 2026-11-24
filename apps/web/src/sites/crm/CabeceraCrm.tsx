import { Link } from 'react-router'
import { LOGO_SAPIENCIA } from '../../compartido/sapiencia/recursos'

/**
 * Cabecera del CRM, igual en todas sus páginas: el logo de Sapiencia, la
 * oficina y el nombre de la herramienta. Todo el bloque lleva al inicio
 * (/crm), donde se elige la persona.
 */
export default function CabeceraCrm() {
  return (
    <header className="crm-cabecera">
      <div className="crm-contenedor crm-cabecera-interior">
        <Link to="/crm" className="crm-cabecera-marca">
          <img
            className="crm-cabecera-logo"
            src={LOGO_SAPIENCIA.src}
            width={LOGO_SAPIENCIA.ancho}
            height={LOGO_SAPIENCIA.alto}
            alt="Sapiencia, Alcaldía de Medellín"
          />
          <span className="crm-cabecera-separador" aria-hidden="true" />
          <span className="crm-cabecera-textos">
            <span className="crm-cabecera-oficina">Oficina de Planeación</span>
            <span className="crm-cabecera-nombre">Tareas del equipo</span>
          </span>
        </Link>
      </div>
    </header>
  )
}
