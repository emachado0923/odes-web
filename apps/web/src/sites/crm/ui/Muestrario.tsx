/**
 * Muestrario del CRM (/crm/muestrario, SOLO en desarrollo: CrmSitio no lo
 * monta en producción). Todas las piezas de ui/ con datos ficticios
 * (muestras.ts), para revisar el diseño en el navegador: el inicio, el
 * tablero de una persona (con el diálogo de terminar), el del líder (con el
 * panel lateral) y cada pieza suelta.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACEPTAR_ARCHIVOS_CRM, ESTADOS_TAREA, ETIQUETAS_ESTADO, LIMITES_CRM, type ArchivoCrm, type EstadoTarea, type TareaCrm } from '../api-crm'
import { ErrorCrmHttp } from '../datos/clienteCrm'
import { formatosLegibles, validarArchivo } from './archivos'
import { useAvisar } from './avisos'
import Avatar from './Avatar'
import { ariaCampo } from './campos'
import Campo from './Campo'
import ChipEstado from './ChipEstado'
import Dialogo from './Dialogo'
import { Cargando, ErrorCarga, Vacio } from './Estados'
import { fechaHora, hoyBogota, saludo } from './formato'
import Icono from './Icono'
import ListaArchivos from './ListaArchivos'
import MarcaEstado from './MarcaEstado'
import Migas from './Migas'
import { ARCHIVOS_MUESTRA, PERSONAS_MUESTRA, sumarDias, tareaMuestra, tareasMuestra } from './muestras'
import PanelLateral from './PanelLateral'
import ProgresoSubida from './ProgresoSubida'
import Tablero from './Tablero'
import TarjetaPersona from './TarjetaPersona'
import TarjetaTarea from './TarjetaTarea'
import { useTituloCrm } from './titulo'
import { NOMBRES_ICONO } from './trazos-iconos'
import ZonaArchivos from './ZonaArchivos'
import './muestrario.css'

const ESPERA_MS = 700
const AYUDA_DESCRIPCION = 'Qué hay que hacer y qué se espera al terminar.'
const AYUDA_NOTA = 'Opcional. Lo que deba saber de cómo quedó.'
const ERROR_TITULO = 'Escriba el título de la tarea.'

function conEstado(tarea: TareaCrm, estado: EstadoTarea, hoy: string): TareaCrm {
  return {
    ...tarea,
    estado,
    vencida: estado === 'terminada' ? false : tarea.fechaLimite !== null && tarea.fechaLimite < hoy,
    terminadaEn: estado === 'terminada' ? new Date().toISOString() : null,
  }
}

/** Tablero con estado propio y una espera de mentiras, como si guardara en el servidor. */
function useTableroDePrueba(inicial: TareaCrm[], hoy: string) {
  const [tareas, setTareas] = useState(inicial)
  const [ocupadas, setOcupadas] = useState<ReadonlySet<number>>(new Set())
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const lista = relojes.current
    return () => lista.forEach(clearTimeout)
  }, [])

  function mover(tarea: TareaCrm, destino: EstadoTarea, alTerminar?: () => void) {
    setOcupadas((previas) => new Set(previas).add(tarea.id))
    relojes.current.push(
      setTimeout(() => {
        setTareas((lista) => lista.map((t) => (t.id === tarea.id ? conEstado(t, destino, hoy) : t)))
        setOcupadas((previas) => {
          const nuevas = new Set(previas)
          nuevas.delete(tarea.id)
          return nuevas
        })
        alTerminar?.()
      }, ESPERA_MS),
    )
  }
  return { tareas, ocupadas, mover }
}

function Seccion({ titulo, texto, children }: { titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section className="crm-seccion crm-muestra-seccion">
      <h2 className="crm-titulo-seccion">{titulo}</h2>
      {texto ? <p className="crm-muestra-nota">{texto}</p> : null}
      {children}
    </section>
  )
}

