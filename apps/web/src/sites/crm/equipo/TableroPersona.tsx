/**
 * /crm/equipo/:personaId: el tablero de una persona del equipo, que entra sin
 * cuenta desde su tarjeta del inicio.
 *
 * - Pendiente ⇄ En proceso se mueve al instante (optimista): la tarjeta pasa
 *   de columna mientras se guarda (`ocupadas`) y, si falla, vuelve a la suya
 *   y se avisa el error. Pasar a Terminada no mueve nada: abre
 *   DialogoTerminar. Desde Terminada no se mueve.
 * - Abrir una tarea muestra su detalle en un panel lateral (DetalleTarea). La
 *   tarea abierta va en la dirección, ?tarea=<id> (el enlace del correo de
 *   asignación): al llegar con ella se abre el panel; Atrás lo cierra.
 * - De las terminadas se ven las de los últimos
 *   LIMITES_CRM.diasTerminadasRecientes días; el pie de la columna alterna
 *   con todas.
 * - El nombre del líder para los textos sale de apiEquipo.personas()
 *   (esLider); si no se puede, se dice «el líder».
 * - Persona inexistente o inactiva (404): aviso con enlace al inicio.
 * - Con el permiso persona.puedeCrearTareas, «Nueva tarea» en el encabezado
 *   abre DialogoNuevaTarea; al crearla se recarga el tablero.
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ETIQUETAS_ESTADO, LIMITES_CRM, type EstadoTarea, type TareaCrm, type TareaDetalleCrm } from '../api-crm'
import { apiEquipo, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { Avatar, Cargando, ErrorCarga, Icono, Migas, saludo, Tablero, useAvisar, useTituloCrm, Vacio } from '../ui'
import { cambioEnElServidor, esNoEncontrado, partesResumen, resumenDe, textoSinPendientes } from './comun'
import DetalleTarea from './DetalleTarea'
import DialogoNuevaTarea from './DialogoNuevaTarea'
import DialogoTerminar from './DialogoTerminar'
import './equipo.css'

const DIAS_RECIENTES = LIMITES_CRM.diasTerminadasRecientes
const TITULO_NO_ENCONTRADO = 'Tablero no encontrado'

/** Un id de la dirección (persona o tarea): entero positivo, o null. */
function idDe(texto: string | null | undefined): number | null {
  if (!texto || !/^\d{1,9}$/.test(texto)) return null
  const id = Number(texto)
  return id > 0 ? id : null
}

export default function TableroPersona() {
  const { personaId } = useParams()
  const id = idDe(personaId)
  // Una persona por montaje: al cambiar de persona todo (panel, filtros, ocupadas) empieza de cero.
  return id === null ? <DireccionInvalida /> : <TableroDePersona key={id} personaId={id} />
}

function DireccionInvalida() {
  useTituloCrm(TITULO_NO_ENCONTRADO)
  return <NoEncontrada />
}

function NoEncontrada() {
  return (
    <div className="crm-contenedor crm-pagina">
      <Migas items={[{ texto: 'Inicio', href: '/crm' }, { texto: TITULO_NO_ENCONTRADO }]} />
      <div className="crm-eq-no-encontrada">
        <Vacio
          titulo="Esta persona no está en el equipo."
          texto="Puede que el enlace esté incompleto o que la persona ya no esté activa. Elija su nombre en el inicio."
          accion={
            <Link className="crm-boton crm-boton-primario" to="/crm">
              Ir al inicio
            </Link>
          }
        />
      </div>
    </div>
  )
}

/** «Tiene 3 pendientes, 1 en proceso y 2 vencidas.» (las vencidas, en rojo). */
function Resumen({ tareas, terminadasRecientes }: { tareas: TareaCrm[]; terminadasRecientes: number }) {
  const partes = partesResumen(tareas)
  if (partes.length === 0) return <p className="crm-eq-resumen">{textoSinPendientes(terminadasRecientes)}</p>
  return (
    <p className="crm-eq-resumen">
      Tiene{' '}
      {partes.map((parte, i) => (
        <Fragment key={parte.clave}>
          {i === 0 ? null : i === partes.length - 1 ? ' y ' : ', '}
          <span className="crm-eq-resumen-parte" data-clave={parte.clave}>
            {parte.texto}
          </span>
        </Fragment>
      ))}
      .
    </p>
  )
}

