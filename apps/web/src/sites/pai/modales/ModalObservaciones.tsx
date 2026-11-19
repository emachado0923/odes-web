/**
 * Modal Observaciones (ModalPai: foco atrapado, Escape): los textos de la
 * ficha de un indicador por bimestre (pestañas PestanasBimestre).
 *
 * Carga la ficha (cliente.obtenerFicha). Si el bimestre es editable (bandera
 * del servidor), formulario con logros, observaciones y dificultades,
 * riesgo materializado (Sí/No) con numeral y descripción solo cuando es
 * "Sí", fuentes de verificación y Guardar (PUT solo con los textos y el
 * actualizadoEn del reporte). Avisa de los cambios sin guardar antes de
 * cerrar o de cambiar de bimestre (y a la barra, con useCambiosPendientes).
 * Si no es editable, lectura.
 *
 * Errores: 400 con campos -> junto a cada campo; 409 (otra persona guardó)
 * -> se vuelve a pedir la ficha, lo escrito se conserva y se muestra lo que
 * quedó guardado para comparar; 403 -> ya no se puede editar (se recarga el
 * tablero); 401 -> el ingreso aparece encima y lo escrito sigue aquí.
 *
 * La ficha es una foto: si la fila del tablero trae un token más nuevo para
 * el bimestre (p. ej., la casilla de avance terminó de guardarse después de
 * abrir el modal), se vuelve a pedir en segundo plano, conservando lo
 * escrito, para no dar un 409 falso de "otra persona".
 *
 * Foco: al pulsar Guardar pasa al estado del pie ("Guardando…", luego
 * "Se guardaron…"), porque el botón se deshabilita; un error lo lleva al
 * aviso; "Seguir editando" lo devuelve a donde estaba y "Descartar cambios"
 * a la pestaña del bimestre elegido.
 */
import { useEffect, useId, useRef, useState } from 'react'
import {
  LIMITES_PAI,
  infoBimestre,
  type FichaIndicadorPai,
  type IndicadorTableroPai,
  type NumeroBimestre,
  type ReporteBimestrePai,
  type RespuestaReportePai,
} from '../api-pai'
import { useCambiosPendientes } from '../componentes/cambiosPendientes'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { esErrorPai, mensajeDe } from '../datos/errores'
import { formatoNumero } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { OrigenReporte, TextosReporte } from '../ficha/piezasReporte'
import { useSesionPai } from '../sesion/contexto'
import { claseReporte, textoMotivo, textoPorcentaje } from '../tablero/presentacion'
import {
  ETIQUETAS_OBSERVACIONES,
  datosObservaciones,
  erroresDelServidor,
  hayCambios,
  validarObservaciones,
  valoresDe,
  type CampoObservaciones,
  type ValoresObservaciones,
} from './formularioObservaciones'
import { idPestana } from './idsModales'
import PestanasBimestre from './PestanasBimestre'
import '../tablero/tablero-pai.css'
import './modales-pai.css'

export interface PropsModalObservaciones {
  indicador: IndicadorTableroPai
  bimestreInicial: NumeroBimestre
  onCerrar: () => void
  onGuardado: (respuesta: RespuestaReportePai) => void
  /** El servidor rechazó el guardado por un cambio de estado (409, 403): volver a pedir el tablero. */
  onConflicto?: () => void
}

interface Edicion {
  bimestre: NumeroBimestre
  valores: ValoresObservaciones
  /** Lo guardado en el servidor (para saber si hay cambios). */
  base: ValoresObservaciones
}

type Aviso =
  | { tipo: 'exito'; texto: string }
  | { tipo: 'error'; texto: string }
  | { tipo: 'conflicto'; texto: string; guardado: ReporteBimestrePai }

type Confirmacion = { accion: 'cerrar' } | { accion: 'bimestre'; bimestre: NumeroBimestre }

function conReporte(ficha: FichaIndicadorPai, reporte: ReporteBimestrePai): FichaIndicadorPai {
  return { ...ficha, bimestres: ficha.bimestres.map((r) => (r.bimestre === reporte.bimestre ? reporte : r)) }
}

