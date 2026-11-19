/**
 * Cambio obligatorio de la contraseña temporal (sesión con
 * debeCambiarContrasena). Mientras tanto el servidor responde 403
 * cambio_contrasena_requerido a todo lo demás; al cambiarla, la sesión queda
 * sin la marca y PuertaSesionPai muestra la página que se pidió. La barra
 * conserva "Cerrar sesión".
 */
import { useId } from 'react'
import { useTituloPai } from '../componentes/useTituloPai'
import { useSesionActivaPai } from './contexto'
import FormularioContrasena from './FormularioContrasena'
import './sesion.css'

export default function CambioContrasenaObligatorio() {
  useTituloPai('Cambie su contraseña')
  const sesion = useSesionActivaPai()
  const id = useId()
  return (
    <div className="pai-pagina pai-ingreso">
      <section className="card card-lg pai-ingreso-tarjeta" aria-labelledby={`${id}-titulo`}>
        <div className="card-body">
          <p className="pai-ingreso-etiqueta">Plan de Acción Institucional</p>
          <h1 className="h3" id={`${id}-titulo`}>
            Cambie su contraseña temporal
          </h1>
          <p>
            Hola, {sesion.nombre || sesion.usuario}. Planeación le asignó una contraseña temporal: antes de continuar,
            elija una contraseña nueva que solo usted conozca.
          </p>
          <FormularioContrasena etiquetaActual="Contraseña temporal" textoBoton="Guardar y continuar" />
        </div>
      </section>
    </div>
  )
}
