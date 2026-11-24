/**
 * Equipo del CRM (/crm/lider/equipo): las personas que reciben tareas,
 * activas e inactivas (PersonaAdminCrm), en el orden del servidor: primero
 * las activas, por `orden`, que es el orden del inicio.
 *
 * - «Agregar persona» es la acción principal. Cada fila: Editar, Cambiar
 *   foto, Quitar foto (si tiene), Desactivar (con confirmación) o Activar, y
 *   Subir/Bajar entre las activas (intercambia `orden` con la vecina y
 *   recarga).
 * - Errores del servidor: el 409 de correo repetido va junto al campo Correo;
 *   el 409 del único líder activo, en la confirmación de desactivar.
 * - Ante un 401 llama vencida(): SitioLider vuelve al ingreso.
 * - La foto de una persona inactiva no se sirve (404): el Avatar cae solo a
 *   las iniciales.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ACEPTAR_FOTOS_CRM,
  EXTENSIONES_FOTO_CRM,
  LIMITES_CRM,
  tamanoLegible,
  type ConteoTareasCrm,
  type EdicionPersonaCrm,
  type EstadoTarea,
  type PersonaAdminCrm,
} from '../api-crm'
import { ErrorCrmHttp, esCancelacion, esNoAutenticado, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import {
  ariaCampo,
  Avatar,
  Campo,
  Cargando,
  Dialogo,
  ErrorCarga,
  formatosLegibles,
  Icono,
  MarcaEstado,
  plural,
  ProgresoSubida,
  unirConY,
  useAvisar,
  useTituloCrm,
  Vacio,
  validarArchivo,
  ZonaArchivos,
} from '../ui'
import { useLider } from './contexto'
import './administracion.css'

type DialogoAbierto =
  | { tipo: 'agregar' }
  | { tipo: 'editar'; persona: PersonaAdminCrm }
  | { tipo: 'desactivar'; persona: PersonaAdminCrm }
  | { tipo: 'foto'; persona: PersonaAdminCrm }

/** Acción en curso en una fila: activar o quitar la foto. */
type Ocupacion = 'activo' | 'foto'

const AYUDA_CORREO = 'A este correo le llegan los avisos de sus tareas.'
const AYUDA_FOTO = `Use ${formatosLegibles(EXTENSIONES_FOTO_CRM)} de hasta ${tamanoLegible(LIMITES_CRM.maxBytesFoto)}. Mejor si es cuadrada: se recorta en un círculo.`
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El orden del servidor: activas primero, luego `orden`, nombre e id. */
function ordenar(personas: readonly PersonaAdminCrm[]): PersonaAdminCrm[] {
  return [...personas].sort(
    (a, b) =>
      Number(b.activo) - Number(a.activo) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es-CO') || a.id - b.id,
  )
}

/**
 * Los `orden` que hay que guardar para cambiar de puesto a grupo[i] y
 * grupo[j]: se intercambian. Si los dos tenían el mismo (empate), intercambiar
 * no movería nada: se numera el grupo de nuevo (1, 2, 3…) ya con el cambio y
 * solo se guardan las que cambian.
 */
function cambiosDeOrden(grupo: readonly PersonaAdminCrm[], i: number, j: number): [number, number][] {
  const a = grupo[i]
  const b = grupo[j]
  if (a.orden !== b.orden) {
    return [
      [a.id, b.orden],
      [b.id, a.orden],
    ]
  }
  const nuevo = [...grupo]
  nuevo[i] = b
  nuevo[j] = a
  return nuevo.flatMap((p, k): [number, number][] => (p.orden === k + 1 ? [] : [[p.id, k + 1]]))
}

// ───────── Conteos de tareas de una fila ─────────

type TipoConteo = EstadoTarea | 'vencida'

