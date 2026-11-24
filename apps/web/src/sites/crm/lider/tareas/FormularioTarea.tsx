/**
 * Crear una tarea (modo 'nueva', /crm/lider/tareas/nueva) o editarla (modo
 * 'editar', /crm/lider/tareas/:id/editar).
 *
 * - Nueva: crea la tarea, sube los adjuntos uno a uno (con progreso y
 *   cancelar) y, si subieron todos, le avisa por correo al responsable; luego
 *   va al detalle. Si alguno no subió, no avisa: va al detalle con un aviso de
 *   error (y la lista de los que faltan) para subirlos allá y usar «Avisar».
 * - Editar: prellena los campos (los adjuntos se manejan en el detalle) y
 *   manda solo lo que cambió; si cambió el responsable, le avisa a la persona
 *   nueva. Una tarea terminada no se reasigna.
 * - Los errores del servidor por campo (400 con `campos`) van junto a su
 *   campo y el foco va al primero. Mientras guarda, todo queda deshabilitado.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ACEPTAR_ARCHIVOS_CRM,
  LIMITES_CRM,
  esFechaValida,
  tamanoLegible,
  type EdicionTareaCrm,
  type NuevaTareaCrm,
  type TareaDetalleCrm,
} from '../../api-crm'
import { ErrorCrmHttp, esNoAutenticado, mensajeDe } from '../../datos/clienteCrm'
import { useCarga } from '../../datos/useCarga'
import {
  Avatar,
  Campo,
  Cargando,
  ErrorCarga,
  Icono,
  Migas,
  ProgresoSubida,
  ZonaArchivos,
  ariaCampo,
  formatosLegibles,
  hoyBogota,
  useAvisar,
  useTituloCrm,
} from '../../ui'
import { useLider } from '../contexto'
import {
  RUTA_PANEL,
  elegirArchivos,
  errorNoEncontrada,
  esNoEncontrado,
  estadoNoSubidos,
  idDeRuta,
  primerNombre,
  rutaTarea,
  textoNoSubidos,
  tipoAviso,
  useMontado,
  useSubidas,
} from './comun'
import TareaNoEncontrada from './TareaNoEncontrada'
import './tareas-lider.css'

type CampoTarea = 'titulo' | 'descripcion' | 'responsableId' | 'fechaLimite'
type Errores = Partial<Record<CampoTarea, string>>

/** Id del control de cada campo, en el orden del formulario (el primero con error recibe el foco). */
const ID_CAMPO: Readonly<Record<CampoTarea, string>> = {
  titulo: 'lt-titulo',
  descripcion: 'lt-descripcion',
  responsableId: 'lt-responsable',
  fechaLimite: 'lt-fecha',
}
const CAMPOS = Object.keys(ID_CAMPO) as CampoTarea[]
const ID_CONTADOR = 'lt-titulo-contador'
const ID_ERROR_GENERAL = 'lt-error-general'

const AYUDA_DESCRIPCION = 'Qué hay que hacer y qué se espera al terminar.'
const AYUDA_TERMINADA = 'La tarea ya está terminada: no se puede reasignar. Si hace falta, devuélvala primero desde su detalle.'
const AYUDA_ENTREGABLE = 'La persona no podrá terminar la tarea sin subirlo; le llegará adjunto en el correo.'
const AYUDA_ADJUNTOS = `${formatosLegibles()}. Hasta ${tamanoLegible(LIMITES_CRM.maxBytesArchivo)} cada uno y ${LIMITES_CRM.maxAdjuntos} en total.`

function esCampo(campo: string): campo is CampoTarea {
  return Object.hasOwn(ID_CAMPO, campo)
}

/** Los atributos de ariaCampo, con otro id más en aria-describedby. */
function conDescripcion(atributos: ReturnType<typeof ariaCampo>, otroId: string) {
  return { ...atributos, 'aria-describedby': [atributos['aria-describedby'], otroId].filter(Boolean).join(' ') }
}

export default function FormularioTarea({ modo }: { modo: 'nueva' | 'editar' }) {
  return modo === 'nueva' ? <NuevaTarea /> : <EdicionTarea />
}

function NuevaTarea() {
  useTituloCrm('Nueva tarea')
  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <Migas items={[{ texto: 'Panel', href: RUTA_PANEL }, { texto: 'Nueva tarea' }]} />
          <h1 className="crm-titulo-pagina">Nueva tarea</h1>
          <p className="crm-bajada">Al asignarla, a la persona le llega un correo con la tarea y los adjuntos.</p>
        </div>
      </header>
      <Formulario tarea={null} />
    </div>
  )
}

