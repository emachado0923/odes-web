/**
 * Lo común de las vistas de tareas del líder (lider/tareas): rutas, textos
 * (historial, avisos), archivos elegidos y subidas en fila con progreso.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ETIQUETAS_ESTADO, type ArchivoCrm, type CorreoCrm, type EstadoAvisoCrm, type EventoTareaCrm } from '../../api-crm'
import { ErrorCrmHttp, esNoAutenticado, type OpcionesSubida } from '../../datos/clienteCrm'
import { unirConY, validarArchivo, type TipoAviso } from '../../ui'

// ── Rutas ────────────────────────────────────────────────────────────────────

export const RUTA_PANEL = '/crm/lider'

export function rutaTarea(id: number): string {
  return `/crm/lider/tareas/${id}`
}

export function rutaEditar(id: number): string {
  return `${rutaTarea(id)}/editar`
}

/** El :id de la ruta como entero positivo; null si no lo es («abc», «0», «1.5»). */
export function idDeRuta(texto: string | undefined): number | null {
  return texto && /^[1-9]\d{0,14}$/.test(texto) ? Number(texto) : null
}

/** Un :id que no es número se trata como una tarea que no existe (404). */
export function errorNoEncontrada(): ErrorCrmHttp {
  return new ErrorCrmHttp('no_encontrado', 'No se encontró la tarea.', { estado: 404 })
}

export function esNoEncontrado(error: unknown): boolean {
  return error instanceof ErrorCrmHttp && error.estado === 404
}

// ── Textos ───────────────────────────────────────────────────────────────────

/** 'exito' si el correo salió; si quedó pendiente o falló, 'info' (el mensaje dice qué pasó). */
export function tipoAviso(aviso: EstadoAvisoCrm): TipoAviso {
  return aviso.estado === 'enviado' ? 'exito' : 'info'
}

/** «Jose David Ramírez Abraham» → «Jose». */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre
}

/** «a.pdf» o «a.pdf» y «b.docx». */
export function entreComillas(nombres: readonly string[]): string {
  return unirConY(nombres.map((nombre) => `«${nombre}»`))
}

/** Aviso de la tarea recién creada con adjuntos que no subieron. */
export function textoNoSubidos(nombres: readonly string[]): string {
  const varios = nombres.length > 1
  return `La tarea se creó, pero no se ${varios ? 'subieron' : 'subió'}: ${entreComillas(nombres)}. ${varios ? 'Súbalos' : 'Súbalo'} desde aquí y use «Avisar».`
}

/** Estado de la navegación al detalle cuando algún adjunto no subió al crear la tarea. */
export function estadoNoSubidos(nombres: readonly string[]): { noSubidos: string[] } {
  return { noSubidos: [...nombres] }
}

/** Los nombres que dejó estadoNoSubidos (location.state); [] si no hay. */
export function noSubidosDe(estado: unknown): string[] {
  if (typeof estado !== 'object' || estado === null || !('noSubidos' in estado)) return []
  const lista: unknown = estado.noSubidos
  return Array.isArray(lista) ? lista.filter((nombre): nombre is string => typeof nombre === 'string') : []
}

/** Qué pasó al reintentar un correo, para el aviso. */
export function textoReintento(correo: CorreoCrm): { texto: string; tipo: TipoAviso } {
  switch (correo.estado) {
    case 'enviado':
      return { texto: `Se envió el correo a ${correo.para}.`, tipo: 'exito' }
    case 'error':
      return { texto: correo.error ? `El correo volvió a fallar: ${correo.error}` : 'El correo volvió a fallar.', tipo: 'error' }
    case 'sin_configurar':
      return { texto: 'El correo no está configurado en el servidor: el aviso quedó guardado sin enviar.', tipo: 'info' }
    default:
      return { texto: 'El correo quedó pendiente de envío.', tipo: 'info' }
  }
}

/** «José creó la tarea»; sin nombre, «Creó la tarea». */
function conSujeto(quien: string | null, predicado: string): string {
  if (quien) return `${quien} ${predicado}`
  return predicado.charAt(0).toLocaleUpperCase('es-CO') + predicado.slice(1)
}

/**
 * Una línea del historial: «José creó la tarea», «Se reasignó a Luciana»,
 * «Juliana la pasó a En proceso», «Juliana subió «informe.pdf»», «Juliana la
 * terminó», «José la devolvió: <observación>», «Se le avisó por correo».
 */