function ConteosPersona({ conteo }: { conteo: ConteoTareasCrm }) {
  const dias = LIMITES_CRM.diasTerminadasRecientes
  const partes: { tipo: TipoConteo; texto: string; leido: string }[] = []
  if (conteo.pendientes > 0) {
    const texto = plural(conteo.pendientes, 'pendiente', 'pendientes')
    partes.push({ tipo: 'pendiente', texto, leido: texto })
  }
  if (conteo.enProceso > 0) {
    const texto = `${conteo.enProceso.toLocaleString('es-CO')} en proceso`
    partes.push({ tipo: 'en_proceso', texto, leido: texto })
  }
  if (conteo.terminadasRecientes > 0) {
    const texto = plural(conteo.terminadasRecientes, 'terminada', 'terminadas')
    partes.push({ tipo: 'terminada', texto, leido: `${texto} en los últimos ${dias} días` })
  }
  if (conteo.vencidas > 0) {
    const texto = plural(conteo.vencidas, 'vencida', 'vencidas')
    partes.push({ tipo: 'vencida', texto, leido: texto })
  }
  if (partes.length === 0) return <p className="crm-tp-conteos">Sin tareas</p>
  return (
    <p className="crm-tp-conteos">
      {partes.map((parte) => (
        <span
          key={parte.tipo}
          className="crm-tp-conteo"
          data-tipo={parte.tipo}
          aria-hidden="true"
          title={parte.tipo === 'terminada' ? `En los últimos ${dias} días` : undefined}
        >
          {parte.tipo === 'vencida' ? <Icono nombre="alerta" tamano={15} /> : <MarcaEstado estado={parte.tipo} />}
          {parte.texto}
        </span>
      ))}
      <span className="crm-sr">{`Tareas: ${unirConY(partes.map((p) => p.leido))}.`}</span>
    </p>
  )
}

// ───────── Una fila ─────────

