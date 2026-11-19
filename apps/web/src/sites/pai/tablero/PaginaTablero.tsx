/**
 * /pai (ambos roles): el tablero de indicadores.
 *
 * Carga GET /tablero de la vigencia elegida en la barra (useCarga), muestra
 * la barra de filtros con su estado en la URL (useFiltrosPai), la leyenda de
 * colores, la lista agrupada por proceso -> acción (ListaIndicadores) y los
 * modales de Observaciones y Evidencias. El responsable sin indicadores
 * asignados ve un aviso claro.
 *
 * Al guardar una casilla o un modal se reemplaza la fila con
 * RespuestaReportePai.indicador (setDatos), sin volver a pedir todo. Si un
 * filtro está aplicado (p. ej., estado=pendiente), la fila guardada se queda
 * a la vista aunque ya no lo cumpla, hasta que cambien los filtros: así no
 * desaparecen el "Guardado" ni el foco.
 *
 * Solo se vuelve a pedir el tablero (en segundo plano, sin quitar la lista)
 * cuando el servidor rechazó un guardado por un cambio de estado (409 / 403)
 * o cuando la primera evidencia de un bimestre creó su reporte (cambia el
 * token de concurrencia de la casilla). Esa recarga no pisa lo guardado
 * después de pedirla: si mientras tanto se guardó algo aquí, se descarta y
 * se pide otra (refrescar). La casilla que espera el token nuevo de la
 * primera evidencia espera a que llegue antes de guardar (tokenAlDia).
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { infoBimestre, type IndicadorTableroPai, type NumeroBimestre, type RespuestaReportePai, type TableroPai } from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import { fechaLimite } from '../componentes/textoVigencia'
import { useTituloPai } from '../componentes/useTituloPai'
import { useCarga } from '../datos/useCarga'
import ModalEvidencias from '../modales/ModalEvidencias'
import ModalObservaciones from '../modales/ModalObservaciones'
import { esAdministrador, useSesionPai } from '../sesion/contexto'
import BarraFiltros from './BarraFiltros'
import type { TokenAlDia } from './CasillaBimestre'
import { buscarIndicador, conEvidencias, reemplazarIndicador } from './datosTablero'
import { filtrarIndicadores, hayFiltros, igualesFiltros } from './filtros'
import ListaIndicadores from './ListaIndicadores'
import { LEYENDA_AVANCE, plural } from './presentacion'
import { useFiltrosPai } from './useFiltrosPai'
import './tablero-pai.css'

interface ModalAbierto {
  tipo: 'observaciones' | 'evidencias'
  indicadorId: number
  bimestre: NumeroBimestre
}

const claveCasilla = (indicadorId: number, bimestre: NumeroBimestre) => `${indicadorId}:${bimestre}`

export default function PaginaTablero() {
  useTituloPai('Tablero')
  const { cliente, sesion, vigenciaElegida } = useSesionPai()
  const administrador = esAdministrador(sesion)
  const { estado, recargar, setDatos } = useCarga(
    (signal) => cliente.obtenerTablero(vigenciaElegida, signal),
    `tablero-${sesion?.id ?? 0}-${vigenciaElegida ?? 'actual'}`,
  )
  const tablero = estado.fase === 'listo' ? estado.datos : null
  const [filtros, setFiltros] = useFiltrosPai(tablero)
  const [modal, setModal] = useState<ModalAbierto | null>(null)

  // Filas guardadas en esta visita con los filtros actuales: siguen a la vista aunque ya no los cumplan.
  const [fijadas, setFijadas] = useState<ReadonlySet<number>>(() => new Set())
  const [filtrosVistos, setFiltrosVistos] = useState(filtros)
  if (!igualesFiltros(filtros, filtrosVistos)) {
    setFiltrosVistos(filtros)
    if (fijadas.size > 0) setFijadas(new Set())
  }
  const coinciden = useMemo(() => (tablero ? filtrarIndicadores(tablero, filtros) : []), [tablero, filtros])
  const indicadores = useMemo(() => {
    if (!tablero || fijadas.size === 0 || coinciden === tablero.indicadores) return coinciden
    const ids = new Set(coinciden.map((i) => i.id))
    return tablero.indicadores.filter((i) => ids.has(i.id) || fijadas.has(i.id))
  }, [tablero, coinciden, fijadas])
  const fueraDeFiltro = indicadores.length - coinciden.length

  // ── Recarga en segundo plano ─────────────────────────────────────────────
  // `mutaciones` cuenta lo guardado aquí: una recarga pedida antes de un
  // guardado traería la fila vieja (valor y token), así que se descarta y se
  // pide otra. Solo vale la última recarga pedida.
  const mutaciones = useRef(0)
  const ultimaRecarga = useRef(0)
  const recargaEnCurso = useRef<Promise<TableroPai | null> | null>(null)
  /** Casillas cuyo reporte creó la primera evidencia: su token llega con la próxima recarga. */
  const sinToken = useRef(new Set<string>())

  const refrescar = useCallback(function recargarTablero(): Promise<TableroPai | null> {
    const numero = ++ultimaRecarga.current
    const desde = mutaciones.current
    const promesa: Promise<TableroPai | null> = cliente.obtenerTablero(vigenciaElegida).then(
      (nuevo) => {
        // Hay una recarga más nueva: su resultado es el que vale.
        if (numero !== ultimaRecarga.current) return recargaEnCurso.current ?? null
        // Se guardó algo después de pedirla: traería filas viejas.
        if (mutaciones.current !== desde) return recargarTablero()
        recargaEnCurso.current = null
        sinToken.current.clear()
        setDatos(nuevo)
        return nuevo
      },
      () => {
        // Quien pidió la recarga ya mostró su aviso; el tablero anterior sigue a la vista.
        if (numero === ultimaRecarga.current) recargaEnCurso.current = null
        return null
      },
    )
    recargaEnCurso.current = promesa
    return promesa
  }, [cliente, vigenciaElegida, setDatos])

  const alConflicto = useCallback(() => {
    void refrescar()
  }, [refrescar])

  const tokenAlDia = useCallback<TokenAlDia>((indicadorId, bimestre) => {
    const espera = recargaEnCurso.current
    if (!espera || !sinToken.current.has(claveCasilla(indicadorId, bimestre))) return null
    return espera.then((nuevo) => (nuevo ? buscarIndicador(nuevo, indicadorId)?.actualizadoEn[bimestre - 1] : undefined))
  }, [])

  const alGuardar = useCallback(
    (respuesta: RespuestaReportePai) => {
      mutaciones.current++
      setDatos((actual) => reemplazarIndicador(actual, respuesta.indicador))
      setFijadas((previas) => (previas.has(respuesta.indicador.id) ? previas : new Set(previas).add(respuesta.indicador.id)))
    },
    [setDatos],
  )

  const alCambiarEvidencias = useCallback(
    (indicadorId: number, bimestre: NumeroBimestre, cantidad: number) => {
      const antes = tablero ? buscarIndicador(tablero, indicadorId) : null
      mutaciones.current++
      setDatos((actual) => conEvidencias(actual, indicadorId, bimestre, cantidad))
      // La primera evidencia crea el reporte del bimestre: hace falta su nuevo actualizadoEn.
      if (antes && antes.actualizadoEn[bimestre - 1] === null) {
        sinToken.current.add(claveCasilla(indicadorId, bimestre))
        void refrescar()
      }
    },
    [tablero, setDatos, refrescar],
  )

  const abrir = useCallback(
    (tipo: ModalAbierto['tipo']) => (indicador: IndicadorTableroPai, bimestre: NumeroBimestre) =>
      setModal({ tipo, indicadorId: indicador.id, bimestre }),
    [],
  )
  const abrirObservaciones = useMemo(() => abrir('observaciones'), [abrir])
  const abrirEvidencias = useMemo(() => abrir('evidencias'), [abrir])

  const indicadorModal = modal && tablero ? buscarIndicador(tablero, modal.indicadorId) : null

  return (
    <div className="pai-pagina pai-tablero">
      <h1 className="h3 mb-1">Tablero de indicadores</h1>
      <p className="pai-subtitulo">
        Plan de Acción Institucional{tablero ? ` ${tablero.vigencia.anio}` : ''}
        {administrador ? ' · vista de Planeación (solo lectura)' : ''}
      </p>

      {estado.fase === 'cargando' && <Cargando texto="Cargando el tablero…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudo cargar el tablero." mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {tablero && (
        <>
          <AvisoBimestre tablero={tablero} administrador={administrador} />
          {tablero.indicadores.length === 0 ? (
            <div className="alert alert-info" role="status">
              {administrador ? (
                <p className="mb-0">
                  No hay indicadores cargados para la vigencia {tablero.vigencia.anio}. Cárguelos con{' '}
                  <code>npm run pai:cargar-fichas</code>.
                </p>
              ) : (
                <>
                  <p className="fw-bold mb-1">Todavía no tiene indicadores asignados.</p>
                  <p className="mb-0">
                    Pida a Planeación (administración del PAI) que le asigne los procesos o indicadores que debe
                    reportar. Cuando lo haga, aparecerán aquí.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <BarraFiltros
                tablero={tablero}
                filtros={filtros}
                onCambiar={setFiltros}
                total={coinciden.length}
                urlExportar={administrador ? cliente.urlExportarCsv(filtros, null, tablero.vigencia.anio) : undefined}
              />
              <Leyenda />
              {fueraDeFiltro > 0 && (
                <p className="pai-fuera-filtro">
                  {plural(fueraDeFiltro, 'indicador guardado ya no cumple', 'indicadores guardados ya no cumplen')} los
                  filtros: {fueraDeFiltro === 1 ? 'sigue' : 'siguen'} a la vista hasta que los cambie.
                </p>
              )}
              {indicadores.length === 0 ? (
                <div className="pai-sin-resultados">
                  <p className="mb-2">Ningún indicador cumple los filtros.</p>
                  {hayFiltros(filtros) && (
                    <button type="button" className="btn btn-outline-neutral btn-sm" onClick={() => setFiltros({})}>
                      Limpiar filtros
                    </button>
                  )}
                </div>
              ) : (
                <ListaIndicadores
                  tablero={tablero}
                  indicadores={indicadores}
                  onAbrirObservaciones={abrirObservaciones}
                  onAbrirEvidencias={abrirEvidencias}
                  onGuardado={alGuardar}
                  onConflicto={alConflicto}
                  tokenAlDia={tokenAlDia}
                />
              )}
            </>
          )}
          {modal?.tipo === 'observaciones' && indicadorModal && (
            <ModalObservaciones
              key={`observaciones-${indicadorModal.id}`}
              indicador={indicadorModal}
              bimestreInicial={modal.bimestre}
              onCerrar={() => setModal(null)}
              onGuardado={alGuardar}
              onConflicto={alConflicto}
            />
          )}
          {modal?.tipo === 'evidencias' && indicadorModal && (
            <ModalEvidencias
              key={`evidencias-${indicadorModal.id}`}
              indicador={indicadorModal}
              bimestreInicial={modal.bimestre}
              onCerrar={() => setModal(null)}
              onCambio={alCambiarEvidencias}
              onConflicto={alConflicto}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Qué se puede hacer ahora: bimestre abierto, fecha límite, autorizaciones o solo lectura. */
function AvisoBimestre({ tablero, administrador }: { tablero: TableroPai; administrador: boolean }) {
  const { vigencia } = tablero
  const abierto = vigencia.bimestreAbierto
  // La misma forma de la fecha que la barra ("14 de diciembre"): vale hasta el final de ese día.
  const hasta = vigencia.abiertoHasta ? fechaLimite(vigencia.abiertoHasta, vigencia.anio) : null
  const autorizados = new Set<number>()
  let editables = 0
  for (const indicador of tablero.indicadores) {
    indicador.editables.forEach((editable, i) => {
      if (!editable) return
      editables++
      if (indicador.motivos[i] === 'autorizado') autorizados.add(i + 1)
    })
  }

  let texto: string
  if (abierto && vigencia.abiertoAhora) {
    texto = `${infoBimestre(abierto).nombre} (${infoBimestre(abierto).meses}) abierto${hasta ? ` hasta el ${hasta}` : ''}.`
  } else if (abierto) {
    texto = `El plazo del ${infoBimestre(abierto).nombre.toLowerCase()} venció${hasta ? ` el ${hasta}` : ''}.`
  } else {
    texto = 'No hay bimestre abierto para reportar.'
  }
  let detalle: string
  if (!administrador && tablero.indicadores.length === 0) {
    // El aviso de abajo explica que todavía no tiene indicadores asignados.
    detalle = ''
  } else if (administrador) {
    detalle = 'Planeación ve todos los indicadores en solo lectura; los valores los diligencian los responsables.'
  } else if (editables > 0) {
    const extra = autorizados.size
      ? ` Tiene autorización para editar: ${[...autorizados].map((b) => `bimestre ${b}`).join(', ')}.`
      : ''
    detalle = `Escriba el avance en las casillas con campo: se guarda al salir de la casilla o con Enter.${extra}`
  } else {
    detalle = 'Sus indicadores se muestran en solo lectura.'
  }
  return (
    <div className="pai-aviso-bimestre" role="note">
      <p className="mb-0">
        <strong>{texto}</strong> {detalle}
      </p>
    </div>
  )
}

function Leyenda() {
  return (
    <div className="pai-leyenda">
      <p className="pai-leyenda-titulo" id="pai-leyenda-titulo">
        Colores del avance:
      </p>
      <ul className="pai-leyenda-lista" aria-labelledby="pai-leyenda-titulo">
        {LEYENDA_AVANCE.map((item) => (
          <li key={item.clase} className="pai-leyenda-item">
            <span className={`pai-leyenda-muestra pai-casilla-${item.clase}`} aria-hidden="true" />
            <strong>{item.nombre}</strong>: {item.descripcion}
          </li>
        ))}
        <li className="pai-leyenda-item">
          <span className="pai-leyenda-muestra pai-leyenda-abierta" aria-hidden="true" />
          <strong>Borde magenta</strong>: bimestre abierto
        </li>
      </ul>
    </div>
  )
}
