import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { LIMITES_CRM, type ConteoTareasCrm, type EstadoTarea, type PersonaCrm, type ResumenLiderCrm } from '../api-crm'
import { esNoAutenticado } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { Avatar, Cargando, ErrorCarga, Icono, MarcaEstado, Tablero, plural, unirConY, useTituloCrm } from '../ui'
import { useLider } from './contexto'

/** Lo que espera la búsqueda después de la última tecla. */
const ESPERA_BUSQUEDA_MS = 300
const DIAS_RECIENTES = LIMITES_CRM.diasTerminadasRecientes

function numero(n: number): string {
  return n.toLocaleString('es-CO')
}

/** Correo sin configurar (informativo) y correos que no salieron (advertencia): los dos llevan a Correos. */
function AvisosCorreo({ correo }: { correo: ResumenLiderCrm['correo'] }) {
  if (correo.configurado && correo.errores === 0) return null
  return (
    <div className="crm-li-notas">
      {!correo.configurado ? (
        <div className="crm-li-nota">
          <Icono nombre="info" tamano={20} className="crm-li-nota-icono" />
          <p>
            El correo todavía no está configurado: los avisos quedan guardados y no salen.{' '}
            <Link to="/crm/lider/correos">Configurar el correo</Link>
          </p>
        </div>
      ) : null}
      {correo.errores > 0 ? (
        <div className="crm-li-nota" data-tono="error">
          <Icono nombre="alerta" tamano={20} className="crm-li-nota-icono" />
          <p>
            {correo.errores === 1 ? '1 correo no salió.' : `${numero(correo.errores)} correos no salieron.`}{' '}
            <Link to="/crm/lider/correos">Revisar en Correos</Link>
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Los totales del equipo; el lector de pantalla oye una sola frase. */
function Totales({ totales }: { totales: ConteoTareasCrm }) {
  const { pendientes, enProceso, vencidas, terminadasRecientes } = totales
  const terminadas = `${plural(terminadasRecientes, 'terminada', 'terminadas')} en los últimos ${DIAS_RECIENTES} días`
  const frase = unirConY(
    [
      plural(pendientes, 'pendiente', 'pendientes'),
      `${numero(enProceso)} en proceso`,
      vencidas > 0 ? plural(vencidas, 'vencida', 'vencidas') : null,
      terminadas,
    ].filter((parte): parte is string => parte !== null),
  )
  return (
    <p className="crm-li-totales">
      <span className="crm-sr">{`En todo el equipo: ${frase}.`}</span>
      <span className="crm-li-total" aria-hidden="true">
        <MarcaEstado estado="pendiente" />
        <strong>{numero(pendientes)}</strong> {pendientes === 1 ? 'pendiente' : 'pendientes'}
      </span>
      <span className="crm-li-total" aria-hidden="true">
        <MarcaEstado estado="en_proceso" />
        <strong>{numero(enProceso)}</strong> en proceso
      </span>
      {vencidas > 0 ? (
        <span className="crm-li-total" data-tipo="vencida" aria-hidden="true">
          <Icono nombre="alerta" tamano={16} />
          <strong>{numero(vencidas)}</strong> {vencidas === 1 ? 'vencida' : 'vencidas'}
        </span>
      ) : null}
      <span className="crm-li-total" aria-hidden="true">
        <MarcaEstado estado="terminada" />
        <strong>{numero(terminadasRecientes)}</strong> {terminadasRecientes === 1 ? 'terminada' : 'terminadas'} en {DIAS_RECIENTES} días
      </span>
    </p>
  )
}

/**
 * Ficha compacta de una persona: su círculo, su nombre y lo que tiene abierto.
 * Es un botón que filtra el tablero (aria-pressed); el nombre es su nombre
 * accesible y los conteos, su descripción.
 */
function FichaPersona({ persona, elegida, alPulsar }: { persona: PersonaCrm; elegida: boolean; alPulsar: () => void }) {
  const id = useId()
  const { pendientes, enProceso, vencidas } = persona.conteo
  const conteos: { clave: string; texto: string; tipo: 'pendiente' | 'en_proceso' | 'vencida' }[] = []
  if (pendientes > 0) conteos.push({ clave: 'p', texto: plural(pendientes, 'pendiente', 'pendientes'), tipo: 'pendiente' })
  if (enProceso > 0) conteos.push({ clave: 'e', texto: `${numero(enProceso)} en proceso`, tipo: 'en_proceso' })
  if (vencidas > 0) conteos.push({ clave: 'v', texto: plural(vencidas, 'vencida', 'vencidas'), tipo: 'vencida' })
  const resumen = conteos.length > 0 ? `${unirConY(conteos.map((c) => c.texto))}.` : 'Sin tareas abiertas.'
  const nombrado = persona.esLider ? `${id}-nombre ${id}-lider` : `${id}-nombre`

  return (
    <button
      type="button"
      className="crm-li-ficha"
      aria-pressed={elegida}
      aria-labelledby={nombrado}
      aria-describedby={`${id}-conteos`}
      onClick={alPulsar}
    >
      <Avatar nombre={persona.nombre} iniciales={persona.iniciales} foto={persona.foto} semilla={persona.id} />
      <span className="crm-li-ficha-texto">
        <span className="crm-li-ficha-nombre" id={`${id}-nombre`}>
          {persona.nombre}
        </span>
        {persona.esLider ? (
          <span className="crm-etiqueta" id={`${id}-lider`}>
            Líder
          </span>
        ) : null}
        <span className="crm-li-conteos" aria-hidden="true">
          {conteos.length === 0 ? (
            <span className="crm-li-conteo">Sin tareas abiertas</span>
          ) : (
            conteos.map((c) => (
              <span key={c.clave} className="crm-li-conteo" data-tipo={c.tipo}>
                {c.tipo === 'vencida' ? <Icono nombre="alerta" tamano={15} /> : <MarcaEstado estado={c.tipo} />}
                {c.texto}
              </span>
            ))
          )}
        </span>
        <span className="crm-sr" id={`${id}-conteos`}>
          {resumen}
        </span>
      </span>
    </button>
  )
}

/** Lo que dice cada columna vacía, según los filtros. */
function vaciosDe(filtrado: boolean, todas: boolean): Record<EstadoTarea, ReactNode> {
  const plazo = todas ? '' : ` en los últimos ${DIAS_RECIENTES} días`
  if (filtrado) {
    return {
      pendiente: <p>Ninguna tarea pendiente con este filtro.</p>,
      en_proceso: <p>Ninguna tarea en proceso con este filtro.</p>,
      terminada: <p>{`Ninguna tarea terminada${plazo} con este filtro.`}</p>,
    }
  }
  return {
    pendiente: <p>Nada pendiente.</p>,
    en_proceso: <p>Nadie tiene tareas en proceso.</p>,
    terminada: <p>{`Nada terminado${plazo}.`}</p>,
  }
}

/**
 * Panel del líder (/crm/lider): cómo va el equipo y el tablero de todas las
 * tareas, de solo lectura (las mueve cada responsable; aquí se abren).
 *
 * - Avisos del correo (resumen.correo): sin configurar o con correos que no
 *   salieron; los dos llevan a Correos.
 * - Franja del equipo: los totales y una ficha por persona. Cada ficha deja en
 *   el tablero solo las tareas de esa persona; otro clic lo quita.
 * - Filtros: búsqueda (se aplica ESPERA_BUSQUEDA_MS después de la última
 *   tecla, o al pulsar Enter) y terminadas recientes o todas. Al cambiarlos, el
 *   tablero anterior se queda (atenuado) hasta que llegan las tareas nuevas.
 * - Un 401 en cualquiera de las cargas llama vencida(): SitioLider vuelve al
 *   ingreso.
 */
export default function PanelLider() {
  useTituloCrm('Panel del equipo')
  const { api, vencida } = useLider()
  const navigate = useNavigate()
  const id = useId()
  const [responsable, setResponsable] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [todas, setTodas] = useState(false)

  // La búsqueda sale un momento después de la última tecla.
  useEffect(() => {
    const limpia = texto.trim()
    if (limpia === busqueda) return undefined
    const reloj = setTimeout(() => setBusqueda(limpia), ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(reloj)
  }, [texto, busqueda])

  const resumen = useCarga((signal) => api.resumen(signal), [api])
  const tareas = useCarga(
    (signal) =>
      api.tareas(
        { responsable: responsable ?? undefined, q: busqueda || undefined, terminadas: todas ? 'todas' : 'recientes' },
        signal,
      ),
    [api, responsable, busqueda, todas],
    { conservarAlCambiar: true },
  )

  const vencio = esNoAutenticado(resumen.error) || esNoAutenticado(tareas.error)
  useEffect(() => {
    if (vencio) vencida()
  }, [vencio, vencida])

  function buscarYa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setBusqueda(texto.trim())
  }

  function alternar(personaId: number) {
    setResponsable((actual) => (actual === personaId ? null : personaId))
  }

  const personas = resumen.datos?.personas ?? []
  const nombreElegida =
    responsable === null
      ? null
      : (personas.find((p) => p.id === responsable)?.nombre ??
        tareas.datos?.find((t) => t.responsable.id === responsable)?.responsable.nombre ??
        null)

  let franja: ReactNode
  if (vencio || (!resumen.datos && resumen.estado === 'cargando')) {
    franja = <Cargando texto="Cargando el equipo…" />
  } else if (!resumen.datos) {
    franja = <ErrorCarga error={resumen.error} titulo="No se pudo cargar el equipo." alReintentar={resumen.recargar} />
  } else if (personas.length === 0) {
    franja = (
      <p className="crm-suave">
        Todavía no hay personas en el equipo. <Link to="/crm/lider/equipo">Agréguelas en Equipo</Link>.
      </p>
    )
  } else {
    franja = (
      <ul className="crm-li-fichas">
        {personas.map((persona) => (
          <li key={persona.id}>
            <FichaPersona persona={persona} elegida={responsable === persona.id} alPulsar={() => alternar(persona.id)} />
          </li>
        ))}
      </ul>
    )
  }

  let tablero: ReactNode
  if (vencio || (!tareas.datos && tareas.estado === 'cargando')) {
    tablero = <Cargando texto="Cargando las tareas…" />
  } else if (tareas.estado === 'error' || !tareas.datos) {
    tablero = <ErrorCarga error={tareas.error} titulo="No se pudieron cargar las tareas." alReintentar={tareas.recargar} />
  } else {
    const actualizando = tareas.estado === 'cargando'
    tablero = (
      <div className="crm-li-tablero" aria-busy={actualizando || undefined}>
        <Tablero
          tareas={tareas.datos}
          mostrarResponsable
          nivelTitulo={3}
          alAbrir={(tareaId) => navigate(`/crm/lider/tareas/${tareaId}`)}
          vacio={vaciosDe(responsable !== null || busqueda !== '', todas)}
        />
      </div>
    )
  }

  return (
    <div className="crm-contenedor crm-pagina crm-li-panel">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <h1 className="crm-titulo-pagina">Panel del equipo</h1>
          <p className="crm-bajada">Cómo va cada persona y en qué está cada tarea. Elija a una persona para ver solo sus tareas.</p>
        </div>
        <div className="crm-encabezado-acciones">
          <Link to="/crm/lider/tareas/nueva" className="crm-boton crm-boton-primario">
            <Icono nombre="mas" />
            Nueva tarea
          </Link>
        </div>
      </header>

      {resumen.datos ? <AvisosCorreo correo={resumen.datos.correo} /> : null}

      <section className="crm-li-seccion" aria-labelledby={`${id}-equipo`}>
        <div className="crm-li-seccion-cabeza">
          <h2 className="crm-li-subtitulo" id={`${id}-equipo`}>
            Equipo
          </h2>
          {resumen.datos ? <Totales totales={resumen.datos.totales} /> : null}
        </div>
        {franja}
      </section>

      <section className="crm-li-seccion" aria-labelledby={`${id}-tareas`}>
        <div className="crm-li-seccion-cabeza">
          <h2 className="crm-li-subtitulo" id={`${id}-tareas`}>
            {nombreElegida ? `Tareas de ${nombreElegida}` : 'Tareas del equipo'}
          </h2>
          {responsable !== null ? (
            <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm" onClick={() => setResponsable(null)}>
              <Icono nombre="equipo" tamano={16} />
              Ver todo el equipo
            </button>
          ) : null}
        </div>

        <div className="crm-li-filtros">
          <form role="search" className="crm-li-buscar" onSubmit={buscarYa}>
            <label className="crm-campo-etiqueta" htmlFor={`${id}-buscar`}>
              Buscar
            </label>
            <div className="crm-li-buscar-caja">
              <Icono nombre="buscar" />
              <input
                id={`${id}-buscar`}
                className="crm-control"
                type="search"
                placeholder="Título de la tarea"
                autoComplete="off"
                enterKeyHint="search"
                maxLength={LIMITES_CRM.busqueda}
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
              />
            </div>
          </form>

          <div className="crm-li-segmento" role="group" aria-labelledby={`${id}-terminadas`}>
            <span className="crm-campo-etiqueta" id={`${id}-terminadas`}>
              Terminadas
            </span>
            <div className="crm-li-opciones">
              <button type="button" className="crm-li-opcion" aria-pressed={!todas} onClick={() => setTodas(false)}>
                Recientes<span className="crm-sr">{` (últimos ${DIAS_RECIENTES} días)`}</span>
              </button>
              <button type="button" className="crm-li-opcion" aria-pressed={todas} onClick={() => setTodas(true)}>
                Todas
              </button>
            </div>
          </div>

          {tareas.datos && tareas.estado === 'cargando' && !vencio ? (
            <span className="crm-li-actualizando" role="status">
              <span className="crm-giro" aria-hidden="true" />
              Actualizando…
            </span>
          ) : null}
        </div>

        {tablero}
      </section>
    </div>
  )
}