function TableroDePersona({ personaId }: { personaId: number }) {
  const avisar = useAvisar()
  const navegar = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const [ahora] = useState(() => new Date())
  const [todas, setTodas] = useState(false)
  const [ocupadas, setOcupadas] = useState<ReadonlySet<number>>(() => new Set())
  const [porTerminar, setPorTerminar] = useState<TareaCrm | null>(null)
  const [versionDetalle, setVersionDetalle] = useState(0)
  const [creando, setCreando] = useState(false)

  const tablero = useCarga((signal) => apiEquipo.tablero(personaId, todas, signal), [personaId, todas], { conservarAlCambiar: true })
  const equipo = useCarga((signal) => apiEquipo.personas(signal), [])
  const lider = equipo.datos?.find((persona) => persona.esLider)?.nombre ?? null

  const { datos, ponerDatos, recargar } = tablero
  const noEncontrada = tablero.estado === 'error' && esNoEncontrado(tablero.error)
  const persona = noEncontrada ? null : (datos?.persona ?? null)
  useTituloCrm(noEncontrada ? TITULO_NO_ENCONTRADO : persona ? `Tareas de ${persona.nombre}` : null)

  // ── Tarea abierta en el panel (?tarea=<id>) ──
  const abierta = idDe(parametros.get('tarea'))
  /** El panel se abrió aquí con un clic (entrada nueva en el historial): cerrarlo es volver atrás. */
  const abiertaAqui = useRef(false)
  useEffect(() => {
    if (abierta === null) abiertaAqui.current = false
  }, [abierta])

  function abrir(id: number) {
    if (id === abierta) return
    const siguientes = new URLSearchParams(parametros)
    siguientes.set('tarea', String(id))
    const reemplazar = abierta !== null
    if (!reemplazar) abiertaAqui.current = true
    setParametros(siguientes, { replace: reemplazar })
  }

  function cerrar() {
    if (abiertaAqui.current) {
      abiertaAqui.current = false
      void navegar(-1)
      return
    }
    const siguientes = new URLSearchParams(parametros)
    siguientes.delete('tarea')
    setParametros(siguientes, { replace: true })
  }

  // ── Mover ──
  function ponerTarea(id: number, cambiar: (tarea: TareaCrm) => TareaCrm) {
    ponerDatos((anterior) => (anterior ? { ...anterior, tareas: anterior.tareas.map((t) => (t.id === id ? cambiar(t) : t)) } : anterior))
  }

  function marcarOcupada(id: number, ocupada: boolean) {
    setOcupadas((previas) => {
      const siguientes = new Set(previas)
      if (ocupada) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })
  }

  async function cambiarEstado(tarea: TareaCrm, destino: 'pendiente' | 'en_proceso') {
    const origen = tarea.estado
    marcarOcupada(tarea.id, true)
    ponerTarea(tarea.id, (t) => ({ ...t, estado: destino }))
    try {
      const detalle = await apiEquipo.cambiarEstado(personaId, tarea.id, destino)
      ponerTarea(tarea.id, () => resumenDe(detalle))
      avisar(`«${tarea.titulo}» pasó a ${ETIQUETAS_ESTADO[destino]}.`)
    } catch (error) {
      ponerTarea(tarea.id, (t) => ({ ...t, estado: origen }))
      avisar(`No se pudo mover «${tarea.titulo}». ${mensajeDe(error)}`, 'error')
      if (cambioEnElServidor(error)) recargar()
    } finally {
      marcarOcupada(tarea.id, false)
      setVersionDetalle((version) => version + 1)
    }
  }

  function alMover(tarea: TareaCrm, destino: EstadoTarea) {
    if (tarea.estado === 'terminada') return
    if (destino === 'terminada') setPorTerminar(tarea)
    else void cambiarEstado(tarea, destino)
  }

  // ── Terminar ──
  function alTerminada(tarea: TareaDetalleCrm | null) {
    if (tarea) ponerTarea(tarea.id, () => resumenDe(tarea))
    setPorTerminar(null)
    recargar()
    setVersionDetalle((version) => version + 1)
  }

  // ── Nueva tarea propia ──
  function alCreada() {
    setCreando(false)
    recargar()
  }

  function alCambiarEntregables() {
    recargar()
    setVersionDetalle((version) => version + 1)
  }

  // ── Vista ──
  if (noEncontrada) return <NoEncontrada />

  if (!datos) {
    return (
      <div className="crm-contenedor crm-pagina">
        <Migas items={[{ texto: 'Inicio', href: '/crm' }, { texto: 'Tablero' }]} />
        <div className="crm-eq-cargando">
          {tablero.estado === 'error' ? (
            <ErrorCarga error={tablero.error} alReintentar={recargar} titulo="No se pudo cargar el tablero." />
          ) : (
            <Cargando texto="Cargando las tareas…" />
          )}
        </div>
      </div>
    )
  }

  const { persona: titular, tareas } = datos
  const cargando = tablero.estado === 'cargando'

  return (
    <div className="crm-contenedor crm-pagina crm-eq-tablero">
      <Migas items={[{ texto: 'Inicio', href: '/crm' }, { texto: titular.nombre }]} />

      <header className="crm-eq-persona">
        <Avatar nombre={titular.nombre} iniciales={titular.iniciales} foto={titular.foto} tamano="xl" semilla={titular.id} />
        <div className="crm-eq-persona-texto">
          <h1 className="crm-titulo-pagina crm-eq-titulo">
            <span className="crm-eq-titulo-saludo">{saludo(ahora)},</span> {titular.nombre}
          </h1>
          <Resumen tareas={tareas} terminadasRecientes={titular.conteo.terminadasRecientes} />
          <p className="crm-eq-cambiar">
            ¿No es usted? <Link to="/crm">Volver al inicio</Link>
          </p>
        </div>
        {titular.puedeCrearTareas ? (
          <button type="button" className="crm-boton crm-boton-primario crm-eq-nueva" onClick={() => setCreando(true)}>
            <Icono nombre="mas" />
            Nueva tarea
          </button>
        ) : null}
      </header>

      {tablero.estado === 'error' ? (
        <div className="crm-eq-actualizar">
          <ErrorCarga error={tablero.error} alReintentar={recargar} titulo="No se pudo actualizar el tablero." />
        </div>
      ) : null}

      <Tablero
        tareas={tareas}
        alAbrir={abrir}
        alMover={alMover}
        puedeMover={(tarea) => tarea.estado !== 'terminada'}
        ocupadas={ocupadas}
        seleccionada={abierta}
        vacio={{
          pendiente: <p>No tiene tareas pendientes.</p>,
          en_proceso: <p>Cuando empiece una tarea, muévala aquí.</p>,
          terminada: <p>{todas ? 'Todavía no ha terminado tareas.' : `No ha terminado tareas en los últimos ${DIAS_RECIENTES} días.`}</p>,
        }}
        pieColumna={{
          terminada: (
            <div className="crm-eq-pie-terminadas">
              <p className="crm-eq-pie-nota">
                {todas ? 'Se ven todas las terminadas.' : `Se ven las de los últimos ${DIAS_RECIENTES} días.`}
              </p>
              <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm" onClick={() => setTodas((antes) => !antes)}>
                {todas ? 'Ver solo las recientes' : 'Ver todas las terminadas'}
              </button>
              {cargando ? <span className="crm-giro" aria-hidden="true" /> : null}
            </div>
          ),
        }}
      />

      {abierta !== null ? (
        <DetalleTarea
          key={abierta}
          personaId={personaId}
          tareaId={abierta}
          resumen={tareas.find((tarea) => tarea.id === abierta) ?? null}
          persona={titular.nombre}
          lider={lider}
          version={versionDetalle}
          ocupada={ocupadas.has(abierta)}
          alCerrar={cerrar}
          alMover={(tarea, destino) => void cambiarEstado(tarea, destino)}
          alTerminar={setPorTerminar}
        />
      ) : null}

      {creando ? <DialogoNuevaTarea personaId={personaId} alCerrar={() => setCreando(false)} alCreada={alCreada} /> : null}

      {porTerminar ? (
        <DialogoTerminar
          key={porTerminar.id}
          personaId={personaId}
          tarea={porTerminar}
          lider={lider}
          alCerrar={() => setPorTerminar(null)}
          alTerminada={alTerminada}
          alCambio={alCambiarEntregables}
        />
      ) : null}
    </div>
  )
}
