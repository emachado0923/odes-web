/**
 * Ingreso con usuario y contraseña (kit: card card-lg, form-control,
 * btn btn-primary, alert), adaptado de repositorio/admin/sesion/PaginaIngreso.tsx:
 * - formulario real (method="post", name, autocomplete "username" y
 *   "current-password") para que los gestores de contraseñas lo reconozcan;
 * - mensaje genérico en 401, minutos de bloqueo en 429 (Retry-After) y el
 *   mensaje del servidor en 503 u otros errores;
 * - `vencida`: la sesión venció mientras se trabajaba; lo que estaba en
 *   pantalla se conserva debajo;
 * - el ojo dentro del campo muestra u oculta la contraseña (abierto: mostrar;
 *   tachado: ocultar) y "¿Olvidó su contraseña?" abre un correo a quien
 *   administra el aplicativo.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { LIMITES_PAI } from '../api-pai'
import { useTituloPai } from '../componentes/useTituloPai'
import { esErrorPai, mensajeDe } from '../datos/clientePai'
import { useSesionPai } from './contexto'
import { enlaceOlvidoContrasena, textoBloqueo } from './textos'
import './sesion.css'

/** visibility y visibility_off de Material Symbols (los del kit), viewBox "0 -960 960 960". */
const OJO_ABIERTO =
  'M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z'
const OJO_TACHADO =
  'm644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z'

type CampoIngreso = 'usuario' | 'contrasena'

export default function PaginaIngresoPai({ vencida = false }: { vencida?: boolean }) {
  useTituloPai(vencida ? 'Su sesión venció' : 'Ingresar')
  const { iniciar } = useSesionPai()
  const id = useId()
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<{ texto: string; campo: CampoIngreso | null } | null>(null)
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
    const nombre = usuario.trim().toLowerCase()
    if (!nombre) {
      setError({ texto: 'Escriba su usuario.', campo: 'usuario' })
      return
    }
    if (!contrasena) {
      setError({ texto: 'Escriba su contraseña.', campo: 'contrasena' })
      return
    }
    setEnviando(true)
    setError(null)
    setMostrar(false)
    try {
      await iniciar({ usuario: nombre, contrasena })
      // Al cambiar la sesión este componente se desmonta.
    } catch (e) {
      setEnviando(false)
      setContrasena('')
      if (esErrorPai(e) && e.estado === 429) setError({ texto: textoBloqueo(e.reintentarEn), campo: null })
      else if (esErrorPai(e) && e.estado === 401) setError({ texto: 'Usuario o contraseña incorrectos.', campo: null })
      else setError({ texto: mensajeDe(e), campo: null })
    }
  }

  const idError = `${id}-error`
  const idUsuario = `${id}-usuario`
  const idContrasena = `${id}-contrasena`
  return (
    <div className="pai-pagina pai-ingreso">
      <section className="card card-lg pai-ingreso-tarjeta" aria-labelledby={`${id}-titulo`}>
        <div className="card-body">
          <h1 className="h3" id={`${id}-titulo`} ref={refTitulo} tabIndex={-1}>
            {vencida ? 'Su sesión venció' : 'Ingresar'}
          </h1>
          <p>
            {vencida
              ? 'Inicie sesión de nuevo para continuar. Lo que estaba haciendo se conserva.'
              : 'Ingrese con el usuario y la contraseña que le entregó Planeación.'}
          </p>

          {error && (
            <div className="alert alert-danger" role="alert" id={idError} tabIndex={-1} ref={refError}>
              {error.texto}
            </div>
          )}

          <form method="post" action="" onSubmit={enviar} noValidate>
            <div className="mb-3">
              <label className="form-label" htmlFor={idUsuario}>
                Usuario
              </label>
              <input
                ref={refUsuario}
                id={idUsuario}
                className="form-control"
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
            <div className="mb-3">
              <label className="form-label" htmlFor={idContrasena}>
                Contraseña
              </label>
              <div className="pai-campo-contrasena">
                <input
                  ref={refContrasena}
                  id={idContrasena}
                  className="form-control"
                  name="password"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={LIMITES_PAI.maxContrasena}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  aria-invalid={error?.campo === 'contrasena' || undefined}
                  aria-describedby={error?.campo === 'contrasena' ? idError : undefined}
                  disabled={enviando}
                />
                <button
                  type="button"
                  className="pai-ver-contrasena"
                  aria-label="Mostrar contraseña"
                  aria-pressed={mostrar}
                  aria-controls={idContrasena}
                  onClick={() => setMostrar((m) => !m)}
                >
                  <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
                    <path d={mostrar ? OJO_TACHADO : OJO_ABIERTO} />
                  </svg>
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
          <p className="pai-ingreso-olvido mt-3 mb-0">
            <a href={enlaceOlvidoContrasena(usuario)}>¿Olvidó su contraseña?</a>
          </p>
        </div>
      </section>
    </div>
  )
}
