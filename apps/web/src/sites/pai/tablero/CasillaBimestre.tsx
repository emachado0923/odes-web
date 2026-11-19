/**
 * Casilla de un bimestre en la fila del indicador: meta, avance y % con el
 * color de su clase (completo, parcial, sin avance, sin meta, futuro; ver
 * presentacion.ts).
 *
 * Si `indicador.editables[b - 1]` (bandera del servidor; nunca se recalcula),
 * el avance es un campo de texto numérico (es-CO: coma decimal) que se guarda
 * al salir de él o con Enter (Escape deshace lo escrito). El PUT lleva el
 * CSRF del cliente y el actualizadoEn (concurrencia) que tenía la casilla
 * cuando el usuario empezó a escribir: si mientras tanto llega otro valor del
 * servidor (tablero recargado), el guardado da 409 en vez de pisarlo. Si la
 * fila espera un token nuevo (la primera evidencia del bimestre creó su
 * reporte), el guardado espera a que llegue (tokenAlDia).
 *
 * El estado (guardando / guardado / error / conflicto) se anuncia con
 * aria-live. Un 409 (otra persona guardó antes) o un 403 (la casilla dejó de
 * ser editable) recargan el tablero (onConflicto) y lo explican; el aviso del
 * 409, que dice qué valor no se guardó, queda hasta que se vuelve a escribir
 * o se pulsa Escape. Un 401 conserva lo escrito para volver a guardar después
 * de iniciar sesión. Mientras el PUT va en camino, la casilla no cuenta como
 * "sin guardar" (registro de cambios: seguir / esperarGuardados).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { infoBimestre, type IndicadorTableroPai, type NumeroBimestre, type RespuestaReportePai } from '../api-pai'
import { useCambiosPendientes, useRegistroCambios } from '../componentes/cambiosPendientes'
import { esErrorPai, mensajeDe } from '../datos/errores'
import { formatoNumero } from '../datos/formatos'
import { useClientePai } from '../sesion/contexto'
import { claseCasilla, descripcionCasilla, escalaDe, leerAvance, textoEditable, textoPorcentaje } from './presentacion'

export interface PropsCasillaBimestre {
  indicador: IndicadorTableroPai
  bimestre: NumeroBimestre
  onGuardado: (respuesta: RespuestaReportePai) => void
  /** El servidor rechazó el guardado por un cambio de estado (409, 403): volver a pedir el tablero. */
  onConflicto?: () => void
  /** Es el bimestre abierto de la vigencia (se resalta). */
  abierto?: boolean
  /**
   * Si la casilla espera un token de concurrencia nuevo (p. ej., la primera
   * evidencia creó el reporte y el tablero se está recargando), la promesa
   * de ese token; undefined al resolverse = no se supo (se usa el que hay).
   * null = no hay nada que esperar.
   */
  tokenAlDia?: TokenAlDia
}

export type TokenAlDia = (indicadorId: number, bimestre: NumeroBimestre) => Promise<string | null | undefined> | null

export default function CasillaBimestre({
  indicador,
  bimestre,
  onGuardado,
  onConflicto,
  abierto = false,
  tokenAlDia,
}: PropsCasillaBimestre) {
  const i = bimestre - 1
  const clase = claseCasilla(indicador, bimestre)
  const clases = ['pai-casilla', `pai-casilla-${clase}`]
  if (abierto) clases.push('pai-casilla-abierta')
  if (indicador.editables[i]) {
    clases.push('pai-casilla-editable')
    return (
      <div className={clases.join(' ')}>
        <CampoAvance
          indicador={indicador}
          bimestre={bimestre}
          onGuardado={onGuardado}
          onConflicto={onConflicto}
          abierto={abierto}
          tokenAlDia={tokenAlDia}
        />
      </div>
    )
  }
  const avance = indicador.avances[i]
  return (
    <div className={clases.join(' ')}>
      <span className="pai-solo-lector">{descripcionCasilla(indicador, bimestre)}</span>
      <div className="pai-casilla-contenido" aria-hidden="true">
        <span className="pai-casilla-bimestre" title={`${infoBimestre(bimestre).nombre}, ${infoBimestre(bimestre).meses}`}>
          B{bimestre}
          {abierto && <span className="pai-casilla-marca">abierto</span>}
        </span>
        <span className="pai-casilla-meta">Meta {formatoNumero(indicador.metas[i])}</span>
        <span className="pai-casilla-avance">{avance === null ? '—' : formatoNumero(avance)}</span>
        <span className="pai-casilla-porcentaje">{textoPorcentaje(clase, indicador.porcentajes[i])}</span>
      </div>
    </div>
  )
}

