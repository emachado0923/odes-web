/**
 * /pai/indicadores/:codigo: ficha completa del indicador
 * (cliente.obtenerFicha(codigo); `:codigo` también puede ser el id).
 *
 * Proceso o proyecto (dependencia, tipo, código BPIN, programa, línea del
 * Plan de Desarrollo, dimensión del Plan Estratégico, objetivo), acción y sus
 * riesgos, datos del indicador (tipo de meta, productos, rol responsable,
 * responsable, corresponsables, cálculo de los totales y del %), la tabla de
 * los seis bimestres (th scope) con meta, avance, %, estado y evidencias, y
 * debajo los textos y las evidencias de cada bimestre. Solo lectura: se
 * reporta desde el tablero ("Reportar en el tablero" lo abre filtrado).
 * 404 -> aviso con enlace al tablero.
 */
import { Link, useLocation, useParams } from 'react-router'
import { infoBimestre, type FichaIndicadorPai, type ReporteBimestrePai, type RolPai } from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import { useTituloPai } from '../componentes/useTituloPai'
import { esErrorPai } from '../datos/errores'
import { formatoNumero } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_PAI, rutaTablero } from '../rutas'
import { useSesionPai } from '../sesion/contexto'
import {
  NOMBRE_TIPO_PROCESO,
  TEXTO_ESTADO_BIMESTRE,
  claseReporte,
  claseTotal,
  nombreTipoMeta,
  plural,
  textoMotivo,
  textoPorcentaje,
  textoRegla,
  textoTope,
} from '../tablero/presentacion'
import type { EstadoVolverPai } from '../tablero/ListaIndicadores'
import { DatosEvidencia, OrigenReporte, TextosReporte } from './piezasReporte'
import '../tablero/tablero-pai.css'
import './ficha-pai.css'

/** Destino de "Volver al tablero": el tablero con los filtros de donde se vino (solo rutas de /pai). */
function destinoVolver(estado: unknown): string {
  const volver = (estado as EstadoVolverPai | null)?.volver
  return typeof volver === 'string' && (volver === RUTA_PAI || volver.startsWith(`${RUTA_PAI}?`)) ? volver : RUTA_PAI
}

