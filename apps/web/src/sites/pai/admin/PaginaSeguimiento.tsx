/**
 * /pai/admin (solo administrador): seguimiento del PAI a partir de
 * GET /tablero (TableroPai.resumen, calculado en el servidor):
 * - resumen general: avance anual y reportados / pendientes en el bimestre
 *   abierto;
 * - una tarjeta por dependencia con el logro por bimestre (barras `progress`
 *   del kit) y enlaces al tablero filtrado (rutaTablero: ?dependencia=…,
 *   &estado=pendiente);
 * - tabla por proceso (con filtro por dependencia) con el logro por
 *   bimestre, el avance anual y reportados / pendientes, y enlaces al
 *   tablero filtrado (?proceso=…);
 * - "Exportar CSV" (GET /admin/exportar.csv con la dependencia elegida y el
 *   bimestre de los textos).
 * Los bimestres que aún no se reportan (estado 'futuro') se muestran como
 * "Aún no se reporta", nunca como avance bajo. La leyenda explica los colores
 * (los mismos umbrales del tablero: completo = 100 % de la meta).
 */
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  BIMESTRES_PAI,
  NUMEROS_BIMESTRE,
  type ConteoEstadosPai,
  type DependenciaPai,
  type NumeroBimestre,
  type ResumenAvancePai,
  type TableroPai,
} from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import { textoVigencia } from '../componentes/textoVigencia'
import { useTituloPai } from '../componentes/useTituloPai'
import { formatoNumero, formatoPorcentaje } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { rutaTablero } from '../rutas'
import { useSesionPai } from '../sesion/contexto'
import BarraAvance from './BarraAvance'
import { LEYENDA_NIVELES, bimestresFuturos, textoPendientes, textoReportados, textoSinLogro } from './seguimiento'
import './admin.css'

