/**
 * /pai/cuenta: datos de la cuenta (usuario, nombre, rol) y cambio de la
 * contraseña propia (exige la actual; el servidor cierra las demás sesiones
 * del usuario).
 */
import { useState } from 'react'
import { useTituloPai } from '../componentes/useTituloPai'
import { nombreRol, useSesionActivaPai } from './contexto'
import FormularioContrasena from './FormularioContrasena'
import './sesion.css'

export default function PaginaCuenta() {
  useTituloPai('Mi cuenta')
  const sesion = useSesionActivaPai()
  const [cambiada, setCambiada] = useState(false)

  return (
    <div className="pai-pagina">
      <h1 className="h3 mb-4">Mi cuenta</h1>
      <div className="row g-4">
        <div className="col-12 col-lg-5">
          <section className="card card-lg h-100" aria-labelledby="pai-cuenta-datos">
            <div className="card-header">
              <h2 className="card-title h5 mb-0" id="pai-cuenta-datos">
                Datos de la cuenta
              </h2>
            </div>
            <div className="card-body">
              <dl className="pai-datos-cuenta mb-0">
                <dt>Nombre</dt>
                <dd>{sesion.nombre || '—'}</dd>
                <dt>Usuario</dt>
                <dd>{sesion.usuario}</dd>
                <dt>Rol</dt>
                <dd>{nombreRol(sesion.rol)}</dd>
              </dl>
              <p className="form-text mt-3 mb-0">
                Para cambiar el nombre, el rol o los indicadores asignados, escriba a Planeación.
              </p>
            </div>
          </section>
        </div>
        <div className="col-12 col-lg-7">
          <section className="card card-lg h-100" aria-labelledby="pai-cuenta-contrasena">
            <div className="card-header">
              <h2 className="card-title h5 mb-0" id="pai-cuenta-contrasena">
                Cambiar la contraseña
              </h2>
            </div>
            <div className="card-body">
              <div role="status" aria-live="polite">
                {cambiada && (
                  <div className="alert alert-success">
                    Su contraseña se cambió. Las demás sesiones abiertas con su usuario se cerraron.
                  </div>
                )}
              </div>
              <FormularioContrasena alCambiar={() => setCambiada(true)} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
