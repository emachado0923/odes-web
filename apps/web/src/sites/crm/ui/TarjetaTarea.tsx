import { useId, type MouseEvent, type ReactNode } from 'react'
import type { TareaCrm } from '../api-crm'
import Avatar from './Avatar'
import { plural, textoFechaTarea } from './formato'
import Icono from './Icono'

const INTERACTIVOS = 'a, button, input, select, textarea, label, summary, [role="button"], [tabindex]:not([tabindex="-1"])'

/**
 * Una tarea en el tablero. El título es el botón que la abre (alAbrir); un
 * clic en cualquier parte de la tarjeta que no sea un control hace lo mismo.
 * Debajo: la fecha («Vence el 28 de nov», «Vencida, era para el 12 de nov»,
 * «Terminada el 20 de nov»), los adjuntos y si pide entregable, y el
 * responsable si `mostrarResponsable`. `acciones` va al pie.
 *
 * `ocupada` la atenúa y dice «Guardando…» mientras se guarda un cambio.
 * `nivelTitulo` es el nivel del encabezado del título (3 por defecto: la
 * tarjeta va dentro de una columna con h2).
 */
export default function TarjetaTarea({
  tarea,
  mostrarResponsable = false,
  alAbrir,
  acciones,
  seleccionada = false,
  ocupada = false,
  nivelTitulo = 3,
  hoy,
}: {
  tarea: TareaCrm
  mostrarResponsable?: boolean
  alAbrir: (id: number) => void
  acciones?: ReactNode
  seleccionada?: boolean
  ocupada?: boolean
  nivelTitulo?: 2 | 3 | 4
  /** 'AAAA-MM-DD' de hoy (Bogotá); solo para pruebas y el muestrario. */
  hoy?: string
}) {
  const id = useId()
  const fecha = textoFechaTarea(tarea, hoy)
  const Titulo = `h${nivelTitulo}` as const

  function alPulsarTarjeta(evento: MouseEvent<HTMLElement>) {
    const objetivo = evento.target as Element
    const control = objetivo.closest(INTERACTIVOS)
    if (control && evento.currentTarget.contains(control)) return
    if (window.getSelection?.()?.toString()) return // estaba seleccionando texto
    alAbrir(tarea.id)
  }

  const pideEntregable = tarea.requiereEntregable && tarea.entregables === 0 && tarea.estado !== 'terminada'

  return (
    // El clic en la tarjeta es un atajo para el ratón; con el teclado se usa el botón del título.
    <article
      className="crm-tarjeta-tarea"
      data-estado={tarea.estado}
      data-vencida={tarea.vencida ? '' : undefined}
      data-seleccionada={seleccionada ? '' : undefined}
      data-ocupada={ocupada ? '' : undefined}
      aria-labelledby={`${id}-titulo`}
      aria-current={seleccionada ? 'true' : undefined}
      aria-busy={ocupada || undefined}
      onClick={alPulsarTarjeta}
    >
      <Titulo className="crm-tt-titulo">
        <button type="button" className="crm-tt-abrir" id={`${id}-titulo`} onClick={() => alAbrir(tarea.id)}>
          {tarea.titulo}
        </button>
      </Titulo>

      {fecha ? (
        <p className="crm-tt-fecha" data-tono={fecha.tono} title={fecha.completa}>
          <Icono
            nombre={fecha.tono === 'vencida' ? 'alerta' : fecha.tono === 'terminada' ? 'check' : fecha.tono === 'pronto' ? 'reloj' : 'calendario'}
            tamano={16}
          />
          <span>
            {fecha.etiqueta ? <strong className="crm-tt-vencida">{fecha.etiqueta}</strong> : null}
            {fecha.etiqueta ? ', ' : null}
            {fecha.texto}
          </span>
        </p>
      ) : null}

      {tarea.adjuntos > 0 || tarea.entregables > 0 || pideEntregable ? (
        <ul className="crm-tt-indicadores">
          {pideEntregable ? (
            <li className="crm-tt-indicador" data-tipo="pide">
              <Icono nombre="subir" tamano={15} />
              Pide entregable
            </li>
          ) : null}
          {tarea.entregables > 0 ? (
            <li className="crm-tt-indicador" data-tipo="entregable">
              <Icono nombre="check" tamano={15} />
              {plural(tarea.entregables, 'entregable', 'entregables')}
            </li>
          ) : null}
          {tarea.adjuntos > 0 ? (
            <li className="crm-tt-indicador" data-tipo="adjuntos">
              <Icono nombre="clip" tamano={15} />
              {plural(tarea.adjuntos, 'adjunto', 'adjuntos')}
            </li>
          ) : null}
        </ul>
      ) : null}

      {mostrarResponsable ? (
        <p className="crm-tt-responsable">
          <Avatar
            nombre={tarea.responsable.nombre}
            iniciales={tarea.responsable.iniciales}
            foto={tarea.responsable.foto}
            tamano="sm"
            semilla={tarea.responsable.id}
          />
          <span className="crm-sr">Responsable: </span>
          <span className="crm-tt-responsable-nombre">{tarea.responsable.nombre}</span>
        </p>
      ) : null}

      {acciones || ocupada ? (
        <div className="crm-tt-pie">
          {acciones}
          {ocupada ? (
            <span className="crm-tt-guardando" role="status">
              <span className="crm-giro" aria-hidden="true" />
              Guardando…
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
