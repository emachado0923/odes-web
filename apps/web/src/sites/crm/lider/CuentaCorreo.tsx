/**
 * «Cuenta de envío», arriba de la bandeja de correos (/crm/lider/correos):
 * desde qué cuenta salen los avisos del CRM y, si el servidor no la trae en
 * sus variables CRM_CORREO_*, el formulario para guardarla (la cuenta de
 * Google Workspace de la oficina con su contraseña de aplicación). Contrato:
 * «Cuenta de correo (líder)» en ../api-crm.ts.
 *
 * - origen 'ninguna': los avisos quedan guardados y no salen; la acción
 *   principal es «Configurar correo».
 * - origen 'base': la cuenta guardada y cuándo; «Cambiar», «Enviar prueba» y
 *   «Quitar cuenta» (con confirmación).
 * - origen 'variables': la del servidor, solo para ver, y «Enviar prueba».
 * - Fuera del modo 'smtp' (desarrollo) dice que no sale correo real.
 * - La contraseña nunca vuelve del servidor. Guardar manda solo lo que hay,
 *   sin espacios en los bordes; la clave vacía no va y el servidor conserva la
 *   guardada. Los errores 400 con `campos` van junto a su campo; el 409 y los
 *   demás, arriba del formulario.
 * - Con la cuenta guardada: aviso «Cuenta guardada.», avisarCambioCorreos() y,
 *   con la casilla marcada, un correo de prueba. El resultado de una prueba se
 *   ve en su diálogo o, si ya lo cerraron, como aviso.
 * - Ante un 401 llama vencida().
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  HOST_SMTP_GOOGLE,
  LIMITES_CRM,
  type CuentaCorreoCrm,
  type GuardarCuentaCorreoCrm,
  type ResultadoPruebaCorreoCrm,
} from '../api-crm'
import { ErrorCrmHttp, esNoAutenticado, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { ariaCampo, Campo, Cargando, Dialogo, ErrorCarga, fechaHora, Icono, useAvisar } from '../ui'
import { useLider } from './contexto'
import './cuenta-correo.css'

/** Donde se crea la contraseña de aplicación de una cuenta de Google. */
const URL_CONTRASENAS_APLICACION = 'https://myaccount.google.com/apppasswords'
/** TLS desde el inicio; con el 587 va STARTTLS. */
const PUERTO_TLS = 465
const PUERTO_STARTTLS = 587
const NOMBRE_POR_DEFECTO = 'Planeación Sapiencia'
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUGERENCIA_REINTENTAR = 'Ya puede reenviar los avisos pendientes con «Reintentar».'
const AYUDA_CLAVE_GUARDADA = 'Déjela vacía para conservar la guardada.'
const AYUDA_HOST = `Para Google Workspace (como @sapiencia.gov.co): ${HOST_SMTP_GOOGLE}`
const AYUDA_SEGURO = `Va con el puerto ${PUERTO_TLS}. Sin marcar se usa STARTTLS, con el ${PUERTO_STARTTLS}.`
const AYUDA_NOMBRE = 'Así aparece el remitente en los correos.'
const AYUDA_PARA = 'Si lo deja vacío, la prueba le llega a usted.'

function conPunto(texto: string): string {
  return /[.!?…]$/.test(texto) ? texto : `${texto}.`
}

/** «smtp.gmail.com:465», solo el host, o null. */
function servidorDe({ host, puerto }: CuentaCorreoCrm): string | null {
  if (!host) return null
  return puerto ? `${host}:${puerto}` : host
}

/** «odes-web@sapiencia.gov.co (smtp.gmail.com:465)», con la cuenta resaltada. */
function CuentaYServidor({ cuenta }: { cuenta: CuentaCorreoCrm }) {
  const servidor = servidorDe(cuenta)
  if (!cuenta.usuario) return <>{servidor}</>
  return (
    <>
      <strong className="crm-cc-cuenta">{cuenta.usuario}</strong>
      {servidor ? ` (${servidor})` : null}
    </>
  )
}

