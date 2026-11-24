import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ESTADOS_TAREA, ETIQUETAS_ESTADO, type EstadoTarea, type TareaCrm } from '../api-crm'
import { plural } from './formato'
import MarcaEstado from './MarcaEstado'
import TarjetaTarea from './TarjetaTarea'

const VACIO_POR_DEFECTO: Record<EstadoTarea, string> = {
  pendiente: 'Sin tareas pendientes.',
  en_proceso: 'Sin tareas en proceso.',
  terminada: 'Sin tareas terminadas.',
}

/** Hasta cuándo se espera a que la tarea movida con un botón llegue a su columna (luego se olvida). */
function plazoFoco(): number {
  return Date.now() + 15_000
}

const PALABRAS: Record<EstadoTarea, readonly [string, string]> = {
  pendiente: ['pendiente', 'pendientes'],
  en_proceso: ['en proceso', 'en proceso'],
  terminada: ['terminada', 'terminadas'],
}

export interface PropsTablero {
  tareas: TareaCrm[]
  mostrarResponsable?: boolean
  alAbrir: (id: number) => void
  /** Sin alMover el tablero es de solo lectura: ni arrastre ni botones de mover. */
  alMover?: (tarea: TareaCrm, destino: EstadoTarea) => void
  /** Qué movimientos se ofrecen; por defecto, a cualquier otra columna. */
  puedeMover?: (tarea: TareaCrm, destino: EstadoTarea) => boolean
  /** Tareas guardando un cambio: atenuadas y quietas. */
  ocupadas?: ReadonlySet<number>
  /** Lo que se ve en una columna sin tareas (si no, «Sin tareas pendientes.»…). */
  vacio?: Partial<Record<EstadoTarea, ReactNode>>
  /** Pie de cada columna (p. ej., «Ver todas las terminadas»). */
  pieColumna?: Partial<Record<EstadoTarea, ReactNode>>
  /** Más acciones al pie de cada tarjeta, después de las de mover. */
  accionesTarea?: (tarea: TareaCrm) => ReactNode
  /** Id de la tarea abierta (en un panel), que se marca. */
  seleccionada?: number | null
  /** Nivel del encabezado de cada columna (2 por defecto); las tarjetas usan el siguiente. */
  nivelTitulo?: 2 | 3
  /** 'AAAA-MM-DD' de hoy (Bogotá); solo para pruebas y el muestrario. */
  hoy?: string
}

/**
 * Tablero de tres columnas (Pendiente, En proceso, Terminada), cada una con su
 * número de tareas y cuántas están vencidas.
 *
 * Con `alMover` las tareas se mueven de dos maneras, y las dos llaman a
 * alMover(tarea, destino) sin cambiar nada por su cuenta (quien lo usa
 * actualiza `tareas` y `ocupadas`):
 * - arrastrando la tarjeta a otra columna (HTML5): mientras se arrastra se
 *   marcan las columnas que la reciben (`puedeMover`);
 * - con los botones «Mover a …» del pie de cada tarjeta, siempre visibles,
 *   para el teclado y las pantallas táctiles. Después de mover con un botón,
 *   el foco sigue a la tarjeta en su columna nueva.
 *
 * En pantallas angostas las columnas se recorren de lado (con imán) y arriba
 * queda una barra con el número de cada una que lleva a su columna.
 */