export default function ModalObservaciones({
  indicador,
  bimestreInicial,
  onCerrar,
  onGuardado,
  onConflicto,
}: PropsModalObservaciones) {
  const { cliente, sesion } = useSesionPai()
  const rol = sesion?.rol ?? 'responsable'
  const id = useId()
  const { estado, recargar, setDatos } = useCarga(
    (signal) => cliente.obtenerFicha(indicador.id, signal),
    `ficha-${indicador.id}`,
  )
  const ficha = estado.fase === 'listo' ? estado.datos : null
  const [bimestre, setBimestre] = useState<NumeroBimestre>(bimestreInicial)
  const reporte = ficha?.bimestres[bimestre - 1] ?? null
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [errores, setErrores] = useState<Partial<Record<CampoObservaciones, string>>>({})
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const botonConfirmar = useRef<HTMLButtonElement>(null)
  const pestanaElegida = useRef<HTMLButtonElement>(null)
  const refAviso = useRef<HTMLDivElement>(null)
  const refEstado = useRef<HTMLParagraphElement>(null)
  const refGuardar = useRef<HTMLButtonElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)
  /** Lo que tenía el foco cuando apareció la confirmación (vuelve ahí con "Seguir editando"). */
  const origenConfirmacion = useRef<HTMLElement | null>(null)

  // Formulario del bimestre elegido (al cargar la ficha o al cambiar de pestaña).
  if (reporte && (!edicion || edicion.bimestre !== bimestre)) {
    const valores = valoresDe(reporte)
    setEdicion({ bimestre, valores, base: valores })
  }

  const editable = reporte?.editable ?? false
  const sucio = editable && edicion !== null && edicion.bimestre === bimestre && hayCambios(edicion.valores, edicion.base)
  useCambiosPendientes(sucio)

  useEffect(() => {
    if (confirmacion) botonConfirmar.current?.focus()
  }, [confirmacion])

  // El botón Guardar está abajo y el formulario es largo: un error o un conflicto se trae a la vista y,
  // si el foco no está en un campo (se pulsó Guardar), recibe el foco.
  useEffect(() => {
    if (!aviso || aviso.tipo === 'exito') return
    refAviso.current?.scrollIntoView?.({ block: 'nearest' })
    const enfocado = document.activeElement
    const enCampo = enfocado instanceof HTMLElement && enfocado.matches('textarea, input') && refPanel.current?.contains(enfocado)
    if (!enCampo) refAviso.current?.focus({ preventScroll: true })
  }, [aviso])

  // La fila del tablero tiene un token más nuevo que esta ficha (la casilla guardó después de cargarla):
  // se vuelve a pedir la ficha, conservando lo escrito.
  const tokenFila = indicador.actualizadoEn[bimestre - 1]
  const tokenFicha = reporte ? reporte.actualizadoEn : undefined
  const tokenPedido = useRef<string | null>(null)
  useEffect(() => {
    if (tokenFicha === undefined || tokenFila === null || guardando) return
    if (tokenFicha !== null && tokenFila <= tokenFicha) return
    const clave = `${bimestre}:${tokenFila}`
    if (tokenPedido.current === clave) return
    tokenPedido.current = clave
    const b = bimestre
    cliente
      .obtenerFicha(indicador.id)
      .then((nueva) => {
        const guardado = nueva.bimestres[b - 1]
        setDatos(() => nueva)
        setEdicion((actual) => {
          if (!actual || actual.bimestre !== b) return actual
          const base = valoresDe(guardado)
          // Sin cambios propios: se muestra lo guardado; con cambios, se conservan.
          return hayCambios(actual.valores, actual.base) ? { ...actual, base } : { bimestre: b, valores: base, base }
        })
      })
      .catch(() => {
        // Se conserva la ficha que había; si hace falta, el 409 lo explicará al guardar.
      })
  }, [tokenFila, tokenFicha, bimestre, guardando, cliente, indicador.id, setDatos])

  function cambiarValor<K extends CampoObservaciones>(campo: K, valor: ValoresObservaciones[K]) {
    setEdicion((actual) => (actual ? { ...actual, valores: { ...actual.valores, [campo]: valor } } : actual))
    if (errores[campo]) setErrores((previos) => ({ ...previos, [campo]: undefined }))
    if (aviso?.tipo === 'exito') setAviso(null)
  }

  function irABimestre(siguiente: NumeroBimestre) {
    setBimestre(siguiente)
    setEdicion(null)
    setErrores({})
    setAviso(null)
    setConfirmacion(null)
  }

  function pedirConfirmacion(nueva: Confirmacion) {
    origenConfirmacion.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmacion(nueva)
  }

  function pedirBimestre(siguiente: NumeroBimestre) {
    if (siguiente === bimestre) return
    if (sucio) pedirConfirmacion({ accion: 'bimestre', bimestre: siguiente })
    else irABimestre(siguiente)
  }

  function pedirCerrar() {
    if (guardando) return
    if (sucio) pedirConfirmacion({ accion: 'cerrar' })
    else onCerrar()
  }

  function seguirEditando() {
    const origen = origenConfirmacion.current
    setConfirmacion(null)
    // El botón desaparece: el foco vuelve a donde estaba (o a la pestaña del bimestre).
    const disponible = origen?.isConnected && !(origen as HTMLButtonElement).disabled && origen !== botonConfirmar.current
    ;(disponible ? origen : pestanaElegida.current)?.focus()
  }

  function confirmarDescarte() {
    if (!confirmacion) return
    if (confirmacion.accion === 'cerrar') {
      setConfirmacion(null)
      onCerrar()
    } else {
      irABimestre(confirmacion.bimestre)
      // Las seis pestañas siempre existen: el foco pasa a la elegida.
      document.getElementById(idPestana(id, confirmacion.bimestre))?.focus()
    }
  }

  async function guardar() {
    if (!ficha || !reporte || !edicion || guardando) return
    const encontrados = validarObservaciones(edicion.valores)
    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados)
      setAviso({ tipo: 'error', texto: 'Revise los campos marcados.' })
      return
    }
    // Guardar se deshabilita mientras guarda: el foco pasa al estado del pie (no se pierde en <body>).
    if (document.activeElement === refGuardar.current) refEstado.current?.focus()
    setGuardando(true)
    setAviso(null)
    setErrores({})
    try {
      const respuesta = await cliente.guardarReporte(
        indicador.id,
        bimestre,
        datosObservaciones(edicion.valores, reporte.actualizadoEn),
      )
      setDatos((actual) => conReporte(actual, respuesta.reporte))
      const guardados = valoresDe(respuesta.reporte)
      setEdicion({ bimestre, valores: guardados, base: guardados })
      setAviso({ tipo: 'exito', texto: `Se guardaron las observaciones del ${infoBimestre(bimestre).nombre.toLowerCase()}.` })
      onGuardado(respuesta)
    } catch (error) {
      if (esErrorPai(error) && error.estado === 409) {
        await adoptarVersionGuardada(error.message)
      } else if (esErrorPai(error) && error.estado === 403) {
        setAviso({ tipo: 'error', texto: `${mensajeDe(error)} Sus cambios no se guardaron.` })
        onConflicto?.()
      } else if (esErrorPai(error) && error.estado === 401) {
        setAviso({ tipo: 'error', texto: 'La sesión venció. Inicie sesión y vuelva a pulsar Guardar: lo escrito sigue aquí.' })
      } else if (esErrorPai(error) && error.estado === 400 && Object.keys(error.campos).length > 0) {
        setErrores(erroresDelServidor(error.campos))
        setAviso({ tipo: 'error', texto: mensajeDe(error) })
      } else {
        setAviso({ tipo: 'error', texto: `${mensajeDe(error)} Sus cambios no se guardaron.` })
      }
    } finally {
      setGuardando(false)
    }
  }

  /** 409: trae la versión guardada; lo escrito se conserva y se puede volver a guardar encima. */
  async function adoptarVersionGuardada(mensaje: string) {
    onConflicto?.()
    try {
      const nueva = await cliente.obtenerFicha(indicador.id)
      const guardado = nueva.bimestres[bimestre - 1]
      setDatos(() => nueva)
      setEdicion((actual) => (actual ? { ...actual, base: valoresDe(guardado) } : actual))
      setAviso({
        tipo: 'conflicto',
        texto:
          'Otra persona guardó este reporte mientras usted lo editaba. Sus cambios siguen en el formulario: compárelos con lo guardado y pulse Guardar para reemplazarlo.',
        guardado,
      })
    } catch (error) {
      setAviso({ tipo: 'error', texto: `${mensaje} ${mensajeDe(error)}` })
    }
  }

  const titulo = (
    <>
      Observaciones · <span className="pai-codigo">{indicador.codigo}</span>
    </>
  )

  const pie = (
    <>
      {/* Junto a Guardar (el formulario puede estar desplazado y el principio del cuerpo no se ve). */}
      <p className="pai-pie-estado" aria-live="polite" tabIndex={-1} ref={refEstado}>
        {guardando ? 'Guardando…' : aviso?.tipo === 'exito' ? aviso.texto : ''}
      </p>
      <button type="button" className="btn btn-outline-neutral" onClick={pedirCerrar} disabled={guardando}>
        Cerrar
      </button>
      {editable && reporte && (
        <button
          ref={refGuardar}
          type="button"
          className="btn btn-primary"
          onClick={() => void guardar()}
          disabled={guardando || !sucio}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      )}
    </>
  )

  return (
    <ModalPai
      abierto
      titulo={titulo}
      onCerrar={pedirCerrar}
      pie={pie}
      tamano="lg"
      bloqueado={guardando}
      enfoqueInicial={pestanaElegida}
    >
      <p className="pai-modal-indicador">{indicador.nombre}</p>
      <PestanasBimestre
        id={id}
        idPanel={`${id}-panel`}
        bimestre={bimestre}
        onCambiar={pedirBimestre}
        deshabilitadas={guardando}
        refElegida={pestanaElegida}
        marca={(b) =>
          indicador.editables[b - 1] ? <span className="pai-pestana-marca" aria-hidden="true" title="Editable" /> : null
        }
        descripcion={(b) => (indicador.editables[b - 1] ? ', editable' : '')}
      />
      <div
        ref={refPanel}
        className="pai-panel-bimestre"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={idPestana(id, bimestre)}
      >
        {confirmacion && (
          <div className="alert alert-warning pai-confirmacion" role="alert">
            <p className="mb-2">
              Tiene cambios sin guardar en el {infoBimestre(bimestre).nombre.toLowerCase()}.{' '}
              {confirmacion.accion === 'cerrar' ? '¿Cerrar sin guardarlos?' : '¿Descartarlos y cambiar de bimestre?'}
            </p>
            <div className="d-flex flex-wrap gap-2">
              <button ref={botonConfirmar} type="button" className="btn btn-outline-danger btn-sm" onClick={confirmarDescarte}>
                Descartar cambios
              </button>
              <button type="button" className="btn btn-outline-neutral btn-sm" onClick={seguirEditando}>
                Seguir editando
              </button>
            </div>
          </div>
        )}
        {estado.fase === 'cargando' && <Cargando texto="Cargando la ficha…" />}
        {estado.fase === 'error' && (
          <ErrorCarga titulo="No se pudo cargar la ficha." mensaje={estado.mensaje} onReintentar={recargar} />
        )}
        {reporte && (
          <>
            <ResumenBimestre reporte={reporte} />
            <p className="pai-motivo">{textoMotivo(reporte.motivo, rol)}</p>
            <OrigenReporte reporte={reporte} />
            {aviso && aviso.tipo !== 'exito' && (
              <div
                ref={refAviso}
                className={`alert ${aviso.tipo === 'conflicto' ? 'alert-warning' : 'alert-danger'}`}
                role="alert"
                tabIndex={-1}
              >
                <p className="mb-0">{aviso.texto}</p>
                {aviso.tipo === 'conflicto' && (
                  <details className="mt-2">
                    <summary>Ver lo que quedó guardado</summary>
                    <TextosReporte reporte={aviso.guardado} />
                  </details>
                )}
              </div>
            )}
            {editable && edicion ? (
              <FormularioObservaciones
                id={id}
                valores={edicion.valores}
                errores={errores}
                deshabilitado={guardando}
                riesgos={ficha?.riesgos ?? []}
                onCambiar={cambiarValor}
                onEnviar={() => void guardar()}
              />
            ) : (
              <TextosReporte reporte={reporte} />
            )}
          </>
        )}
      </div>
    </ModalPai>
  )
}