export function textoEvento(evento: EventoTareaCrm): string {
  const quien = evento.personaNombre?.trim() ? primerNombre(evento.personaNombre) : null
  const detalle = evento.detalle?.trim() || null
  switch (evento.tipo) {
    case 'creada':
      return conSujeto(quien, 'creó la tarea')
    case 'editada':
      return conSujeto(quien, detalle ? `editó la tarea (${detalle})` : 'editó la tarea')
    case 'reasignada':
      return detalle ? `Se reasignó a ${detalle}` : 'Se reasignó la tarea'
    case 'estado':
      return conSujeto(quien, evento.aEstado ? `la pasó a ${ETIQUETAS_ESTADO[evento.aEstado]}` : 'le cambió el estado')
    case 'adjunto':
      return conSujeto(quien, detalle ? `subió «${detalle}»` : 'subió un adjunto')
    case 'entregable':
      return conSujeto(quien, detalle ? `subió el entregable «${detalle}»` : 'subió un entregable')
    case 'archivo_quitado':
      return conSujeto(quien, detalle ? `quitó «${detalle}»` : 'quitó un archivo')
    case 'terminada':
      return conSujeto(quien, 'la terminó')
    case 'devuelta':
      return conSujeto(quien, detalle ? `la devolvió: ${detalle}` : 'la devolvió')
    case 'aviso':
      return 'Se le avisó por correo'
    default:
      return detalle ?? 'Hubo un cambio en la tarea'
  }
}

// ── Archivos ─────────────────────────────────────────────────────────────────

function mismoArchivo(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

/**
 * De los archivos que se acaban de elegir, los que se pueden agregar: válidos
 * (validarArchivo), sin repetir los ya elegidos y sin pasar de `maximo`
 * contando los `ocupados`. Del resto, el porqué (un texto por problema).
 */
export function elegirArchivos(
  nuevos: readonly File[],
  ocupados: number,
  maximo: number,
  yaElegidos: readonly File[] = [],
): { aceptados: File[]; errores: string[] } {
  const aceptados: File[] = []
  const errores: string[] = []
  const sinCupo: string[] = []
  for (const archivo of nuevos) {
    if ([...yaElegidos, ...aceptados].some((otro) => mismoArchivo(otro, archivo))) continue
    const error = validarArchivo(archivo)
    if (error) {
      errores.push(error)
    } else if (ocupados + aceptados.length >= maximo) {
      sinCupo.push(archivo.name)
    } else {
      aceptados.push(archivo)
    }
  }
  if (sinCupo.length > 0) {
    errores.push(`Una tarea lleva hasta ${maximo} adjuntos: no se ${sinCupo.length > 1 ? 'agregaron' : 'agregó'} ${entreComillas(sinCupo)}.`)
  }
  return { aceptados, errores }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Función que dice si la vista sigue en pantalla (para no navegar ni pintar después de salir). */
export function useMontado(): () => boolean {
  const vida = useRef({ montado: true })
  useEffect(() => {
    const actual = vida.current
    actual.montado = true
    return () => {
      actual.montado = false
    }
  }, [])
  return useCallback(() => vida.current.montado, [])
}

export interface SubidaEnCurso {
  nombre: string
  /** De 0 a 1. */
  progreso: number
  /** Cuál va (desde 1) y cuántas son. */
  numero: number
  total: number
}

export interface ResultadoSubidas {
  subidos: ArchivoCrm[]
  /** Los que no subieron (error o cancelados), con su error. */
  fallidos: { archivo: File; error: unknown }[]
  /** Respondió 401: se detuvo ahí. */
  sinSesion: boolean
  /** La vista se cerró a mitad de camino: se detuvo ahí. */
  interrumpida: boolean
}

type SubirUno = (archivo: File, opciones: Pick<OpcionesSubida, 'alProgreso' | 'signal'>) => Promise<ArchivoCrm>

/**
 * Sube archivos uno a uno. `subida` es el que va (para ProgresoSubida);
 * `cancelar` corta solo ese y sigue con los demás; al cerrar la vista se
 * corta el que va y no se sigue.
 */
export function useSubidas() {
  const [subida, setSubida] = useState<SubidaEnCurso | null>(null)
  const interno = useRef<{ montado: boolean; control: AbortController | null }>({ montado: true, control: null })

  useEffect(() => {
    const actual = interno.current
    actual.montado = true
    return () => {
      actual.montado = false
      actual.control?.abort()
    }
  }, [])

  const cancelar = useCallback(() => interno.current.control?.abort(), [])

  const subirTodos = useCallback(
    async (archivos: readonly File[], subirUno: SubirUno, alSubir?: (archivo: ArchivoCrm) => void): Promise<ResultadoSubidas> => {
      const estado = interno.current
      const resultado: ResultadoSubidas = { subidos: [], fallidos: [], sinSesion: false, interrumpida: false }
      for (const [i, archivo] of archivos.entries()) {
        if (!estado.montado) break
        const control = new AbortController()
        estado.control = control
        const pintar = (progreso: number) => {
          if (estado.montado && estado.control === control) {
            setSubida({ nombre: archivo.name, progreso, numero: i + 1, total: archivos.length })
          }
        }
        pintar(0)
        try {
          const subido = await subirUno(archivo, { alProgreso: pintar, signal: control.signal })
          resultado.subidos.push(subido)
          if (estado.montado) alSubir?.(subido)
        } catch (error) {
          resultado.fallidos.push({ archivo, error })
          if (esNoAutenticado(error)) {
            resultado.sinSesion = true
            break
          }
        } finally {
          if (estado.control === control) estado.control = null
        }
      }
      resultado.interrumpida = !estado.montado
      if (estado.montado) setSubida(null)
      return resultado
    },
    [],
  )

  return { subida, cancelar, subirTodos }
}
