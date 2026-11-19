import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import './compartido.css'
import { esFalloDeCarga } from './fallo-de-carga'

/**
 * errorElement de cada rama (y de la raíz). Si una rama falla al renderizar
 * o su chunk no se puede descargar (típico tras un nuevo despliegue, cuando
 * los nombres con hash cambiaron), se muestra este mensaje en lugar de una
 * página en blanco, sin afectar a las demás ramas.
 */
export default function ErrorRama() {
  const error = useRouteError()

  useEffect(() => {
    console.error('[Sapiencia] Error en la sección:', error)
  }, [error])

  const titulo =
    isRouteErrorResponse(error) && error.status === 404 ? 'Página no encontrada' : 'No pudimos mostrar esta sección'

  const detalle = esFalloDeCarga(error)
    ? 'No se pudo descargar esta sección. Es posible que el sitio se haya actualizado mientras navegabas.'
    : 'Ocurrió un error inesperado.'

  return (
    <div className="pantalla-estado" role="alert">
      <title>Error · Sapiencia</title>
      <h1 className="pantalla-estado__titulo">{titulo}</h1>
      <p className="pantalla-estado__texto">{detalle} Recarga la página para intentarlo de nuevo.</p>
      <div className="pantalla-estado__acciones">
        <button type="button" className="pantalla-estado__boton" onClick={() => window.location.reload()}>
          Recargar la página
        </button>
        {/* Enlace normal (no <Link>) para recargar la aplicación completa. */}
        <a className="pantalla-estado__boton pantalla-estado__boton--secundario" href="/">
          Ir al inicio
        </a>
      </div>
    </div>
  )
}