/** Fuera de 'smtp' (desarrollo y pruebas) el correo no sale de verdad. */
function NotaModo({ cuenta }: { cuenta: CuentaCorreoCrm }) {
  if (cuenta.modo === 'smtp') return null
  return (
    <p className="crm-cc-modo">
      <Icono nombre="info" tamano={16} />
      {`Modo ${cuenta.modo}: no sale correo real.`}
    </p>
  )
}

function ErrorArriba({ texto }: { texto: string }) {
  return (
    <p className="crm-campo-error crm-cc-error" role="alert">
      <Icono nombre="alerta" tamano={16} />
      {texto}
    </p>
  )
}

// ───────── Correo de prueba ─────────

interface ResultadoPrueba {
  exito: boolean
  mensaje: string
}

type EstadoPrueba = { fase: 'quieta' } | { fase: 'enviando' } | { fase: 'lista'; resultado: ResultadoPrueba }

function resultadoDe(respuesta: ResultadoPruebaCorreoCrm): ResultadoPrueba {
  const mensaje = respuesta.mensaje.trim()
  if (respuesta.enviado) return { exito: true, mensaje: mensaje || `Se envió un correo de prueba a ${respuesta.para}.` }
  return { exito: false, mensaje: mensaje || `No se pudo enviar el correo de prueba a ${respuesta.para}.` }
}

/** El error de la petición (un 429 trae su mensaje y cuánto esperar). */
function resultadoDelError(error: unknown): ResultadoPrueba {
  const delCampo = error instanceof ErrorCrmHttp ? error.campos?.para : undefined
  return { exito: false, mensaje: delCampo ?? mensajeDe(error) }
}

/**
 * Manda el correo de prueba. El resultado queda en `prueba` mientras el
 * diálogo que lo pidió siga abierto; si ya lo cerraron, sale como aviso.
 */
function usePrueba() {
  const { api, vencida } = useLider()
  const avisar = useAvisar()
  const [prueba, setPrueba] = useState<EstadoPrueba>({ fase: 'quieta' })
  const abierto = useRef(false)
  useEffect(() => {
    abierto.current = true
    return () => {
      abierto.current = false
    }
  }, [])

  async function probar(para?: string) {
    setPrueba({ fase: 'enviando' })
    let resultado: ResultadoPrueba
    try {
      resultado = resultadoDe(await (para ? api.probarCorreo(para) : api.probarCorreo()))
    } catch (error) {
      if (esNoAutenticado(error)) {
        vencida()
        return
      }
      resultado = resultadoDelError(error)
    }
    if (abierto.current) setPrueba({ fase: 'lista', resultado })
    else if (resultado.exito) avisar(`${conPunto(resultado.mensaje)} ${SUGERENCIA_REINTENTAR}`, 'exito')
    else avisar(resultado.mensaje, 'error')
  }

  return { prueba, probar }
}

/** Cómo va la prueba. La región está siempre (vacía si no hay nada) para que el lector anuncie los cambios. */
function RegionPrueba({ prueba }: { prueba: EstadoPrueba }) {
  let contenido: ReactNode = null
  if (prueba.fase === 'enviando') {
    contenido = (
      <div className="crm-cc-resultado" data-tono="enviando">
        <span className="crm-giro" aria-hidden="true" />
        <p>Enviando el correo de prueba…</p>
      </div>
    )
  } else if (prueba.fase === 'lista') {
    const { exito, mensaje } = prueba.resultado
    contenido = (
      <div className="crm-cc-resultado" data-tono={exito ? 'exito' : 'error'}>
        <Icono nombre={exito ? 'check' : 'alerta'} tamano={20} />
        <div className="crm-cc-resultado-texto">
          <p>{mensaje}</p>
          {exito ? <p>{SUGERENCIA_REINTENTAR}</p> : null}
        </div>
      </div>
    )
  }
  return (
    <div className="crm-cc-region" role="status">
      {contenido}
    </div>
  )
}

// ───────── Configurar la cuenta ─────────

interface FormularioCuenta {
  usuario: string
  clave: string
  host: string
  puerto: string
  seguro: boolean
  nombre: string
  probar: boolean
}