type FaseCampo = 'inactivo' | 'guardando' | 'guardado' | 'error' | 'conflicto'

type PropsCampo = Required<Pick<PropsCasillaBimestre, 'indicador' | 'bimestre' | 'onGuardado' | 'abierto'>> &
  Pick<PropsCasillaBimestre, 'onConflicto' | 'tokenAlDia'>

function CampoAvance({ indicador, bimestre, onGuardado, onConflicto, abierto, tokenAlDia }: PropsCampo) {
  const cliente = useClientePai()
  const registro = useRegistroCambios()
  const i = bimestre - 1
  const info = infoBimestre(bimestre)
  const clase = claseCasilla(indicador, bimestre)
  const id = useId()
  const base = textoEditable(indicador.avances[i])
  const tokenFila = indicador.actualizadoEn[i]
  const [texto, setTexto] = useState(base)
  const [baseVista, setBaseVista] = useState(base)
  const [tokenVisto, setTokenVisto] = useState(tokenFila)
  /** Token de la casilla cuando el usuario empezó a escribir (null dentro = no había reporte). */
  const [tokenEdicion, setTokenEdicion] = useState<{ token: string | null } | null>(null)
  const [fase, setFase] = useState<FaseCampo>('inactivo')
  const [mensaje, setMensaje] = useState('')

  // El valor del servidor cambió (otra fila guardada, tablero recargado):
  // se adopta si no hay cambios propios sin guardar; si los hay, se conservan
  // con el token con que se empezaron a escribir.
  if (base !== baseVista || tokenFila !== tokenVisto) {
    setBaseVista(base)
    setTokenVisto(tokenFila)
    if (texto === baseVista && fase !== 'guardando') {
      setTexto(base)
      setTokenEdicion(null)
    }
  }

  const sucio = texto.trim() !== baseVista
  const marcarAhora = useCambiosPendientes(sucio && fase !== 'guardando')
  // El valor del servidor más reciente, para cuando termina un guardado (pudo cambiar mientras tanto).
  const baseActual = useRef(baseVista)
  useEffect(() => {
    baseActual.current = baseVista
  })

  function limpiarAviso() {
    if (fase === 'guardado' || fase === 'error' || fase === 'conflicto') {
      setFase('inactivo')
      setMensaje('')
    }
  }

  async function guardar() {
    if (fase === 'guardando') return
    const lectura = leerAvance(texto)
    if (!lectura.ok) {
      setFase('error')
      setMensaje(lectura.mensaje)
      return
    }
    if (!sucio || lectura.valor === indicador.avances[i]) {
      // Sin cambios (o el mismo número escrito de otra forma). El aviso de un
      // conflicto se queda: es el único lugar donde se ve el valor descartado.
      setTexto(baseVista)
      setTokenEdicion(null)
      if (fase === 'error') {
        setFase('inactivo')
        setMensaje('')
      }
      return
    }
    const escrito = texto.trim()
    const espera = tokenAlDia?.(indicador.id, bimestre) ?? null
    const tokenInicial = tokenEdicion ? tokenEdicion.token : tokenFila
    setFase('guardando')
    setMensaje('Guardando…')
    // Ya no es un cambio "sin guardar": va en camino (Cerrar sesión espera a que termine).
    marcarAhora(false)
    const peticion = (async () => {
      let token = tokenInicial
      if (espera) {
        const fresco = await espera
        if (fresco !== undefined) token = fresco
      }
      return cliente.guardarReporte(indicador.id, bimestre, { avance: lectura.valor, actualizadoEn: token })
    })()
    registro.seguir(peticion)
    try {
      const respuesta = await peticion
      const guardado = textoEditable(respuesta.reporte.avance)
      marcarAhora(false)
      setTexto(guardado)
      setBaseVista(guardado)
      setTokenEdicion(null)
      setFase('guardado')
      setMensaje('Guardado')
      onGuardado(respuesta)
    } catch (error) {
      if (esErrorPai(error) && error.estado === 409) {
        marcarAhora(false)
        setFase('conflicto')
        setTexto(baseActual.current)
        setTokenEdicion(null)
        setMensaje(`Otra persona cambió este avance. Se cargó el valor actual; el suyo (${escrito}) no se guardó.`)
        onConflicto?.()
        return
      }
      // Lo escrito se conserva: sigue sin guardar.
      marcarAhora(true)
      setFase('error')
      if (esErrorPai(error) && error.estado === 403) {
        setMensaje(`${mensajeDe(error)} No se guardó.`)
        onConflicto?.()
      } else if (esErrorPai(error) && error.estado === 401) {
        setMensaje('La sesión venció: inicie sesión y vuelva a guardar.')
      } else if (esErrorPai(error) && error.campos.avance) {
        setMensaje(error.campos.avance)
      } else {
        setMensaje(`${mensajeDe(error)} No se guardó.`)
      }
    }
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter') {
      evento.preventDefault()
      void guardar()
    } else if (evento.key === 'Escape' && (sucio || fase === 'error' || fase === 'conflicto')) {
      // Deshace lo escrito (o quita el aviso) sin cerrar nada más.
      evento.stopPropagation()
      setTexto(baseVista)
      setTokenEdicion(null)
      setFase('inactivo')
      setMensaje('')
    }
  }

  return (
    <>
      <span className="pai-casilla-bimestre" aria-hidden="true" title={`${info.nombre}, ${info.meses}`}>
        B{bimestre}
        {abierto && <span className="pai-casilla-marca">abierto</span>}
      </span>
      <span className="pai-casilla-meta" id={`${id}-meta`}>
        Meta {formatoNumero(indicador.metas[i])}
      </span>
      <label className="pai-casilla-etiqueta" htmlFor={`${id}-campo`}>
        Avance
        <span className="pai-solo-lector">
          {' '}
          de {indicador.codigo} en el {info.nombre.toLowerCase()} ({info.meses})
          {escalaDe(indicador) === '0-1' ? ', en escala de 0 a 1 (1 = 100 %)' : ''}
        </span>
      </label>
      <input
        id={`${id}-campo`}
        className="form-control form-control-sm pai-casilla-campo"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={texto}
        readOnly={fase === 'guardando'}
        aria-busy={fase === 'guardando' || undefined}
        aria-invalid={fase === 'error' || undefined}
        aria-describedby={`${id}-meta ${id}-porcentaje ${id}-estado`}
        onChange={(evento) => {
          // El token con que se empezó a escribir (si llega otro valor, el guardado dará 409 en vez de pisarlo).
          if (!sucio && tokenEdicion === null) setTokenEdicion({ token: tokenFila })
          setTexto(evento.target.value)
          limpiarAviso()
        }}
        onBlur={() => void guardar()}
        onKeyDown={alTeclear}
      />
      <span className="pai-casilla-porcentaje" id={`${id}-porcentaje`}>
        <span className="pai-solo-lector">Porcentaje:</span> {textoPorcentaje(clase, indicador.porcentajes[i])}
      </span>
      <span className={`pai-casilla-estado pai-casilla-estado-${fase}`} id={`${id}-estado`} aria-live="polite">
        {mensaje}
      </span>
    </>
  )
}