function ResumenBimestre({ reporte }: { reporte: ReporteBimestrePai }) {
  const clase = claseReporte(reporte)
  const info = infoBimestre(reporte.bimestre)
  return (
    <dl className="pai-resumen-bimestre">
      <div>
        <dt>Bimestre</dt>
        <dd>
          {info.nombre} · {info.meses}
        </dd>
      </div>
      <div>
        <dt>Meta</dt>
        <dd>{formatoNumero(reporte.meta)}</dd>
      </div>
      <div>
        <dt>Avance</dt>
        <dd>{formatoNumero(reporte.avance)}</dd>
      </div>
      <div>
        <dt>%</dt>
        <dd className={`pai-texto-${clase}`}>{textoPorcentaje(clase, reporte.porcentaje)}</dd>
      </div>
    </dl>
  )
}

interface PropsFormulario {
  id: string
  valores: ValoresObservaciones
  errores: Partial<Record<CampoObservaciones, string>>
  deshabilitado: boolean
  riesgos: FichaIndicadorPai['riesgos']
  onCambiar: <K extends CampoObservaciones>(campo: K, valor: ValoresObservaciones[K]) => void
  onEnviar: () => void
}

function FormularioObservaciones({ id, valores, errores, deshabilitado, riesgos, onCambiar, onEnviar }: PropsFormulario) {
  const area = (campo: 'logros' | 'observaciones' | 'descripcionRiesgo' | 'fuentesVerificacion', filas: number) => {
    const idCampo = `${id}-${campo}`
    const error = errores[campo]
    return (
      <div className="mb-3">
        <label className="form-label" htmlFor={idCampo}>
          {ETIQUETAS_OBSERVACIONES[campo]}
        </label>
        <textarea
          id={idCampo}
          className={`form-control${error ? ' is-invalid' : ''}`}
          rows={filas}
          maxLength={LIMITES_PAI.maxTexto}
          value={valores[campo]}
          readOnly={deshabilitado}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idCampo}-error` : undefined}
          onChange={(evento) => onCambiar(campo, evento.target.value)}
        />
        {error && (
          <div className="invalid-feedback d-block" id={`${idCampo}-error`}>
            {error}
          </div>
        )}
      </div>
    )
  }
  const errorRiesgo = errores.riesgoMaterializado
  const errorNumeral = errores.numeralRiesgo
  const numerales = riesgos.flatMap((r) => (r.numeral === null ? [] : [String(r.numeral)]))
  return (
    <form
      className="pai-formulario-observaciones"
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        onEnviar()
      }}
    >
      {area('logros', 4)}
      {area('observaciones', 3)}
      <fieldset className="mb-3" aria-describedby={errorRiesgo ? `${id}-riesgo-error` : undefined}>
        <legend className="form-label fs-6">{ETIQUETAS_OBSERVACIONES.riesgoMaterializado}</legend>
        {(['SI', 'NO'] as const).map((opcion) => (
          <div className="form-check form-check-inline" key={opcion}>
            <input
              className="form-check-input"
              type="radio"
              id={`${id}-riesgo-${opcion}`}
              name={`${id}-riesgo`}
              value={opcion}
              checked={valores.riesgoMaterializado === opcion}
              disabled={deshabilitado}
              onChange={() => onCambiar('riesgoMaterializado', opcion)}
            />
            <label className="form-check-label" htmlFor={`${id}-riesgo-${opcion}`}>
              {opcion === 'SI' ? 'Sí' : 'No'}
            </label>
          </div>
        ))}
        {errorRiesgo && (
          <div className="invalid-feedback d-block" id={`${id}-riesgo-error`}>
            {errorRiesgo}
          </div>
        )}
      </fieldset>
      {valores.riesgoMaterializado === 'SI' && (
        <div className="pai-riesgo-materializado">
          <div className="mb-3">
            <label className="form-label" htmlFor={`${id}-numeral`}>
              {ETIQUETAS_OBSERVACIONES.numeralRiesgo}
            </label>
            <input
              id={`${id}-numeral`}
              className={`form-control${errorNumeral ? ' is-invalid' : ''}`}
              type="text"
              maxLength={LIMITES_PAI.maxNumeralRiesgo}
              value={valores.numeralRiesgo}
              readOnly={deshabilitado}
              aria-invalid={errorNumeral ? true : undefined}
              aria-describedby={[riesgos.length ? `${id}-numeral-ayuda` : '', errorNumeral ? `${id}-numeral-error` : '']
                .filter(Boolean)
                .join(' ') || undefined}
              onChange={(evento) => onCambiar('numeralRiesgo', evento.target.value)}
            />
            {riesgos.length > 0 && (
              <div className="form-text" id={`${id}-numeral-ayuda`}>
                {numerales.length
                  ? `Numerales de los riesgos de esta acción: ${numerales.join(', ')}.`
                  : 'Escriba el numeral del riesgo según la ficha.'}
              </div>
            )}
            {errorNumeral && (
              <div className="invalid-feedback d-block" id={`${id}-numeral-error`}>
                {errorNumeral}
              </div>
            )}
            {riesgos.length > 0 && (
              <details className="pai-riesgos-accion">
                <summary>Ver los riesgos de la acción</summary>
                <ul>
                  {riesgos.map((r) => (
                    <li key={r.id}>{r.texto}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {area('descripcionRiesgo', 3)}
        </div>
      )}
      {area('fuentesVerificacion', 3)}
      <p className="form-text mb-0">Cada texto admite hasta {LIMITES_PAI.maxTexto.toLocaleString('es-CO')} caracteres.</p>
    </form>
  )
}
