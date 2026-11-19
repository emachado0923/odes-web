import { Link } from 'react-router'
import Icono from '../componentes/Icono'
import { ID_CONTENIDO, RUTA_REPOSITORIO } from '../rutas'

/** 404 propio del repositorio: cualquier subruta desconocida bajo /repositorio. */
export default function NoEncontradoRepositorio() {
  return (
    <main id={ID_CONTENIDO} className="rp-principal sap-contenido" tabIndex={-1}>
      <title>Página no encontrada · Repositorio de productos</title>
      <div className="rp-contenedor">
        <div className="rp-vacio rp-no-encontrado">
          <Icono nombre="buscar" />
          <p className="rp-codigo">Error 404</p>
          <h1 className="rp-vacio-titulo">Página no encontrada</h1>
          <p className="rp-vacio-texto">Esta página no existe dentro del Repositorio de productos.</p>
          <p className="rp-acciones rp-acciones-centradas">
            <Link className="rp-boton" to={RUTA_REPOSITORIO}>
              Volver al repositorio
            </Link>
            {/* Sale de la rama: recarga completa. */}
            <Link className="rp-boton rp-boton-borde" to="/" reloadDocument>
              Ir al inicio de Sapiencia
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