export default function PaginaSeguimiento() {
  useTituloPai('Seguimiento')
  const { cliente, vigenciaElegida } = useSesionPai()
  const { estado, recargar } = useCarga(
    (signal) => cliente.obtenerTablero(vigenciaElegida, signal),
    `seguimiento-${vigenciaElegida ?? 'actual'}`,
  )
  return (
    <div className="pai-pagina pai-admin">
      <h1 className="h3">Seguimiento del PAI</h1>
      {estado.fase === 'cargando' && <Cargando texto="Cargando el seguimiento…" />}
      {estado.fase === 'error' && <ErrorCarga mensaje={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && <Seguimiento tablero={estado.datos} />}
    </div>
  )
}

function Seguimiento({ tablero }: { tablero: TableroPai }) {
  const { cliente } = useSesionPai()
  const id = useId()
  const futuros = useMemo(() => bimestresFuturos(tablero), [tablero])
  const [dependenciaId, setDependenciaId] = useState<number | null>(null)
  const [bimestreTextos, setBimestreTextos] = useState<NumeroBimestre | null>(null)
  const { vigencia } = tablero
  const abierto = vigencia.bimestreAbierto

  const dependencias = useMemo(() => new Map(tablero.dependencias.map((d) => [d.id, d])), [tablero])
  const resumenDependencia = useMemo(
    () => new Map(tablero.resumen.dependencias.map((r) => [r.dependenciaId, r])),
    [tablero],
  )
  const resumenProceso = useMemo(() => new Map(tablero.resumen.procesos.map((r) => [r.procesoId, r])), [tablero])
  const procesos = useMemo(() => {
    const posicion = new Map(tablero.dependencias.map((d, i) => [d.id, i]))
    return [...tablero.procesos].sort(
      (a, b) => (posicion.get(a.dependenciaId) ?? 0) - (posicion.get(b.dependenciaId) ?? 0) || a.orden - b.orden,
    )
  }, [tablero])
  const procesosVisibles = dependenciaId === null ? procesos : procesos.filter((p) => p.dependenciaId === dependenciaId)
  const dependenciaElegida = dependenciaId === null ? null : (dependencias.get(dependenciaId) ?? null)

  if (tablero.indicadores.length === 0) {
    return (
      <div className="alert alert-info" role="status">
        Todavía no hay indicadores cargados para el PAI {vigencia.anio}. Cuando se carguen las fichas, aquí verá el
        avance por dependencia y por proceso.
      </div>
    )
  }

  const urlCsv = cliente.urlExportarCsv(
    dependenciaId === null ? {} : { dependencia: dependenciaId },
    bimestreTextos,
    vigencia.anio,
  )

  return (
    <>
      <p className="pai-admin-intro">
        PAI {vigencia.anio} · {textoVigencia(vigencia)}
      </p>

      <section className="card card-lg mb-4" aria-labelledby={`${id}-general`}>
        <div className="card-header">
          <h2 className="card-title h5 mb-0" id={`${id}-general`}>
            Avance general
          </h2>
        </div>
        <div className="card-body">
          <div className="pai-cifras">
            <Cifra titulo="Avance anual" valor={formatoPorcentaje(tablero.resumen.general.avanceAnual)} />
            <Cifra titulo="Indicadores" valor={String(tablero.resumen.general.indicadores)} />
            {tablero.resumen.general.conteo && (
              <Cifra
                titulo={`Reportados en el bimestre ${tablero.resumen.general.conteo.bimestre}`}
                valor={textoReportados(tablero.resumen.general.conteo)}
                detalle={textoPendientes(tablero.resumen.general.conteo)}
              />
            )}
          </div>
          <LogrosPorBimestre resumen={tablero.resumen.general} nombre="el PAI" abierto={abierto} futuros={futuros} />
          <LeyendaNiveles />
        </div>
      </section>

      <section aria-labelledby={`${id}-dependencias`} className="mb-4">
        <h2 className="h4" id={`${id}-dependencias`}>
          Por dependencia
        </h2>
        <ul className="row g-3 list-unstyled mb-0">
          {tablero.dependencias.map((dependencia) => {
            const resumen = resumenDependencia.get(dependencia.id)
            if (!resumen) return null
            return (
              <li className="col-12 col-md-6 col-xxl-4" key={dependencia.id}>
                <TarjetaDependencia dependencia={dependencia} resumen={resumen} abierto={abierto} futuros={futuros} />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card card-lg mb-4" aria-labelledby={`${id}-procesos`}>
        <div className="card-header d-flex flex-wrap align-items-end justify-content-between gap-3">
          <h2 className="card-title h5 mb-0" id={`${id}-procesos`}>
            Por proceso o proyecto
          </h2>
          <div className="pai-admin-filtro">
            <label className="form-label mb-1" htmlFor={`${id}-dependencia`}>
              Dependencia
            </label>
            <select
              id={`${id}-dependencia`}
              className="form-select form-select-sm"
              value={dependenciaId ?? ''}
              onChange={(e) => setDependenciaId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas</option>
              {tablero.dependencias.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.sigla} · {d.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-sm align-middle pai-tabla-seguimiento">
              <caption className="pai-solo-lector">
                Logro por bimestre, avance anual y reportes de cada proceso
                {dependenciaElegida ? ` de ${dependenciaElegida.sigla}` : ''}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Proceso o proyecto</th>
                  <th scope="col">Dependencia</th>
                  {BIMESTRES_PAI.map((b) => (
                    <th scope="col" key={b.numero} className={b.numero === abierto ? 'pai-columna-abierta' : undefined}>
                      <abbr title={`${b.nombre} (${b.meses})`}>Bim. {b.numero}</abbr>
                    </th>
                  ))}
                  <th scope="col">Avance anual</th>
                  <th scope="col">{abierto ? `Reportados (Bim. ${abierto})` : 'Reportados'}</th>
                </tr>
              </thead>
              <tbody>
                {procesosVisibles.map((proceso) => {
                  const resumen = resumenProceso.get(proceso.id)
                  const dependencia = dependencias.get(proceso.dependenciaId)
                  return (
                    <tr key={proceso.id}>
                      <th scope="row" className="pai-celda-proceso">
                        <Link to={rutaTablero({ proceso: proceso.id })}>
                          <span className="pai-codigo">{proceso.codigo}</span> {proceso.nombre}
                        </Link>
                        {proceso.tipo === 'proyecto' && <span className="tag tag-light-neutral ms-2">Proyecto</span>}
                      </th>
                      <td>{dependencia?.sigla ?? '—'}</td>
                      {NUMEROS_BIMESTRE.map((b) => (
                        <td key={b} className={b === abierto ? 'pai-columna-abierta' : undefined}>
                          <BarraAvance
                            fraccion={resumen?.logros[b - 1] ?? null}
                            etiqueta={`Logro del bimestre ${b} en ${proceso.codigo}`}
                            vacio={textoSinLogro(b, futuros)}
                          />
                        </td>
                      ))}
                      <td>
                        <BarraAvance
                          fraccion={resumen?.avanceAnual ?? null}
                          etiqueta={`Avance anual de ${proceso.codigo}`}
                        />
                      </td>
                      <td>
                        {resumen?.conteo ? (
                          <ConteoProceso conteo={resumen.conteo} procesoId={proceso.id} codigo={proceso.codigo} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card card-lg" aria-labelledby={`${id}-exportar`}>
        <div className="card-header">
          <h2 className="card-title h5 mb-0" id={`${id}-exportar`}>
            Exportar
          </h2>
        </div>
        <div className="card-body">
          <p>
            Descargue un archivo CSV (para Excel) con una fila por indicador: proceso, acción, metas, avances, porcentajes
            y los textos del bimestre elegido.{' '}
            {dependenciaElegida
              ? `Se exportan los indicadores de ${dependenciaElegida.sigla} (el filtro de la tabla).`
              : 'Se exportan todos los indicadores.'}
          </p>
          <div className="d-flex flex-wrap align-items-end gap-3">
            <div className="pai-admin-filtro">
              <label className="form-label mb-1" htmlFor={`${id}-bimestre-csv`}>
                Textos del bimestre
              </label>
              <select
                id={`${id}-bimestre-csv`}
                className="form-select"
                value={bimestreTextos ?? ''}
                onChange={(e) => setBimestreTextos(e.target.value ? (Number(e.target.value) as NumeroBimestre) : null)}
              >
                <option value="">{abierto ? `El bimestre abierto (${abierto})` : 'El último con reportes'}</option>
                {BIMESTRES_PAI.map((b) => (
                  <option key={b.numero} value={b.numero}>
                    {b.nombre} ({b.meses})
                  </option>
                ))}
              </select>
            </div>
            <a className="btn btn-primary" href={urlCsv} download>
              Exportar CSV
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="pai-cifra">
      <p className="pai-cifra-titulo">{titulo}</p>
      <p className="pai-cifra-valor">{valor}</p>
      {detalle && <p className="pai-cifra-detalle">{detalle}</p>}
    </div>
  )
}

function LeyendaNiveles() {
  return (
    <div className="pai-leyenda-niveles">
      <p className="pai-leyenda-niveles-titulo" id="pai-leyenda-niveles">
        Colores de las barras:
      </p>
      <ul aria-labelledby="pai-leyenda-niveles">
        {LEYENDA_NIVELES.map((item) => (
          <li key={item.nivel}>
            <span className={`progress pai-leyenda-barra ${item.clase}`} aria-hidden="true">
              <span className="progress-bar" style={{ width: '100%' }} />
            </span>
            {item.texto}
          </li>
        ))}
        <li>«Aún no se reporta»: bimestre que todavía no se abre para reportar</li>
      </ul>
    </div>
  )
}

function LogrosPorBimestre({
  resumen,
  nombre,
  abierto,
  futuros,
}: {
  resumen: ResumenAvancePai
  nombre: string
  abierto: NumeroBimestre | null
  futuros: ReadonlySet<NumeroBimestre>
}) {
  return (
    <dl className="pai-logros">
      {BIMESTRES_PAI.map((b) => (
        <div key={b.numero} className={b.numero === abierto ? 'pai-logro pai-columna-abierta' : 'pai-logro'}>
          <dt>
            <abbr title={`${b.nombre} (${b.meses})`}>Bim. {b.numero}</abbr>
          </dt>
          <dd>
            <BarraAvance
              fraccion={resumen.logros[b.numero - 1]}
              etiqueta={`Logro del ${b.nombre.toLowerCase()} en ${nombre}`}
              vacio={textoSinLogro(b.numero, futuros)}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TarjetaDependencia({
  dependencia,
  resumen,
  abierto,
  futuros,
}: {
  dependencia: DependenciaPai
  resumen: ResumenAvancePai
  abierto: NumeroBimestre | null
  futuros: ReadonlySet<NumeroBimestre>
}) {
  const conteo = resumen.conteo
  return (
    <article className="card card-lg h-100 pai-tarjeta-dependencia" aria-labelledby={`pai-dep-${dependencia.id}`}>
      <div className="card-header">
        <h3 className="card-title h5 mb-0" id={`pai-dep-${dependencia.id}`}>
          {dependencia.sigla}
          <span className="pai-tarjeta-nombre">{dependencia.nombre}</span>
        </h3>
      </div>
      <div className="card-body">
        <div className="pai-cifras">
          <Cifra titulo="Avance anual" valor={formatoPorcentaje(resumen.avanceAnual)} />
          {conteo && (
            <Cifra
              titulo={`Reportados en el bimestre ${conteo.bimestre}`}
              valor={textoReportados(conteo)}
              detalle={textoPendientes(conteo)}
            />
          )}
        </div>
        <LogrosPorBimestre resumen={resumen} nombre={dependencia.sigla} abierto={abierto} futuros={futuros} />
      </div>
      <div className="card-footer d-flex flex-wrap gap-3">
        <Link to={rutaTablero({ dependencia: dependencia.id })}>
          Ver sus {resumen.indicadores} indicadores{' '}<span className="pai-solo-lector">de {dependencia.sigla}</span>
        </Link>
        {conteo && conteo.pendientes > 0 && (
          <Link to={rutaTablero({ dependencia: dependencia.id, estado: 'pendiente' })}>
            Ver pendientes{' '}<span className="pai-solo-lector">de {dependencia.sigla}</span>
          </Link>
        )}
      </div>
    </article>
  )
}

function ConteoProceso({ conteo, procesoId, codigo }: { conteo: ConteoEstadosPai; procesoId: number; codigo: string }) {
  return (
    <span className="pai-conteo">
      <span>{textoReportados(conteo)}</span>
      {conteo.pendientes > 0 && (
        <Link to={rutaTablero({ proceso: procesoId, estado: 'pendiente' })}>
          {formatoNumero(conteo.pendientes)} {conteo.pendientes === 1 ? 'pendiente' : 'pendientes'}
          {' '}<span className="pai-solo-lector">de {codigo}</span>
        </Link>
      )}
    </span>
  )
}
