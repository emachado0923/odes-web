import { Link } from 'react-router'
import { useTituloCrm } from './ui/titulo'

/** 404 de la rama /crm: una dirección que no es del CRM. */
export default function NoEncontradoCrm() {
  useTituloCrm('Página no encontrada')
  return (
    <div className="crm-contenedor crm-pagina crm-no-encontrado">
      <h1 className="crm-titulo-pagina">Esta página no existe</h1>
      <p className="crm-bajada">La dirección está mal escrita o cambió. Desde el inicio puede entrar a su tablero de tareas.</p>
      <p>
        <Link className="crm-boton crm-boton-primario" to="/crm">
          Ir al inicio
        </Link>
      </p>
    </div>
  )
}
