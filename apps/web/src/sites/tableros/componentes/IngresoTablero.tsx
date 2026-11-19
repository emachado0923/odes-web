import { type FormEvent, useId, useState } from 'react'
import { LOGO_OBSERVATORIO } from '../recursos/recursos'
import { iniciarSesion, type SesionTableros } from '../sesion-tableros'

/**
 * Ingreso a un tablero privado, con la misma tarjeta de la ventana de
 * bienvenida de los tableros (franja azul con el logo, etiqueta morada,
 * título, texto y botón magenta: clases bienvenida-* de
 * ../matricula/tablero-matricula.css), pero en la página y no encima.
 * Las cuentas son las de los tableros (npm run tableros:crear-usuario), no
 * las de la administración ni las del PAI.
 */
export default function IngresoTablero({
  titulo,
  aviso,
  alIngresar,
}: {
  titulo: string
  /** Mensaje previo, por ejemplo «La sesión venció». */
  aviso?: string | null
  alIngresar: (sesion: SesionTableros) => void
}) {
  const id = useId()
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setError(null)
    setEnviando(true)
    try {
      alIngresar(await iniciarSesion(usuario.trim(), contrasena))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.')
      setContrasena('')
      setEnviando(false)
    }
  }

  return (
    <div className="ingreso-tablero">
      <form className="bienvenida" onSubmit={enviar} aria-labelledby={`${id}-titulo`} noValidate>
        <div className="bienvenida-cabecera">
          <img src={LOGO_OBSERVATORIO.src} alt="Observatorio de Sapiencia" width={LOGO_OBSERVATORIO.ancho} height={LOGO_OBSERVATORIO.alto} />
        </div>
        <div className="bienvenida-cuerpo">
          <div className="bienvenida-etiqueta">Acceso restringido</div>
          <h2 className="bienvenida-titulo" id={`${id}-titulo`}>
            {titulo}
          </h2>
          <p className="bienvenida-texto">Este tablero es de uso interno de Sapiencia. Ingrese con su usuario y contraseña de los tableros.</p>
          {(error ?? aviso) && (
            <div className={`ingreso-aviso${error ? ' ingreso-aviso-error' : ''}`} role={error ? 'alert' : 'status'}>
              {error ?? aviso}
            </div>
          )}
          <div className="ingreso-campos">
            <label className="ingreso-etiqueta" htmlFor={`${id}-usuario`}>
              Usuario
            </label>
            <input
              id={`${id}-usuario`}
              className="ingreso-campo"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
            />
            <label className="ingreso-etiqueta" htmlFor={`${id}-contrasena`}>
              Contraseña
            </label>
            <input
              id={`${id}-contrasena`}
              className="ingreso-campo"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </div>
        </div>
        <div className="bienvenida-pie">
          <span className="bienvenida-fuente">Observatorio de Sapiencia</span>
          <button type="submit" className="bienvenida-boton" disabled={enviando || !usuario.trim() || !contrasena}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </div>
      </form>
    </div>
  )
}