export default function Tablero({
  tareas,
  mostrarResponsable = false,
  alAbrir,
  alMover,
  puedeMover,
  ocupadas,
  vacio,
  pieColumna,
  accionesTarea,
  seleccionada = null,
  nivelTitulo = 2,
  hoy,
}: PropsTablero) {
  const id = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const columnas = useRef<Partial<Record<EstadoTarea, HTMLElement | null>>>({})
  const arrastradaRef = useRef<TareaCrm | null>(null)
  const [arrastrada, setArrastrada] = useState<TareaCrm | null>(null)
  const [sobre, setSobre] = useState<EstadoTarea | null>(null)
  /** Tarea movida con un botón: al llegar a su columna nueva recibe el foco. */
  const seguirFoco = useRef<{ id: number; destino: EstadoTarea; hasta: number } | null>(null)

  const porEstado: Record<EstadoTarea, TareaCrm[]> = { pendiente: [], en_proceso: [], terminada: [] }
  for (const tarea of tareas) porEstado[tarea.estado]?.push(tarea)

  const ofrece = (tarea: TareaCrm, destino: EstadoTarea) =>
    Boolean(alMover) && destino !== tarea.estado && (puedeMover ? puedeMover(tarea, destino) : true)
  const permitido = (tarea: TareaCrm, destino: EstadoTarea) => ofrece(tarea, destino) && !ocupadas?.has(tarea.id)

  useEffect(() => {
    const pendiente = seguirFoco.current
    if (!pendiente) return
    const tarea = tareas.find((t) => t.id === pendiente.id)
    if (!tarea || Date.now() > pendiente.hasta) {
      seguirFoco.current = null
      return
    }
    if (tarea.estado !== pendiente.destino) return
    seguirFoco.current = null
    raiz.current?.querySelector<HTMLElement>(`[data-tarea="${pendiente.id}"] .crm-tt-abrir`)?.focus()
  }, [tareas])

  function mover(tarea: TareaCrm, destino: EstadoTarea, conBoton: boolean) {
    if (!alMover || !permitido(tarea, destino)) return
    if (conBoton) seguirFoco.current = { id: tarea.id, destino, hasta: plazoFoco() }
    alMover(tarea, destino)
  }

  // ── Arrastrar y soltar ──
  function empezarArrastre(evento: DragEvent<HTMLElement>, tarea: TareaCrm) {
    evento.dataTransfer.effectAllowed = 'move'
    try {
      evento.dataTransfer.setData('text/plain', String(tarea.id)) // Firefox no arrastra sin datos
    } catch {
      // algunos navegadores no dejan escribir aquí: no hace falta
    }
    arrastradaRef.current = tarea
    // Cambiar el DOM durante dragstart puede cortar el arrastre en Chrome: se marca después.
    setTimeout(() => {
      if (arrastradaRef.current === tarea) setArrastrada(tarea)
    }, 0)
  }

  function terminarArrastre() {
    arrastradaRef.current = null
    setArrastrada(null)
    setSobre(null)
  }

  function pasarSobre(evento: DragEvent<HTMLElement>, destino: EstadoTarea) {
    const tarea = arrastradaRef.current
    if (!tarea || !permitido(tarea, destino)) return
    evento.preventDefault()
    evento.dataTransfer.dropEffect = 'move'
    if (sobre !== destino) setSobre(destino)
  }

  function salir(evento: DragEvent<HTMLElement>, destino: EstadoTarea) {
    const hacia = evento.relatedTarget
    if (hacia instanceof Node && evento.currentTarget.contains(hacia)) return
    setSobre((actual) => (actual === destino ? null : actual))
  }

  function soltar(evento: DragEvent<HTMLElement>, destino: EstadoTarea) {
    const tarea = arrastradaRef.current
    terminarArrastre()
    if (!tarea || !permitido(tarea, destino)) return
    evento.preventDefault()
    mover(tarea, destino, false)
  }

  function irAColumna(estado: EstadoTarea) {
    const columna = columnas.current[estado]
    if (!columna) return
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    columna.scrollIntoView?.({ behavior: quieto ? 'auto' : 'smooth', block: 'nearest', inline: 'start' })
    columna.focus({ preventScroll: true })
  }

  const Encabezado = `h${nivelTitulo}` as const
  const nivelTarjeta = (nivelTitulo + 1) as 3 | 4

  return (
    <div className="crm-tablero" ref={raiz} data-arrastrando={arrastrada ? '' : undefined}>
      <nav className="crm-tablero-saltos" aria-label="Ir a una columna">
        {ESTADOS_TAREA.map((estado) => (
          <button key={estado} type="button" className="crm-salto" data-estado={estado} onClick={() => irAColumna(estado)}>
            <MarcaEstado estado={estado} />
            <span className="crm-salto-cifra">{porEstado[estado].length}</span>{' '}
            <span className="crm-salto-texto">{PALABRAS[estado][porEstado[estado].length === 1 ? 0 : 1]}</span>
          </button>
        ))}
      </nav>

      <div className="crm-tablero-columnas">
        {ESTADOS_TAREA.map((estado) => {
          const lista = porEstado[estado]
          const vencidas = lista.filter((t) => t.vencida).length
          const idTitulo = `${id}-${estado}`
          const destino = arrastrada ? (arrastrada.estado === estado ? 'origen' : permitido(arrastrada, estado) ? 'si' : 'no') : undefined
          return (
            <section
              key={estado}
              ref={(nodo) => {
                columnas.current[estado] = nodo
              }}
              className="crm-columna"
              data-estado={estado}
              data-destino={destino}
              data-sobre={sobre === estado ? '' : undefined}
              aria-labelledby={idTitulo}
              tabIndex={-1}
              onDragOver={(evento) => pasarSobre(evento, estado)}
              onDragLeave={(evento) => salir(evento, estado)}
              onDrop={(evento) => soltar(evento, estado)}
            >
              <header className="crm-columna-cabeza">
                <Encabezado
                  className="crm-columna-titulo"
                  id={idTitulo}
                  aria-label={`${ETIQUETAS_ESTADO[estado]}: ${plural(lista.length, 'tarea', 'tareas')}`}
                >
                  <MarcaEstado estado={estado} />
                  <span className="crm-columna-nombre">{ETIQUETAS_ESTADO[estado]}</span>
                  <span className="crm-columna-cuenta">{lista.length}</span>
                </Encabezado>
                {vencidas > 0 ? <p className="crm-columna-vencidas">{plural(vencidas, 'vencida', 'vencidas')}</p> : null}
              </header>

              {lista.length > 0 ? (
                <ul className="crm-columna-lista">
                  {lista.map((tarea) => {
                    const ocupada = ocupadas?.has(tarea.id) ?? false
                    const destinos = ESTADOS_TAREA.filter((d) => ofrece(tarea, d))
                    const extra = accionesTarea?.(tarea)
                    const arrastrable = destinos.length > 0 && !ocupada
                    return (
                      <li
                        key={tarea.id}
                        className="crm-columna-item"
                        data-tarea={tarea.id}
                        data-arrastrando={arrastrada?.id === tarea.id ? '' : undefined}
                        draggable={arrastrable || undefined}
                        onDragStart={arrastrable ? (evento) => empezarArrastre(evento, tarea) : undefined}
                        onDragEnd={arrastrable ? terminarArrastre : undefined}
                      >
                        <TarjetaTarea
                          tarea={tarea}
                          mostrarResponsable={mostrarResponsable}
                          alAbrir={alAbrir}
                          seleccionada={seleccionada === tarea.id}
                          ocupada={ocupada}
                          nivelTitulo={nivelTarjeta}
                          hoy={hoy}
                          acciones={
                            destinos.length > 0 || extra ? (
                              <>
                                {destinos.length > 0 ? (
                                  <span className="crm-mover-grupo">
                                    <span className="crm-mover-rotulo" aria-hidden="true">
                                      Mover a
                                    </span>
                                    {destinos.map((d) => (
                                      <button
                                        key={d}
                                        type="button"
                                        className="crm-mover"
                                        data-estado={d}
                                        disabled={ocupada}
                                        aria-label={`Mover «${tarea.titulo}» a ${ETIQUETAS_ESTADO[d]}`}
                                        onClick={() => mover(tarea, d, true)}
                                      >
                                        <MarcaEstado estado={d} />
                                        {ETIQUETAS_ESTADO[d]}
                                      </button>
                                    ))}
                                  </span>
                                ) : null}
                                {extra}
                              </>
                            ) : undefined
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="crm-columna-vacia">{vacio?.[estado] ?? <p>{VACIO_POR_DEFECTO[estado]}</p>}</div>
              )}

              {pieColumna?.[estado] ? <div className="crm-columna-pie">{pieColumna[estado]}</div> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
