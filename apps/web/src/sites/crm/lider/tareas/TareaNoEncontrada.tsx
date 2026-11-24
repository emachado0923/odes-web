import { Link } from 'react-router'
import { Migas, Vacio } from '../../ui'
import { RUTA_PANEL } from './comun'

/** 404 de una tarea del líder (eliminada o con la dirección mal escrita). El título de la pestaña lo pone quien la usa. */
export default function TareaNoEncontrada() {
  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <Migas items={[{ texto: 'Panel', href: RUTA_PANEL }, { texto: 'Tarea no encontrada' }]} />
        </div>
      </header>
      <Vacio
        titulo="No se encontró la tarea"
        texto="Puede que la hayan eliminado o que la dirección esté mal escrita."
        accion={
          <Link className="crm-boton crm-boton-primario" to={RUTA_PANEL}>
            Ir al panel
          </Link>
        }
      />
    </div>
  )
}
