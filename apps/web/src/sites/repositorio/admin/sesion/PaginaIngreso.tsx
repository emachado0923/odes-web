/**
 * Inicio de sesión de la administración.
 *
 * - Formulario real (method="post", name, autocomplete="username" y
 *   "current-password") para que los gestores de contraseñas lo reconozcan.
 * - Error genérico del servidor ("Usuario o contraseña incorrectos.") y, con
 *   429, el aviso de bloqueo con los minutos de Retry-After.
 * - "vencida": la sesión caducó mientras se trabajaba; lo editado se conserva.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import Icono from '../componentes/IconoAdmin'
import { esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { useSesion } from './contexto'
import { textoBloqueo } from './textos'

export default function PaginaIngreso({ vencida = false }: { vencida?: boolean }) {
  const { iniciar } = useSesion()
  const id = useId()
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<{ texto: string; campo: 'usuario' | 'contrasena' | null } | null>(null)
  const refTitulo = useRef<HTMLHeadingElement>(null)
  const refUsuario = useRef<HTMLInputElement>(null)
  const refContrasena = useRef<HTMLInputElement>(null)
  const refError = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (vencida) refTitulo.current?.focus()
  }, [vencida])

  // Con un campo vacío el foco va a ese campo (su error queda en aria-describedby);
  // si el servidor rechazó el intento, al aviso.
  useEffect(() => {
    if (!error) return
    if (error.campo === 'usuario') refUsuario.current?.focus()
    else if (error.campo === 'contrasena') refContrasena.current?.focus()
    else refError.current?.focus()
  }, [error])

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const u = usuario.trim()
    if (!u) {
      setError({ texto: 'Escriba su usuario.', campo: 'usuario' })
      return
    }
    if (!contrasena) {
      setError({ texto: 'Escriba su contraseña.', campo: 'contrasena' })
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await iniciar({ usuario: u, contrasena })
      // El componente se desmonta al cambiar la sesión.
    } catch (e) {
      setEnviando(false)
      setContrasena('')
      if (esErrorAdmin(e) && e.estado === 429) {
        setError({ texto: textoBloqueo(e.reintentarEn), campo: null })
      } else if (esErrorAdmin(e) && e.estado === 401) {
        setError({ texto: 'Usuario o contraseña incorrectos.', campo: null })
      } else {
        setError({ texto: mensajeDe(e), campo: null })
      }
    }
  }

  const idError = `${id}-error`
  return (
    <div className="ra-ingreso">
      <title>Iniciar sesión · Administración del repositorio</title>
      <div className="ra-ingreso-tarjeta">
        <p className="ra-contexto-etiqueta">Administración</p>
        <h1 className="ra-titulo" ref={refTitulo} tabIndex={-1}>
          {vencida ? 'Su sesión venció' : 'Repositorio de productos'}
        </h1>
        <p className="ra-ingreso-texto">
          {vencida
            ? 'Inicie sesión de nuevo para continuar. Lo que estaba editando se conserva.'
            : 'Inicie sesión para agregar, editar, publicar o despublicar documentos.'}
        </p>

        {error && (
          <div className="ra-aviso ra-aviso-error" role="alert" id={idError} tabIndex={-1} ref={refError}>
            <Icono nombre="error" />
            <p>{error.texto}</p>
          </div>
        )}

        <form className="ra-formulario-ingreso" method="post" action="" onSubmit={enviar} noValidate>
          <div className="ra-campo">
            <label className="ra-etiqueta" htmlFor={`${id}-usuario`}>
              Usuario
            </label>
            <input
              ref={refUsuario}
              id={`${id}-usuario`}
              className="ra-control"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={64}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              aria-invalid={error?.campo === 'usuario' || undefined}
              aria-describedby={error?.campo === 'usuario' ? idError : undefined}
              disabled={enviando}
            />
          </div>
          <div className="ra-campo">
            <label className="ra-etiqueta" htmlFor={`${id}-contrasena`}>
              Contraseña
            </label>
            <div className="ra-contrasena">
              <input
                ref={refContrasena}
                id={`${id}-contrasena`}
                className="ra-control"
                name="password"
                type={mostrar ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={1024}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                aria-invalid={error?.campo === 'contrasena' || undefined}
                aria-describedby={error?.campo === 'contrasena' ? idError : undefined}
                disabled={enviando}
              />
              <button
                type="button"
                className="ra-boton-texto ra-mostrar"
                aria-pressed={mostrar}
                aria-controls={`${id}-contrasena`}
                onClick={() => setMostrar((m) => !m)}
              >
                {mostrar ? 'Ocultar' : 'Mostrar'}
                <span className="rp-oculto"> contraseña</span>
              </button>
            </div>
          </div>
          <button type="submit" className="rp-boton ra-boton-ancho" disabled={enviando} aria-disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="ra-ingreso-ayuda">
          ¿Olvidó su contraseña o necesita una cuenta? Pídala a quien administra el servidor del repositorio.
        </p>
      </div>
    </div>
  )
}