export default function Muestrario() {
  useTituloCrm('Muestrario')
  const avisar = useAvisar()
  const [hoy] = useState(hoyBogota)
  const [ahora] = useState(() => new Date())

  // Tablero de una persona: pendiente ⇄ en proceso; terminar pide confirmar (y el entregable).
  const persona = useTableroDePrueba(tareasMuestra(hoy), hoy)
  const [porTerminar, setPorTerminar] = useState<TareaCrm | null>(null)
  const [terminando, setTerminando] = useState(false)
  const [nota, setNota] = useState('')
  const [entregables, setEntregables] = useState<ArchivoCrm[]>([])
  const [errorEntregable, setErrorEntregable] = useState<string | null>(null)

  // Tablero del líder: cualquier movimiento; al abrir una tarea, el panel lateral.
  const lider = useTableroDePrueba(tareasMuestra(hoy), hoy)
  const [abierta, setAbierta] = useState<number | null>(null)
  const tareaAbierta = lider.tareas.find((t) => t.id === abierta) ?? null

  // Piezas sueltas.
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [archivos, setArchivos] = useState<ArchivoCrm[]>(ARCHIVOS_MUESTRA)
  const [quitando, setQuitando] = useState<ReadonlySet<number>>(new Set())
  const [subida, setSubida] = useState<{ nombre: string; progreso: number } | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => void (temporizador.current && clearInterval(temporizador.current)), [])

  function subirDePrueba(archivo: File, alListo: (nuevo: ArchivoCrm) => void) {
    if (temporizador.current) clearInterval(temporizador.current)
    let progreso = 0
    setSubida({ nombre: archivo.name, progreso })
    temporizador.current = setInterval(() => {
      progreso = Math.min(1, progreso + 0.17)
      setSubida({ nombre: archivo.name, progreso })
      if (progreso < 1) return
      if (temporizador.current) clearInterval(temporizador.current)
      temporizador.current = null
      setTimeout(() => {
        setSubida(null)
        alListo({
          id: Date.now(),
          tipo: 'entregable',
          nombre: archivo.name,
          mime: archivo.type,
          bytes: archivo.size,
          subidoEn: new Date().toISOString(),
          url: '#',
        })
      }, 500)
    }, 260)
  }

  function cancelarSubida() {
    if (temporizador.current) clearInterval(temporizador.current)
    temporizador.current = null
    setSubida(null)
    avisar('Se canceló la subida.', 'info')
  }

  function elegir(lista: File[], alListo: (nuevo: ArchivoCrm) => void, alError: (texto: string | null) => void) {
    const [archivo] = lista
    if (!archivo) return
    const problema = validarArchivo(archivo)
    alError(problema)
    if (!problema) subirDePrueba(archivo, alListo)
  }

  function abrirTerminar(tarea: TareaCrm) {
    setPorTerminar(tarea)
    setNota('')
    setEntregables([])
    setErrorEntregable(null)
  }

  function confirmarTerminar() {
    if (!porTerminar) return
    if (porTerminar.requiereEntregable && porTerminar.entregables + entregables.length === 0) {
      setErrorEntregable('Esta tarea pide un entregable: súbalo antes de terminarla.')
      return
    }
    const tarea = porTerminar
    setTerminando(true)
    persona.mover(tarea, 'terminada', () => {
      setTerminando(false)
      setPorTerminar(null)
      avisar(`Terminó «${tarea.titulo}». Se le avisó a Martha por correo.`)
    })
  }

  const ejemploPersona = PERSONAS_MUESTRA[1]
  const tareasSueltas: { titulo: string; tarea: TareaCrm; props?: { seleccionada?: boolean; ocupada?: boolean; mostrarResponsable?: boolean } }[] = [
    {
      titulo: 'Vencida, con adjuntos',
      tarea: tareaMuestra({ id: 201, titulo: 'Entregar la proyección de cupos 2027', fechaLimite: sumarDias(hoy, -2), vencida: true, adjuntos: 3 }),
    },
    {
      titulo: 'Pide entregable, vence mañana',
      tarea: tareaMuestra({ id: 202, titulo: 'Diligenciar el formato de seguimiento', fechaLimite: sumarDias(hoy, 1), requiereEntregable: true }),
      props: { mostrarResponsable: true },
    },
    {
      titulo: 'Abierta en el panel',
      tarea: tareaMuestra({ id: 203, titulo: 'Revisar la base de datos de graduados', estado: 'en_proceso', fechaLimite: sumarDias(hoy, 12) }),
      props: { seleccionada: true },
    },
    {
      titulo: 'Guardando un cambio',
      tarea: tareaMuestra({ id: 204, titulo: 'Programar la reunión de cierre de año', estado: 'en_proceso' }),
      props: { ocupada: true },
    },
  ]

  return (
    <div className="crm-contenedor crm-pagina crm-muestrario">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <Migas items={[{ texto: 'Inicio', href: '/crm' }, { texto: 'Muestrario' }]} />
          <h1 className="crm-titulo-pagina">Muestrario del CRM</h1>
          <p className="crm-bajada">Las piezas de la interfaz con datos de prueba. Esta página solo existe en desarrollo.</p>
        </div>
      </header>

      <Seccion titulo="Inicio" texto="Así se ve la pantalla de inicio: un clic en la tarjeta lleva al tablero. El líder pide contraseña.">
        <div className="crm-muestra-marco">
          <p className="crm-titulo-pagina">{saludo(ahora)}</p>
          <p className="crm-bajada">Elija su nombre para ver sus tareas.</p>
          <ul className="crm-rejilla-personas crm-muestra-rejilla">
            {PERSONAS_MUESTRA.map((p) => (
              <li key={p.id}>
                {p.esLider ? (
                  <TarjetaPersona persona={p} href="/crm/lider" etiqueta="Líder" pideClave mostrarConteos={false} />
                ) : (
                  <TarjetaPersona persona={p} href={`/crm/equipo/${p.id}`} />
                )}
              </li>
            ))}
          </ul>
        </div>
      </Seccion>

      <Seccion
        titulo="Tablero de una persona"
        texto="Se arrastra la tarjeta o se usan los botones «Mover a». Pasar a Terminada abre la confirmación, con el entregable si la tarea lo pide."
      >
        <Tablero
          tareas={persona.tareas}
          hoy={hoy}
          alAbrir={(id) => avisar(`Aquí se abriría la tarea ${id}.`, 'info')}
          alMover={(tarea, destino) => (destino === 'terminada' ? abrirTerminar(tarea) : persona.mover(tarea, destino, () => avisar(`«${tarea.titulo}» pasó a ${ETIQUETAS_ESTADO[destino]}.`)))}
          puedeMover={(tarea) => tarea.estado !== 'terminada'}
          ocupadas={persona.ocupadas}
          pieColumna={{
            terminada: (
              <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm">
                Ver todas las terminadas
              </button>
            ),
          }}
        />
      </Seccion>

      <Seccion titulo="Tablero del equipo (líder)" texto="Con el responsable en cada tarjeta. Al abrir una tarea se ve el panel lateral.">
        <Tablero
          tareas={lider.tareas}
          hoy={hoy}
          mostrarResponsable
          seleccionada={abierta}
          alAbrir={setAbierta}
          alMover={(tarea, destino) => lider.mover(tarea, destino, () => avisar(`«${tarea.titulo}» pasó a ${ETIQUETAS_ESTADO[destino]}.`))}
          ocupadas={lider.ocupadas}
          vacio={{ en_proceso: <p>Nadie tiene tareas en proceso.</p> }}
        />
      </Seccion>

      <Seccion titulo="Personas">
        <div className="crm-muestra-fila">
          {(['xl', 'lg', 'md', 'sm'] as const).map((tamano) => (
            <Avatar key={tamano} nombre={ejemploPersona.nombre} iniciales={ejemploPersona.iniciales} foto={null} tamano={tamano} semilla={ejemploPersona.id} />
          ))}
          <Avatar nombre={PERSONAS_MUESTRA[5].nombre} iniciales={PERSONAS_MUESTRA[5].iniciales} foto={PERSONAS_MUESTRA[5].foto} tamano="lg" semilla={6} decorativo={false} />
          <Avatar nombre={PERSONAS_MUESTRA[6].nombre} iniciales={PERSONAS_MUESTRA[6].iniciales} foto={PERSONAS_MUESTRA[6].foto} tamano="lg" semilla={7} decorativo={false} />
        </div>
        <p className="crm-muestra-nota">Los ocho colores, uno por persona (por su id):</p>
        <div className="crm-muestra-fila">
          {PERSONAS_MUESTRA.map((p) => (
            <Avatar key={p.id} nombre={p.nombre} iniciales={p.iniciales} foto={null} tamano="lg" semilla={p.id} decorativo={false} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Estados y tarjetas de tarea">
        <div className="crm-muestra-fila">
          {ESTADOS_TAREA.map((estado) => (
            <ChipEstado key={estado} estado={estado} />
          ))}
          {ESTADOS_TAREA.map((estado) => (
            <ChipEstado key={`sm-${estado}`} estado={estado} tamano="sm" />
          ))}
          <span className="crm-muestra-marca">
            {ESTADOS_TAREA.map((estado) => (
              <MarcaEstado key={estado} estado={estado} tamano={22} />
            ))}
          </span>
        </div>
        <ul className="crm-muestra-tarjetas">
          {tareasSueltas.map(({ titulo, tarea, props }) => (
            <li key={tarea.id}>
              <p className="crm-muestra-rotulo">{titulo}</p>
              <TarjetaTarea tarea={tarea} hoy={hoy} alAbrir={(id) => avisar(`Aquí se abriría la tarea ${id}.`, 'info')} {...props} />
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Botones">
        <div className="crm-muestra-fila">
          <button type="button" className="crm-boton crm-boton-primario">
            <Icono nombre="mas" />
            Crear tarea
          </button>
          <button type="button" className="crm-boton crm-boton-secundario">
            <Icono nombre="enviar" />
            Avisar por correo
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma">
            <Icono nombre="atras" />
            Volver al tablero
          </button>
          <button type="button" className="crm-boton crm-boton-peligro">
            Eliminar tarea
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-peligro">
            <Icono nombre="borrar" />
            Eliminar
          </button>
          <button type="button" className="crm-boton crm-boton-primario" disabled>
            Guardando…
          </button>
        </div>
        <div className="crm-muestra-fila">
          <button type="button" className="crm-boton crm-boton-primario crm-boton-sm">
            <Icono nombre="subir" tamano={16} />
            Subir entregable
          </button>
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm">
            <Icono nombre="devolver" tamano={16} />
            Devolver
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm">
            <Icono nombre="reintentar" tamano={16} />
            Reintentar
          </button>
          <button type="button" className="crm-boton-icono" aria-label="Editar">
            <Icono nombre="editar" />
          </button>
          <button type="button" className="crm-boton-icono crm-boton-icono-peligro" aria-label="Quitar">
            <Icono nombre="borrar" />
          </button>
          <span className="crm-etiqueta">Líder</span>
          <span className="crm-etiqueta">Inactiva</span>
        </div>
      </Seccion>

      <Seccion titulo="Formulario">
        <form className="crm-formulario crm-muestra-formulario" onSubmit={(evento) => evento.preventDefault()}>
          <Campo etiqueta="Título" id="m-titulo" obligatorio error={ERROR_TITULO}>
            <input className="crm-control" maxLength={LIMITES_CRM.titulo} {...ariaCampo('m-titulo', { error: ERROR_TITULO })} />
          </Campo>
          <Campo etiqueta="Descripción" id="m-descripcion" ayuda={AYUDA_DESCRIPCION}>
            <textarea className="crm-control" {...ariaCampo('m-descripcion', { ayuda: AYUDA_DESCRIPCION })} />
          </Campo>
          <div className="crm-muestra-dos">
            <Campo etiqueta="Responsable" id="m-responsable" obligatorio>
              <select className="crm-control" id="m-responsable" defaultValue="2">
                {PERSONAS_MUESTRA.filter((p) => !p.esLider).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha límite" id="m-fecha">
              <input className="crm-control" id="m-fecha" type="date" defaultValue={sumarDias(hoy, 7)} />
            </Campo>
          </div>
          <label className="crm-casilla">
            <input type="checkbox" defaultChecked />
            Pide entregable al terminar
          </label>
          <div className="crm-acciones">
            <button type="submit" className="crm-boton crm-boton-primario">
              Crear tarea
            </button>
            <button type="button" className="crm-boton crm-boton-fantasma">
              Cancelar
            </button>
          </div>
        </form>
      </Seccion>

      <Seccion titulo="Archivos" texto="Elegir un archivo simula la subida. Uno de otro tipo o de más de 25 MB muestra el error.">
        <div className="crm-pila crm-muestra-archivos">
          <ZonaArchivos
            aceptar={ACEPTAR_ARCHIVOS_CRM}
            alElegir={(lista) => elegir(lista, (nuevo) => setArchivos((previos) => [...previos, nuevo]), setErrorArchivo)}
            deshabilitada={subida !== null}
            ayuda={`${formatosLegibles()}. Hasta 25 MB.`}
          />
          {errorArchivo ? (
            <p className="crm-campo-error" role="alert">
              <Icono nombre="alerta" tamano={16} />
              {errorArchivo}
            </p>
          ) : null}
          {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={cancelarSubida} /> : null}
          <ProgresoSubida nombre="Informe de gestión, noviembre.pdf" progreso={0.42} />
          <ListaArchivos
            archivos={archivos}
            ocupados={quitando}
            alQuitar={(archivo) => {
              setQuitando((previos) => new Set(previos).add(archivo.id))
              setTimeout(() => {
                setArchivos((lista) => lista.filter((a) => a.id !== archivo.id))
                setQuitando((previos) => {
                  const nuevos = new Set(previos)
                  nuevos.delete(archivo.id)
                  return nuevos
                })
                avisar(`Se quitó «${archivo.nombre}».`)
              }, ESPERA_MS)
            }}
          />
          <ListaArchivos archivos={[]} vacio="Todavía no hay entregables." />
        </div>
      </Seccion>

      <Seccion titulo="Diálogo, avisos y estados de carga">
        <div className="crm-muestra-fila">
          <button type="button" className="crm-boton crm-boton-secundario" onClick={() => setDialogoAbierto(true)}>
            Abrir un diálogo
          </button>
          <button type="button" className="crm-boton crm-boton-secundario" onClick={() => setAbierta(104)}>
            Abrir el panel lateral
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma" onClick={() => avisar('Tarea creada y asignada a Ana María.')}>
            Aviso de éxito
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma" onClick={() => avisar('El correo quedó pendiente: se enviará al reintentar.', 'info')}>
            Aviso informativo
          </button>
          <button type="button" className="crm-boton crm-boton-fantasma" onClick={() => avisar('No se pudo mover la tarea. Revise su conexión.', 'error')}>
            Aviso de error
          </button>
        </div>
        <div className="crm-muestra-estados">
          <Cargando texto="Cargando el tablero…" />
          <ErrorCarga error={new ErrorCrmHttp('red', 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.')} alReintentar={() => avisar('Reintentando…', 'info')} />
          <Vacio
            titulo="No hay tareas todavía"
            texto="Cuando el líder le asigne una tarea, aparecerá aquí."
            accion={
              <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm">
                Recargar
              </button>
            }
          />
        </div>
      </Seccion>

      <Seccion titulo="Íconos">
        <ul className="crm-muestra-iconos">
          {NOMBRES_ICONO.map((nombre) => (
            <li key={nombre}>
              <Icono nombre={nombre} tamano={22} />
              <span>{nombre}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Dialogo
        abierto={dialogoAbierto}
        titulo="¿Eliminar la tarea?"
        descripcion="«Actualizar la matriz de riesgos de la oficina» dejará de verse en los tableros."
        tamano="sm"
        alCerrar={() => setDialogoAbierto(false)}
        pie={
          <>
            <button type="button" className="crm-boton crm-boton-secundario" onClick={() => setDialogoAbierto(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="crm-boton crm-boton-peligro"
              onClick={() => {
                setDialogoAbierto(false)
                avisar('Se eliminó la tarea.')
              }}
            >
              Eliminar tarea
            </button>
          </>
        }
      >
        <p>Quien la tenía asignada no recibe aviso. Si fue un error, pídale al equipo técnico que la recupere.</p>
      </Dialogo>

      <Dialogo
        abierto={porTerminar !== null}
        titulo="Terminar la tarea"
        descripcion={porTerminar?.titulo}
        bloqueado={terminando || subida !== null}
        alCerrar={() => setPorTerminar(null)}
        pie={
          <>
            <button type="button" className="crm-boton crm-boton-secundario" disabled={terminando} onClick={() => setPorTerminar(null)}>
              Cancelar
            </button>
            <button type="button" className="crm-boton crm-boton-primario" disabled={terminando || subida !== null} onClick={confirmarTerminar}>
              <Icono nombre="check" />
              {terminando ? 'Terminando…' : 'Terminar tarea'}
            </button>
          </>
        }
      >
        <div className="crm-formulario">
          {porTerminar?.requiereEntregable ? (
            <div className="crm-pila">
              <p>
                <strong>Esta tarea pide un entregable.</strong> Al terminar, le llega a Martha por correo.
              </p>
              <ZonaArchivos
                aceptar={ACEPTAR_ARCHIVOS_CRM}
                deshabilitada={subida !== null || terminando}
                alElegir={(lista) => elegir(lista, (nuevo) => setEntregables((previos) => [...previos, nuevo]), setErrorEntregable)}
                ayuda={`${formatosLegibles()}. Hasta 25 MB.`}
              />
              {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={cancelarSubida} /> : null}
              <ListaArchivos archivos={entregables} alQuitar={(a) => setEntregables((previos) => previos.filter((x) => x.id !== a.id))} />
              {errorEntregable ? (
                <p className="crm-campo-error" role="alert">
                  <Icono nombre="alerta" tamano={16} />
                  {errorEntregable}
                </p>
              ) : null}
            </div>
          ) : null}
          <Campo etiqueta="Nota para el líder" id="m-nota" ayuda={AYUDA_NOTA}>
            <textarea
              className="crm-control"
              value={nota}
              maxLength={LIMITES_CRM.nota}
              onChange={(evento) => setNota(evento.target.value)}
              {...ariaCampo('m-nota', { ayuda: AYUDA_NOTA })}
            />
          </Campo>
        </div>
      </Dialogo>

      <PanelLateral
        abierto={tareaAbierta !== null}
        titulo={tareaAbierta?.titulo ?? ''}
        alCerrar={() => setAbierta(null)}
        pie={
          <>
            <button type="button" className="crm-boton crm-boton-secundario" onClick={() => avisar('Aquí se devolvería la tarea.', 'info')}>
              <Icono nombre="devolver" />
              Devolver
            </button>
            <button type="button" className="crm-boton crm-boton-primario" onClick={() => avisar('Se le avisó por correo.')}>
              <Icono nombre="enviar" />
              Avisar por correo
            </button>
          </>
        }
      >
        {tareaAbierta ? (
          <div className="crm-pila crm-muestra-detalle">
            <div className="crm-fila">
              <ChipEstado estado={tareaAbierta.estado} />
              <span className="crm-fila crm-suave">
                <Avatar
                  nombre={tareaAbierta.responsable.nombre}
                  iniciales={tareaAbierta.responsable.iniciales}
                  foto={tareaAbierta.responsable.foto}
                  semilla={tareaAbierta.responsable.id}
                  tamano="sm"
                />
                {tareaAbierta.responsable.nombre}
              </span>
            </div>
            <p>
              Reunir los datos de avance de cada meta, contrastarlos con la línea base y dejar listo el documento para la sesión del
              comité. Incluir las alertas de las metas que van por debajo del 70 %.
            </p>
            <h3 className="crm-muestra-subtitulo">Archivos</h3>
            <ListaArchivos archivos={ARCHIVOS_MUESTRA.slice(0, 2)} />
            <h3 className="crm-muestra-subtitulo">Historial</h3>
            <ol className="crm-muestra-historial">
              <li>
                <ChipEstado estado="en_proceso" tamano="sm" /> {tareaAbierta.responsable.nombre} la pasó a En proceso.
                <span className="crm-suave"> {fechaHora('2026-11-21T14:05:00.000Z', hoy)}</span>
              </li>
              <li>
                Martha la creó y se la asignó.<span className="crm-suave"> {fechaHora('2026-11-18T15:10:00.000Z', hoy)}</span>
              </li>
            </ol>
          </div>
        ) : null}
      </PanelLateral>
    </div>
  )
}