function FilaPersona({
  persona,
  primera,
  ultima,
  ocupacion,
  ordenBloqueado,
  alEditar,
  alCambiarFoto,
  alQuitarFoto,
  alCambiarActivo,
  alMover,
}: {
  persona: PersonaAdminCrm
  /** Primera / última de las activas (no puede subir / bajar). */
  primera: boolean
  ultima: boolean
  ocupacion: Ocupacion | undefined
  ordenBloqueado: boolean
  alEditar: () => void
  alCambiarFoto: () => void
  alQuitarFoto: () => void
  alCambiarActivo: () => void
  alMover: (paso: -1 | 1) => void
}) {
  const { id, nombre, activo } = persona
  const ocupada = ocupacion !== undefined
  return (
    <li className="crm-la-persona" data-inactiva={activo ? undefined : ''} aria-busy={ocupada || undefined}>
      <Avatar nombre={nombre} iniciales={persona.iniciales} foto={persona.foto} tamano="lg" semilla={id} />
      <div className="crm-la-persona-datos">
        <div className="crm-la-persona-cabeza">
          <h2 className="crm-la-persona-nombre">{nombre}</h2>
          {persona.esLider ? <span className="crm-etiqueta">Líder</span> : null}
          <span className="crm-etiqueta crm-la-activa" data-activa={activo ? 'si' : 'no'}>
            {activo ? 'Activa' : 'Inactiva'}
          </span>
        </div>
        <p className="crm-la-persona-correo">{persona.correo}</p>
        <ConteosPersona conteo={persona.conteo} />
      </div>
      <div className="crm-la-persona-acciones">
        <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" data-foco={`${id}-editar`} disabled={ocupada} onClick={alEditar}>
          Editar{' '}<span className="crm-sr">los datos de {nombre}</span>
        </button>
        <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" data-foco={`${id}-foto`} disabled={ocupada} onClick={alCambiarFoto}>
          Cambiar foto{' '}<span className="crm-sr">de {nombre}</span>
        </button>
        {persona.foto ? (
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-peligro crm-boton-sm" disabled={ocupada} onClick={alQuitarFoto}>
            {ocupacion === 'foto' ? 'Quitando…' : 'Quitar foto'}
            {' '}<span className="crm-sr">de {nombre}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`crm-boton crm-boton-sm ${activo ? 'crm-boton-fantasma' : 'crm-boton-secundario'}`}
          data-foco={`${id}-activo`}
          disabled={ocupada}
          onClick={alCambiarActivo}
        >
          {activo ? 'Desactivar' : ocupacion === 'activo' ? 'Activando…' : 'Activar'}
          {' '}<span className="crm-sr">a {nombre}</span>
        </button>
        {activo ? (
          <span className="crm-la-orden">
            <button
              type="button"
              className="crm-boton crm-boton-fantasma crm-boton-sm"
              data-foco={`${id}-subir`}
              disabled={primera || ordenBloqueado || ocupada}
              onClick={() => alMover(-1)}
            >
              Subir{' '}<span className="crm-sr">a {nombre} un puesto</span>
            </button>
            <button
              type="button"
              className="crm-boton crm-boton-fantasma crm-boton-sm"
              data-foco={`${id}-bajar`}
              disabled={ultima || ordenBloqueado || ocupada}
              onClick={() => alMover(1)}
            >
              Bajar{' '}<span className="crm-sr">a {nombre} un puesto</span>
            </button>
          </span>
        ) : null}
      </div>
    </li>
  )
}

// ───────── Diálogos ─────────

function ErrorDialogo({ texto }: { texto: string }) {
  return (
    <p className="crm-campo-error" role="alert">
      <Icono nombre="alerta" tamano={16} />
      {texto}
    </p>
  )
}

interface DatosPersona {
  nombre: string
  correo: string
}

interface ErroresPersona {
  nombre?: string
  correo?: string
  general?: string
}

function validarPersona({ nombre, correo }: DatosPersona): ErroresPersona {
  const errores: ErroresPersona = {}
  if (!nombre) errores.nombre = 'Escriba el nombre.'
  else if (nombre.length > LIMITES_CRM.nombrePersona) errores.nombre = `El nombre puede tener hasta ${LIMITES_CRM.nombrePersona} caracteres.`
  if (!correo) errores.correo = 'Escriba el correo.'
  else if (correo.length > LIMITES_CRM.correo) errores.correo = `El correo puede tener hasta ${LIMITES_CRM.correo} caracteres.`
  else if (!CORREO_VALIDO.test(correo)) errores.correo = 'Escriba un correo válido (por ejemplo, nombre@sapiencia.gov.co).'
  return errores
}

/** Errores del servidor junto a su campo: los de `campos` y el 409 (correo repetido) en Correo; el resto, abajo. */
function erroresDelServidor(error: unknown): ErroresPersona {
  const errores: ErroresPersona = {}
  if (error instanceof ErrorCrmHttp) {
    if (error.campos?.nombre) errores.nombre = error.campos.nombre
    if (error.campos?.correo) errores.correo = error.campos.correo
    if (!errores.nombre && !errores.correo && error.estado === 409) errores.correo = mensajeDe(error)
  }
  if (!errores.nombre && !errores.correo) errores.general = mensajeDe(error)
  return errores
}

/** Agregar o editar: nombre y correo. `guardar` lanza el error del servidor para mostrarlo aquí. */
function DialogoPersona({
  titulo,
  descripcion,
  inicial,
  textoGuardar,
  textoGuardando,
  guardar,
  alCerrar,
}: {
  titulo: string
  descripcion?: string
  inicial: DatosPersona
  textoGuardar: string
  textoGuardando: string
  guardar: (datos: DatosPersona) => Promise<void>
  alCerrar: () => void
}) {
  const { vencida } = useLider()
  const id = useId()
  const idFormulario = `${id}-formulario`
  const idNombre = `${id}-nombre`
  const idCorreo = `${id}-correo`
  const [nombre, setNombre] = useState(inicial.nombre)
  const [correo, setCorreo] = useState(inicial.correo)
  const [errores, setErrores] = useState<ErroresPersona>({})
  const [guardando, setGuardando] = useState(false)
  const refNombre = useRef<HTMLInputElement>(null)
  const refCorreo = useRef<HTMLInputElement>(null)
  // El campo con error recibe el foco después de pintar el error (así el lector lo lee).
  const enfocar = useRef<'nombre' | 'correo' | null>(null)

  useEffect(() => {
    const campo = enfocar.current
    if (!campo) return
    enfocar.current = null
    ;(campo === 'nombre' ? refNombre : refCorreo).current?.focus()
  })

  function mostrar(nuevos: ErroresPersona) {
    setErrores(nuevos)
    enfocar.current = nuevos.nombre ? 'nombre' : nuevos.correo ? 'correo' : null
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    const datos = { nombre: nombre.trim().replace(/\s+/g, ' '), correo: correo.trim() }
    const problemas = validarPersona(datos)
    if (problemas.nombre || problemas.correo) {
      mostrar(problemas)
      return
    }
    setErrores({})
    setGuardando(true)
    try {
      await guardar(datos) // si sale bien, quien abrió el diálogo lo cierra
    } catch (error) {
      if (esNoAutenticado(error)) {
        vencida()
        return
      }
      setGuardando(false)
      mostrar(erroresDelServidor(error))
    }
  }

  return (
    <Dialogo
      abierto
      titulo={titulo}
      descripcion={descripcion}
      alCerrar={alCerrar}
      bloqueado={guardando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" disabled={guardando} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" form={idFormulario} className="crm-boton crm-boton-primario" disabled={guardando}>
            {guardando ? textoGuardando : textoGuardar}
          </button>
        </>
      }
    >
      <form id={idFormulario} className="crm-formulario" noValidate onSubmit={(evento) => void enviar(evento)}>
        <Campo etiqueta="Nombre" id={idNombre} obligatorio error={errores.nombre}>
          <input
            ref={refNombre}
            className="crm-control"
            type="text"
            value={nombre}
            maxLength={LIMITES_CRM.nombrePersona}
            autoComplete="off"
            onChange={(evento) => {
              setNombre(evento.target.value)
              if (errores.nombre) setErrores((previos) => ({ ...previos, nombre: undefined }))
            }}
            {...ariaCampo(idNombre, { error: errores.nombre })}
          />
        </Campo>
        <Campo etiqueta="Correo" id={idCorreo} obligatorio ayuda={AYUDA_CORREO} error={errores.correo}>
          <input
            ref={refCorreo}
            className="crm-control"
            type="email"
            value={correo}
            maxLength={LIMITES_CRM.correo}
            autoComplete="off"
            spellCheck={false}
            onChange={(evento) => {
              setCorreo(evento.target.value)
              if (errores.correo) setErrores((previos) => ({ ...previos, correo: undefined }))
            }}
            {...ariaCampo(idCorreo, { ayuda: AYUDA_CORREO, error: errores.correo })}
          />
        </Campo>
        {errores.general ? <ErrorDialogo texto={errores.general} /> : null}
      </form>
    </Dialogo>
  )
}

function DialogoDesactivar({
  persona,
  alCerrar,
  alListo,
}: {
  persona: PersonaAdminCrm
  alCerrar: () => void
  alListo: (persona: PersonaAdminCrm) => void
}) {
  const { api, vencida } = useLider()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      alListo(await api.editarPersona(persona.id, { activo: false }))
    } catch (fallo) {
      if (esNoAutenticado(fallo)) {
        vencida()
        return
      }
      setGuardando(false)
      setError(mensajeDe(fallo)) // p. ej., el 409 del único líder activo
    }
  }

  return (
    <Dialogo
      abierto
      tamano="sm"
      titulo={`¿Desactivar a ${persona.nombre}?`}
      descripcion="Ya no aparecerá en el inicio; sus tareas se conservan."
      alCerrar={alCerrar}
      bloqueado={guardando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" disabled={guardando} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="crm-boton crm-boton-primario" disabled={guardando} onClick={() => void confirmar()}>
            {guardando ? 'Desactivando…' : 'Desactivar'}
          </button>
        </>
      }
    >
      {error ? <ErrorDialogo texto={error} /> : <p>Puede activarla de nuevo cuando quiera.</p>}
    </Dialogo>
  )
}

