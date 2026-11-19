/**
 * Modal Evidencias (ModalPai): las evidencias de un indicador por bimestre
 * (pestañas PestanasBimestre), cargadas con la ficha.
 *
 * - Lista con descarga (cliente.urlEvidencia; el servidor revisa el permiso
 *   y responde el archivo o una URL firmada de 60 s).
 * - Si el bimestre es editable (bandera del servidor): subir arrastrando o
 *   eligiendo archivos, con validación en el navegador (problemaEvidencia:
 *   tipo y 25 MB; máximo LIMITES_PAI.maxEvidenciasPorReporte por bimestre) y
 *   barra de progreso (cliente.subirEvidencia: directo al bucket privado o
 *   multipart); borrar con confirmación.
 * - Avisa el nuevo número de evidencias con onCambio. Un 403 (ya no se
 *   puede editar) vuelve a pedir la ficha y el tablero (onConflicto).
 * - Si se cancela una subida de varios archivos (o la sesión vence, o ya no
 *   se puede editar), los que faltaban se listan como no subidos con el
 *   motivo. Tras cancelar o perder la conexión se vuelve a pedir la ficha: el
 *   servidor pudo alcanzar a guardar el archivo, y la lista y el conteo deben
 *   ser los reales.
 * - Mientras el modal está abierto, soltar un archivo fuera del recuadro no
 *   hace que el navegador lo abra (y salga de la aplicación): dentro del
 *   modal se sube como si se soltara en el recuadro; fuera, se ignora.
 * - Foco: al terminar una subida, si el foco estaba en «Cancelar subida»
 *   (que desaparece) o en el campo de archivo (que se deshabilita al llegar
 *   al máximo), pasa al título de la lista.
 */
import { useEffect, useId, useRef, useState, type DragEvent as ArrastreReact } from 'react'
import {
  ACEPTAR_EVIDENCIAS,
  LIMITES_PAI,
  infoBimestre,
  type EvidenciaPai,
  type FichaIndicadorPai,
  type IndicadorTableroPai,
  type NumeroBimestre,
} from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { problemaEvidencia } from '../datos/clientePai'
import { esAborto, esErrorPai, mensajeDe } from '../datos/errores'
import { useCarga } from '../datos/useCarga'
import { DatosEvidencia } from '../ficha/piezasReporte'
import { useSesionPai } from '../sesion/contexto'
import { plural, textoMotivo } from '../tablero/presentacion'
import { idPestana } from './idsModales'
import PestanasBimestre from './PestanasBimestre'
import '../tablero/tablero-pai.css'
import './modales-pai.css'

export interface PropsModalEvidencias {
  indicador: IndicadorTableroPai
  bimestreInicial: NumeroBimestre
  onCerrar: () => void
  /** Nuevo número de evidencias de (indicador, bimestre) tras subir o borrar. */
  onCambio: (indicadorId: number, bimestre: NumeroBimestre, cantidad: number) => void
  /** El servidor rechazó una subida o un borrado por un cambio de estado (403): volver a pedir el tablero. */
  onConflicto?: () => void
}

interface Rechazo {
  nombre: string
  motivo: string
}

interface Subida {
  nombre: string
  /** 1..total */
  indice: number
  total: number
  porcentaje: number
}

type Aviso = { tipo: 'exito' | 'error'; texto: string }

function conEvidencias(ficha: FichaIndicadorPai, bimestre: NumeroBimestre, evidencias: EvidenciaPai[]): FichaIndicadorPai {
  return {
    ...ficha,
    bimestres: ficha.bimestres.map((r) => (r.bimestre === bimestre ? { ...r, evidencias } : r)),
  }
}

