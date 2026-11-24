import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { SesionLiderCrm } from '../api-crm'
import { apiSesionLider, ErrorCrmHttp, esNoAutenticado, mensajeDe } from '../datos/clienteCrm'
import { Icono, useTituloCrm } from '../ui'

/** Lo que guardan los gestores de contraseñas como usuario: hay una sola cuenta. */
const USUARIO_GESTOR = 'lider'

/** «1 minuto», «14 minutos» (hacia arriba); sin Retry-After, «unos minutos». */
function minutosDeEspera(segundos: number | undefined): string {
  if (segundos === undefined || segundos <= 0) return 'unos minutos'
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  return minutos === 1 ? '1 minuto' : `${minutos.toLocaleString('es-CO')} minutos`
}

/** El texto del error del ingreso: 401 y 429 con texto propio; lo demás, el del servidor o el de la red. */
function textoDelError(error: unknown): string {
  if (esNoAutenticado(error)) return 'Contraseña incorrecta.'
  if (error instanceof ErrorCrmHttp && (error.estado === 429 || error.codigo === 'demasiados_intentos')) {
    return `Demasiados intentos. Espere ${minutosDeEspera(error.reintentarEn)} e intente de nuevo.`
  }
  return mensajeDe(error)
}

/**
 * Ingreso del líder (/crm/lider sin sesión): solo la contraseña, en una
 * tarjeta centrada. El campo de usuario oculto (value «lider») es para que los
 * gestores de contraseñas la guarden y la llenen; no se ve ni recibe el foco
 * con Tab.
 *
 * - «Entrar» se deshabilita con el campo vacío y mientras envía.
 * - Errores: 401 → «Contraseña incorrecta.»; 429 → cuántos minutos esperar
 *   (Retry-After); lo demás, el mensaje del servidor o el de la red. El error se
 *   anuncia (role="alert") y el foco vuelve al campo, con el texto seleccionado.
 * - `aviso` va arriba del formulario (p. ej. «La sesión venció. Ingrese de
 *   nuevo.») y el campo lo lee al recibir el foco.
 */
export default function IngresoLider({
  aviso = null,
  alIngresar,
}: {
  aviso?: string | null
  alIngresar: (sesion: SesionLiderCrm) => void
}) {
  useTituloCrm('Ingreso del líder')
  const id = useId()
  const idCampo = `${id}-contrasena`
  const idAviso = `${id}-aviso`
  const idError = `${idCampo}-error`
  const campo = useRef<HTMLInputElement>(null)
  const [contrasena, setContrasena] = useState('')
  const [visible, setVisible] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando || contrasena.length === 0) return
    setEnviando(true)
    setError(null)
    // Al entrar, SitioLider cambia de fase y esta pantalla se va: no hace falta apagar «enviando».
    apiSesionLider.iniciar(contrasena).then(alIngresar, (fallo: unknown) => {
      setEnviando(false)
      setError(textoDelError(fallo))
      campo.current?.focus()
      campo.current?.select()
    })
  }

  const describe = [aviso ? idAviso : null, error ? idError : null].filter(Boolean).join(' ')

  return (
    <div className="crm-contenedor crm-pagina crm-li-ingreso">
      <section className="crm-li-tarjeta" aria-labelledby={`${id}-titulo`}>
        <div className="crm-li-tarjeta-cabeza">
          <span className="crm-li-sello" aria-hidden="true">
            <Icono nombre="candado" tamano={24} />
          </span>
          <h1 className="crm-titulo-pagina crm-li-ingreso-titulo" id={`${id}-titulo`}>
            Ingreso del líder
          </h1>
          <p className="crm-li-ingreso-texto">Escriba su contraseña para ver el panel del equipo.</p>
        </div>

        {aviso ? (
          <p className="crm-li-nota" id={idAviso} role="status">
            <Icono nombre="reloj" tamano={20} className="crm-li-nota-icono" />
            <span>{aviso}</span>
          </p>
        ) : null}

        <form className="crm-formulario" onSubmit={enviar}>
          <input
            className="crm-sr"
            type="text"
            name="username"
            autoComplete="username"
            value={USUARIO_GESTOR}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <div className="crm-campo">
            <label className="crm-campo-etiqueta" htmlFor={idCampo}>
              Contraseña
            </label>
            <div className="crm-li-clave">
              <input
                ref={campo}
                id={idCampo}
                className="crm-control"
                type={visible ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                // Es lo único que hay que hacer en esta pantalla.
                autoFocus
                value={contrasena}
                readOnly={enviando}
                onChange={(evento) => setContrasena(evento.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describe || undefined}
              />
              <button
                type="button"
                className="crm-boton-icono crm-li-ver"
                aria-label="Mostrar la contraseña"
                aria-pressed={visible}
                onClick={() => setVisible((antes) => !antes)}
              >
                <Icono nombre={visible ? 'ojo-tachado' : 'ojo'} />
              </button>
            </div>
            {error ? (
              <p className="crm-campo-error" id={idError} role="alert">
                <Icono nombre="alerta" tamano={16} />
                {error}
              </p>
            ) : null}
          </div>

          <button type="submit" className="crm-boton crm-boton-primario crm-li-entrar" disabled={enviando || contrasena.length === 0}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <Link to="/crm" className="crm-li-volver">
          Volver al inicio
        </Link>
      </section>
    </div>
  )
}