export default function PaginaFichaIndicador() {
  const { codigo = '' } = useParams()
  const ubicacion = useLocation()
  const volver = destinoVolver(ubicacion.state)
  const { cliente } = useSesionPai()
  const { estado, recargar } = useCarga((signal) => cliente.obtenerFicha(codigo, signal), `ficha-${codigo}`)
  const ficha = estado.fase === 'listo' ? estado.datos : null
  useTituloPai(ficha ? `${ficha.codigo} · Ficha del indicador` : 'Ficha del indicador')
  const noEncontrado = estado.fase === 'error' && esErrorPai(estado.error) && estado.error.estado === 404

  return (
    <div className="pai-pagina pai-ficha">
      <nav aria-label="Ruta de navegación">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to={volver}>Tablero</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {ficha?.codigo ?? codigo}
          </li>
        </ol>
      </nav>
      {estado.fase === 'cargando' && (
        <>
          <h1 className="h3">Ficha del indicador {codigo}</h1>
          <Cargando texto="Cargando la ficha…" />
        </>
      )}
      {estado.fase === 'error' && (
        <>
          <h1 className="h3">Ficha del indicador {codigo}</h1>
          {noEncontrado ? (
            <div className="alert alert-warning" role="alert">
              <p className="mb-2">
                No se encontró el indicador «{codigo}», o no está entre los indicadores que tiene asignados.
              </p>
              <Link to={RUTA_PAI} className="btn btn-outline-neutral btn-sm">
                Ir al tablero
              </Link>
            </div>
          ) : (
            <ErrorCarga titulo="No se pudo cargar la ficha." mensaje={estado.mensaje} onReintentar={recargar} />
          )}
        </>
      )}
      {ficha && <Ficha ficha={ficha} />}
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  return (
    <div className="pai-dato">
      <dt>{etiqueta}</dt>
      <dd>{valor === null || valor === undefined || valor === '' ? <span className="pai-sin-dato">Sin información</span> : valor}</dd>
    </div>
  )
}

function Ficha({ ficha }: { ficha: FichaIndicadorPai }) {
  const { sesion } = useSesionPai()
  const rol = sesion?.rol ?? 'responsable'
  const { proceso } = ficha
  const claseAnual = claseTotal(ficha)
  const editables = ficha.bimestres.filter((r) => r.editable).map((r) => r.bimestre)
  return (
    <>
      <h1 className="h3 pai-ficha-titulo">
        <span className="pai-codigo">{ficha.codigo}</span> {ficha.nombre}
      </h1>
      <p className="pai-subtitulo">
        PAI {ficha.vigencia} · {proceso.codigo} · {proceso.nombre}
      </p>
      <div className="pai-ficha-acciones">
        <Link className="btn btn-primary btn-sm" to={rutaTablero({ q: ficha.codigo })}>
          {editables.length ? 'Reportar en el tablero' : 'Ver en el tablero'}
        </Link>
        {editables.length > 0 && (
          <p className="mb-0 small">
            Puede editar: {editables.map((b) => infoBimestre(b).nombre.toLowerCase()).join(', ')}.
          </p>
        )}
      </div>

      <div className="row g-4 mt-0">
        <div className="col-12 col-lg-6">
          <section className="card card-lg h-100" aria-labelledby="ficha-proceso">
            <div className="card-body">
              <h2 className="h5" id="ficha-proceso">
                {NOMBRE_TIPO_PROCESO[proceso.tipo]}
              </h2>
              <dl className="pai-datos">
                <Dato etiqueta="Dependencia" valor={`${proceso.dependencia.sigla} · ${proceso.dependencia.nombre}`} />
                <Dato etiqueta={`${NOMBRE_TIPO_PROCESO[proceso.tipo]}`} valor={`${proceso.codigo} · ${proceso.nombre}`} />
                {proceso.codigoProyecto && <Dato etiqueta="Código del proyecto (BPIN)" valor={proceso.codigoProyecto} />}
                <Dato etiqueta="Programa" valor={proceso.programa} />
                <Dato etiqueta="Línea del Plan de Desarrollo" valor={proceso.lineaPlanDesarrollo} />
                <Dato etiqueta="Dimensión del Plan Estratégico" valor={proceso.dimensionPlanEstrategico} />
                <Dato etiqueta="Objetivo" valor={proceso.objetivo} />
              </dl>
            </div>
          </section>
        </div>
        <div className="col-12 col-lg-6">
          <section className="card card-lg h-100" aria-labelledby="ficha-indicador">
            <div className="card-body">
              <h2 className="h5" id="ficha-indicador">
                Indicador
              </h2>
              <dl className="pai-datos">
                <Dato etiqueta="Tipo de meta" valor={nombreTipoMeta(ficha)} />
                <Dato etiqueta="Productos" valor={ficha.productos} />
                <Dato etiqueta="Rol responsable" valor={ficha.rolResponsable} />
                <Dato etiqueta="Responsable" valor={ficha.responsable} />
                <Dato etiqueta="Corresponsables" valor={ficha.corresponsables} />
                <Dato
                  etiqueta="Meta total"
                  valor={`${formatoNumero(ficha.metaTotal)} (${textoRegla(ficha.calculo.reglaMetaTotal, ficha.calculo.divisorMetaTotal).toLowerCase()})`}
                />
                <Dato
                  etiqueta="Avance total"
                  valor={`${formatoNumero(ficha.avanceTotal)} (${textoRegla(ficha.calculo.reglaAvanceTotal, ficha.calculo.divisorAvanceTotal).toLowerCase()})`}
                />
                <Dato etiqueta="% total" valor={`${textoPorcentaje(claseAnual, ficha.porcentajeTotal)} · ${textoTope(ficha.calculo)}`} />
              </dl>
            </div>
          </section>
        </div>
        <div className="col-12">
          <section className="card card-lg" aria-labelledby="ficha-accion">
            <div className="card-body">
              <h2 className="h5" id="ficha-accion">
                Acción {ficha.accion.orden}
              </h2>
              <p className="pai-texto-largo">{ficha.accion.descripcion}</p>
              <h3 className="h6 mt-3">Riesgos que cubre la acción</h3>
              {ficha.riesgos.length === 0 ? (
                <p className="pai-sin-dato mb-0">La acción no tiene riesgos asociados en la ficha.</p>
              ) : (
                <ul className="pai-riesgos">
                  {ficha.riesgos.map((riesgo) => (
                    <li key={riesgo.id}>
                      {riesgo.texto}
                      {riesgo.corrupcion && <span className="pai-etiqueta-rc"> Riesgo de corrupción</span>}
                      {riesgo.descripcion && riesgo.descripcion !== riesgo.texto && !riesgo.texto.includes(riesgo.descripcion) && (
                        <span className="pai-riesgo-descripcion">{riesgo.descripcion}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-4" aria-labelledby="ficha-bimestres">
        <h2 className="h4" id="ficha-bimestres">
          Avance por bimestre
        </h2>
        <div className="table-responsive">
          <table className="table table-sm align-middle pai-tabla-bimestres">
            <caption className="pai-solo-lector">
              Meta, avance, porcentaje, estado y evidencias de {ficha.codigo} por bimestre
            </caption>
            <thead>
              <tr>
                <th scope="col">Bimestre</th>
                <th scope="col" className="text-end">
                  Meta
                </th>
                <th scope="col" className="text-end">
                  Avance
                </th>
                <th scope="col" className="text-end">
                  %
                </th>
                <th scope="col">Estado</th>
                <th scope="col" className="text-end">
                  <span className="pai-ficha-largo">Evidencias</span>
                  <abbr className="pai-ficha-corto" title="Evidencias">
                    Evid.
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {ficha.bimestres.map((reporte) => {
                const clase = claseReporte(reporte)
                const info = infoBimestre(reporte.bimestre)
                return (
                  <tr key={reporte.bimestre}>
                    <th scope="row">
                      {info.nombre}
                      <span className="pai-tabla-meses">{info.meses}</span>
                    </th>
                    <td className="text-end">{formatoNumero(reporte.meta)}</td>
                    <td className="text-end">{formatoNumero(reporte.avance)}</td>
                    <td className={`text-end pai-texto-${clase}`}>{textoPorcentaje(clase, reporte.porcentaje)}</td>
                    <td>{TEXTO_ESTADO_BIMESTRE[reporte.estado]}</td>
                    <td className="text-end">{formatoNumero(reporte.evidencias.length)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="text-end">{formatoNumero(ficha.metaTotal)}</td>
                <td className="text-end">{formatoNumero(ficha.avanceTotal)}</td>
                <td className={`text-end pai-texto-${claseAnual}`}>{textoPorcentaje(claseAnual, ficha.porcentajeTotal)}</td>
                <td />
                <td className="text-end">{formatoNumero(ficha.bimestres.reduce((n, r) => n + r.evidencias.length, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-4" aria-labelledby="ficha-reportes">
        <h2 className="h4" id="ficha-reportes">
          Reportes por bimestre
        </h2>
        {ficha.bimestres.map((reporte) => (
          <ReporteBimestre key={reporte.bimestre} reporte={reporte} rol={rol} />
        ))}
      </section>
    </>
  )
}

function ReporteBimestre({ reporte, rol }: { reporte: ReporteBimestrePai; rol: RolPai }) {
  const { cliente } = useSesionPai()
  const info = infoBimestre(reporte.bimestre)
  const sinReporte = reporte.origen === null && reporte.evidencias.length === 0
  const idTitulo = `bimestre-${reporte.bimestre}`
  return (
    <article className="card card-lg pai-reporte" aria-labelledby={`${idTitulo}-titulo`} id={idTitulo}>
      <div className="card-body">
        <h3 className="h5" id={`${idTitulo}-titulo`}>
          {info.nombre} · {info.meses}
        </h3>
        <p className="pai-reporte-estado">
          {TEXTO_ESTADO_BIMESTRE[reporte.estado]} · meta {formatoNumero(reporte.meta)} · avance {formatoNumero(reporte.avance)} ·{' '}
          {textoPorcentaje(claseReporte(reporte), reporte.porcentaje)}
          {reporte.editable && <span className="pai-etiqueta-editable"> Editable</span>}
        </p>
        {(reporte.editable || reporte.motivo === 'cerrado') && <p className="pai-motivo">{textoMotivo(reporte.motivo, rol)}</p>}
        {sinReporte ? (
          <p className="pai-sin-dato mb-0">Sin reporte en este bimestre.</p>
        ) : (
          <>
            <OrigenReporte reporte={reporte} />
            <TextosReporte reporte={reporte} />
            <h4 className="h6 mt-3">Evidencias ({plural(reporte.evidencias.length, 'archivo', 'archivos')})</h4>
            {reporte.evidencias.length === 0 ? (
              <p className="pai-sin-dato mb-0">Sin evidencias.</p>
            ) : (
              <ul className="pai-evidencias">
                {reporte.evidencias.map((evidencia) => (
                  <li key={evidencia.id} className="pai-evidencia">
                    <DatosEvidencia evidencia={evidencia} url={cliente.urlEvidencia(evidencia.id)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </article>
  )
}
