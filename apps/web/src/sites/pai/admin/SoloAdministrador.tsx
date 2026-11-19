/**
 * Envuelve las páginas /pai/admin/*: con rol administrador muestra
 * `children`; a un responsable le muestra un aviso con enlace al tablero (el
 * servidor responde 403 de todas formas).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTituloPai } from '../componentes/useTituloPai'
import { RUTA_PAI } from '../rutas'
import { esAdministrador, useSesionPai } from '../sesion/contexto'

export default function SoloAdministrador({ children }: { children: ReactNode }) {
  const { sesion } = useSesionPai()
  if (esAdministrador(sesion)) return <>{children}</>
  return <AvisoSoloAdministrador />
}

function AvisoSoloAdministrador() {
  useTituloPai('Solo para Planeación')
  return (
    <div className="pai-pagina">
      <section className="alert alert-warning" aria-labelledby="pai-solo-admin">
        <h1 className="h4" id="pai-solo-admin">
          Esta sección es solo para Planeación
        </h1>
        <p>
          Su cuenta es de responsable: puede consultar y reportar sus indicadores en el tablero. Si necesita acceso a la
          administración, pídalo a Planeación.
        </p>
        <Link to={RUTA_PAI} className="btn btn-primary">
          Ir al tablero
        </Link>
      </section>
    </div>
  )
}