export default function ModalEvidencias({ indicador, bimestreInicial, onCerrar, onCambio, onConflicto }: PropsModalEvidencias) {
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
  const evidencias = reporte?.evidencias ?? []
  const editable = reporte?.editable ?? false
  const disponibles = Math.max(0, LIMITES_PAI.maxEvidenciasPorReporte - evidencias.length)

  const [subida, setSubida] = useState<Subida | null>(null)
  const [rechazos, setRechazos] = useState<Rechazo[]>([])
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [porBorrar, setPorBorrar] = useState<EvidenciaPai | null>(null)
  const [borrando, setBorrando] = useState(false)
  const control = useRef<AbortController | null>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const pestanaElegida = useRef<HTMLButtonElement>(null)
  const tituloLista = useRef<HTMLHeadingElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)
  const refCancelar = useRef<HTMLButtonElement>(null)
  const refArchivos = useRef<HTMLInputElement>(null)
  const ocupado = subida !== null || borrando

  useEffect(() => {
    if (porBorrar) botonBorrar.current?.focus()
  }, [porBorrar])

  // Si el modal se cierra en medio de una subida (p. ej., la sesión venció y se desmontó), se cancela.
  useEffect(() => () => control.current?.abort(), [])

  /**
   * Vuelve a pedir la ficha sin quitar lo que se ve (p. ej., tras un 403: el
   * bimestre dejó de ser editable). Con `avisar`, informa al tablero el
   * número real de evidencias de ese bimestre.
   */
  function refrescarFicha(avisar?: NumeroBimestre) {
    cliente
      .obtenerFicha(indicador.id)
      .then((nueva) => {
        setDatos(() => nueva)
        if (avisar) onCambio(indicador.id, avisar, nueva.bimestres[avisar - 1].evidencias.length)
      })
      .catch(() => {
        // Se conserva lo que había; el aviso del error ya está a la vista.
      })
  }

  // Soltar un archivo fuera del recuadro: sin esto, el navegador lo abre y sale de la aplicación.
  const recibirActual = useRef<(archivos: File[]) => void>(() => undefined)
  useEffect(() => {
    recibirActual.current = recibirArchivos
  })
  useEffect(() => {
    const conArchivos = (evento: DragEvent) => Array.from(evento.dataTransfer?.types ?? []).includes('Files')
    function alArrastrar(evento: DragEvent) {
      if (conArchivos(evento)) evento.preventDefault()
    }
    function alSoltarFuera(evento: DragEvent) {
      // El recuadro ya lo atendió (y llamó a preventDefault).
      if (evento.defaultPrevented || !conArchivos(evento)) return
      evento.preventDefault()
      const modal = refPanel.current?.closest('.modal')
      if (modal && evento.target instanceof Node && modal.contains(evento.target)) {
        recibirActual.current([...(evento.dataTransfer?.files ?? [])])
      }
    }
    document.addEventListener('dragover', alArrastrar)
    document.addEventListener('drop', alSoltarFuera)
    return () => {
      document.removeEventListener('dragover', alArrastrar)
      document.removeEventListener('drop', alSoltarFuera)
    }
  }, [])

  function cambiarBimestre(siguiente: NumeroBimestre) {
    if (ocupado) return
    setBimestre(siguiente)
    setRechazos([])
    setAviso(null)
    setPorBorrar(null)
  }

  function recibirArchivos(archivos: File[]) {
    if (!editable || archivos.length === 0) return
    if (ocupado) {
      setRechazos(archivos.map((archivo) => ({ nombre: archivo.name, motivo: 'Espere a que termine la subida en curso.' })))
      return
    }
    setAviso(null)
    const aceptados: File[] = []
    const rechazados: Rechazo[] = []
    for (const archivo of archivos) {
      const problema = problemaEvidencia(archivo)
      if (problema) rechazados.push({ nombre: archivo.name, motivo: problema })
      else if (aceptados.length >= disponibles) {
        rechazados.push({
          nombre: archivo.name,
          motivo: `Ya se alcanzó el máximo de ${LIMITES_PAI.maxEvidenciasPorReporte} evidencias del bimestre.`,
        })
      } else aceptados.push(archivo)
    }
    setRechazos(rechazados)
    if (aceptados.length > 0) void subir(aceptados)
  }

  async function subir(archivos: File[]) {
    const b = bimestre
    const ctrl = new AbortController()
    control.current = ctrl
    let lista = evidencias
    let subidas = 0
    /** Cancelada o sin conexión: el servidor pudo alcanzar a guardar el archivo en curso. */
    let incierto = false
    const fallidos: Rechazo[] = []
    const noSubidos = (desde: number, motivo: string) => {
      for (const resto of archivos.slice(desde)) fallidos.push({ nombre: resto.name, motivo })
    }
    try {
      for (const [i, archivo] of archivos.entries()) {
        setSubida({ nombre: archivo.name, indice: i + 1, total: archivos.length, porcentaje: 0 })
        try {
          const evidencia = await cliente.subirEvidencia(
            indicador.id,
            b,
            archivo,
            (p) => setSubida((actual) => (actual ? { ...actual, porcentaje: p.total ? Math.round((p.cargado / p.total) * 100) : 0 } : actual)),
            ctrl.signal,
          )
          const nueva = [...lista, evidencia]
          lista = nueva
          subidas++
          setDatos((actual) => conEvidencias(actual, b, nueva))
          onCambio(indicador.id, b, nueva.length)
        } catch (error) {
          if (esAborto(error)) {
            fallidos.push({ nombre: archivo.name, motivo: 'Se canceló la subida.' })
            noSubidos(i + 1, 'No se subió: se canceló la subida.')
            incierto = true
            break
          }
          fallidos.push({ nombre: archivo.name, motivo: mensajeDe(error) })
          if (esErrorPai(error) && error.estado === null) incierto = true
          if (esErrorPai(error) && (error.estado === 401 || error.estado === 403)) {
            noSubidos(
              i + 1,
              error.estado === 401 ? 'No se subió: la sesión venció.' : 'No se subió: ya no se puede editar este bimestre.',
            )
            if (error.estado === 403) {
              refrescarFicha()
              onConflicto?.()
            }
            break
          }
          // 429: el usuario ya tiene el cupo de subidas sin terminar (Retry-After
          // puede ser de varios minutos); los demás archivos fallarían igual.
          if (esErrorPai(error) && error.estado === 429) {
            noSubidos(i + 1, 'No se subió: espere unos minutos y vuelva a intentarlo.')
            break
          }
        }
      }
    } finally {
      control.current = null
      // «Cancelar subida» desaparece y el campo de archivo se deshabilita al llegar al máximo: el foco no se pierde.
      const enfocado = document.activeElement
      const lleno = lista.length >= LIMITES_PAI.maxEvidenciasPorReporte
      if (
        enfocado === refCancelar.current ||
        enfocado === document.body ||
        (lleno && enfocado === refArchivos.current)
      ) {
        tituloLista.current?.focus()
      }
      setSubida(null)
    }
    if (fallidos.length) setRechazos((previos) => [...previos, ...fallidos])
    if (subidas > 0) {
      setAviso({ tipo: 'exito', texto: `Se ${subidas === 1 ? 'subió' : 'subieron'} ${plural(subidas, 'evidencia', 'evidencias')}.` })
    }
    // La lista y el conteo, como quedaron en el servidor.
    if (incierto) refrescarFicha(b)
  }

  async function borrar(evidencia: EvidenciaPai) {
    const b = bimestre
    setBorrando(true)
    setAviso(null)
    try {
      await cliente.borrarEvidencia(evidencia.id)
      const lista = evidencias.filter((e) => e.id !== evidencia.id)
      setDatos((actual) => conEvidencias(actual, b, lista))
      onCambio(indicador.id, b, lista.length)
      setAviso({ tipo: 'exito', texto: `Se borró «${evidencia.nombre}».` })
    } catch (error) {
      setAviso({ tipo: 'error', texto: `No se borró «${evidencia.nombre}»: ${mensajeDe(error)}` })
      if (esErrorPai(error) && (error.estado === 403 || error.estado === 404)) {
        refrescarFicha()
        if (error.estado === 403) onConflicto?.()
      }
    } finally {
      setBorrando(false)
      setPorBorrar(null)
      // El botón que tenía el foco desaparece: el foco pasa al título de la lista.
      tituloLista.current?.focus()
    }
  }

  function alSoltar(evento: ArrastreReact<HTMLDivElement>) {
    evento.preventDefault()
    setArrastrando(false)
    recibirArchivos([...evento.dataTransfer.files])
  }

  const titulo = (
    <>
      Evidencias · <span className="pai-codigo">{indicador.codigo}</span>
    </>
  )
  const pie = (
    <button type="button" className="btn btn-outline-neutral" onClick={onCerrar} disabled={ocupado}>
      Cerrar
    </button>
  )

  return (
    <ModalPai
      abierto
      titulo={titulo}
      onCerrar={onCerrar}
      pie={pie}
      tamano="lg"
      bloqueado={ocupado}
      enfoqueInicial={pestanaElegida}
    >
      <p className="pai-modal-indicador">{indicador.nombre}</p>
      <PestanasBimestre
        id={id}
        idPanel={`${id}-panel`}
        bimestre={bimestre}
        onCambiar={cambiarBimestre}
        deshabilitadas={ocupado}
        refElegida={pestanaElegida}
        marca={(b) => {
          const n = ficha ? ficha.bimestres[b - 1].evidencias.length : indicador.evidencias[b - 1]
          return n ? (
            <span className="pai-insignia pai-insignia-activa" aria-hidden="true">
              {n}
            </span>
          ) : null
        }}
        descripcion={(b) => {
          const n = ficha ? ficha.bimestres[b - 1].evidencias.length : indicador.evidencias[b - 1]
          return `, ${plural(n, 'evidencia', 'evidencias')}${indicador.editables[b - 1] ? ', editable' : ''}`
        }}
      />
      <div
        ref={refPanel}
        className="pai-panel-bimestre"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={idPestana(id, bimestre)}
      >
        {estado.fase === 'cargando' && <Cargando texto="Cargando las evidencias…" />}
        {estado.fase === 'error' && (
          <ErrorCarga titulo="No se pudieron cargar las evidencias." mensaje={estado.mensaje} onReintentar={recargar} />
        )}
        {reporte && (
          <>
            <p className="pai-motivo">{textoMotivo(reporte.motivo, rol)}</p>
            <div aria-live="polite">
              {aviso?.tipo === 'exito' && <div className="alert alert-success py-2">{aviso.texto}</div>}
            </div>
            {aviso?.tipo === 'error' && (
              <div className="alert alert-danger" role="alert">
                {aviso.texto}
              </div>
            )}
            {rechazos.length > 0 && (
              <div className="alert alert-danger" role="alert">
                <p className="fw-bold mb-1">
                  {rechazos.length === 1 ? 'Un archivo no se subió:' : `${rechazos.length} archivos no se subieron:`}
                </p>
                <ul className="mb-0">
                  {rechazos.map((r, i) => (
                    <li key={`${r.nombre}-${i}`}>
                      <span className="pai-evidencia-nombre">{r.nombre}</span>: {r.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <h3 className="h6 mt-3 pai-titulo-lista" ref={tituloLista} tabIndex={-1}>
              Evidencias del {infoBimestre(bimestre).nombre.toLowerCase()} ({evidencias.length} de{' '}
              {LIMITES_PAI.maxEvidenciasPorReporte})
            </h3>
            {evidencias.length === 0 ? (
              <p className="pai-sin-dato">No hay evidencias en este bimestre.</p>
            ) : (
              <ul className="pai-evidencias">
                {evidencias.map((evidencia) => (
                  <li key={evidencia.id} className="pai-evidencia">
                    <div className="pai-evidencia-fila">
                      <DatosEvidencia evidencia={evidencia} url={cliente.urlEvidencia(evidencia.id)} />
                      {editable && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          aria-label={`Borrar ${evidencia.nombre}`}
                          disabled={ocupado || porBorrar !== null}
                          onClick={() => setPorBorrar(evidencia)}
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                    {porBorrar?.id === evidencia.id && (
                      <div className="alert alert-warning pai-confirmacion mt-2 mb-0" role="alert">
                        <p className="mb-2">¿Borrar «{evidencia.nombre}»? No se puede deshacer.</p>
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            ref={botonBorrar}
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={borrando}
                            onClick={() => void borrar(evidencia)}
                          >
                            {borrando ? 'Borrando…' : 'Sí, borrar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-neutral btn-sm"
                            disabled={borrando}
                            onClick={() => {
                              setPorBorrar(null)
                              tituloLista.current?.focus()
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editable && (
              <div
                className={`pai-zona-subida${arrastrando ? ' pai-zona-subida-activa' : ''}`}
                onDragOver={(evento) => {
                  evento.preventDefault()
                  if (!ocupado && disponibles > 0) setArrastrando(true)
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={alSoltar}
              >
                <label className="form-label fw-bold" htmlFor={`${id}-archivos`}>
                  Subir evidencias
                </label>
                <input
                  ref={refArchivos}
                  id={`${id}-archivos`}
                  className="form-control"
                  type="file"
                  multiple
                  accept={ACEPTAR_EVIDENCIAS}
                  disabled={disponibles === 0}
                  aria-describedby={`${id}-archivos-ayuda`}
                  onChange={(evento) => {
                    recibirArchivos([...(evento.target.files ?? [])])
                    evento.target.value = ''
                  }}
                />
                <p className="form-text mb-0" id={`${id}-archivos-ayuda`}>
                  {disponibles === 0
                    ? `Ya hay ${LIMITES_PAI.maxEvidenciasPorReporte} evidencias: borre alguna para subir otra.`
                    : `PDF, imágenes (PNG, JPEG o WebP), Word, Excel o PowerPoint, hasta 25 MB cada uno; puede subir ${plural(disponibles, 'archivo más', 'archivos más')}. También puede arrastrarlos a este recuadro.`}
                </p>
                {subida && (
                  <div className="pai-subida mt-3">
                    <p className="mb-1" aria-live="polite">
                      Subiendo {subida.total > 1 ? `${subida.indice} de ${subida.total}: ` : ''}
                      <span className="pai-evidencia-nombre">{subida.nombre}</span>
                    </p>
                    <p className="pai-subida-porcentaje mb-1" aria-hidden="true">
                      {subida.porcentaje} %
                    </p>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-label={`Progreso de ${subida.nombre}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={subida.porcentaje}
                    >
                      <div className="progress-bar" style={{ width: `${subida.porcentaje}%` }} />
                    </div>
                    <button
                      ref={refCancelar}
                      type="button"
                      className="btn btn-outline-neutral btn-sm mt-2"
                      onClick={() => control.current?.abort()}
                    >
                      Cancelar subida
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ModalPai>
  )
}
