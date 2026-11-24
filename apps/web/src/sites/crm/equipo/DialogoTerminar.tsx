/**
 * Diálogo para terminar una tarea del tablero de una persona. Lo abren el
 * tablero (al pasar una tarjeta a Terminada) y el panel del detalle.
 *
 * - Entregables: si la tarea los pide, hace falta al menos uno y el botón
 *   principal espera a que lo haya; si no, son opcionales. Se validan aquí
 *   (validarArchivo: tipo y tamaño de LIMITES_CRM) antes de subirlos, y se
 *   suben de a uno, con su avance y «Cancelar». Los que ya estaban llegan con
 *   la tarea (apiEquipo.tarea) y se pueden quitar.
 * - Nota opcional para el líder, de hasta LIMITES_CRM.nota caracteres.
 * - «Terminar y avisar a José» llama a apiEquipo.terminar. El mensaje del
 *   aviso del servidor sale con useAvisar (éxito si el correo se envió;
 *   informativo si no) y `alTerminada` cierra y recarga. Un 400 con
 *   campos.entregable se muestra junto a los archivos; un 409 (ya estaba
 *   terminada) o un 404 avisan y llaman a alTerminada(null) para recargar.
 * - `alCambio` se llama cada vez que se sube o se quita un entregable: el
 *   tablero de atrás se pone al día aunque luego se cancele el diálogo.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { ACEPTAR_ARCHIVOS_CRM, LIMITES_CRM, tamanoLegible, type ArchivoCrm, type TareaCrm, type TareaDetalleCrm } from '../api-crm'
import { apiEquipo, ErrorCrmHttp, esCancelacion, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import {
  ariaCampo,
  Campo,
  Cargando,
  Dialogo,
  ErrorCarga,
  formatosLegibles,
  Icono,
  ListaArchivos,
  ProgresoSubida,
  unirConY,
  useAvisar,
  validarArchivo,
  ZonaArchivos,
  type NombreIcono,
} from '../ui'
import { cambioEnElServidor, nombreLider } from './comun'

const MAX_ENTREGABLES = LIMITES_CRM.maxEntregables
const AYUDA_NOTA = 'Opcional. Lo que deba saber de cómo quedó la tarea.'

interface Explicacion {
  tipo: 'obligatorio' | 'listo' | 'opcional'
  icono: NombreIcono
  texto: string
}

export default function DialogoTerminar({
  personaId,
  tarea,
  lider,
  alCerrar,
  alTerminada,
  alCambio,
}: {
  personaId: number
  /** La tarea tal como estaba en el tablero al pedir terminarla. */
  tarea: TareaCrm
  /** Nombre completo del líder, o null si no se pudo saber («el líder»). */
  lider: string | null
  alCerrar: () => void
  /** Terminó (con la tarea como quedó) o ya no se puede terminar (null): hay que cerrar y recargar. */
  alTerminada: (tarea: TareaDetalleCrm | null) => void
  /** Se subió o se quitó un entregable. */
  alCambio: () => void
}) {
  const avisar = useAvisar()
  const id = useId()
  const idExplica = `${id}-explica`
  const idNota = `${id}-nota`
  const detalle = useCarga((signal) => apiEquipo.tarea(personaId, tarea.id, signal), [personaId, tarea.id])

  const [subidos, setSubidos] = useState<ArchivoCrm[]>([])
  const [quitados, setQuitados] = useState<ReadonlySet<number>>(() => new Set())
  const [quitando, setQuitando] = useState<ReadonlySet<number>>(() => new Set())
  const [subida, setSubida] = useState<{ nombre: string; progreso: number } | null>(null)
  const [erroresArchivos, setErroresArchivos] = useState<string[]>([])
  const [errorEntregable, setErrorEntregable] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [errorNota, setErrorNota] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [terminando, setTerminando] = useState(false)

  /** La subida en curso, para cancelarla (también al cerrar el diálogo). */
  const control = useRef<AbortController | null>(null)
  const montado = useRef(false)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      control.current?.abort()
    }
  }, [])

  // Los entregables: los que ya tenía la tarea más los que se subieron aquí, sin los quitados.
  const entregables: ArchivoCrm[] = []
  const vistos = new Set<number>()
  for (const archivo of [...(detalle.datos?.archivos ?? []).filter((a) => a.tipo === 'entregable'), ...subidos]) {
    if (vistos.has(archivo.id) || quitados.has(archivo.id)) continue
    vistos.add(archivo.id)
    entregables.push(archivo)
  }

  const requiere = detalle.datos?.requiereEntregable ?? tarea.requiereEntregable
  // Mientras no llega la tarea, se cuenta con lo que decía el tablero.
  const cuantos = detalle.datos ? entregables.length : Math.max(entregables.length, tarea.entregables)
  const faltaEntregable = requiere && cuantos === 0
  const cupo = Math.max(0, MAX_ENTREGABLES - cuantos)
  const subiendo = subida !== null
  const ocupado = subiendo || terminando
  const nombre = nombreLider(lider)

  // Al empezar o terminar una subida, o al quitar un archivo, el control que tenía el foco se deshabilita o
  // desaparece: el foco pasa al «Cancelar» de la subida o, si no hay, a «Elegir archivos» (o a la nota).
  const raiz = useRef<HTMLDivElement>(null)
  const cantidad = entregables.length
  useEffect(() => {
    const activo = document.activeElement
    const perdido = !activo || activo === document.body || !activo.isConnected || (activo instanceof HTMLButtonElement && activo.disabled)
    if (!perdido || !raiz.current) return
    const destino =
      raiz.current.querySelector<HTMLElement>('.crm-progreso-cancelar') ??
      raiz.current.querySelector<HTMLElement>('.crm-zona button:not(:disabled)') ??
      raiz.current.querySelector<HTMLElement>('textarea')
    destino?.focus()
  }, [subiendo, cantidad])

  let explicacion: Explicacion
  if (requiere && cuantos === 0) {
    explicacion = {
      tipo: 'obligatorio',
      icono: 'info',
      texto: `${nombre.sujeto} pidió un documento al terminar: súbalo aquí. Le llegará adjunto en el correo.`,
    }
  } else if (requiere) {
    explicacion = { tipo: 'listo', icono: 'check', texto: `Ya subió el documento que pidió ${nombre.nombre}. Le llegará adjunto en el correo.` }
  } else {
    explicacion = {
      tipo: 'opcional',
      icono: 'clip',
      texto: `Subir un documento es opcional. Si sube alguno, le llegará ${nombre.a} adjunto en el correo.`,
    }
  }

  const ayudaZona =
    cupo === 0
      ? `Ya subió el máximo de ${MAX_ENTREGABLES} entregables. Quite uno para subir otro.`
      : `${formatosLegibles()}. Hasta ${tamanoLegible(LIMITES_CRM.maxBytesArchivo)} por archivo y ${MAX_ENTREGABLES} entregables por tarea.`

  function elegir(archivos: File[]) {
    if (ocupado) return
    const errores: string[] = []
    const validos: File[] = []
    for (const archivo of archivos) {
      const problema = validarArchivo(archivo, { maxBytes: LIMITES_CRM.maxBytesArchivo })
      if (problema) errores.push(problema)
      else validos.push(archivo)
    }
    const sobran = validos.slice(cupo)
    if (sobran.length > 0) {
      const nombres = unirConY(sobran.map((archivo) => `«${archivo.name}»`))
      errores.push(`Cada tarea admite hasta ${MAX_ENTREGABLES} entregables: no se ${sobran.length === 1 ? 'subió' : 'subieron'} ${nombres}.`)
    }
    setErroresArchivos(errores)
    setErrorEntregable(null)
    setErrorGeneral(null)
    const aSubir = validos.slice(0, cupo)
    if (aSubir.length > 0) void subir(aSubir)
  }

  /** Sube los archivos de a uno; «Cancelar» corta la subida en curso y las que faltan. */
  async function subir(archivos: File[]) {
    for (const [i, archivo] of archivos.entries()) {
      const actual = new AbortController()
      control.current = actual
      setSubida({ nombre: archivo.name, progreso: 0 })
      try {
        const nuevo = await apiEquipo.subirEntregable(personaId, tarea.id, archivo, {
          signal: actual.signal,
          alProgreso: (progreso) => {
            if (montado.current && control.current === actual) setSubida({ nombre: archivo.name, progreso })
          },
        })
        if (!montado.current) return
        setSubidos((previos) => [...previos, nuevo])
        alCambio()
      } catch (error) {
        if (!montado.current) return
        if (esCancelacion(error)) {
          const resto = archivos.length - i - 1
          const otros = resto === 1 ? ' No se subió el otro archivo.' : resto > 1 ? ` No se subieron los otros ${resto} archivos.` : ''
          avisar(`Se canceló la subida.${otros}`, 'info')
          break
        }
        setErroresArchivos((previos) => [...previos, `No se pudo subir «${archivo.name}». ${mensajeDe(error)}`])
        if (cambioEnElServidor(error)) break
      } finally {
        if (control.current === actual) control.current = null
      }
    }
    if (montado.current) setSubida(null)
  }

  async function quitar(archivo: ArchivoCrm) {
    if (terminando || quitando.has(archivo.id)) return
    setQuitando((previos) => new Set(previos).add(archivo.id))
    try {
      await apiEquipo.quitarEntregable(personaId, tarea.id, archivo.id)
      if (!montado.current) return
      setQuitados((previos) => new Set(previos).add(archivo.id))
      alCambio()
      avisar(`Se quitó «${archivo.nombre}».`)
    } catch (error) {
      if (!montado.current) return
      avisar(`No se pudo quitar «${archivo.nombre}». ${mensajeDe(error)}`, 'error')
    } finally {
      if (montado.current) {
        setQuitando((previos) => {
          const siguen = new Set(previos)
          siguen.delete(archivo.id)
          return siguen
        })
      }
    }
  }

  async function terminar() {
    if (ocupado || faltaEntregable) return
    setTerminando(true)
    setErrorGeneral(null)
    setErrorEntregable(null)
    setErrorNota(null)
    try {
      const resultado = await apiEquipo.terminar(personaId, tarea.id, nota)
      if (!montado.current) return
      avisar(resultado.aviso.mensaje || 'Terminó la tarea.', resultado.aviso.estado === 'enviado' ? 'exito' : 'info')
      alTerminada(resultado.tarea)
    } catch (error) {
      if (!montado.current) return
      setTerminando(false)
      if (error instanceof ErrorCrmHttp && (error.estado === 409 || error.estado === 404)) {
        // Ya estaba terminada (409) o ya no es suya (404): no hay nada más que hacer aquí.
        avisar(mensajeDe(error), error.estado === 409 ? 'info' : 'error')
        alTerminada(null)
        return
      }
      const campos = error instanceof ErrorCrmHttp ? (error.campos ?? {}) : {}
      if (campos.entregable || campos.nota) {
        if (campos.entregable) {
          setErrorEntregable(campos.entregable)
          detalle.recargar()
        }
        if (campos.nota) setErrorNota(campos.nota)
        return
      }
      setErrorGeneral(mensajeDe(error))
    }
  }

  const aria = ariaCampo(idNota, { ayuda: AYUDA_NOTA, error: errorNota })
  const describeNota = [aria['aria-describedby'], `${idNota}-contador`].filter(Boolean).join(' ')

  let estadoLista = null
  if (!detalle.datos && detalle.estado === 'error') {
    estadoLista = (
      <ErrorCarga error={detalle.error} alReintentar={detalle.recargar} titulo="No se pudieron cargar los entregables que ya subió." />
    )
  } else if (!detalle.datos) {
    estadoLista = <Cargando texto="Buscando los entregables que ya subió…" />
  }

  return (
    <Dialogo
      abierto
      titulo={`Terminar «${tarea.titulo}»`}
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" disabled={ocupado} onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="crm-boton crm-boton-primario"
            disabled={ocupado || faltaEntregable}
            aria-describedby={faltaEntregable ? idExplica : undefined}
            onClick={() => void terminar()}
          >
            <Icono nombre="check" />
            {terminando ? 'Terminando…' : `Terminar y avisar ${nombre.a}`}
          </button>
        </>
      }
    >
      <div className="crm-eq-terminar" ref={raiz}>
        <section className="crm-eq-entregables">
          <h3 className="crm-eq-subtitulo">Entregables</h3>
          <p className="crm-eq-explica" id={idExplica} data-tipo={explicacion.tipo}>
            <Icono nombre={explicacion.icono} />
            <span>{explicacion.texto}</span>
          </p>
          <ZonaArchivos
            aceptar={ACEPTAR_ARCHIVOS_CRM}
            multiple
            alElegir={elegir}
            deshabilitada={ocupado || cupo === 0}
            ayuda={ayudaZona}
          />
          {erroresArchivos.length > 0 ? (
            <ul className="crm-eq-errores" role="alert">
              {erroresArchivos.map((texto, i) => (
                <li key={`${i}-${texto}`} className="crm-campo-error">
                  <Icono nombre="alerta" tamano={16} />
                  {texto}
                </li>
              ))}
            </ul>
          ) : null}
          {errorEntregable ? (
            <p className="crm-campo-error" role="alert">
              <Icono nombre="alerta" tamano={16} />
              {errorEntregable}
            </p>
          ) : null}
          {subida ? <ProgresoSubida nombre={subida.nombre} progreso={subida.progreso} alCancelar={() => control.current?.abort()} /> : null}
          {estadoLista}
          <ListaArchivos archivos={entregables} ocupados={quitando} alQuitar={(archivo) => void quitar(archivo)} />
        </section>

        <Campo etiqueta={`Nota para ${nombre.nombre}`} id={idNota} ayuda={AYUDA_NOTA} error={errorNota}>
          <textarea
            className="crm-control"
            {...aria}
            aria-describedby={describeNota}
            rows={4}
            value={nota}
            maxLength={LIMITES_CRM.nota}
            readOnly={terminando}
            data-autofocus={requiere ? undefined : ''}
            onChange={(evento) => {
              setNota(evento.target.value)
              setErrorNota(null)
            }}
          />
          <p className="crm-eq-contador" id={`${idNota}-contador`}>
            {nota.length.toLocaleString('es-CO')} de {LIMITES_CRM.nota.toLocaleString('es-CO')} caracteres
          </p>
        </Campo>

        {errorGeneral ? (
          <p className="crm-campo-error" role="alert">
            <Icono nombre="alerta" tamano={16} />
            {errorGeneral}
          </p>
        ) : null}
      </div>
    </Dialogo>
  )
}
