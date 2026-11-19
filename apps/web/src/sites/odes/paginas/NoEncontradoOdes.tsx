import { Link } from 'react-router'
import { RUTA_INGRESO } from './rutas'

/** 404 propio de ODES: cualquier subruta desconocida bajo /odes. */
export default function NoEncontradoOdes() {
  return (
    <main id="odes-contenido" className="odes-principal odes-principal--estado" tabIndex={-1}>
      <title>Página no encontrada · Asistente ODES</title>
      <div className="odes-estado">
        <p className="odes-estado__codigo">Error 404</p>
        <h1 className="odes-estado__titulo">Página no encontrada</h1>
        <p className="odes-estado__texto">Esta página no existe dentro del Asistente ODES.</p>
        <div className="odes-estado__acciones">
          <Link className="btn btn-primary" to={RUTA_INGRESO}>
            Volver al Asistente ODES
          </Link>
          {/* Sale de la rama: recarga completa para descargar el CSS del kit. */}
          <Link className="btn btn-outline-primary" to="/" reloadDocument>
            Ir al inicio de Sapiencia
          </Link>
        </div>
      </div>
    </main>
  )
}
