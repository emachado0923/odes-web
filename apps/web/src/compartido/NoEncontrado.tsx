import { Link } from 'react-router'
import './compartido.css'

/**
 * 404 global: cualquier ruta fuera de "/", "/sivu/*", "/odes/*" y
 * "/repositorio/*" (/principal la sirve el servidor, fuera de React).
 * "Ir al inicio" recarga la página (reloadDocument), como todo enlace entre
 * ramas: así no queda cargado el CSS de otra rama.
 */
export default function NoEncontrado() {
  return (
    <main className="pantalla-estado">
      <title>Página no encontrada · Sapiencia</title>
      <p className="pantalla-estado__codigo">Error 404</p>
      <h1 className="pantalla-estado__titulo">Página no encontrada</h1>
      <p className="pantalla-estado__texto">La dirección que buscas no existe o cambió de lugar.</p>
      <div className="pantalla-estado__acciones">
        <Link className="pantalla-estado__boton" to="/" reloadDocument>
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
