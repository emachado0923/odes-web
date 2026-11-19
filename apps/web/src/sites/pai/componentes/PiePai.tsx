import { LOGO_PIE } from '../rutas'

/**
 * Pie del Observatorio, igual en todo el sitio: franja magenta con los logos
 * de Sapiencia y la Alcaldía de Medellín en blanco, centrados.
 */
export default function PiePai() {
  return (
    <footer className="pai-pie">
      <a href="https://www.sapiencia.gov.co/" className="pai-pie-logo" target="_blank" rel="noopener noreferrer">
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
