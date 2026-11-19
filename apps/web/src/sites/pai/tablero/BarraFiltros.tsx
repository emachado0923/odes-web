/**
 * Barra de filtros del tablero (kit: card, form-select, form-control):
 * búsqueda por texto, dependencia, proceso/proyecto y estado del reporte en
 * el bimestre abierto siempre a la vista; tipo, programa, riesgo, línea del
 * Plan de Desarrollo y dimensión del Plan Estratégico en "Más filtros" (se
 * abre solo si alguno está aplicado). Los selects dependen entre sí
 * (opcionesFiltros) y un cambio quita los filtros que dejan de concordar
 * (ajustarFiltros). Debajo, el conteo "N indicadores" (role=status) y
 * "Limpiar filtros". Cada campo tiene su etiqueta.
 */
import { useId, useState, type ReactNode } from 'react'
import {
  ESTADOS_REPORTE_FILTRO,
  TIPOS_PROCESO,
  infoBimestre,
  type EstadoReporteFiltro,
  type FiltrosTableroPai,
  type RiesgoTableroPai,
  type TableroPai,
  type TipoProceso,
} from '../api-pai'
import { MAX_BUSQUEDA, ajustarFiltros, hayFiltros, opcionesFiltros, type ClaveFiltro } from './filtros'
import { NOMBRE_TIPO_PROCESO, TEXTO_ESTADO_FILTRO, textoConteo } from './presentacion'

export interface PropsBarraFiltros {
  tablero: TableroPai
  filtros: FiltrosTableroPai
  onCambiar: (filtros: FiltrosTableroPai) => void
  /** Indicadores que cumplen los filtros. */
  total: number
  /** Administrador: GET /admin/exportar.csv con estos mismos filtros (misma semántica en el servidor). */
  urlExportar?: string
}

/** Filtros que van en "Más filtros". */
const EXTRA: readonly ClaveFiltro[] = ['tipo', 'programa', 'riesgo', 'linea', 'dimension']

/** Largo máximo del texto de un riesgo en las opciones (el texto completo va en title). */
const MAX_TEXTO_OPCION = 110

function recortar(texto: string): string {
  return texto.length > MAX_TEXTO_OPCION ? `${texto.slice(0, MAX_TEXTO_OPCION - 1).trimEnd()}…` : texto
}

function idDeValor(valor: string): number | null {
  return valor ? Number(valor) : null
}

