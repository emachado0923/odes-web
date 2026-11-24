/**
 * Detalle de una tarea en el panel lateral del tablero de una persona: estado,
 * fecha límite (vencida en rojo y con texto), si pide entregable, la
 * descripción con sus saltos de línea, los archivos del líder (para
 * descargar), los entregables, la nota de cierre y el historial.
 *
 * El pie cambia con el estado: pendiente → «Terminar» y «Empezar»; en proceso
 * → «Volver a pendiente» y «Terminar»; terminada → solo cuándo se terminó.
 * Mover lo hace el tablero (alMover, igual que con las tarjetas) y «Terminar»
 * abre su DialogoTerminar (alTerminar).
 *
 * Pide la tarea con apiEquipo.tarea y la vuelve a pedir cuando sube `version`
 * (el tablero la sube después de mover o terminar), sin borrar lo que se ve.
 * El estado que se muestra es el de `resumen` (la tarjeta del tablero, que se
 * mueve al instante) mientras la tarea esté en el tablero.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { TareaCrm } from '../api-crm'
import { apiEquipo } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { Cargando, ChipEstado, ErrorCarga, fechaHora, fechaLarga, Icono, ListaArchivos, MarcaEstado, PanelLateral, textoFechaTarea, Vacio } from '../ui'
import { esNoEncontrado, nombreLider, resumenDe, textoEvento } from './comun'

export default function DetalleTarea({
  personaId,
  tareaId,
  resumen,
  persona,
  lider,
  version,
  ocupada,
  alCerrar,
  alMover,
  alTerminar,
}: {
  personaId: number
  tareaId: number
  /** La tarjeta de esta tarea en el tablero, si está (las terminadas viejas no están). */
  resumen: TareaCrm | null
  /** Nombre de la persona del tablero: lo que hizo ella va sin nombre en el historial. */
  persona: string | null
  /** Nombre completo del líder, o null si no se pudo saber («el líder»). */
  lider: string | null
  /** Sube cuando hay que volver a pedir la tarea. */
  version: number
  /** La tarea se está moviendo: el pie espera. */
  ocupada: boolean
  alCerrar: () => void
  alMover: (tarea: TareaCrm, destino: 'pendiente' | 'en_proceso') => void
  alTerminar: (tarea: TareaCrm) => void
}) {
  const { estado, datos, error, recargar } = useCarga(
    (signal) => apiEquipo.tarea(personaId, tareaId, signal),
    [personaId, tareaId, version],
    { conservarAlCambiar: true },
  )
  const tarea: TareaCrm | null = resumen ?? (datos ? resumenDe(datos) : null)
  const estadoTarea = tarea?.estado ?? null
  const finRef = useRef<HTMLParagraphElement>(null)

  // Al terminarla con el panel abierto, el botón que tenía el foco desaparece: el foco pasa al aviso de terminada.
  const estadoAnterior = useRef(estadoTarea)
  useEffect(() => {
    const anterior = estadoAnterior.current
    estadoAnterior.current = estadoTarea
    if (estadoTarea !== 'terminada' || anterior === null || anterior === 'terminada') return
    const activo = document.activeElement
    if (!activo || activo === document.body) finRef.current?.focus()
  }, [estadoTarea])

  let contenido: ReactNode
  if (datos && estadoTarea) {
    const terminada = estadoTarea === 'terminada'
    const adjuntos = datos.archivos.filter((archivo) => archivo.tipo === 'adjunto')
    const entregables = datos.archivos.filter((archivo) => archivo.tipo === 'entregable')
    const fecha = terminada ? null : textoFechaTarea({ ...datos, estado: estadoTarea })
    const elLider = nombreLider(lider)
    contenido = (
      <div className="crm-eq-detalle">
        {estado === 'error' ? <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo actualizar la tarea." /> : null}

        <div className="crm-eq-detalle-marcas">
          <ChipEstado estado={estadoTarea} />
          {datos.requiereEntregable && !terminada ? (
            <span className="crm-eq-pide">
              <Icono nombre="subir" tamano={15} />
              Pide entregable
            </span>
          ) : null}
        </div>

        <dl className="crm-eq-datos">
          <div className="crm-eq-dato">
            <dt>Fecha límite</dt>
            <dd>
              {datos.fechaLimite ? (
                <>
                  {fecha && fecha.tono !== 'normal' ? (
                    <span className="crm-eq-fecha" data-tono={fecha.tono}>
                      <Icono nombre={fecha.tono === 'vencida' ? 'alerta' : 'reloj'} tamano={16} />
                      <span>
                        {fecha.etiqueta ? <strong>{fecha.etiqueta}</strong> : null}
                        {fecha.etiqueta ? ', ' : null}
                        {fecha.texto}
                      </span>
                    </span>
                  ) : null}
                  <span className="crm-eq-fecha-larga">{fechaLarga(datos.fechaLimite)}</span>
                </>
              ) : (
                <span className="crm-suave">Sin fecha límite</span>
              )}
            </dd>
          </div>
          <div className="crm-eq-dato">
            <dt>Asignada</dt>
            <dd>{fechaHora(datos.creadaEn)}</dd>
          </div>
        </dl>

        <section className="crm-eq-seccion">
          <h3 className="crm-eq-subtitulo">Descripción</h3>
          {datos.descripcion.trim() ? (
            <p className="crm-eq-texto-libre">{datos.descripcion}</p>
          ) : (
            <p className="crm-suave">Sin descripción.</p>
          )}
        </section>

        <section className="crm-eq-seccion">
          <h3 className="crm-eq-subtitulo">Archivos adjuntos</h3>
          <ListaArchivos archivos={adjuntos} vacio={`${elLider.sujeto} no adjuntó archivos.`} />
        </section>

        <section className="crm-eq-seccion">
          <h3 className="crm-eq-subtitulo">Sus entregables</h3>
          {datos.requiereEntregable && !terminada ? (
            <p className="crm-eq-nota-seccion">{elLider.sujeto} pidió un documento al terminar. Se sube al pulsar «Terminar».</p>
          ) : null}
          <ListaArchivos archivos={entregables} vacio={terminada ? 'No subió entregables.' : 'Todavía no ha subido entregables.'} />
        </section>

        {terminada && datos.notaCierre?.trim() ? (
          <section className="crm-eq-seccion">
            <h3 className="crm-eq-subtitulo">Nota de cierre</h3>
            <p className="crm-eq-texto-libre crm-eq-cita">{datos.notaCierre}</p>
          </section>
        ) : null}

        <section className="crm-eq-seccion">
          <h3 className="crm-eq-subtitulo">Historial</h3>
          {datos.eventos.length > 0 ? (
            <ol className="crm-eq-historial">
              {datos.eventos.map((evento) => (
                <li key={evento.id} className="crm-eq-evento" data-tipo={evento.tipo}>
                  <span className="crm-eq-evento-texto">{textoEvento(evento, { lider, persona })}</span>
                  <time className="crm-eq-evento-hora" dateTime={evento.creadoEn}>
                    {fechaHora(evento.creadoEn)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="crm-suave">Sin movimientos todavía.</p>
          )}
        </section>
      </div>
    )
  } else if (estado === 'error') {
    contenido = esNoEncontrado(error) ? (
      <Vacio titulo="Esta tarea no está en su tablero." texto="Puede que se la hayan asignado a otra persona o que la hayan eliminado." />
    ) : (
      <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo cargar la tarea." />
    )
  } else {
    contenido = <Cargando texto="Cargando la tarea…" />
  }

  let pie: ReactNode = null
  if (tarea && estadoTarea === 'terminada') {
    const cuando = tarea.terminadaEn ?? datos?.terminadaEn ?? null
    pie = (
      <p className="crm-eq-pie-fin" ref={finRef} tabIndex={-1}>
        <MarcaEstado estado="terminada" />
        {cuando ? `Terminada el ${fechaHora(cuando)}` : 'Terminada'}
      </p>
    )
  } else if (tarea) {
    const pendiente = estadoTarea === 'pendiente'
    // Dos botones fijos en su lugar (el de la derecha es el principal): al mover, el foco se queda en el mismo botón.
    pie = (
      <>
        {ocupada ? (
          <span className="crm-eq-guardando" role="status">
            <span className="crm-giro" aria-hidden="true" />
            Guardando…
          </span>
        ) : null}
        <button
          key="secundaria"
          type="button"
          className="crm-boton crm-boton-secundario"
          aria-disabled={ocupada || undefined}
          onClick={() => {
            if (ocupada) return
            if (pendiente) alTerminar(tarea)
            else alMover(tarea, 'pendiente')
          }}
        >
          {pendiente ? <Icono nombre="check" /> : <MarcaEstado estado="pendiente" />}
          {pendiente ? 'Terminar' : 'Volver a pendiente'}
        </button>
        <button
          key="principal"
          type="button"
          className="crm-boton crm-boton-primario"
          aria-disabled={ocupada || undefined}
          onClick={() => {
            if (ocupada) return
            if (pendiente) alMover(tarea, 'en_proceso')
            else alTerminar(tarea)
          }}
        >
          {pendiente ? <MarcaEstado estado="en_proceso" /> : <Icono nombre="check" />}
          {pendiente ? 'Empezar' : 'Terminar'}
        </button>
      </>
    )
  }

  return (
    <PanelLateral abierto titulo={tarea?.titulo ?? 'Detalle de la tarea'} alCerrar={alCerrar} pie={pie}>
      {contenido}
    </PanelLateral>
  )
}
