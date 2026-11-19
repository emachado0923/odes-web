/**
 * Formulario de cambio de la contraseña propia (PUT /sesion/contrasena), para
 * el cambio obligatorio de la contraseña temporal y para /pai/cuenta.
 *
 * - Contraseña actual, nueva y confirmación, con las reglas del servidor
 *   (textos.ts) revisadas antes de enviar; los errores quedan junto a cada
 *   campo (aria-invalid + aria-describedby) y el foco va al primero.
 * - Lleva el usuario en un campo oculto con autocomplete="username" para
 *   que los gestores de contraseñas guarden la nueva con su cuenta.
 * - Avisa de cambios sin guardar (useCambiosPendientes).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { LIMITES_PAI } from '../api-pai'
import { useCambiosPendientes } from '../componentes/cambiosPendientes'
import { esErrorPai, mensajeDe } from '../datos/clientePai'
import { useSesionPai } from './contexto'
import {
  AYUDA_CONTRASENA,
  erroresCambioContrasena,
  textoBloqueo,
  type CampoCambioContrasena,
  type DatosCambioContrasena,
} from './textos'

const VACIO: DatosCambioContrasena = { actual: '', nueva: '', confirmacion: '' }
const ORDEN: CampoCambioContrasena[] = ['actual', 'nueva', 'confirmacion']

export interface PropsFormularioContrasena {
  /** Etiqueta del campo de la contraseña actual ("Contraseña temporal" en el cambio obligatorio). */
  etiquetaActual?: string
  textoBoton?: string
  /** Se llama después de cambiarla (la sesión ya quedó actualizada). */
  alCambiar?: () => void
}

export default function FormularioContrasena({
  etiquetaActual = 'Contraseña actual',
  textoBoton = 'Cambiar la contraseña',
  alCambiar,
}: PropsFormularioContrasena) {
  const { sesion, cambiarContrasena } = useSesionPai()
  const id = useId()
  const [datos, setDatos] = useState<DatosCambioContrasena>(VACIO)
  const [mostrar, setMostrar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<Partial<Record<CampoCambioContrasena, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [enfocar, setEnfocar] = useState(0)
  const refs = {
    actual: useRef<HTMLInputElement>(null),
    nueva: useRef<HTMLInputElement>(null),
    confirmacion: useRef<HTMLInputElement>(null),
  }
  const refError = useRef<HTMLDivElement>(null)

  useCambiosPendientes(datos.actual !== '' || datos.nueva !== '' || datos.confirmacion !== '')

  useEffect(() => {
    if (enfocar === 0) return
    const primero = ORDEN.find((campo) => errores[campo])
    if (primero) refs[primero].current?.focus()
    else refError.current?.focus()
    // Solo al enviar (enfocar cambia); refs son estables.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar])

  function cambiar(campo: CampoCambioContrasena, valor: string) {
    setDatos((previo) => ({ ...previo, [campo]: valor }))
    if (errores[campo]) setErrores((previo) => ({ ...previo, [campo]: undefined }))
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const encontrados = erroresCambioContrasena(datos)
    setError(null)
    setErrores(encontrados)
    if (Object.keys(encontrados).length > 0) {
      setEnfocar((n) => n + 1)
      return
    }
    setEnviando(true)
    try {
      await cambiarContrasena({ actual: datos.actual, nueva: datos.nueva })
      setDatos(VACIO)
      setEnviando(false)
      alCambiar?.()
    } catch (e) {
      setEnviando(false)
      const campos = esErrorPai(e) ? e.campos : {}
      const delServidor: Partial<Record<CampoCambioContrasena, string>> = {}
      if (campos.actual) delServidor.actual = campos.actual
      if (campos.nueva) delServidor.nueva = campos.nueva
      setErrores(delServidor)
      // 429: demasiados intentos con la contraseña actual equivocada (con Retry-After).
      setError(esErrorPai(e) && e.estado === 429 ? textoBloqueo(e.reintentarEn) : mensajeDe(e))
      if (delServidor.actual) setDatos((previo) => ({ ...previo, actual: '' }))
      setEnfocar((n) => n + 1)
    }
  }

  function campo(nombre: CampoCambioContrasena, etiqueta: string, autocompletar: string, ayuda?: string) {
    const idCampo = `${id}-${nombre}`
    const idAyuda = ayuda ? `${idCampo}-ayuda` : undefined
    const idErrorCampo = errores[nombre] ? `${idCampo}-error` : undefined
    return (
      <div className="mb-3">
        <label className="form-label" htmlFor={idCampo}>
          {etiqueta}
        </label>
        <input
          ref={refs[nombre]}
          id={idCampo}
          className={`form-control${errores[nombre] ? ' is-invalid' : ''}`}
          type={mostrar ? 'text' : 'password'}
          name={nombre === 'actual' ? 'current-password' : nombre === 'nueva' ? 'new-password' : 'confirm-password'}
          autoComplete={autocompletar}
          maxLength={LIMITES_PAI.maxContrasena}
          value={datos[nombre]}
          onChange={(e) => cambiar(nombre, e.target.value)}
          aria-invalid={errores[nombre] ? true : undefined}
          aria-describedby={[idErrorCampo, idAyuda].filter(Boolean).join(' ') || undefined}
          disabled={enviando}
        />
        {errores[nombre] && (
          <div className="invalid-feedback d-block" id={idErrorCampo}>
            {errores[nombre]}
          </div>
        )}
        {ayuda && (
          <div className="form-text" id={idAyuda}>
            {ayuda}
          </div>
        )}
      </div>
    )
  }

  return (
    <form method="post" action="" onSubmit={enviar} noValidate className="pai-formulario-contrasena">
      {error && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={refError}>
          {error}
        </div>
      )}
      <input type="text" name="username" autoComplete="username" value={sesion?.usuario ?? ''} readOnly hidden />
      {campo('actual', etiquetaActual, 'current-password')}
      {campo('nueva', 'Contraseña nueva', 'new-password', AYUDA_CONTRASENA)}
      {campo('confirmacion', 'Confirme la contraseña nueva', 'new-password')}
      <div className="form-check mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id={`${id}-mostrar`}
          checked={mostrar}
          onChange={(e) => setMostrar(e.target.checked)}
        />
        <label className="form-check-label" htmlFor={`${id}-mostrar`}>
          Mostrar las contraseñas
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Guardando…' : textoBoton}
      </button>
    </form>
  )
}
