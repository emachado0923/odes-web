import { LOGO_PORTADA } from '../recursos/recursos'

/**
 * Cabecera morada del repositorio: logo en su tarjeta blanca, título,
 * subtítulo, introducción y, aparte y más pequeña, la ayuda de uso.
 * Jerarquía (comentarios del Observatorio, 12 de noviembre de 2026): el
 * subtítulo es claramente menor que el título y la ayuda va separada de la
 * introducción, con letra más pequeña.
 */
export default function Presentacion() {
  return (
    <div className="rp-hero">
      <div className="rp-logo">
        <img
          src={LOGO_PORTADA.src}
          alt="Observatorio de Sapiencia"
          width={LOGO_PORTADA.ancho}
          height={LOGO_PORTADA.alto}
          decoding="async"
        />
      </div>
      <h1 className="rp-titulo">Repositorio de productos</h1>
      <p className="rp-bajada">Análisis e investigación sobre educación postsecundaria</p>
      <p className="rp-intro">
        Consulta los informes, boletines, infografías y estudios que publica el Observatorio de Sapiencia sobre la
        educación postsecundaria en Medellín.
      </p>
      <p className="rp-ayuda">Busca por título o palabra clave, filtra por categoría y año, y abre o descarga cada documento.</p>
    </div>
  )
}
