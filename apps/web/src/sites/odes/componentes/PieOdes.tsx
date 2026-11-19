/**
 * Pie del Observatorio, igual en todo el sitio: franja magenta con los logos
 * de Sapiencia y la Alcaldía de Medellín en blanco, centrados.
 */
export default function PieOdes() {
  return (
    <footer className="odes-footer">
      <a href="https://www.sapiencia.gov.co/" className="odes-footer-logo" target="_blank" rel="noopener noreferrer">
        <img
          src="/odes/img/logo-sapiencia-alcaldia-blanco.png"
          alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín. Alcaldía de Medellín, Distrito de Ciencia, Tecnología e Innovación (se abre en una pestaña nueva)"
          width={720}
          height={255}
          loading="lazy"
          decoding="async"
        />
      </a>
    </footer>
  )
}