export default function BarraFiltros({ tablero, filtros, onCambiar, total, urlExportar }: PropsBarraFiltros) {
  const id = useId()
  const opciones = opcionesFiltros(tablero, filtros)
  const extrasAplicados = EXTRA.filter((clave) => filtros[clave] !== null && filtros[clave] !== undefined).length
  const [masAbierto, setMasAbierto] = useState(extrasAplicados > 0)
  const verMas = masAbierto || extrasAplicados > 0
  const bimestre = tablero.vigencia.bimestreAbierto
  const procesosPorId = new Map(tablero.procesos.map((p) => [p.id, p]))

  function cambiar<K extends ClaveFiltro>(clave: K, valor: FiltrosTableroPai[K]) {
    onCambiar(ajustarFiltros(tablero, { ...filtros, [clave]: valor }, clave))
  }

  // Riesgos agrupados por proceso cuando no hay un proceso elegido.
  const riesgosPorProceso = new Map<number, RiesgoTableroPai[]>()
  for (const riesgo of opciones.riesgos) {
    riesgosPorProceso.set(riesgo.procesoId, [...(riesgosPorProceso.get(riesgo.procesoId) ?? []), riesgo])
  }
  const opcionRiesgo = (riesgo: RiesgoTableroPai) => (
    <option key={riesgo.id} value={riesgo.id} title={riesgo.texto}>
      {recortar(riesgo.texto)}
    </option>
  )

  return (
    <section className="card card-lg pai-filtros" aria-labelledby={`${id}-titulo`}>
      <div className="card-body">
        <h2 className="h5 mb-3" id={`${id}-titulo`}>
          Filtros
        </h2>
        <div className="row g-3">
          <Campo id={`${id}-q`} etiqueta="Buscar indicador" clases="col-12 col-md-6 col-xl-3">
            <input
              id={`${id}-q`}
              className="form-control"
              type="search"
              placeholder="Código o nombre"
              maxLength={MAX_BUSQUEDA}
              autoComplete="off"
              value={filtros.q ?? ''}
              onChange={(evento) => cambiar('q', evento.target.value || null)}
            />
          </Campo>
          <Campo id={`${id}-dependencia`} etiqueta="Dependencia" clases="col-12 col-md-6 col-xl-3">
            <select
              id={`${id}-dependencia`}
              className="form-select"
              value={filtros.dependencia ?? ''}
              onChange={(evento) => cambiar('dependencia', idDeValor(evento.target.value))}
            >
              <option value="">Todas</option>
              {opciones.dependencias.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.sigla} · {d.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={`${id}-proceso`} etiqueta="Proceso o proyecto" clases="col-12 col-md-6 col-xl-3">
            <select
              id={`${id}-proceso`}
              className="form-select"
              value={filtros.proceso ?? ''}
              onChange={(evento) => cambiar('proceso', idDeValor(evento.target.value))}
            >
              <option value="">Todos</option>
              {opciones.procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            id={`${id}-estado`}
            etiqueta={bimestre ? `Estado en el bimestre ${bimestre}` : 'Estado del reporte'}
            ayuda={bimestre ? `${infoBimestre(bimestre).meses}, el bimestre abierto` : 'No hay bimestre abierto.'}
            clases="col-12 col-md-6 col-xl-3"
          >
            <select
              id={`${id}-estado`}
              className="form-select"
              value={bimestre ? (filtros.estado ?? '') : ''}
              disabled={!bimestre}
              aria-describedby={`${id}-estado-ayuda`}
              onChange={(evento) => cambiar('estado', (evento.target.value || null) as EstadoReporteFiltro | null)}
            >
              <option value="">Todos</option>
              {ESTADOS_REPORTE_FILTRO.map((estado) => (
                <option key={estado} value={estado}>
                  {TEXTO_ESTADO_FILTRO[estado]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="row g-3 mt-0" id={`${id}-mas`} hidden={!verMas}>
          <Campo id={`${id}-tipo`} etiqueta="Tipo" clases="col-12 col-md-6 col-xl-2">
            <select
              id={`${id}-tipo`}
              className="form-select"
              value={filtros.tipo ?? ''}
              onChange={(evento) => cambiar('tipo', (evento.target.value || null) as TipoProceso | null)}
            >
              <option value="">Procesos y proyectos</option>
              {TIPOS_PROCESO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {NOMBRE_TIPO_PROCESO[tipo]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={`${id}-programa`} etiqueta="Programa" clases="col-12 col-md-6 col-xl-4">
            <select
              id={`${id}-programa`}
              className="form-select"
              value={filtros.programa ?? ''}
              disabled={opciones.programas.length === 0 && !filtros.programa}
              onChange={(evento) => cambiar('programa', evento.target.value || null)}
            >
              <option value="">{opciones.programas.length ? 'Todos' : 'Sin programas'}</option>
              {opciones.programas.map((programa) => (
                <option key={programa} value={programa} title={programa}>
                  {recortar(programa)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={`${id}-riesgo`} etiqueta="Riesgo" clases="col-12 col-xl-6">
            <select
              id={`${id}-riesgo`}
              className="form-select"
              value={filtros.riesgo ?? ''}
              disabled={opciones.riesgos.length === 0 && !filtros.riesgo}
              onChange={(evento) => cambiar('riesgo', idDeValor(evento.target.value))}
            >
              <option value="">{opciones.riesgos.length ? 'Todos' : 'Sin riesgos'}</option>
              {filtros.proceso
                ? opciones.riesgos.map(opcionRiesgo)
                : [...riesgosPorProceso].map(([procesoId, riesgos]) => {
                    const proceso = procesosPorId.get(procesoId)
                    return (
                      <optgroup key={procesoId} label={proceso ? `${proceso.codigo} · ${proceso.nombre}` : 'Proceso'}>
                        {riesgos.map(opcionRiesgo)}
                      </optgroup>
                    )
                  })}
            </select>
          </Campo>
          <Campo id={`${id}-linea`} etiqueta="Línea del Plan de Desarrollo" clases="col-12 col-md-6">
            <select
              id={`${id}-linea`}
              className="form-select"
              value={filtros.linea ?? ''}
              onChange={(evento) => cambiar('linea', evento.target.value || null)}
            >
              <option value="">Todas</option>
              {opciones.lineas.map((linea) => (
                <option key={linea} value={linea} title={linea}>
                  {recortar(linea)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={`${id}-dimension`} etiqueta="Dimensión del Plan Estratégico" clases="col-12 col-md-6">
            <select
              id={`${id}-dimension`}
              className="form-select"
              value={filtros.dimension ?? ''}
              disabled={opciones.dimensiones.length === 0 && !filtros.dimension}
              onChange={(evento) => cambiar('dimension', evento.target.value || null)}
            >
              <option value="">{opciones.dimensiones.length ? 'Todas' : 'Sin dimensiones'}</option>
              {opciones.dimensiones.map((dimension) => (
                <option key={dimension} value={dimension} title={dimension}>
                  {recortar(dimension)}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="pai-filtros-pie">
          <p className="pai-filtros-conteo" role="status">
            {textoConteo(total, tablero.indicadores.length)}
          </p>
          <div className="pai-filtros-acciones">
            <button
              type="button"
              className="btn btn-link-primary btn-sm"
              aria-expanded={verMas}
              aria-controls={`${id}-mas`}
              disabled={extrasAplicados > 0}
              onClick={() => setMasAbierto((abierto) => !abierto)}
            >
              {verMas ? 'Menos filtros' : 'Más filtros'}
              {extrasAplicados > 0 && ` (${extrasAplicados} aplicado${extrasAplicados === 1 ? '' : 's'})`}
            </button>
            <button
              type="button"
              className="btn btn-outline-neutral btn-sm"
              disabled={!hayFiltros(filtros)}
              onClick={() => onCambiar({})}
            >
              Limpiar filtros
            </button>
            {urlExportar && (
              <a className="btn btn-outline-primary btn-sm" href={urlExportar} download>
                Exportar CSV{' '}<span className="pai-solo-lector">con estos filtros</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Campo({
  id,
  etiqueta,
  ayuda,
  clases,
  children,
}: {
  id: string
  etiqueta: string
  ayuda?: string
  clases: string
  children: ReactNode
}) {
  return (
    <div className={clases}>
      <label className="form-label" htmlFor={id}>
        {etiqueta}
      </label>
      {children}
      {ayuda && (
        <div className="form-text" id={`${id}-ayuda`}>
          {ayuda}
        </div>
      )}
    </div>
  )
}