function EdicionTarea() {
  const { id: parametro } = useParams()
  const id = idDeRuta(parametro)
  const { api, vencida } = useLider()
  const { estado, datos, error, recargar } = useCarga(
    (signal) => (id === null ? Promise.reject(errorNoEncontrada()) : api.tarea(id, signal)),
    [id],
  )
  const noEncontrada = estado === 'error' && esNoEncontrado(error)
  const sinSesion = estado === 'error' && esNoAutenticado(error)
  useEffect(() => {
    if (sinSesion) vencida()
  }, [sinSesion, vencida])
  useTituloCrm(noEncontrada ? 'Tarea no encontrada' : 'Editar tarea')

  if (noEncontrada) return <TareaNoEncontrada />
  const migas = datos
    ? [{ texto: 'Panel', href: RUTA_PANEL }, { texto: datos.titulo, href: rutaTarea(datos.id) }, { texto: 'Editar' }]
    : [{ texto: 'Panel', href: RUTA_PANEL }, { texto: 'Editar tarea' }]
  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <Migas items={migas} />
          <h1 className="crm-titulo-pagina">Editar tarea</h1>
        </div>
      </header>
      {datos ? (
        <Formulario key={datos.id} tarea={datos} />
      ) : estado === 'error' ? (
        <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo cargar la tarea." />
      ) : (
        <Cargando texto="Cargando la tarea…" />
      )}
    </div>
  )
}