function DialogoFoto({
  persona,
  alCerrar,
  alListo,
}: {
  persona: PersonaAdminCrm
  alCerrar: () => void
  alListo: (persona: PersonaAdminCrm) => void
}) {
  const { api, vencida } = useLider()
  const avisar = useAvisar()
  const [subida, setSubida] = useState<{ nombre: string; progreso: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const control = useRef<AbortController | null>(null)

  // Al cerrar (o salir de la página) se cancela la subida en curso, sin avisar.
  useEffect(
    () => () => {
      const actual = control.current
      control.current = null
      actual?.abort()
    },
    [],
  )

  async function elegir(archivos: File[]) {
    const [archivo] = archivos
    if (!archivo || control.current) return
    const problema = validarArchivo(archivo, { extensiones: EXTENSIONES_FOTO_CRM, maxBytes: LIMITES_CRM.maxBytesFoto })
    setError(problema)
    if (problema) return
    const actual = new AbortController()
    control.current = actual
    setSubida({ nombre: archivo.name, progreso: 0 })
    try {
      const nueva = await api.subirFoto(persona.id, archivo, {
        alProgreso: (progreso) => {
          if (control.current === actual) setSubida({ nombre: archivo.name, progreso })
        },
        signal: actual.signal,
      })
      control.current = null
      alListo(nueva)
    } catch (fallo) {
      const vigente = control.current === actual
      control.current = null
      if (!vigente) return // el diálogo ya se cerró
      setSubida(null)
      if (esCancelacion(fallo)) avisar('Se canceló la subida.', 'info')
      else if (esNoAutenticado(fallo)) vencida()
      else setError(mensajeDe(fallo))
    }
  }

  const ahora = !persona.foto
    ? 'Todavía no tiene foto: se ven sus iniciales.'
    : persona.activo
      ? 'Esta es su foto de ahora; la nueva la reemplaza.'
      : 'Tiene foto, pero no se ve mientras esté inactiva. La nueva la reemplaza.'

  return (
    <Dialogo
      abierto
      titulo={`Foto de ${persona.nombre}`}
      descripcion="Aparece en el inicio y en las tareas."
      alCerrar={alCerrar}
      bloqueado={subida !== null}
      pie={
        <button type="button" className="crm-boton crm-boton-secundario" disabled={subida !== null} onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div className="crm-pila">
        <div className="crm-la-foto-actual">
          <Avatar nombre={persona.nombre} iniciales={persona.iniciales} foto={persona.foto} tamano="xl" semilla={persona.id} />
          <p className="crm-suave">{ahora}</p>
        </div>
        <ZonaArchivos
          aceptar={ACEPTAR_FOTOS_CRM}
          alElegir={(lista) => void elegir(lista)}
          deshabilitada={subida !== null}
          texto="Suelte la foto aquí o"
          ayuda={AYUDA_FOTO}
        />
        {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={() => control.current?.abort()} /> : null}
        {error ? <ErrorDialogo texto={error} /> : null}
      </div>
    </Dialogo>
  )
}

// ───────── Pantalla ─────────

export default function EquipoLider() {
  useTituloCrm('Equipo')
  const { api, vencida } = useLider()
  const avisar = useAvisar()
  const { estado, datos, error, recargar, ponerDatos } = useCarga((signal) => api.personas(signal), [])
  const [dialogo, setDialogo] = useState<DialogoAbierto | null>(null)
  const [ocupadas, setOcupadas] = useState<ReadonlyMap<number, Ocupacion>>(() => new Map())
  const [moviendo, setMoviendo] = useState(false)
  const lista = useRef<HTMLUListElement>(null)
  // Botón (data-foco) que recibe el foco cuando la lista se vuelve a pintar:
  // p. ej., el de «Subir» después de mover o «Cambiar foto» al quitarla.
  const focoPendiente = useRef<string | null>(null)

  useEffect(() => {
    if (estado === 'error' && esNoAutenticado(error)) vencida()
  }, [estado, error, vencida])

  useEffect(() => {
    const clave = focoPendiente.current
    if (!clave) return
    const boton = lista.current?.querySelector<HTMLButtonElement>(`[data-foco="${clave}"]`)
    if (!boton || boton.disabled) return
    focoPendiente.current = null
    boton.focus()
  })

  const personas = useMemo(() => (datos ? ordenar(datos) : []), [datos])
  const activas = personas.filter((p) => p.activo)
  const inactivas = personas.length - activas.length
  const ordenBloqueado = moviendo || estado === 'cargando'

  function reemplazar(persona: PersonaAdminCrm) {
    ponerDatos((anterior) => anterior && anterior.map((p) => (p.id === persona.id ? persona : p)))
  }

  function ocupar(id: number, ocupacion: Ocupacion | null) {
    setOcupadas((previas) => {
      const nuevas = new Map(previas)
      if (ocupacion) nuevas.set(id, ocupacion)
      else nuevas.delete(id)
      return nuevas
    })
  }

  /** Error de una acción de una fila: 401 → ingreso; lo demás, en un aviso. */
  function fallo(error: unknown) {
    if (esNoAutenticado(error)) vencida()
    else avisar(mensajeDe(error), 'error')
  }

  function abrir(nuevo: DialogoAbierto) {
    focoPendiente.current = null
    setDialogo(nuevo)
  }

  function cerrar() {
    setDialogo(null)
  }

  async function activar(persona: PersonaAdminCrm) {
    ocupar(persona.id, 'activo')
    try {
      const nueva = await api.editarPersona(persona.id, { activo: true })
      focoPendiente.current = `${nueva.id}-activo`
      reemplazar(nueva)
      avisar(`Se activó a ${nueva.nombre}: vuelve a aparecer en el inicio.`)
    } catch (error) {
      fallo(error)
    } finally {
      ocupar(persona.id, null)
    }
  }

  async function quitarFoto(persona: PersonaAdminCrm) {
    ocupar(persona.id, 'foto')
    try {
      const nueva = await api.quitarFoto(persona.id)
      focoPendiente.current = `${nueva.id}-foto`
      reemplazar(nueva)
      avisar(`Se quitó la foto de ${nueva.nombre}.`)
    } catch (error) {
      fallo(error)
    } finally {
      ocupar(persona.id, null)
    }
  }

  async function mover(persona: PersonaAdminCrm, paso: -1 | 1) {
    const i = activas.findIndex((p) => p.id === persona.id)
    const j = i + paso
    if (ordenBloqueado || i < 0 || j < 0 || j >= activas.length) return
    setMoviendo(true)
    try {
      for (const [id, orden] of cambiosDeOrden(activas, i, j)) await api.editarPersona(id, { orden })
      // Queda en un extremo: su botón en esa dirección se apaga y el foco va al otro.
      const enExtremo = paso < 0 ? j === 0 : j === activas.length - 1
      const direccion = paso < 0 ? (enExtremo ? 'bajar' : 'subir') : enExtremo ? 'subir' : 'bajar'
      focoPendiente.current = `${persona.id}-${direccion}`
      avisar(`${persona.nombre} ${paso < 0 ? 'subió' : 'bajó'} un puesto.`)
      recargar()
    } catch (error) {
      fallo(error)
      if (!esNoAutenticado(error)) recargar()
    } finally {
      setMoviendo(false)
    }
  }

  let contenido: ReactNode
  if (!datos) {
    contenido =
      estado === 'error' ? (
        <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo cargar el equipo." />
      ) : (
        <Cargando texto="Cargando el equipo…" />
      )
  } else if (personas.length === 0) {
    contenido = <Vacio titulo="Todavía no hay personas en el equipo." texto="Agregue a la primera con «Agregar persona»." />
  } else {
    contenido = (
      <>
        {estado === 'error' ? <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo actualizar la lista." /> : null}
        <p className="crm-la-cuenta crm-la-equipo-cuenta">
          {unirConY([
            plural(activas.length, 'persona activa', 'personas activas'),
            ...(inactivas > 0 ? [plural(inactivas, 'inactiva', 'inactivas')] : []),
          ])}
          .
        </p>
        <ul ref={lista} className="crm-la-personas" aria-busy={estado === 'cargando' || undefined}>
          {personas.map((persona) => {
            const puesto = activas.indexOf(persona)
            return (
              <FilaPersona
                key={persona.id}
                persona={persona}
                primera={puesto === 0}
                ultima={puesto === activas.length - 1}
                ocupacion={ocupadas.get(persona.id)}
                ordenBloqueado={ordenBloqueado}
                alEditar={() => abrir({ tipo: 'editar', persona })}
                alCambiarFoto={() => abrir({ tipo: 'foto', persona })}
                alQuitarFoto={() => void quitarFoto(persona)}
                alCambiarActivo={() => (persona.activo ? abrir({ tipo: 'desactivar', persona }) : void activar(persona))}
                alMover={(paso) => void mover(persona, paso)}
              />
            )
          })}
        </ul>
      </>
    )
  }

  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <h1 className="crm-titulo-pagina">Equipo</h1>
          <p className="crm-bajada">Quiénes reciben tareas. Las activas aparecen en el inicio, en el orden de esta lista.</p>
        </div>
        <div className="crm-encabezado-acciones">
          <button type="button" className="crm-boton crm-boton-primario" onClick={() => abrir({ tipo: 'agregar' })}>
            <Icono nombre="mas" />
            Agregar persona
          </button>
        </div>
      </header>

      {contenido}

      {dialogo?.tipo === 'agregar' ? (
        <DialogoPersona
          titulo="Agregar persona"
          descripcion="Queda activa, al final de la lista, y desde ya se le pueden asignar tareas."
          inicial={{ nombre: '', correo: '' }}
          textoGuardar="Agregar persona"
          textoGuardando="Agregando…"
          guardar={async (datosNuevos) => {
            const nueva = await api.crearPersona(datosNuevos)
            cerrar()
            avisar(`Se agregó a ${nueva.nombre}.`)
            recargar()
          }}
          alCerrar={cerrar}
        />
      ) : null}

      {dialogo?.tipo === 'editar' ? (
        <DialogoPersona
          titulo={`Editar a ${dialogo.persona.nombre}`}
          inicial={{ nombre: dialogo.persona.nombre, correo: dialogo.persona.correo }}
          textoGuardar="Guardar cambios"
          textoGuardando="Guardando…"
          guardar={async (cambiados) => {
            const { persona } = dialogo
            const cambios: EdicionPersonaCrm = {}
            if (cambiados.nombre !== persona.nombre) cambios.nombre = cambiados.nombre
            if (cambiados.correo !== persona.correo) cambios.correo = cambiados.correo
            if (Object.keys(cambios).length === 0) {
              cerrar()
              return
            }
            const nueva = await api.editarPersona(persona.id, cambios)
            reemplazar(nueva)
            cerrar()
            avisar(`Se guardaron los cambios de ${nueva.nombre}.`)
          }}
          alCerrar={cerrar}
        />
      ) : null}

      {dialogo?.tipo === 'desactivar' ? (
        <DialogoDesactivar
          persona={dialogo.persona}
          alCerrar={cerrar}
          alListo={(nueva) => {
            focoPendiente.current = `${nueva.id}-activo`
            reemplazar(nueva)
            cerrar()
            avisar(`Se desactivó a ${nueva.nombre}. Sus tareas se conservan.`)
          }}
        />
      ) : null}

      {dialogo?.tipo === 'foto' ? (
        <DialogoFoto
          persona={dialogo.persona}
          alCerrar={cerrar}
          alListo={(nueva) => {
            reemplazar(nueva)
            cerrar()
            avisar(`Se cambió la foto de ${nueva.nombre}.`)
          }}
        />
      ) : null}
    </div>
  )
}
