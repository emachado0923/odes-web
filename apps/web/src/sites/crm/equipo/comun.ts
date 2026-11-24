/**
 * Lo común de las vistas del equipo (Inicio, TableroPersona, DetalleTarea y
 * DialogoTerminar): cómo se nombra al líder en los textos, el resumen de las
 * tareas de una persona, el texto de cada evento del historial y el resumen
 * (TareaCrm) de un detalle que devuelve el servidor.
 */
import { ETIQUETAS_ESTADO, LIMITES_CRM, type EventoTareaCrm, type TareaCrm, type TareaDetalleCrm } from '../api-crm'
import { ErrorCrmHttp } from '../datos/clienteCrm'
import { plural } from '../ui/formato'

/** «José» de «José David Ramírez Abraham»; '' si no hay nombre. */
export function primerNombre(nombre: string | null | undefined): string {
  return nombre?.trim().split(/\s+/)[0] ?? ''
}

export interface NombreLider {
  /** Al empezar una frase: «José» o «El líder». */
  sujeto: string
  /** Dentro de una frase: «José» o «el líder». */
  nombre: string
  /** «a José» o «al líder». */
  a: string
}

/** Cómo se nombra al líder en los textos: por su primer nombre o, si no se sabe, «el líder». */
export function nombreLider(lider: string | null): NombreLider {
  const primero = primerNombre(lider)
  return primero ? { sujeto: primero, nombre: primero, a: `a ${primero}` } : { sujeto: 'El líder', nombre: 'el líder', a: 'al líder' }
}

/** ¿Respondió el servidor 404 (la persona o la tarea no existe, o no es de esta persona)? */
export function esNoEncontrado(error: unknown): boolean {
  return error instanceof ErrorCrmHttp && error.estado === 404
}

/** ¿La tarea cambió en el servidor (409) o ya no está (404)? Hay que volver a pedir el tablero. */
export function cambioEnElServidor(error: unknown): boolean {
  return error instanceof ErrorCrmHttp && (error.estado === 409 || error.estado === 404)
}

/** Lo que va en el tablero (TareaCrm) de un detalle (TareaDetalleCrm), sin archivos ni historial. */
export function resumenDe(t: TareaDetalleCrm): TareaCrm {
  return {
    id: t.id,
    titulo: t.titulo,
    estado: t.estado,
    responsable: t.responsable,
    fechaLimite: t.fechaLimite,
    vencida: t.vencida,
    requiereEntregable: t.requiereEntregable,
    adjuntos: t.adjuntos,
    entregables: t.entregables,
    creadaEn: t.creadaEn,
    actualizadaEn: t.actualizadaEn,
    terminadaEn: t.terminadaEn,
  }
}

export interface ParteResumen {
  clave: 'pendientes' | 'en_proceso' | 'vencidas'
  texto: string
}

/** Lo abierto de una persona: «3 pendientes», «1 en proceso», «2 vencidas» (solo lo que no es cero). */
export function partesResumen(tareas: readonly TareaCrm[]): ParteResumen[] {
  let pendientes = 0
  let enProceso = 0
  let vencidas = 0
  for (const tarea of tareas) {
    if (tarea.estado === 'pendiente') pendientes++
    else if (tarea.estado === 'en_proceso') enProceso++
    if (tarea.vencida && tarea.estado !== 'terminada') vencidas++
  }
  const partes: ParteResumen[] = []
  if (pendientes > 0) partes.push({ clave: 'pendientes', texto: plural(pendientes, 'pendiente', 'pendientes') })
  if (enProceso > 0) partes.push({ clave: 'en_proceso', texto: `${enProceso.toLocaleString('es-CO')} en proceso` })
  if (vencidas > 0) partes.push({ clave: 'vencidas', texto: plural(vencidas, 'vencida', 'vencidas') })
  return partes
}

/** Cuando no hay nada abierto: «No tiene tareas pendientes. Terminó 4 tareas en los últimos 30 días.» */
export function textoSinPendientes(terminadasRecientes: number): string {
  const base = 'No tiene tareas pendientes.'
  if (terminadasRecientes <= 0) return base
  return `${base} Terminó ${plural(terminadasRecientes, 'tarea', 'tareas')} en los últimos ${LIMITES_CRM.diasTerminadasRecientes} días.`
}

/**
 * Quién hizo lo del evento, para empezar la frase: el líder por su primer
 * nombre; la persona del tablero no se nombra («Subió…», «Pasó a…»), salvo
 * que haya sido otra (la tarea se reasignó).
 */
function sujetoDe(evento: EventoTareaCrm, lider: string | null, persona: string | null): string | null {
  if (evento.actor === 'lider') return primerNombre(evento.personaNombre) || nombreLider(lider).sujeto
  const quien = evento.personaNombre?.trim()
  if (quien && persona && quien !== persona.trim()) return primerNombre(quien)
  return null
}

/**
 * Texto de un evento del historial: «José creó la tarea», «Pasó a En
 * proceso», «Subió «informe.pdf»», «José la devolvió: falta la firma»…
 */
export function textoEvento(evento: EventoTareaCrm, { lider, persona }: { lider: string | null; persona: string | null }): string {
  const sujeto = sujetoDe(evento, lider, persona)
  const frase = (conSujeto: string, sinSujeto: string) => (sujeto ? `${sujeto} ${conSujeto}` : sinSujeto)
  const detalle = evento.detalle?.trim() ?? ''
  const conDetalle = (texto: string) => (detalle ? `${texto}: ${detalle}` : texto)
  const archivo = detalle ? `«${detalle}»` : 'un archivo'

  switch (evento.tipo) {
    case 'creada':
      return frase('creó la tarea', 'Se creó la tarea')
    case 'editada':
      return conDetalle(frase('editó la tarea', 'Se editó la tarea'))
    case 'reasignada':
      return detalle ? frase(`se la asignó a ${detalle}`, `Se le asignó a ${detalle}`) : frase('la reasignó', 'Se reasignó')
    case 'estado': {
      const destino = evento.aEstado ? ETIQUETAS_ESTADO[evento.aEstado] : null
      return destino ? frase(`la pasó a ${destino}`, `Pasó a ${destino}`) : frase('le cambió el estado', 'Cambió de estado')
    }
    case 'adjunto':
      return frase(`adjuntó ${archivo}`, `Se adjuntó ${archivo}`)
    case 'entregable':
      return frase(`subió ${archivo}`, `Subió ${archivo}`)
    case 'archivo_quitado':
      return frase(`quitó ${archivo}`, `Quitó ${archivo}`)
    case 'terminada':
      return frase('terminó la tarea', 'Terminó la tarea')
    case 'devuelta':
      return conDetalle(frase('la devolvió', 'Se la devolvieron'))
    case 'aviso':
      return evento.actor === 'lider' ? frase('le avisó por correo', 'Se le avisó por correo') : `Se le avisó ${nombreLider(lider).a} por correo`
    default:
      return 'Cambió la tarea'
  }
}
