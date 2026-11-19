/**
 * Crear o editar una cuenta del PAI (POST / PATCH /admin/usuarios).
 *
 * - Crear: usuario (PATRON_USUARIO_PAI), nombre, correo, cargo, rol y
 *   contraseña temporal (obligatoria, con generador y botón Copiar).
 * - Editar: nombre, correo, cargo, rol, activo y, si se pide, una contraseña
 *   temporal nueva (el servidor cierra sus sesiones y le pide cambiarla al
 *   entrar). Solo se envían los campos que cambiaron.
 * - El administrador no puede desactivarse ni quitarse el rol a sí mismo
 *   (el servidor responde 409; aquí esos campos quedan deshabilitados).
 * - Errores junto a cada campo (los del servidor también, por `campos`) y
 *   aviso antes de descartar cambios sin guardar.
 * - Con contraseña temporal (cuenta nueva o restablecida), al guardar no se
 *   cierra: muestra el usuario y la contraseña para entregarlos (con
 *   Copiar), porque después ya no se ven en ninguna parte; se cierra con
 *   «Listo». onGuardado actualiza la lista sin cerrar; onCerrar cierra.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  LIMITES_PAI,
  ROLES_PAI,
  type CambiosUsuarioPai,
  type DatosUsuarioNuevoPai,
  type RolPai,
  type UsuarioPai,
} from '../api-pai'
import { useCambiosPendientes } from '../componentes/cambiosPendientes'
import ModalPai from '../componentes/ModalPai'
import { esErrorPai, mensajeDe } from '../datos/clientePai'
import { nombreRol, useClientePai } from '../sesion/contexto'
import { AYUDA_CONTRASENA } from '../sesion/textos'
import { generarContrasenaTemporal } from './contrasenaTemporal'
import {
  ORDEN_CAMPOS,
  campoDelServidor,
  erroresUsuario,
  formularioInicial,
  mismoFormulario,
  type CampoUsuario,
  type FormularioUsuario,
} from './usuarios'

export default function ModalUsuario({
  usuario,
  propio,
  onCerrar,
  onGuardado,
}: {
  /** null: cuenta nueva. */
  usuario: UsuarioPai | null
  /** ¿Es la cuenta de quien edita? */
  propio: boolean
  onCerrar: () => void
  /** La cuenta quedó guardada (el modal puede seguir abierto para entregar la contraseña). */
  onGuardado: (usuario: UsuarioPai, creado: boolean) => void
}) {
  const cliente = useClientePai()
  const id = useId()
  const nuevo = usuario === null
  const original = useMemo(() => formularioInicial(usuario), [usuario])
  const [datos, setDatos] = useState<FormularioUsuario>(original)
  const [errores, setErrores] = useState<Partial<Record<CampoUsuario, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [enfocar, setEnfocar] = useState(0)
  /** Guardada con contraseña temporal: los datos para entregar. */
  const [entrega, setEntrega] = useState<{ usuario: UsuarioPai; creado: boolean; contrasena: string } | null>(null)
  const refFormulario = useRef<HTMLFormElement>(null)
  const refNombre = useRef<HTMLInputElement>(null)
  const refEntrega = useRef<HTMLDivElement>(null)
  const sucio = entrega === null && !mismoFormulario(datos, original)
  useCambiosPendientes(sucio)

  useEffect(() => {
    if (entrega) refEntrega.current?.focus()
  }, [entrega])

  useEffect(() => {
    if (enfocar === 0 || !refFormulario.current) return
    const primero = ORDEN_CAMPOS.find((campo) => errores[campo])
    const destino = primero
      ? refFormulario.current.querySelector<HTMLElement>(`[data-campo="${primero}"]`)
      : refFormulario.current.querySelector<HTMLElement>('.alert')
    destino?.focus()
    // Solo después de enviar (enfocar cambia).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar])

  function cambiar<K extends keyof FormularioUsuario>(campo: K, valor: FormularioUsuario[K]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }))
    setDescartar(false)
    const clave: CampoUsuario | null = campo === 'restablecer' ? 'contrasena' : (campo as CampoUsuario)
    if (clave && errores[clave]) setErrores((previo) => ({ ...previo, [clave]: undefined }))
  }

  function generar() {
    cambiar('contrasena', generarContrasenaTemporal())
    setCopiado(null)
  }

  async function copiar(texto = datos.contrasena) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado('Contraseña copiada.')
    } catch {
      setCopiado('No se pudo copiar: selecciónela y cópiela a mano.')
    }
  }

  function pedirCierre() {
    if (guardando) return
    if (entrega) {
      onCerrar()
      return
    }
    if (sucio && !descartar) {
      setDescartar(true)
      return
    }
    onCerrar()
  }

  function cambios(): CambiosUsuarioPai {
    const resultado: CambiosUsuarioPai = {}
    if (datos.nombre.trim() !== original.nombre) resultado.nombre = datos.nombre.trim()
    if (datos.correo.trim() !== original.correo) resultado.correo = datos.correo.trim() || null
    if (datos.cargo.trim() !== original.cargo) resultado.cargo = datos.cargo.trim() || null
    if (datos.rol !== original.rol) resultado.rol = datos.rol
    if (datos.activo !== original.activo) resultado.activo = datos.activo
    if (datos.restablecer) resultado.contrasenaTemporal = datos.contrasena
    return resultado
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    const encontrados = erroresUsuario(datos, nuevo)
    setErrores(encontrados)
    setError(null)
    setDescartar(false)
    if (Object.keys(encontrados).length > 0) {
      setEnfocar((n) => n + 1)
      return
    }
    setGuardando(true)
    try {
      if (nuevo) {
        const cuerpo: DatosUsuarioNuevoPai = {
          usuario: datos.usuario.trim(),
          nombre: datos.nombre.trim(),
          correo: datos.correo.trim() || null,
          cargo: datos.cargo.trim() || null,
          rol: datos.rol,
          contrasenaTemporal: datos.contrasena,
        }
        const creado = await cliente.crearUsuario(cuerpo)
        onGuardado(creado, true)
        setGuardando(false)
        setCopiado(null)
        setEntrega({ usuario: creado, creado: true, contrasena: cuerpo.contrasenaTemporal })
      } else {
        const cuerpo = cambios()
        if (Object.keys(cuerpo).length === 0) {
          onCerrar()
          return
        }
        const actualizado = await cliente.actualizarUsuario(usuario.id, cuerpo)
        onGuardado(actualizado, false)
        if (cuerpo.contrasenaTemporal) {
          setGuardando(false)
          setCopiado(null)
          setEntrega({ usuario: actualizado, creado: false, contrasena: cuerpo.contrasenaTemporal })
        } else {
          onCerrar()
        }
      }
    } catch (e) {
      setGuardando(false)
      const delServidor: Partial<Record<CampoUsuario, string>> = {}
      if (esErrorPai(e)) {
        for (const [campo, mensaje] of Object.entries(e.campos)) {
          const propioCampo = campoDelServidor(campo)
          if (propioCampo) delServidor[propioCampo] = mensaje
        }
      }
      setErrores(delServidor)
      setError(mensajeDe(e))
      setEnfocar((n) => n + 1)
    }
  }

  function atributos(campo: CampoUsuario, ayuda?: boolean) {
    const idCampo = `${id}-${campo}`
    const descripcion = [errores[campo] ? `${idCampo}-error` : null, ayuda ? `${idCampo}-ayuda` : null]
      .filter(Boolean)
      .join(' ')
    return {
      id: idCampo,
      'data-campo': campo,
      'aria-invalid': errores[campo] ? true : undefined,
      'aria-describedby': descripcion || undefined,
      disabled: guardando,
    }
  }

  function errorDe(campo: CampoUsuario) {
    return errores[campo] ? (
      <div className="invalid-feedback d-block" id={`${id}-${campo}-error`}>
        {errores[campo]}
      </div>
    ) : null
  }

  const pedirContrasena = nuevo || datos.restablecer
  const idFormulario = `${id}-formulario`
  const titulo = nuevo ? 'Crear usuario' : `Editar a ${usuario.nombre || usuario.usuario}`

  if (entrega) {
    const nombre = entrega.usuario.nombre || entrega.usuario.usuario
    return (
      <ModalPai
        abierto
        titulo={titulo}
        onCerrar={onCerrar}
        tamano="lg"
        enfoqueInicial={refEntrega}
        pie={
          <button type="button" className="btn btn-primary" onClick={onCerrar}>
            Listo
          </button>
        }
      >
        <div className="alert alert-success" tabIndex={-1} ref={refEntrega}>
          <p className="fw-bold mb-1">
            {entrega.creado
              ? `Se creó la cuenta de ${nombre}.`
              : `Se asignó una contraseña temporal nueva a ${nombre}; sus sesiones abiertas se cerraron.`}
          </p>
          <p className="mb-0">
            Entréguele estos datos por un medio seguro: deberá cambiar la contraseña al ingresar. Cuando cierre esta
            ventana, la contraseña ya no se volverá a mostrar.
          </p>
        </div>
        <dl className="pai-entrega">
          <dt>Usuario</dt>
          <dd>
            <code>{entrega.usuario.usuario}</code>
          </dd>
          <dt>Contraseña temporal</dt>
          <dd className="pai-entrega-contrasena">
            <code className="pai-contrasena-visible">{entrega.contrasena}</code>
            {typeof navigator !== 'undefined' && navigator.clipboard && (
              <button type="button" className="btn btn-outline-neutral btn-sm" onClick={() => void copiar(entrega.contrasena)}>
                Copiar<span className="pai-solo-lector"> la contraseña temporal</span>
              </button>
            )}
          </dd>
        </dl>
        <p className="pai-solo-lector" role="status" aria-live="polite">
          {copiado ?? ''}
        </p>
        {copiado && (
          <p className="form-text mb-0" aria-hidden="true">
            {copiado}
          </p>
        )}
      </ModalPai>
    )
  }

  return (
    <ModalPai
      abierto
      titulo={titulo}
      onCerrar={pedirCierre}
      bloqueado={guardando}
      tamano="lg"
      enfoqueInicial={nuevo ? undefined : refNombre}
      pie={
        descartar ? (
          <>
            <p className="me-auto mb-0" role="alert">
              Hay cambios sin guardar. ¿Descartarlos?
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setDescartar(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={onCerrar}>
              Descartar cambios
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline-neutral" onClick={pedirCierre} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" form={idFormulario} className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : nuevo ? 'Crear usuario' : 'Guardar cambios'}
            </button>
          </>
        )
      }
    >
      <form id={idFormulario} ref={refFormulario} onSubmit={enviar} noValidate className="pai-formulario-usuario">
        {error && (
          <div className="alert alert-danger" role="alert" tabIndex={-1}>
            {error}
          </div>
        )}
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor={`${id}-usuario`}>
              Usuario {nuevo && <span className="pai-requerido">(obligatorio)</span>}
            </label>
            <input
              {...atributos('usuario', nuevo)}
              className={`form-control${errores.usuario ? ' is-invalid' : ''}`}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              value={datos.usuario}
              readOnly={!nuevo}
              onChange={(e) => cambiar('usuario', e.target.value.toLowerCase())}
            />
            {errorDe('usuario')}
            {nuevo ? (
              <div className="form-text" id={`${id}-usuario-ayuda`}>
                Con este nombre ingresa (p. ej., maria.gomez). No se puede cambiar después.
              </div>
            ) : null}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor={`${id}-nombre`}>
              Nombre completo <span className="pai-requerido">(obligatorio)</span>
            </label>
            <input
              {...atributos('nombre')}
              ref={refNombre}
              className={`form-control${errores.nombre ? ' is-invalid' : ''}`}
              type="text"
              autoComplete="off"
              maxLength={LIMITES_PAI.maxNombreUsuario}
              value={datos.nombre}
              onChange={(e) => cambiar('nombre', e.target.value)}
            />
            {errorDe('nombre')}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor={`${id}-correo`}>
              Correo
            </label>
            <input
              {...atributos('correo')}
              className={`form-control${errores.correo ? ' is-invalid' : ''}`}
              type="email"
              autoComplete="off"
              maxLength={LIMITES_PAI.maxCorreo}
              value={datos.correo}
              onChange={(e) => cambiar('correo', e.target.value)}
            />
            {errorDe('correo')}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor={`${id}-cargo`}>
              Cargo
            </label>
            <input
              {...atributos('cargo')}
              className={`form-control${errores.cargo ? ' is-invalid' : ''}`}
              type="text"
              autoComplete="off"
              maxLength={LIMITES_PAI.maxCargo}
              value={datos.cargo}
              onChange={(e) => cambiar('cargo', e.target.value)}
            />
            {errorDe('cargo')}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor={`${id}-rol`}>
              Rol
            </label>
            <select
              {...atributos('rol', true)}
              className={`form-select${errores.rol ? ' is-invalid' : ''}`}
              value={datos.rol}
              disabled={guardando || (propio && !nuevo)}
              onChange={(e) => cambiar('rol', e.target.value as RolPai)}
            >
              {ROLES_PAI.map((rol) => (
                <option key={rol} value={rol}>
                  {nombreRol(rol)}
                </option>
              ))}
            </select>
            {errorDe('rol')}
            <div className="form-text" id={`${id}-rol-ayuda`}>
              {propio && !nuevo
                ? 'No puede quitarse a sí mismo el rol de administrador.'
                : 'Responsable: reporta solo los indicadores asignados. Administrador: ve todo en solo lectura y administra.'}
            </div>
          </div>
          {!nuevo && (
            <div className="col-12 col-md-6">
              <span className="form-label d-block">Estado</span>
              <div className="form-check form-switch">
                <input
                  {...atributos('activo', true)}
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={datos.activo}
                  disabled={guardando || propio}
                  onChange={(e) => cambiar('activo', e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`${id}-activo`}>
                  Cuenta activa
                </label>
              </div>
              {errorDe('activo')}
              <div className="form-text" id={`${id}-activo-ayuda`}>
                {propio
                  ? 'No puede desactivar su propia cuenta.'
                  : 'Una cuenta inactiva no puede ingresar; al desactivarla se cierran sus sesiones.'}
              </div>
            </div>
          )}
          <div className="col-12">
            <fieldset className="pai-contrasena-temporal">
              <legend className="form-label">Contraseña temporal</legend>
              {!nuevo && (
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`${id}-restablecer`}
                    checked={datos.restablecer}
                    disabled={guardando}
                    onChange={(e) => {
                      cambiar('restablecer', e.target.checked)
                      if (!e.target.checked) cambiar('contrasena', '')
                    }}
                  />
                  <label className="form-check-label" htmlFor={`${id}-restablecer`}>
                    Asignar una contraseña temporal nueva
                  </label>
                </div>
              )}
              {pedirContrasena && (
                <>
                  <label className="pai-solo-lector" htmlFor={`${id}-contrasena`}>
                    Contraseña temporal
                  </label>
                  <div className="input-group">
                    <input
                      {...atributos('contrasena', true)}
                      className={`form-control pai-contrasena-visible${errores.contrasena ? ' is-invalid' : ''}`}
                      type="text"
                      autoComplete="new-password"
                      spellCheck={false}
                      maxLength={LIMITES_PAI.maxContrasena}
                      value={datos.contrasena}
                      onChange={(e) => cambiar('contrasena', e.target.value)}
                    />
                    <button type="button" className="btn btn-outline-neutral" onClick={generar} disabled={guardando}>
                      Generar
                    </button>
                    {typeof navigator !== 'undefined' && navigator.clipboard && (
                      <button
                        type="button"
                        className="btn btn-outline-neutral"
                        onClick={() => void copiar()}
                        disabled={guardando || !datos.contrasena}
                      >
                        Copiar
                      </button>
                    )}
                  </div>
                  {errorDe('contrasena')}
                  <div className="form-text" id={`${id}-contrasena-ayuda`}>
                    {AYUDA_CONTRASENA} Entréguela a la persona por un medio seguro: deberá cambiarla al ingresar.
                    {!nuevo && ' Al guardarla se cierran sus sesiones abiertas.'}
                  </div>
                  <p className="pai-solo-lector" role="status" aria-live="polite">
                    {copiado ?? ''}
                  </p>
                  {copiado && (
                    <p className="form-text mb-0" aria-hidden="true">
                      {copiado}
                    </p>
                  )}
                </>
              )}
            </fieldset>
          </div>
        </div>
      </form>
    </ModalPai>
  )
}
