import { LOGO_PIE } from '../recursos/recursos'

/**
 * Pie del Observatorio, igual en todo el sitio: franja magenta con los logos
 * de Sapiencia y la Alcaldía de Medellín en blanco, centrados.
 */
export default function PieSivu() {
  return (
    <footer className="sv-pie">
      <a href="https://www.sapiencia.gov.co/" className="sv-pie-logo" target="_blank" rel="noopener noreferrer">
        <img
          src={LOGO_PIE.src}
          alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín. Alcaldía de Medellín, Distrito de Ciencia, Tecnología e Innovación (se abre en una pestaña nueva)"
          width={LOGO_PIE.ancho}
          height={LOGO_PIE.alto}
          loading="lazy"
          decoding="async"
        />
      </a>
    </footer>
  )
}