/** Los campos de la tarea. Sin `tarea`, crea; con ella, la edita. */
function Formulario({ tarea }: { tarea: TareaDetalleCrm | null }) {
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const navigate = useNavigate()
  const sigueMontado = useMontado()
  const { subida, cancelar, subirTodos } = useSubidas()
  const [hoy] = useState(() => hoyBogota())

  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [responsableId, setResponsableId] = useState(tarea ? String(tarea.responsable.id) : '')
  const [fecha, setFecha] = useState(tarea?.fechaLimite ?? '')
  const [requiere, setRequiere] = useState(tarea?.requiereEntregable ?? false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [erroresArchivo, setErroresArchivo] = useState<string[]>([])
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [paso, setPaso] = useState<string | null>(null)
  /** Id del control que recibe el foco después de pintar los errores. */
  const enfocar = useRef<string | null>(null)

  const personas = useCarga((signal) => api.personas(signal), [])
  const personasSinSesion = personas.estado === 'error' && esNoAutenticado(personas.error)
  useEffect(() => {
    if (personasSinSesion) vencida()
  }, [personasSinSesion, vencida])

  useEffect(() => {
    if (!enfocar.current) return
    document.getElementById(enfocar.current)?.focus()
    enfocar.current = null
  })

  const terminada = tarea?.estado === 'terminada'
  const listas = personas.datos !== null
  const activas = (personas.datos ?? []).filter((persona) => persona.activo)
  const actual = tarea?.responsable ?? null
  // Al editar, el responsable de hoy sigue en la lista aunque ya no esté activo.
  const inactivo = listas && actual && !activas.some((persona) => persona.id === actual.id) ? actual : null
  const opciones = [
    ...activas.map((persona) => ({ id: persona.id, nombre: persona.nombre, inactiva: false })),
    ...(inactivo ? [{ id: inactivo.id, nombre: inactivo.nombre, inactiva: true }] : []),
  ]
  const elegida =
    activas.find((persona) => String(persona.id) === responsableId) ?? (actual && String(actual.id) === responsableId ? actual : null)
  const minFecha = tarea?.fechaLimite && tarea.fechaLimite < hoy ? tarea.fechaLimite : hoy
  const ayudaResponsable = terminada ? AYUDA_TERMINADA : undefined
  const llenos = archivos.length >= LIMITES_CRM.maxAdjuntos
  const textoPaso = subida ? `Subiendo los adjuntos (${subida.numero} de ${subida.total})…` : paso

  function limpiar(campo: CampoTarea) {
    if (!errores[campo]) return
    const resto = { ...errores }
    delete resto[campo]
    setErrores(resto)
  }

  function mostrarErrores(encontrados: Errores, general: string | null) {
    setErrores(encontrados)
    setErrorGeneral(general)
    const primero = CAMPOS.find((campo) => encontrados[campo])
    enfocar.current = primero ? ID_CAMPO[primero] : general ? ID_ERROR_GENERAL : null
  }

  function validar(): Errores {
    const encontrados: Errores = {}
    if (!titulo.trim()) encontrados.titulo = 'Escriba el título de la tarea.'
    if (!responsableId) encontrados.responsableId = 'Elija a la persona responsable.'
    if (fecha && !esFechaValida(fecha)) {
      encontrados.fechaLimite = 'Escriba una fecha válida.'
    } else if (fecha && fecha < hoy && fecha !== tarea?.fechaLimite) {
      encontrados.fechaLimite = 'La fecha límite no puede ser anterior a hoy.'
    }
    return encontrados
  }

  /** El servidor no aceptó: los errores por campo, junto a su campo; lo demás, arriba de los botones. */
  function fallo(error: unknown) {
    setEnviando(false)
    setPaso(null)
    const propios: Errores = {}
    const otros: string[] = []
    if (error instanceof ErrorCrmHttp && error.campos) {
      for (const [campo, texto] of Object.entries(error.campos)) {
        if (esCampo(campo)) propios[campo] = texto
        else otros.push(texto)
      }
    }
    const hayPropios = Object.keys(propios).length > 0
    mostrarErrores(propios, otros.length > 0 ? otros.join(' ') : hayPropios ? null : mensajeDe(error))
  }

  async function crear() {
    const nombre = primerNombre(elegida?.nombre ?? '')
    const descripcionLimpia = descripcion.trim()
    const datos: NuevaTareaCrm = {
      titulo: titulo.trim(),
      responsableId: Number(responsableId),
      fechaLimite: fecha || null,
      requiereEntregable: requiere,
      ...(descripcionLimpia ? { descripcion: descripcionLimpia } : {}),
    }
    setEnviando(true)
    setPaso('Creando la tarea…')
    let creada: TareaDetalleCrm
    try {
      creada = await api.crearTarea(datos)
    } catch (error) {
      if (esNoAutenticado(error)) return vencida()
      if (sigueMontado()) fallo(error)
      return
    }
    const interrumpida = () =>
      avisar(
        `La tarea «${creada.titulo}» se creó, pero no se terminó de asignar. Ábrala desde el panel, suba los adjuntos que falten y use «Avisar».`,
        'error',
      )
    if (!sigueMontado()) return interrumpida()

    let noSubidos: string[] = []
    if (archivos.length > 0) {
      const resultado = await subirTodos(archivos, (archivo, opciones) => api.subirAdjunto(creada.id, archivo, opciones))
      if (resultado.sinSesion) return vencida()
      if (resultado.interrumpida) return interrumpida()
      noSubidos = resultado.fallidos.map(({ archivo }) => archivo.name)
    }

    if (noSubidos.length > 0) {
      avisar(textoNoSubidos(noSubidos), 'error')
    } else {
      setPaso(nombre ? `Avisándole a ${nombre}…` : 'Avisando…')
      try {
        const aviso = await api.avisar(creada.id)
        avisar(aviso.mensaje, tipoAviso(aviso))
        avisarCambioCorreos()
      } catch (error) {
        if (esNoAutenticado(error)) return vencida()
        avisar(`La tarea se creó, pero no se pudo avisar por correo: ${mensajeDe(error)} Use «Avisar» desde aquí.`, 'error')
      }
    }
    if (sigueMontado()) navigate(rutaTarea(creada.id), noSubidos.length > 0 ? { state: estadoNoSubidos(noSubidos) } : undefined)
  }

  async function guardar(original: TareaDetalleCrm) {
    const cambios: EdicionTareaCrm = {}
    const tituloNuevo = titulo.trim()
    if (tituloNuevo !== original.titulo.trim()) cambios.titulo = tituloNuevo
    const descripcionNueva = descripcion.trim()
    if (descripcionNueva !== (original.descripcion ?? '').trim()) cambios.descripcion = descripcionNueva
    const responsableNuevo = Number(responsableId)
    if (responsableNuevo !== original.responsable.id) cambios.responsableId = responsableNuevo
    const fechaNueva = fecha || null
    if (fechaNueva !== original.fechaLimite) cambios.fechaLimite = fechaNueva
    if (requiere !== original.requiereEntregable) cambios.requiereEntregable = requiere

    if (Object.keys(cambios).length === 0) {
      avisar('No había cambios que guardar.', 'info')
      navigate(rutaTarea(original.id))
      return
    }
    setEnviando(true)
    setPaso('Guardando los cambios…')
    try {
      await api.editarTarea(original.id, cambios)
    } catch (error) {
      if (esNoAutenticado(error)) return vencida()
      if (sigueMontado()) fallo(error)
      return
    }
    if (cambios.responsableId === undefined) {
      avisar('Cambios guardados.')
    } else {
      const nombre = primerNombre(elegida?.nombre ?? '')
      setPaso(`Avisándole a ${nombre}…`)
      try {
        const aviso = await api.avisar(original.id)
        avisar(`Cambios guardados. ${aviso.mensaje}`, tipoAviso(aviso))
        avisarCambioCorreos()
      } catch (error) {
        if (esNoAutenticado(error)) return vencida()
        avisar(`Cambios guardados, pero no se le pudo avisar a ${nombre} por correo: ${mensajeDe(error)} Use «Avisar» desde el detalle.`, 'error')
      }
    }
    if (sigueMontado()) navigate(rutaTarea(original.id))
  }

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const encontrados = validar()
    if (Object.keys(encontrados).length > 0) {
      mostrarErrores(encontrados, null)
      return
    }
    mostrarErrores({}, null)
    if (tarea) await guardar(tarea)
    else await crear()
  }

  function agregarArchivos(lista: File[]) {
    const { aceptados, errores: problemas } = elegirArchivos(lista, archivos.length, LIMITES_CRM.maxAdjuntos, archivos)
    setErroresArchivo([...new Set(problemas)])
    if (aceptados.length > 0) setArchivos([...archivos, ...aceptados])
  }

  function quitarElegido(archivo: File) {
    setArchivos(archivos.filter((otro) => otro !== archivo))
    setErroresArchivo([])
  }

  return (
    <form className="crm-lt-formulario" noValidate onSubmit={alEnviar} aria-busy={enviando || undefined}>
      <fieldset className="crm-formulario crm-lt-campos" disabled={enviando}>
        <Campo etiqueta="Título" id={ID_CAMPO.titulo} obligatorio error={errores.titulo}>
          <input
            className="crm-control"
            type="text"
            value={titulo}
            maxLength={LIMITES_CRM.titulo}
            autoComplete="off"
            onChange={(evento) => {
              setTitulo(evento.target.value)
              limpiar('titulo')
            }}
            {...conDescripcion(ariaCampo(ID_CAMPO.titulo, { error: errores.titulo }), ID_CONTADOR)}
          />
          <p className="crm-lt-contador crm-num" id={ID_CONTADOR} data-cerca={titulo.length >= LIMITES_CRM.titulo - 10 ? '' : undefined}>
            <span aria-hidden="true">
              {titulo.length}/{LIMITES_CRM.titulo}
            </span>
            <span className="crm-sr">
              {titulo.length} de {LIMITES_CRM.titulo} caracteres
            </span>
          </p>
        </Campo>

        <Campo etiqueta="Descripción" id={ID_CAMPO.descripcion} ayuda={AYUDA_DESCRIPCION} error={errores.descripcion}>
          <textarea
            className="crm-control"
            rows={6}
            value={descripcion}
            maxLength={LIMITES_CRM.descripcion}
            onChange={(evento) => {
              setDescripcion(evento.target.value)
              limpiar('descripcion')
            }}
            {...ariaCampo(ID_CAMPO.descripcion, { ayuda: AYUDA_DESCRIPCION, error: errores.descripcion })}
          />
        </Campo>

        <div className="crm-lt-dos">
          <Campo etiqueta="Responsable" id={ID_CAMPO.responsableId} obligatorio ayuda={ayudaResponsable} error={errores.responsableId}>
            <select
              className="crm-control"
              value={responsableId}
              disabled={terminada || !listas}
              onChange={(evento) => {
                setResponsableId(evento.target.value)
                limpiar('responsableId')
              }}
              {...ariaCampo(ID_CAMPO.responsableId, { ayuda: ayudaResponsable, error: errores.responsableId })}
            >
              {listas ? (
                <>
                  {tarea ? null : (
                    <option value="" disabled>
                      Elija a una persona
                    </option>
                  )}
                  {opciones.map((opcion) => (
                    <option key={opcion.id} value={String(opcion.id)}>
                      {opcion.inactiva ? `${opcion.nombre} (inactiva)` : opcion.nombre}
                    </option>
                  ))}
                </>
              ) : (
                <option value={responsableId}>{personas.estado === 'error' ? 'No se pudo cargar la lista' : 'Cargando las personas…'}</option>
              )}
            </select>
            {elegida ? (
              <p className="crm-lt-elegida">
                <Avatar nombre={elegida.nombre} iniciales={elegida.iniciales} foto={elegida.foto} semilla={elegida.id} />
                <span>{elegida.nombre}</span>
              </p>
            ) : null}
            {listas && opciones.length === 0 ? <p className="crm-lt-ayuda">No hay personas activas en el equipo.</p> : null}
          </Campo>

          <Campo etiqueta="Fecha límite" id={ID_CAMPO.fechaLimite} error={errores.fechaLimite}>
            <input
              className="crm-control"
              type="date"
              value={fecha}
              min={minFecha}
              onChange={(evento) => {
                setFecha(evento.target.value)
                limpiar('fechaLimite')
              }}
              {...ariaCampo(ID_CAMPO.fechaLimite, { error: errores.fechaLimite })}
            />
          </Campo>
        </div>

        {personas.estado === 'error' && !listas && !personasSinSesion ? (
          <ErrorCarga error={personas.error} alReintentar={personas.recargar} titulo="No se pudo cargar la lista de personas." />
        ) : null}

        <div className="crm-lt-casilla">
          <label className="crm-casilla">
            <input
              type="checkbox"
              id="lt-entregable"
              checked={requiere}
              onChange={(evento) => setRequiere(evento.target.checked)}
              aria-describedby="lt-entregable-ayuda"
            />
            Pedir un documento al terminar
          </label>
          <p className="crm-campo-ayuda crm-lt-casilla-ayuda" id="lt-entregable-ayuda">
            {AYUDA_ENTREGABLE}
          </p>
        </div>

        {tarea ? (
          <p className="crm-lt-ayuda">
            Los adjuntos se agregan y se quitan desde el <Link to={rutaTarea(tarea.id)}>detalle de la tarea</Link>.
          </p>
        ) : (
          <div className="crm-campo" role="group" aria-labelledby="lt-adjuntos-etiqueta">
            <p className="crm-campo-etiqueta" id="lt-adjuntos-etiqueta">
              Adjuntos
            </p>
            <p className="crm-campo-ayuda">Opcionales. Le llegan a la persona en el correo de la tarea.</p>
            <ZonaArchivos
              aceptar={ACEPTAR_ARCHIVOS_CRM}
              multiple
              alElegir={agregarArchivos}
              deshabilitada={enviando || llenos}
              ayuda={AYUDA_ADJUNTOS}
            />
            {erroresArchivo.length > 0 ? (
              <div className="crm-lt-errores" role="alert">
                {erroresArchivo.map((texto) => (
                  <p key={texto} className="crm-campo-error">
                    <Icono nombre="alerta" tamano={16} />
                    {texto}
                  </p>
                ))}
              </div>
            ) : null}
            {llenos ? <p className="crm-lt-ayuda">Ya eligió el máximo de {LIMITES_CRM.maxAdjuntos} adjuntos.</p> : null}
            {archivos.length > 0 ? (
              <ul className="crm-archivos" aria-label="Adjuntos elegidos">
                {archivos.map((archivo) => (
                  <li key={`${archivo.name}-${archivo.size}-${archivo.lastModified}`} className="crm-archivo">
                    <span className="crm-archivo-icono" aria-hidden="true">
                      <Icono nombre="archivo" tamano={22} />
                    </span>
                    <span className="crm-archivo-datos">
                      <span className="crm-archivo-nombre">{archivo.name}</span>
                      <span className="crm-archivo-meta">{tamanoLegible(archivo.size)}, se sube al asignar la tarea</span>
                    </span>
                    <button
                      type="button"
                      className="crm-boton-icono crm-boton-icono-peligro"
                      aria-label={`Quitar ${archivo.name}`}
                      title="Quitar"
                      onClick={() => quitarElegido(archivo)}
                    >
                      <Icono nombre="borrar" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {errorGeneral ? (
          <div className="crm-lt-alerta" id={ID_ERROR_GENERAL} role="alert" tabIndex={-1}>
            <Icono nombre="alerta" tamano={20} />
            <p>{errorGeneral}</p>
          </div>
        ) : null}

        <div className="crm-acciones">
          <button type="submit" className="crm-boton crm-boton-primario">
            {enviando ? (tarea ? 'Guardando…' : 'Asignando…') : tarea ? 'Guardar cambios' : 'Asignar tarea'}
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma" onClick={() => navigate(tarea ? rutaTarea(tarea.id) : RUTA_PANEL)}>
            Cancelar
          </button>
        </div>
      </fieldset>

      <p className="crm-lt-paso" role="status">
        {textoPaso ? (
          <>
            <span className="crm-giro" aria-hidden="true" />
            {textoPaso}
          </>
        ) : null}
      </p>
      {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={cancelar} /> : null}
    </form>
  )
}