type CampoCuenta = 'usuario' | 'clave' | 'host' | 'puerto' | 'nombre'
const CAMPOS_CUENTA: readonly string[] = ['usuario', 'clave', 'host', 'puerto', 'nombre'] satisfies CampoCuenta[]
/** Los que van dentro de «Opciones avanzadas»: con un error, se abren. */
const CAMPOS_AVANZADOS: readonly CampoCuenta[] = ['puerto', 'nombre']

type ErroresCuenta = Partial<Record<CampoCuenta | 'general', string>>

function esCampoCuenta(campo: string): campo is CampoCuenta {
  return CAMPOS_CUENTA.includes(campo)
}

function formularioDe(cuenta: CuentaCorreoCrm): FormularioCuenta {
  const puerto = cuenta.puerto ?? PUERTO_TLS
  return {
    usuario: cuenta.usuario ?? '',
    clave: '',
    host: cuenta.host || HOST_SMTP_GOOGLE,
    puerto: String(puerto),
    seguro: cuenta.seguro ?? puerto === PUERTO_TLS,
    nombre: (cuenta.nombre || '').trim() || NOMBRE_POR_DEFECTO,
    probar: true,
  }
}

function validarCuenta(f: FormularioCuenta, tieneClave: boolean): ErroresCuenta {
  const errores: ErroresCuenta = {}
  const usuario = f.usuario.trim()
  if (!usuario) errores.usuario = 'Escriba la cuenta de correo.'
  else if (usuario.length > LIMITES_CRM.correo || !CORREO_VALIDO.test(usuario)) {
    errores.usuario = 'Escriba un correo válido (por ejemplo, nombre@sapiencia.gov.co).'
  }
  if (!tieneClave && !f.clave.trim()) errores.clave = 'Escriba la contraseña de aplicación.'
  const puerto = f.puerto.trim()
  if (puerto && !(/^\d{1,5}$/.test(puerto) && Number(puerto) >= 1 && Number(puerto) <= 65535)) {
    errores.puerto = `Escriba un puerto entre 1 y 65535 (casi siempre ${PUERTO_TLS} o ${PUERTO_STARTTLS}).`
  }
  return errores
}

/** Lo que va al servidor: solo lo que hay, sin espacios en los bordes (la clave vacía no va). */
function datosDe(f: FormularioCuenta): GuardarCuentaCorreoCrm {
  const datos: GuardarCuentaCorreoCrm = { usuario: f.usuario.trim() }
  const clave = f.clave.trim()
  if (clave) datos.clave = clave
  const host = f.host.trim()
  if (host) datos.host = host
  const puerto = f.puerto.trim()
  if (puerto) {
    datos.puerto = Number(puerto)
    datos.seguro = f.seguro
  }
  const nombre = f.nombre.trim().replace(/\s+/g, ' ')
  if (nombre) datos.nombre = nombre
  return datos
}

/** 400 con `campos`: cada error junto a su campo. El 409 y lo demás van arriba del formulario. */
function erroresDelServidor(error: unknown): ErroresCuenta {
  if (error instanceof ErrorCrmHttp && error.estado === 400 && error.campos) {
    const errores: ErroresCuenta = {}
    const otros: string[] = []
    for (const [campo, texto] of Object.entries(error.campos)) {
      if (esCampoCuenta(campo)) errores[campo] = texto
      else otros.push(texto)
    }
    if (otros.length > 0) errores.general = otros.join(' ')
    if (Object.keys(errores).length > 0) return errores
  }
  return { general: mensajeDe(error) }
}

