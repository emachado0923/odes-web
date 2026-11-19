import { Link } from 'react-router'
import IconoFlecha from '../componentes/IconoFlecha'
import { ID_CONTENIDO, NOMBRE_PERTINENCIA, RUTA_PERTINENCIA } from '../rutas'

/** 404 propio de la rama: cualquier subruta desconocida bajo /pertinencia. */
export default function NoEncontradoPertinencia() {
  return (
    <main id={ID_CONTENIDO} className="pe-principal" tabIndex={-1}>
      <title>{`Página no encontrada · ${NOMBRE_PERTINENCIA}`}</title>
      <div className="pe-columna">
        <div className="pe-404">
          <p className="pe-404-codigo">Error 404</p>
          <h1 className="pe-404-titulo">Página no encontrada</h1>
          <p className="pe-404-texto">Esta página no existe dentro de la medida de pertinencia.</p>
          <Link className="pe-boton pe-404-volver" to={RUTA_PERTINENCIA}>
            <span>Volver a la medida de pertinencia</span>
            <span className="pe-boton-flecha">
              <IconoFlecha />
            </span>
          </Link>
        </div>
      </div>
    </main>
  )
}
