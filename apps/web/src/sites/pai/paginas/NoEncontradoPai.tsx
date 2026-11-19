/**
 * Ruta desconocida dentro de /pai: aviso con enlaces al tablero y, para el
 * administrador, al seguimiento.
 */
import { Link, useLocation } from 'react-router'
import { useTituloPai } from '../componentes/useTituloPai'
import { RUTA_ADMIN, RUTA_PAI } from '../rutas'
import { esAdministrador, useSesionPai } from '../sesion/contexto'

export default function NoEncontradoPai() {
  useTituloPai('Página no encontrada')
  const { sesion } = useSesionPai()
  const { pathname } = useLocation()
  return (
    <div className="pai-pagina">
      <section className="card card-lg" aria-labelledby="pai-no-encontrado">
        <div className="card-body">
          <h1 className="h3" id="pai-no-encontrado">
            No encontramos esa página
          </h1>
          <p>
            La dirección <code className="text-break">{pathname}</code> no existe en el Plan de Acción Institucional.
            Revise el enlace o vuelva al tablero.
          </p>
          <div className="d-flex flex-wrap gap-2">
            <Link to={RUTA_PAI} className="btn btn-primary">
              Ir al tablero
            </Link>
            {esAdministrador(sesion) && (
              <Link to={RUTA_ADMIN} className="btn btn-outline-primary">
                Ir al seguimiento
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