function DialogoConfigurar({
  cuenta,
  alCerrar,
  alGuardar,
}: {
  cuenta: CuentaCorreoCrm
  alCerrar: () => void
  alGuardar: (cuenta: CuentaCorreoCrm) => void
}) {
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const { prueba, probar } = usePrueba()
  const id = useId()
  const idFormulario = `${id}-formulario`
  const idUsuario = `${id}-usuario`
  const idClave = `${id}-clave`
  const idHost = `${id}-host`
  const idPuerto = `${id}-puerto`
  const idSeguro = `${id}-seguro`
  const idNombre = `${id}-nombre`
  const [f, setF] = useState(() => formularioDe(cuenta))
  const [verClave, setVerClave] = useState(false)
  const [avanzadas, setAvanzadas] = useState(false)
  const [errores, setErrores] = useState<ErroresCuenta>({})
  const [guardando, setGuardando] = useState(false)
  /** Ya se guardó y se está probando: el diálogo muestra la prueba en vez del formulario. */
  const [guardada, setGuardada] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  const campoClave = useRef<HTMLInputElement>(null)
  const confirmacion = useRef<HTMLParagraphElement>(null)
  // Después de pintar: el foco va al primer campo con error, a la confirmación al
  // guardar o, al volver de una prueba fallida, a la contraseña.
  const enfocar = useRef<'error' | 'confirmacion' | 'clave' | null>(null)

  useEffect(() => {
    const destino = enfocar.current
    if (!destino) return
    enfocar.current = null
    if (destino === 'confirmacion') confirmacion.current?.focus()
    else if (destino === 'clave') campoClave.current?.focus()
    else formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  })

  function poner(cambios: Partial<FormularioCuenta>, campo?: CampoCuenta) {
    setF((previo) => ({ ...previo, ...cambios }))
    if (campo && errores[campo]) setErrores((previos) => ({ ...previos, [campo]: undefined }))
  }

  function mostrar(nuevos: ErroresCuenta) {
    setErrores(nuevos)
    if (CAMPOS_AVANZADOS.some((campo) => nuevos[campo])) setAvanzadas(true)
    enfocar.current = 'error'
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    const problemas = validarCuenta(f, cuenta.tieneClave)
    if (Object.keys(problemas).length > 0) {
      mostrar(problemas)
      return
    }
    setErrores({})
    setGuardando(true)
    let nueva: CuentaCorreoCrm
    try {
      nueva = await api.guardarCorreoCuenta(datosDe(f))
    } catch (error) {
      if (esNoAutenticado(error)) {
        vencida()
        return
      }
      setGuardando(false)
      mostrar(erroresDelServidor(error))
      return
    }
    setGuardando(false)
    alGuardar(nueva)
    avisarCambioCorreos()
    avisar('Cuenta guardada.', 'exito')
    if (!f.probar) {
      alCerrar()
      return
    }
    // La contraseña ya quedó guardada: no se deja escrita en el formulario.
    setF((previo) => ({ ...previo, clave: '' }))
    setVerClave(false)
    setGuardada(true)
    enfocar.current = 'confirmacion'
    void probar()
  }

  const fallo = prueba.fase === 'lista' && !prueba.resultado.exito
  const describeClave = [cuenta.tieneClave ? `${idClave}-ayuda` : null, `${idClave}-google`, errores.clave ? `${idClave}-error` : null]
    .filter(Boolean)
    .join(' ')

  const pie = guardada ? (
    <>
      {fallo ? (
        <button
          type="button"
          className="crm-boton crm-boton-secundario"
          onClick={() => {
            setGuardada(false)
            enfocar.current = 'clave'
          }}
        >
          Revisar los datos
        </button>
      ) : null}
      <button type="button" className="crm-boton crm-boton-primario" onClick={alCerrar}>
        Cerrar
      </button>
    </>
  ) : (
    <>
      <button type="button" className="crm-boton crm-boton-secundario" disabled={guardando} onClick={alCerrar}>
        Cancelar
      </button>
      <button type="submit" form={idFormulario} className="crm-boton crm-boton-primario" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </>
  )

  return (
    <Dialogo
      abierto
      titulo="Configurar correo"
      descripcion="Los avisos del CRM salen desde esta cuenta. La contraseña se guarda cifrada y no se vuelve a mostrar."
      alCerrar={alCerrar}
      bloqueado={guardando}
      pie={pie}
    >
      {guardada ? (
        <p ref={confirmacion} tabIndex={-1} className="crm-cc-guardada">
          <Icono nombre="check" tamano={20} />
          La cuenta quedó guardada.
        </p>
      ) : (
        <form ref={formulario} id={idFormulario} className="crm-formulario" noValidate onSubmit={(evento) => void enviar(evento)}>
          {errores.general ? <ErrorArriba texto={errores.general} /> : null}

          <Campo etiqueta="Cuenta" id={idUsuario} obligatorio error={errores.usuario}>
            <input
              className="crm-control"
              type="email"
              inputMode="email"
              placeholder="nombre@sapiencia.gov.co"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={LIMITES_CRM.correo}
              value={f.usuario}
              onChange={(evento) => poner({ usuario: evento.target.value }, 'usuario')}
              {...ariaCampo(idUsuario, { error: errores.usuario })}
            />
          </Campo>

          <div className="crm-campo" data-error={errores.clave ? '' : undefined}>
            <label className="crm-campo-etiqueta" htmlFor={idClave}>
              Contraseña de aplicación
              {cuenta.tieneClave ? null : (
                <>
                  {' '}
                  <span className="crm-campo-obligatorio">(obligatorio)</span>
                </>
              )}
            </label>
            {cuenta.tieneClave ? (
              <p className="crm-campo-ayuda" id={`${idClave}-ayuda`}>
                {AYUDA_CLAVE_GUARDADA}
              </p>
            ) : null}
            <p className="crm-campo-ayuda" id={`${idClave}-google`}>
              Se crea en{' '}
              <a href={URL_CONTRASENAS_APLICACION} target="_blank" rel="noreferrer">
                su cuenta de Google<span className="crm-sr"> (se abre en otra pestaña)</span>
              </a>
              , con la verificación en dos pasos activa.
            </p>
            <div className="crm-cc-clave">
              <input
                ref={campoClave}
                id={idClave}
                className="crm-control"
                type={verClave ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="16 letras, con o sin espacios"
                value={f.clave}
                onChange={(evento) => poner({ clave: evento.target.value }, 'clave')}
                aria-invalid={errores.clave ? true : undefined}
                aria-describedby={describeClave}
              />
              <button
                type="button"
                className="crm-boton-icono crm-cc-ver"
                aria-label="Mostrar la contraseña"
                aria-pressed={verClave}
                onClick={() => setVerClave((antes) => !antes)}
              >
                <Icono nombre={verClave ? 'ojo-tachado' : 'ojo'} />
              </button>
            </div>
            {errores.clave ? (
              <p className="crm-campo-error" id={`${idClave}-error`}>
                <Icono nombre="alerta" tamano={16} />
                {errores.clave}
              </p>
            ) : null}
          </div>

          <Campo etiqueta="Servidor SMTP" id={idHost} ayuda={AYUDA_HOST} error={errores.host}>
            <input
              className="crm-control"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={253}
              value={f.host}
              onChange={(evento) => poner({ host: evento.target.value }, 'host')}
              {...ariaCampo(idHost, { ayuda: AYUDA_HOST, error: errores.host })}
            />
          </Campo>

          <details className="crm-cc-avanzadas" open={avanzadas} onToggle={(evento) => setAvanzadas(evento.currentTarget.open)}>
            <summary>Opciones avanzadas</summary>
            <div className="crm-cc-avanzadas-cuerpo">
              <Campo etiqueta="Puerto" id={idPuerto} error={errores.puerto}>
                <input
                  className="crm-control crm-cc-puerto"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  value={f.puerto}
                  onChange={(evento) => {
                    const puerto = evento.target.value
                    const numero = Number(puerto.trim())
                    // Con los puertos de siempre, la casilla de TLS los sigue.
                    const seguro = numero === PUERTO_TLS ? true : numero === PUERTO_STARTTLS ? false : f.seguro
                    poner({ puerto, seguro }, 'puerto')
                  }}
                  {...ariaCampo(idPuerto, { error: errores.puerto })}
                />
              </Campo>
              <div className="crm-campo">
                <label className="crm-casilla">
                  <input
                    type="checkbox"
                    checked={f.seguro}
                    onChange={(evento) => poner({ seguro: evento.target.checked })}
                    aria-describedby={`${idSeguro}-ayuda`}
                  />
                  TLS desde el inicio
                </label>
                <p className="crm-campo-ayuda" id={`${idSeguro}-ayuda`}>
                  {AYUDA_SEGURO}
                </p>
              </div>
              <Campo etiqueta="Nombre visible" id={idNombre} ayuda={AYUDA_NOMBRE} error={errores.nombre}>
                <input
                  className="crm-control"
                  type="text"
                  autoComplete="off"
                  maxLength={LIMITES_CRM.nombrePersona}
                  value={f.nombre}
                  onChange={(evento) => poner({ nombre: evento.target.value }, 'nombre')}
                  {...ariaCampo(idNombre, { ayuda: AYUDA_NOMBRE, error: errores.nombre })}
                />
              </Campo>
            </div>
          </details>

          <label className="crm-casilla">
            <input type="checkbox" checked={f.probar} onChange={(evento) => poner({ probar: evento.target.checked })} />
            Enviar un correo de prueba al guardar
          </label>
        </form>
      )}
      <RegionPrueba prueba={prueba} />
    </Dialogo>
  )
}

// ───────── Enviar una prueba ─────────

function DialogoPrueba({ alCerrar }: { alCerrar: () => void }) {
  const { prueba, probar } = usePrueba()
  const id = useId()
  const idFormulario = `${id}-formulario`
  const idPara = `${id}-para`
  const [para, setPara] = useState('')
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const enfocar = useRef(false)
  const enviando = prueba.fase === 'enviando'

  useEffect(() => {
    if (!enfocar.current) return
    enfocar.current = false
    campo.current?.focus()
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const destino = para.trim()
    if (destino && (destino.length > LIMITES_CRM.correo || !CORREO_VALIDO.test(destino))) {
      setError('Escriba un correo válido o deje el campo vacío.')
      enfocar.current = true
      return
    }
    setError(null)
    void probar(destino || undefined)
  }

  return (
    <Dialogo
      abierto
      tamano="sm"
      titulo="Enviar un correo de prueba"
      descripcion="Sale con la cuenta de envío, para comprobar que funciona."
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" onClick={alCerrar}>
            Cerrar
          </button>
          <button type="submit" form={idFormulario} className="crm-boton crm-boton-primario" disabled={enviando}>
            <Icono nombre="enviar" />
            {enviando ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </>
      }
    >
      <form id={idFormulario} className="crm-formulario" noValidate onSubmit={enviar}>
        <Campo etiqueta="Enviar a" id={idPara} ayuda={AYUDA_PARA} error={error}>
          <input
            ref={campo}
            className="crm-control"
            type="email"
            inputMode="email"
            placeholder="nombre@sapiencia.gov.co"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={LIMITES_CRM.correo}
            value={para}
            onChange={(evento) => {
              setPara(evento.target.value)
              if (error) setError(null)
            }}
            {...ariaCampo(idPara, { ayuda: AYUDA_PARA, error })}
          />
        </Campo>
      </form>
      <RegionPrueba prueba={prueba} />
    </Dialogo>
  )
}

// ───────── Quitar la cuenta ─────────

function DialogoQuitar({ alCerrar, alQuitar }: { alCerrar: () => void; alQuitar: (cuenta: CuentaCorreoCrm) => void }) {
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    if (quitando) return
    setQuitando(true)
    setError(null)
    try {
      alQuitar(await api.borrarCorreoCuenta())
    } catch (fallo) {
      if (esNoAutenticado(fallo)) {
        vencida()
        return
      }
      setQuitando(false)
      setError(mensajeDe(fallo))
      return
    }
    avisarCambioCorreos()
    avisar('Se quitó la cuenta de correo.', 'exito')
    alCerrar()
  }

  return (
    <Dialogo
      abierto
      tamano="sm"
      titulo="¿Quitar la cuenta de correo?"
      descripcion="Se borran la cuenta y su contraseña de aplicación."
      alCerrar={alCerrar}
      bloqueado={quitando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" disabled={quitando} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="crm-boton crm-boton-peligro" disabled={quitando} onClick={() => void confirmar()}>
            {quitando ? 'Quitando…' : 'Quitar la cuenta'}
          </button>
        </>
      }
    >
      {error ? <ErrorArriba texto={error} /> : <p>Los avisos quedarán guardados sin salir hasta que configure otra cuenta.</p>}
    </Dialogo>
  )
}

// ───────── Sección ─────────

type DialogoAbierto = 'configurar' | 'prueba' | 'quitar'

export default function CuentaCorreo() {
  const { api, vencida } = useLider()
  const id = useId()
  const [dialogo, setDialogo] = useState<DialogoAbierto | null>(null)
  const { estado, datos: cuenta, error, recargar, ponerDatos } = useCarga((signal) => api.correoCuenta(signal), [api])

  const vencio = estado === 'error' && esNoAutenticado(error)
  useEffect(() => {
    if (vencio) vencida()
  }, [vencio, vencida])

  const cerrar = () => setDialogo(null)
  const poner = (nueva: CuentaCorreoCrm) => ponerDatos(() => nueva)

  let contenido: ReactNode
  if (!cuenta) {
    contenido =
      estado === 'error' && !vencio ? (
        <ErrorCarga error={error} titulo="No se pudo cargar la cuenta de correo." alReintentar={recargar} />
      ) : (
        <Cargando texto="Cargando la cuenta de correo…" />
      )
  } else if (cuenta.origen === 'ninguna') {
    contenido = (
      <>
        <p className="crm-cc-texto crm-cc-falta">Todavía no hay una cuenta de correo: los avisos quedan guardados y no salen.</p>
        <p className="crm-cc-detalle">Guarde aquí la cuenta de la oficina con su contraseña de aplicación de Google.</p>
        <div className="crm-acciones crm-cc-acciones">
          <button type="button" className="crm-boton crm-boton-primario" onClick={() => setDialogo('configurar')}>
            <Icono nombre="correo" />
            Configurar correo
          </button>
        </div>
      </>
    )
  } else if (cuenta.origen === 'base') {
    contenido = (
      <>
        <p className="crm-cc-texto">
          Los avisos salen desde <CuentaYServidor cuenta={cuenta} />.
        </p>
        {cuenta.actualizadoEn ? (
          <p className="crm-cc-detalle">
            Guardada el <time dateTime={cuenta.actualizadoEn}>{fechaHora(cuenta.actualizadoEn)}</time>
          </p>
        ) : null}
        {cuenta.tieneClave ? null : (
          <p className="crm-cc-detalle" data-tono="error">
            Falta la contraseña de aplicación: use «Cambiar» para escribirla.
          </p>
        )}
        <NotaModo cuenta={cuenta} />
        <div className="crm-acciones crm-cc-acciones">
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" onClick={() => setDialogo('configurar')}>
            <Icono nombre="editar" tamano={16} />
            Cambiar
          </button>
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" onClick={() => setDialogo('prueba')}>
            <Icono nombre="enviar" tamano={16} />
            Enviar prueba
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-peligro crm-boton-sm" onClick={() => setDialogo('quitar')}>
            <Icono nombre="borrar" tamano={16} />
            Quitar cuenta
          </button>
        </div>
      </>
    )
  } else {
    contenido = (
      <>
        <p className="crm-cc-texto">
          Configurado en el servidor{cuenta.usuario || cuenta.host ? ': ' : ''}
          <CuentaYServidor cuenta={cuenta} />.
        </p>
        <p className="crm-cc-detalle">Se cambia en las variables CRM_CORREO_* del servidor, no desde aquí.</p>
        <NotaModo cuenta={cuenta} />
        <div className="crm-acciones crm-cc-acciones">
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" onClick={() => setDialogo('prueba')}>
            <Icono nombre="enviar" tamano={16} />
            Enviar prueba
          </button>
        </div>
      </>
    )
  }

  return (
    <section className="crm-cc" data-origen={cuenta?.origen} aria-labelledby={`${id}-titulo`}>
      <h2 className="crm-cc-titulo" id={`${id}-titulo`}>
        <Icono nombre="correo" tamano={20} />
        Cuenta de envío
      </h2>
      {contenido}

      {cuenta && dialogo === 'configurar' ? <DialogoConfigurar cuenta={cuenta} alCerrar={cerrar} alGuardar={poner} /> : null}
      {dialogo === 'prueba' ? <DialogoPrueba alCerrar={cerrar} /> : null}
      {dialogo === 'quitar' ? <DialogoQuitar alCerrar={cerrar} alQuitar={poner} /> : null}
    </section>
  )
}
