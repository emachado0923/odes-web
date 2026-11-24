/**
 * Detalle de una tarea para el líder (/crm/lider/tareas/:id).
 *
 * - Encabezado: migas, título, estado, responsable, fecha límite (vencida en
 *   rojo y con texto), «Pide entregable» y si ya se le avisó por correo.
 * - Descripción; adjuntos del líder (se quitan con confirmación y se agregan
 *   con progreso); entregables de la persona (con la nota de cierre si está
 *   terminada); historial; correos de la tarea (con «Reintentar»).
 * - Una sola acción principal según el estado: «Devolver» (con observación)
 *   si está terminada; si no, «Avisar» o «Avisar de nuevo». Además «Editar» y
 *   «Eliminar» (con confirmación).
 * - Si al crearla algún adjunto no subió, el formulario llega aquí con
 *   location.state (estadoNoSubidos) y se dice cuáles faltan.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ACEPTAR_ARCHIVOS_CRM,
  ETIQUETAS_ESTADO_CORREO,
  ETIQUETAS_TIPO_CORREO,
  LIMITES_CRM,
  tamanoLegible,
  type ArchivoCrm,
  type CorreoCrm,
  type TareaDetalleCrm,
} from '../../api-crm'
import { ErrorCrmHttp, esCancelacion, esNoAutenticado, mensajeDe } from '../../datos/clienteCrm'
import { useCarga } from '../../datos/useCarga'
import {
  Avatar,
  Campo,
  Cargando,
  ChipEstado,
  Dialogo,
  ErrorCarga,
  Icono,
  ListaArchivos,
  Migas,
  ProgresoSubida,
  ZonaArchivos,
  ariaCampo,
  fechaCorta,
  fechaHora,
  formatosLegibles,
  plural,
  textoFechaTarea,
  useAvisar,
  useTituloCrm,
  type NombreIcono,
  type TonoFecha,
} from '../../ui'
import { useLider } from '../contexto'
import {
  RUTA_PANEL,
  elegirArchivos,
  entreComillas,
  errorNoEncontrada,
  esNoEncontrado,
  idDeRuta,
  noSubidosDe,
  primerNombre,
  rutaEditar,
  textoEvento,
  textoReintento,
  tipoAviso,
  useSubidas,
} from './comun'
import TareaNoEncontrada from './TareaNoEncontrada'
import './tareas-lider.css'

const ID_OBSERVACION = 'lt-observacion'
const AYUDA_OBSERVACION = 'Qué debe corregir o completar. Le llega en el correo.'
const AYUDA_ADJUNTOS = `${formatosLegibles()}. Hasta ${tamanoLegible(LIMITES_CRM.maxBytesArchivo)} cada uno.`

const ICONO_FECHA: Readonly<Record<TonoFecha, NombreIcono>> = {
  normal: 'calendario',
  pronto: 'reloj',
  vencida: 'alerta',
  terminada: 'check',
}

type PonerTarea = (actualizar: (anterior: TareaDetalleCrm | null) => TareaDetalleCrm | null) => void

function con(conjunto: ReadonlySet<number>, id: number): ReadonlySet<number> {
  return new Set(conjunto).add(id)
}

function sin(conjunto: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const nuevo = new Set(conjunto)
  nuevo.delete(id)
  return nuevo
}

export default function DetalleTareaLider() {
  const { id: parametro } = useParams()
  const id = idDeRuta(parametro)
  const { api, vencida } = useLider()
  const { estado, datos, error, recargar, ponerDatos } = useCarga(
    (signal) => (id === null ? Promise.reject(errorNoEncontrada()) : api.tarea(id, signal)),
    [id],
  )
  const noEncontrada = estado === 'error' && esNoEncontrado(error)
  const sinSesion = estado === 'error' && esNoAutenticado(error)
  useEffect(() => {
    if (sinSesion) vencida()
  }, [sinSesion, vencida])
  useTituloCrm(noEncontrada ? 'Tarea no encontrada' : (datos?.titulo ?? 'Tarea'))

  if (noEncontrada) return <TareaNoEncontrada />
  if (!datos) {
    return (
      <div className="crm-contenedor crm-pagina">
        <header className="crm-encabezado">
          <div className="crm-encabezado-texto">
            <Migas items={[{ texto: 'Panel', href: RUTA_PANEL }, { texto: 'Tarea' }]} />
          </div>
        </header>
        {estado === 'error' ? (
          <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo cargar la tarea." />
        ) : (
          <Cargando texto="Cargando la tarea…" />
        )}
      </div>
    )
  }
  return <Detalle tarea={datos} errorRecarga={estado === 'error' ? error : null} recargar={recargar} ponerDatos={ponerDatos} />
}

function Detalle({
  tarea,
  errorRecarga,
  recargar,
  ponerDatos,
}: {
  tarea: TareaDetalleCrm
  /** La última recarga falló (se siguen viendo los datos anteriores). */
  errorRecarga: unknown
  recargar: () => void
  ponerDatos: PonerTarea
}) {
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const navigate = useNavigate()
  const location = useLocation()
  const { subida, cancelar, subirTodos } = useSubidas()
  const [abierto, setAbierto] = useState<'devolver' | 'eliminar' | null>(null)
  const [porQuitar, setPorQuitar] = useState<ArchivoCrm | null>(null)
  const [quitando, setQuitando] = useState<ReadonlySet<number>>(() => new Set())
  const [reintentando, setReintentando] = useState<ReadonlySet<number>>(() => new Set())
  const [avisando, setAvisando] = useState(false)
  const [erroresSubida, setErroresSubida] = useState<string[]>([])

  const terminada = tarea.estado === 'terminada'
  const nombre = primerNombre(tarea.responsable.nombre)
  const adjuntos = tarea.archivos.filter((archivo) => archivo.tipo === 'adjunto')
  const entregables = tarea.archivos.filter((archivo) => archivo.tipo === 'entregable')
  const correos = tarea.correos ?? []
  const lleno = adjuntos.length >= LIMITES_CRM.maxAdjuntos
  const noSubidos = noSubidosDe(location.state)
  const fecha = textoFechaTarea(tarea)

  /** Ya no hace falta decir qué adjuntos no subieron al crearla. */
  function olvidarNoSubidos() {
    if (noSubidos.length > 0) navigate(location.pathname, { replace: true, state: null })
  }

  async function avisarTarea() {
    setAvisando(true)
    try {
      const aviso = await api.avisar(tarea.id)
      avisar(aviso.mensaje, tipoAviso(aviso))
      avisarCambioCorreos()
      olvidarNoSubidos()
      recargar()
    } catch (error) {
      if (esNoAutenticado(error)) return vencida()
      avisar(mensajeDe(error), 'error')
      if (error instanceof ErrorCrmHttp && error.estado === 409) recargar()
    } finally {
      setAvisando(false)
    }
  }

  async function agregarAdjuntos(lista: File[]) {
    const { aceptados, errores } = elegirArchivos(lista, adjuntos.length, LIMITES_CRM.maxAdjuntos)
    setErroresSubida([...new Set(errores)])
    if (aceptados.length === 0) return
    const resultado = await subirTodos(
      aceptados,
      (archivo, opciones) => api.subirAdjunto(tarea.id, archivo, opciones),
      (subido) => ponerDatos((anterior) => (anterior ? { ...anterior, archivos: [...anterior.archivos, subido], adjuntos: anterior.adjuntos + 1 } : anterior)),
    )
    if (resultado.sinSesion) return vencida()
    if (resultado.interrumpida) return
    const fallas = resultado.fallidos
      .filter(({ error }) => !esCancelacion(error))
      .map(({ archivo, error }) => `No se subió «${archivo.name}»: ${mensajeDe(error)}`)
    if (fallas.length > 0) setErroresSubida((previos) => [...new Set([...previos, ...fallas])])
    if (resultado.subidos.length > 0) {
      const varios = resultado.subidos.length > 1
      const pedirAviso = tarea.avisada && !terminada ? ` Para que ${varios ? 'le lleguen' : 'le llegue'} a ${nombre}, use «Avisar de nuevo».` : ''
      avisar(`${varios ? 'Se subieron' : 'Se subió'} ${entreComillas(resultado.subidos.map((archivo) => archivo.nombre))}.${pedirAviso}`)
      olvidarNoSubidos()
      recargar()
    }
  }

  async function quitarAdjunto(archivo: ArchivoCrm) {
    setPorQuitar(null)
    setQuitando((previos) => con(previos, archivo.id))
    try {
      await api.quitarAdjunto(tarea.id, archivo.id)
      ponerDatos((anterior) =>
        anterior
          ? { ...anterior, archivos: anterior.archivos.filter((otro) => otro.id !== archivo.id), adjuntos: Math.max(0, anterior.adjuntos - 1) }
          : anterior,
      )
      avisar(`Se quitó «${archivo.nombre}».`)
      recargar()
    } catch (error) {
      if (esNoAutenticado(error)) return vencida()
      avisar(mensajeDe(error), 'error')
    } finally {
      setQuitando((previos) => sin(previos, archivo.id))
    }
  }

  async function reintentar(correo: CorreoCrm) {
    setReintentando((previos) => con(previos, correo.id))
    try {
      const nuevo = await api.reintentarCorreo(correo.id)
      ponerDatos((anterior) =>
        anterior ? { ...anterior, correos: (anterior.correos ?? []).map((otro) => (otro.id === correo.id ? nuevo : otro)) } : anterior,
      )
      const { texto, tipo } = textoReintento(nuevo)
      avisar(texto, tipo)
      avisarCambioCorreos()
    } catch (error) {
      if (esNoAutenticado(error)) return vencida()
      avisar(mensajeDe(error), 'error')
    } finally {
      setReintentando((previos) => sin(previos, correo.id))
    }
  }

  function devuelta(nueva: TareaDetalleCrm) {
    ponerDatos((anterior) => ({ ...nueva, correos: nueva.correos ?? anterior?.correos }))
    setAbierto(null)
    recargar()
  }

  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <Migas items={[{ texto: 'Panel', href: RUTA_PANEL }, { texto: tarea.titulo }]} />
          <h1 className="crm-titulo-pagina">{tarea.titulo}</h1>
          <ul className="crm-lt-datos" aria-label="Datos de la tarea">
            <li>
              <ChipEstado estado={tarea.estado} />
            </li>
            <li className="crm-lt-dato crm-lt-responsable">
              <Avatar
                nombre={tarea.responsable.nombre}
                iniciales={tarea.responsable.iniciales}
                foto={tarea.responsable.foto}
                tamano="sm"
                semilla={tarea.responsable.id}
              />
              <span>
                <span className="crm-sr">Responsable: </span>
                {tarea.responsable.nombre}
              </span>
            </li>
            {fecha ? (
              <li className="crm-lt-dato crm-lt-fecha" data-tono={fecha.tono} title={fecha.completa}>
                <Icono nombre={ICONO_FECHA[fecha.tono]} tamano={16} />
                <span>
                  {fecha.etiqueta ? <strong>{fecha.etiqueta}</strong> : null}
                  {fecha.etiqueta ? ', ' : null}
                  {fecha.texto}
                </span>
              </li>
            ) : null}
            {terminada && tarea.fechaLimite ? (
              <li className="crm-lt-dato">
                <Icono nombre="calendario" tamano={16} />
                Fecha límite: {fechaCorta(tarea.fechaLimite)}
              </li>
            ) : null}
            {!terminada && !tarea.fechaLimite ? (
              <li className="crm-lt-dato">
                <Icono nombre="calendario" tamano={16} />
                Sin fecha límite
              </li>
            ) : null}
            {tarea.requiereEntregable ? (
              <li>
                <span className="crm-etiqueta">
                  <Icono nombre="subir" tamano={14} />
                  Pide entregable
                </span>
              </li>
            ) : null}
            <li>
              {tarea.avisada ? (
                <span className="crm-etiqueta">
                  <Icono nombre="check" tamano={14} />
                  Aviso enviado
                </span>
              ) : (
                <span className="crm-etiqueta crm-lt-sin-avisar">
                  <Icono nombre="correo" tamano={14} />
                  Sin avisar
                </span>
              )}
            </li>
          </ul>
        </div>
        <div className="crm-encabezado-acciones">
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-peligro" onClick={() => setAbierto('eliminar')}>
            <Icono nombre="borrar" />
            Eliminar
          </button>
          <Link className="crm-boton crm-boton-secundario" to={rutaEditar(tarea.id)}>
            <Icono nombre="editar" />
            Editar
          </Link>
          {terminada ? (
            <button type="button" className="crm-boton crm-boton-primario" onClick={() => setAbierto('devolver')}>
              <Icono nombre="devolver" />
              Devolver
            </button>
          ) : (
            <button
              type="button"
              className="crm-boton crm-boton-primario"
              onClick={() => void avisarTarea()}
              disabled={avisando || subida !== null}
              aria-busy={avisando || undefined}
            >
              <Icono nombre="enviar" />
              {avisando ? 'Avisando…' : tarea.avisada ? 'Avisar de nuevo' : 'Avisar'}
            </button>
          )}
        </div>
      </header>

      {errorRecarga ? (
        <div className="crm-lt-recarga">
          <ErrorCarga error={errorRecarga} alReintentar={recargar} titulo="No se pudo actualizar la tarea." />
        </div>
      ) : null}

      <div className="crm-lt-cuerpo">
        <div className="crm-lt-columna">
          <section className="crm-lt-seccion" aria-labelledby="lt-t-descripcion">
            <h2 className="crm-titulo-seccion" id="lt-t-descripcion">
              Descripción
            </h2>
            {tarea.descripcion?.trim() ? <p className="crm-lt-texto">{tarea.descripcion}</p> : <p className="crm-suave">Sin descripción.</p>}
          </section>

          <section className="crm-lt-seccion" aria-labelledby="lt-t-adjuntos">
            <div className="crm-lt-seccion-cabeza">
              <h2 className="crm-titulo-seccion" id="lt-t-adjuntos">
                Adjuntos
              </h2>
              <span className="crm-lt-cuenta crm-num">
                {adjuntos.length} de {LIMITES_CRM.maxAdjuntos}
              </span>
            </div>
            <p className="crm-lt-ayuda">Van en el correo que le llega a {nombre} cuando usted le avisa.</p>
            {noSubidos.length > 0 ? (
              <div className="crm-lt-alerta">
                <Icono nombre="alerta" tamano={20} />
                <p>
                  Al crear la tarea no se {noSubidos.length > 1 ? 'subieron' : 'subió'} {entreComillas(noSubidos)}.{' '}
                  {noSubidos.length > 1 ? 'Súbalos' : 'Súbalo'} aquí y luego use «Avisar».
                </p>
                <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm" onClick={olvidarNoSubidos}>
                  Entendido
                </button>
              </div>
            ) : null}
            <ListaArchivos archivos={adjuntos} alQuitar={setPorQuitar} ocupados={quitando} vacio="La tarea no tiene adjuntos." />
            {lleno ? (
              <p className="crm-lt-ayuda">Llegó al máximo de {LIMITES_CRM.maxAdjuntos} adjuntos: quite uno para subir otro.</p>
            ) : (
              <ZonaArchivos
                aceptar={ACEPTAR_ARCHIVOS_CRM}
                multiple
                alElegir={(lista) => void agregarAdjuntos(lista)}
                deshabilitada={subida !== null}
                ayuda={AYUDA_ADJUNTOS}
              />
            )}
            {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={cancelar} /> : null}
            {erroresSubida.length > 0 ? (
              <div className="crm-lt-errores" role="alert">
                {erroresSubida.map((texto) => (
                  <p key={texto} className="crm-campo-error">
                    <Icono nombre="alerta" tamano={16} />
                    {texto}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="crm-lt-seccion" aria-labelledby="lt-t-entregables">
            <h2 className="crm-titulo-seccion" id="lt-t-entregables">
              Entregables de {nombre}
            </h2>
            <ListaArchivos
              archivos={entregables}
              vacio={tarea.requiereEntregable ? 'Todavía no hay entregables. La tarea pide uno para poder terminarla.' : 'Todavía no hay entregables.'}
            />
            {terminada ? (
              <div className="crm-lt-cierre">
                <p className="crm-lt-cierre-titulo">
                  <Icono nombre="check" tamano={16} />
                  {tarea.terminadaEn ? `Terminada el ${fechaHora(tarea.terminadaEn)}` : 'Terminada'}
                </p>
                {tarea.notaCierre?.trim() ? (
                  <>
                    <p className="crm-lt-cierre-etiqueta">Nota de cierre</p>
                    <p className="crm-lt-texto">{tarea.notaCierre}</p>
                  </>
                ) : (
                  <p className="crm-suave">No dejó nota de cierre.</p>
                )}
              </div>
            ) : null}
          </section>
        </div>

        <div className="crm-lt-columna">
          <section className="crm-lt-seccion" aria-labelledby="lt-t-historial">
            <h2 className="crm-titulo-seccion" id="lt-t-historial">
              Historial
            </h2>
            {tarea.eventos.length > 0 ? (
              <ol className="crm-lt-historial">
                {tarea.eventos.map((evento) => (
                  <li key={evento.id} className="crm-lt-evento" data-tipo={evento.tipo}>
                    <p className="crm-lt-evento-texto">{textoEvento(evento)}</p>
                    <time className="crm-lt-evento-fecha" dateTime={evento.creadoEn}>
                      {fechaHora(evento.creadoEn)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="crm-suave">Todavía no hay movimientos.</p>
            )}
          </section>

          <section className="crm-lt-seccion" aria-labelledby="lt-t-correos">
            <h2 className="crm-titulo-seccion" id="lt-t-correos">
              Correos de esta tarea
            </h2>
            {correos.length > 0 ? (
              <ul className="crm-lt-correos">
                {correos.map((correo) => (
                  <FilaCorreo key={correo.id} correo={correo} ocupado={reintentando.has(correo.id)} alReintentar={() => void reintentar(correo)} />
                ))}
              </ul>
            ) : (
              <p className="crm-suave">Todavía no ha salido ningún correo de esta tarea.</p>
            )}
          </section>
        </div>
      </div>

      {abierto === 'devolver' ? (
        <DialogoDevolver tarea={tarea} alCerrar={() => setAbierto(null)} alDevuelta={devuelta} alConflicto={recargar} />
      ) : null}
      {abierto === 'eliminar' ? <DialogoEliminar tarea={tarea} alCerrar={() => setAbierto(null)} /> : null}
      <Dialogo
        abierto={porQuitar !== null}
        titulo="¿Quitar el adjunto?"
        descripcion={porQuitar ? `«${porQuitar.nombre}» dejará de estar en la tarea.` : undefined}
        tamano="sm"
        alCerrar={() => setPorQuitar(null)}
        pie={
          porQuitar ? (
            <>
              <button type="button" className="crm-boton crm-boton-secundario" onClick={() => setPorQuitar(null)}>
                Cancelar
              </button>
              <button type="button" className="crm-boton crm-boton-peligro" onClick={() => void quitarAdjunto(porQuitar)}>
                <Icono nombre="borrar" />
                Quitar
              </button>
            </>
          ) : null
        }
      >
        <p>{tarea.avisada ? `Si ${nombre} ya recibió el correo de la tarea, allí lo conserva.` : 'Puede volver a subirlo cuando quiera.'}</p>
      </Dialogo>
    </div>
  )
}

/** Un correo de la tarea: tipo, destinatario, estado (color y texto), intentos, error y «Reintentar» si no salió. */
function FilaCorreo({ correo, ocupado, alReintentar }: { correo: CorreoCrm; ocupado: boolean; alReintentar: () => void }) {
  const tipo = ETIQUETAS_TIPO_CORREO[correo.tipo] ?? correo.tipo
  return (
    <li className="crm-lt-correo" aria-busy={ocupado || undefined}>
      <p className="crm-lt-correo-cabeza">
        <span className="crm-lt-correo-tipo">{tipo}</span>
        <span className="crm-lt-estado-correo" data-estado={correo.estado}>
          {ETIQUETAS_ESTADO_CORREO[correo.estado] ?? correo.estado}
        </span>
      </p>
      <p className="crm-lt-correo-para">
        <span className="crm-suave">Para: </span>
        {correo.para}
      </p>
      <p className="crm-lt-correo-meta">
        <span>{plural(correo.intentos, 'intento', 'intentos')}</span>
        <span>{correo.enviadoEn ? `Enviado el ${fechaHora(correo.enviadoEn)}` : `Creado el ${fechaHora(correo.creadoEn)}`}</span>
        {correo.adjuntos > 0 ? <span>{plural(correo.adjuntos, 'archivo adjunto', 'archivos adjuntos')}</span> : null}
      </p>
      {correo.error ? <p className="crm-lt-correo-error">{correo.error}</p> : null}
      {correo.estado !== 'enviado' ? (
        <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" onClick={alReintentar} disabled={ocupado}>
          {ocupado ? <span className="crm-giro" aria-hidden="true" /> : <Icono nombre="reintentar" tamano={16} />}
          {ocupado ? 'Reintentando…' : 'Reintentar'}{' '}
          <span className="crm-sr">
            el correo «{tipo}» para {correo.para}
          </span>
        </button>
      ) : null}
    </li>
  )
}

/** Devolver una tarea terminada: la observación es obligatoria y le llega a la persona. */
function DialogoDevolver({
  tarea,
  alCerrar,
  alDevuelta,
  alConflicto,
}: {
  tarea: TareaDetalleCrm
  alCerrar: () => void
  alDevuelta: (tarea: TareaDetalleCrm) => void
  /** La tarea cambió mientras tanto (409): recargarla. */
  alConflicto: () => void
}) {
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const nombre = primerNombre(tarea.responsable.nombre)

  async function devolver() {
    if (enviando) return
    const texto = observacion.trim()
    if (!texto) {
      setError('Escriba la observación: qué debe corregir o completar.')
      document.getElementById(ID_OBSERVACION)?.focus()
      return
    }
    setEnviando(true)
    setError(null)
    setErrorGeneral(null)
    try {
      const resultado = await api.devolver(tarea.id, texto)
      avisar(resultado.aviso.mensaje, tipoAviso(resultado.aviso))
      avisarCambioCorreos()
      alDevuelta(resultado.tarea)
    } catch (fallo) {
      if (esNoAutenticado(fallo)) return vencida()
      setEnviando(false)
      if (fallo instanceof ErrorCrmHttp && fallo.campos?.observacion) setError(fallo.campos.observacion)
      else setErrorGeneral(mensajeDe(fallo))
      if (fallo instanceof ErrorCrmHttp && fallo.estado === 409) alConflicto()
    }
  }

  return (
    <Dialogo
      abierto
      titulo="Devolver la tarea"
      descripcion={`Vuelve a En proceso y a ${nombre} le llega un correo con su observación.`}
      alCerrar={alCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="crm-boton crm-boton-primario" onClick={() => void devolver()} disabled={enviando}>
            <Icono nombre="devolver" />
            {enviando ? 'Devolviendo…' : 'Devolver tarea'}
          </button>
        </>
      }
    >
      <div className="crm-formulario">
        <Campo etiqueta="Observación" id={ID_OBSERVACION} obligatorio ayuda={AYUDA_OBSERVACION} error={error}>
          <textarea
            className="crm-control"
            rows={5}
            value={observacion}
            maxLength={LIMITES_CRM.observacion}
            disabled={enviando}
            onChange={(evento) => {
              setObservacion(evento.target.value)
              if (error) setError(null)
            }}
            {...ariaCampo(ID_OBSERVACION, { ayuda: AYUDA_OBSERVACION, error })}
          />
        </Campo>
        {errorGeneral ? (
          <p className="crm-campo-error" role="alert">
            <Icono nombre="alerta" tamano={16} />
            {errorGeneral}
          </p>
        ) : null}
      </div>
    </Dialogo>
  )
}

/** Confirmación para eliminar: la tarea desaparece del tablero de la persona y se vuelve al panel. */
function DialogoEliminar({ tarea, alCerrar }: { tarea: TareaDetalleCrm; alCerrar: () => void }) {
  const { api, vencida } = useLider()
  const avisar = useAvisar()
  const navigate = useNavigate()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function eliminar() {
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      await api.eliminarTarea(tarea.id)
    } catch (fallo) {
      if (esNoAutenticado(fallo)) return vencida()
      // 404: alguien más ya la eliminó; se sigue como si se hubiera eliminado ahora.
      if (!esNoEncontrado(fallo)) {
        setEnviando(false)
        setError(mensajeDe(fallo))
        return
      }
    }
    avisar('Tarea eliminada.')
    navigate(RUTA_PANEL)
  }

  return (
    <Dialogo
      abierto
      titulo="¿Eliminar la tarea?"
      descripcion={`La tarea desaparecerá del tablero de ${tarea.responsable.nombre}.`}
      tamano="sm"
      alCerrar={alCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="crm-boton crm-boton-peligro" onClick={() => void eliminar()} disabled={enviando}>
            <Icono nombre="borrar" />
            {enviando ? 'Eliminando…' : 'Eliminar tarea'}
          </button>
        </>
      }
    >
      <p className="crm-lt-eliminar-titulo">«{tarea.titulo}»</p>
      {error ? (
        <p className="crm-campo-error" role="alert">
          <Icono nombre="alerta" tamano={16} />
          {error}
        </p>
      ) : null}
    </Dialogo>
  )
}
