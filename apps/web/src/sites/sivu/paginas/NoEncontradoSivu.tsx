import { Link } from 'react-router'
import { ID_CONTENIDO, RUTA_SIVU } from '../rutas'

/** 404 propio de SIVU: cualquier subruta desconocida bajo /sivu. */
export default function NoEncontradoSivu() {
  return (
    <main id={ID_CONTENIDO} className="sv-principal" tabIndex={-1}>
      <title>Página no encontrada · Sistema de Visualización de Datos</title>
      <div className="sv-contenedor">
        <div className="sv-404">
          <p className="sv-404-codigo">Error 404</p>
          <h1 className="sv-404-titulo">Página no encontrada</h1>
          <p className="sv-404-texto">Esta página no existe dentro de SIVU.</p>
          <Link className="ed-boton sv-404-volver" to={RUTA_SIVU}>
            <span aria-hidden="true">←</span> Volver al edificio
          </Link>
        </div>
      </div>
    </main>
  )
}
