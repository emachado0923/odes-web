import { LOGO_SAPIENCIA_ALCALDIA } from '../recursos/recursos'

/**
 * Pie azul de los tableros que llegaron como tableros estáticos del
 * Observatorio (matrícula 2025 y batería de indicadores): el azul de la
 * cabecera con filete magenta y, centrada, la pata de Sapiencia y la Alcaldía
 * sobre su fondo blanco, apoyada en el borde inferior como una pestaña. Sus
 * estilos van en la hoja de cada tablero, como los de CabeceraAzul. El resto
 * de la rama lleva el pie magenta (PieTableros).
 */
export default function PieAzul() {
  return (
    <footer className="odes-footer">
      <a href="https://www.sapiencia.gov.co/" className="odes-footer-logo" target="_blank" rel="noopener noreferrer">
        <img
          src={LOGO_SAPIENCIA_ALCALDIA.src}
          alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín. Alcaldía de Medellín, Distrito de Ciencia, Tecnología e Innovación (se abre en una pestaña nueva)"
          width={LOGO_SAPIENCIA_ALCALDIA.ancho}
          height={LOGO_SAPIENCIA_ALCALDIA.alto}
          loading="lazy"
          decoding="async"
        />
      </a>
    </footer>
  )
}
