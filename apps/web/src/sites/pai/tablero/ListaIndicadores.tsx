/**
 * Lista del tablero agrupada por proceso -> acción (agruparIndicadores).
 * Cada indicador es una fila (en pantallas anchas) o una tarjeta (en el
 * celular) con:
 * - a la izquierda, los botones Observaciones y Evidencias con su insignia
 *   de conteo (bimestres con textos / evidencias);
 * - el código y el nombre, que enlaza a la ficha completa;
 * - las seis casillas por bimestre (CasillaBimestre);
 * - el total y el % anual.
 * El administrador ve además, en la cabecera de cada proceso, el logro del
 * bimestre abierto, el avance anual y los reportados (del resumen que
 * calcula el servidor, para todo el proceso aunque haya filtros), con el
 * mismo texto que el seguimiento (textoReportados / textoPendientes).
 *
 * La ficha se enlaza por código (/pai/indicadores/SAF-TH-02); en una vigencia
 * que no es la más reciente, por id (el código lleva a la más reciente).
 */
import { memo, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import {
  NUMEROS_BIMESTRE,
  type IndicadorTableroPai,
  type NumeroBimestre,
  type RespuestaReportePai,
  type ResumenProcesoPai,
  type TableroPai,
  type VigenciaPai,
} from '../api-pai'
import { textoPendientes, textoReportados } from '../admin/seguimiento'
import { formatoNumero, formatoPorcentaje } from '../datos/formatos'
import { rutaFicha } from '../rutas'
import { esAdministrador, useSesionPai } from '../sesion/contexto'
import CasillaBimestre, { type TokenAlDia } from './CasillaBimestre'
import { agruparIndicadores } from './datosTablero'
import {
  NOMBRE_TIPO_PROCESO,
  bimestreInicial,
  claseTotal,
  conteoTextos,
  nombreTipoMeta,
  plural,
  textoPorcentaje,
  totalEvidencias,
} from './presentacion'

export interface PropsListaIndicadores {
  tablero: TableroPai
  /** Ya filtrados, en el orden del tablero. */
  indicadores: IndicadorTableroPai[]
  onAbrirObservaciones: (indicador: IndicadorTableroPai, bimestre: NumeroBimestre) => void
  onAbrirEvidencias: (indicador: IndicadorTableroPai, bimestre: NumeroBimestre) => void
  onGuardado: (respuesta: RespuestaReportePai) => void
  /** Un guardado chocó con un cambio del servidor (409/403): volver a pedir el tablero. */
  onConflicto?: () => void
  /** Token de concurrencia que una casilla debe esperar (ver CasillaBimestre). */
  tokenAlDia?: TokenAlDia
}

/** Estado de navegación que lleva el enlace a la ficha para volver al tablero con los mismos filtros. */
export interface EstadoVolverPai {
  volver?: string
}

export default function ListaIndicadores({
  tablero,
  indicadores,
  onAbrirObservaciones,
  onAbrirEvidencias,
  onGuardado,
  onConflicto,
  tokenAlDia,
}: PropsListaIndicadores) {
  const { sesion } = useSesionPai()
  const ubicacion = useLocation()
  const administrador = esAdministrador(sesion)
  const grupos = useMemo(() => agruparIndicadores(tablero, indicadores), [tablero, indicadores])
  const destino = `${ubicacion.pathname}${ubicacion.search}`
  const volver = useMemo<EstadoVolverPai>(() => ({ volver: destino }), [destino])
  const masReciente = tablero.vigencia.vigencias[0]
  const fichaPorId = masReciente !== undefined && tablero.vigencia.anio !== masReciente

  return (
    <div className="pai-lista">
      {grupos.map((grupo) => {
        const idTitulo = `pai-proceso-${grupo.procesoId}`
        return (
          <section key={grupo.procesoId} className="pai-proceso" aria-labelledby={idTitulo}>
            <header className="pai-proceso-cabecera">
              <h2 className="pai-proceso-titulo h5" id={idTitulo}>
                {grupo.proceso ? (
                  <>
                    <span className="pai-codigo">{grupo.proceso.codigo}</span> {grupo.proceso.nombre}
                  </>
                ) : (
                  'Proceso sin datos'
                )}
              </h2>
              <p className="pai-proceso-datos">
                {[
                  grupo.dependencia && `${grupo.dependencia.sigla} · ${grupo.dependencia.nombre}`,
                  grupo.proceso && NOMBRE_TIPO_PROCESO[grupo.proceso.tipo],
                  plural(grupo.total, 'indicador', 'indicadores'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {administrador && grupo.resumen && (
                <ResumenProceso
                  resumen={grupo.resumen}
                  vigencia={tablero.vigencia}
                  filtrado={grupo.total !== grupo.resumen.indicadores}
                />
              )}
            </header>
            {grupo.acciones.map((grupoAccion) => (
              <div key={grupoAccion.accionId} className="pai-accion">
                <h3 className="pai-accion-titulo">Acción {grupoAccion.accion?.orden ?? ''}</h3>
                {grupoAccion.accion && <p className="pai-accion-descripcion">{grupoAccion.accion.descripcion}</p>}
                <ul className="pai-indicadores">
                  {grupoAccion.indicadores.map((indicador) => (
                    <li key={indicador.id}>
                      <FilaIndicador
                        indicador={indicador}
                        vigencia={tablero.vigencia}
                        volver={volver}
                        fichaPorId={fichaPorId}
                        onAbrirObservaciones={onAbrirObservaciones}
                        onAbrirEvidencias={onAbrirEvidencias}
                        onGuardado={onGuardado}
                        onConflicto={onConflicto}
                        tokenAlDia={tokenAlDia}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function ResumenProceso({
  resumen,
  vigencia,
  filtrado,
}: {
  resumen: ResumenProcesoPai
  vigencia: VigenciaPai
  /** Los filtros dejan ver solo parte del proceso (las cifras son de todo el proceso). */
  filtrado: boolean
}) {
  const abierto = vigencia.bimestreAbierto
  const anual = resumen.avanceAnual
  const pendientes = resumen.conteo ? textoPendientes(resumen.conteo) : ''
  return (
    <div className="pai-proceso-resumen">
      {filtrado && <p className="pai-proceso-nota">Cifras de todo el proceso ({plural(resumen.indicadores, 'indicador', 'indicadores')}):</p>}
      <dl className="pai-proceso-cifras">
        {abierto && (
          <div>
            <dt>Logro del bimestre {abierto}</dt>
            <dd>{formatoPorcentaje(resumen.logros[abierto - 1])}</dd>
          </div>
        )}
        <div>
          <dt>Avance anual</dt>
          <dd>
            {formatoPorcentaje(anual)}
            {anual !== null && (
              <span
                className="progress pai-proceso-barra"
                role="progressbar"
                aria-label="Avance anual del proceso"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(1, Math.max(0, anual)) * 100)}
              >
                <span className="progress-bar" style={{ width: `${Math.min(1, Math.max(0, anual)) * 100}%` }} />
              </span>
            )}
          </dd>
        </div>
        {resumen.conteo && (
          <div>
            <dt>Reportados en el bimestre {resumen.conteo.bimestre}</dt>
            <dd>
              {textoReportados(resumen.conteo)}
              {pendientes && <span className="pai-proceso-detalle"> · {pendientes}</span>}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

interface PropsFila {
  indicador: IndicadorTableroPai
  vigencia: VigenciaPai
  volver: EstadoVolverPai
  fichaPorId: boolean
  onAbrirObservaciones: PropsListaIndicadores['onAbrirObservaciones']
  onAbrirEvidencias: PropsListaIndicadores['onAbrirEvidencias']
  onGuardado: PropsListaIndicadores['onGuardado']
  onConflicto?: () => void
  tokenAlDia?: TokenAlDia
}

/** Fila de un indicador; memo: al guardar una casilla solo se vuelve a dibujar la fila que cambió. */
const FilaIndicador = memo(function FilaIndicador({
  indicador,
  vigencia,
  volver,
  fichaPorId,
  onAbrirObservaciones,
  onAbrirEvidencias,
  onGuardado,
  onConflicto,
  tokenAlDia,
}: PropsFila) {
  const textos = conteoTextos(indicador)
  const evidencias = totalEvidencias(indicador)
  const clase = claseTotal(indicador)
  const inicial = bimestreInicial(indicador, vigencia)
  const idNombre = `pai-indicador-${indicador.id}`
  return (
    <article className="pai-indicador" aria-labelledby={idNombre}>
      <div className="pai-indicador-botones">
        <button
          type="button"
          className="btn btn-outline-neutral btn-sm pai-boton-conteo"
          aria-label={`Observaciones de ${indicador.codigo} (${plural(textos, 'bimestre', 'bimestres')} con textos)`}
          onClick={() => onAbrirObservaciones(indicador, inicial)}
        >
          Observaciones
          <span className={`pai-insignia${textos ? ' pai-insignia-activa' : ''}`} aria-hidden="true">
            {textos}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-outline-neutral btn-sm pai-boton-conteo"
          aria-label={`Evidencias de ${indicador.codigo} (${plural(evidencias, 'archivo', 'archivos')})`}
          onClick={() => onAbrirEvidencias(indicador, inicial)}
        >
          Evidencias
          <span className={`pai-insignia${evidencias ? ' pai-insignia-activa' : ''}`} aria-hidden="true">
            {evidencias}
          </span>
        </button>
      </div>
      <div className="pai-indicador-nombre">
        <span className="pai-codigo">{indicador.codigo}</span>
        <Link
          id={idNombre}
          to={rutaFicha(fichaPorId ? String(indicador.id) : indicador.codigo)}
          state={volver}
          className="pai-indicador-enlace"
        >
          {indicador.nombre}
        </Link>
        {indicador.tipoMeta !== 'numero' && <span className="pai-etiqueta-meta">{nombreTipoMeta(indicador)}</span>}
      </div>
      <ol className="pai-casillas" aria-label={`Bimestres de ${indicador.codigo}`}>
        {NUMEROS_BIMESTRE.map((b) => (
          <li key={b}>
            <CasillaBimestre
              indicador={indicador}
              bimestre={b}
              onGuardado={onGuardado}
              onConflicto={onConflicto}
              abierto={vigencia.bimestreAbierto === b}
              tokenAlDia={tokenAlDia}
            />
          </li>
        ))}
      </ol>
      <div className={`pai-indicador-total pai-total-${clase}`}>
        <span className="pai-total-etiqueta">Total</span>
        <span className="pai-total-dato">Meta {formatoNumero(indicador.metaTotal)}</span>
        <span className="pai-total-dato">Avance {formatoNumero(indicador.avanceTotal)}</span>
        <span className="pai-total-porcentaje">
          <span className="pai-solo-lector">% anual:</span> {textoPorcentaje(clase, indicador.porcentajeTotal)}
        </span>
      </div>
    </article>
  )
})
