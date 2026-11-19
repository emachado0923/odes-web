/**
 * Cambios sin guardar: un formulario (modal de observaciones, casilla de
 * avance, edición de un usuario…) avisa si tiene cambios pendientes, y el
 * sitio los consulta antes de perderlos:
 * - la barra, antes de cerrar la sesión (cerrarla desmonta la página sin
 *   pasar por la navegación, así que useBlocker no saltaría);
 * - GuardiaCambios (PaiSitio), al salir de la página por un enlace, con
 *   Atrás o Adelante (useBlocker) y al recargar o cerrar la pestaña
 *   (beforeunload).
 *
 * Además lleva los guardados en curso (seguir): una casilla que se guarda al
 * salir de ella ya no cuenta como "sin guardar" mientras su PUT está en
 * camino, y quien va a cerrar la sesión puede esperar a que termine
 * (esperarGuardados) en vez de avisar que se perderá.
 *
 * Parecido a repositorio/admin/componentes/cambiosPendientes.ts.
 */
import { createContext, use, useCallback, useEffect, useId } from 'react'

export interface RegistroCambios {
  /** `quien` tiene (o ya no tiene) cambios sin guardar. */
  marcar: (quien: string, pendientes: boolean) => void
  /** ¿Hay cambios sin guardar (sin contar los que se están guardando)? */
  hay: () => boolean
  /** Sigue un guardado en curso hasta que termine (bien o mal); devuelve la misma promesa. */
  seguir: <T>(guardado: Promise<T>) => Promise<T>
  /** ¿Hay guardados en curso? */
  guardando: () => boolean
  /**
   * Se resuelve cuando no queda ningún guardado en curso, después de que
   * cada uno haya terminado de actualizar su estado (marcar).
   */
  esperarGuardados: () => Promise<void>
  /** Avisa cada vez que cambia hay(); devuelve la función para dejar de oír. */
  suscribir: (oyente: () => void) => () => void
}

export function crearRegistroCambios(): RegistroCambios {
  const pendientes = new Set<string>()
  const oyentes = new Set<() => void>()
  let enCurso = 0
  let esperas: (() => void)[] = []

  function avisar() {
    for (const oyente of oyentes) oyente()
  }

  function liberar() {
    if (enCurso > 0 || esperas.length === 0) return
    const listas = esperas
    esperas = []
    // Un macrotask: antes corren todas las continuaciones (microtareas) de
    // quien guardaba, que marcan si su cambio quedó guardado o no.
    setTimeout(() => {
      for (const lista of listas) lista()
    }, 0)
  }

  return {
    marcar: (quien, hay) => {
      const antes = pendientes.size > 0
      if (hay) pendientes.add(quien)
      else pendientes.delete(quien)
      if (antes !== pendientes.size > 0) avisar()
    },
    hay: () => pendientes.size > 0,
    seguir: (guardado) => {
      enCurso++
      const terminar = () => {
        enCurso--
        liberar()
      }
      guardado.then(terminar, terminar)
      return guardado
    },
    guardando: () => enCurso > 0,
    esperarGuardados: () =>
      new Promise<void>((resolver) => {
        esperas.push(resolver)
        liberar()
      }),
    suscribir: (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
  }
}

/** Estado de una navegación que no debe detener GuardiaCambios (p. ej., tras cerrar la sesión). */
export const ESTADO_SIN_GUARDIA = { paiSinGuardia: true } as const

export function esSinGuardia(estado: unknown): boolean {
  return typeof estado === 'object' && estado !== null && (estado as { paiSinGuardia?: unknown }).paiSinGuardia === true
}

/** PaiSitio provee un registro por montaje del sitio. */
export const ContextoCambios = createContext<RegistroCambios>(crearRegistroCambios())

/**
 * El componente que llama tiene (o no) cambios sin guardar. Devuelve
 * `marcarAhora`, para actualizar el registro en el mismo instante (p. ej., al
 * empezar o terminar un guardado), sin esperar al próximo render.
 */
export function useCambiosPendientes(pendientes: boolean): (ahora: boolean) => void {
  const registro = use(ContextoCambios)
  const quien = useId()
  useEffect(() => {
    registro.marcar(quien, pendientes)
    return () => registro.marcar(quien, false)
  }, [registro, quien, pendientes])
  return useCallback((ahora: boolean) => registro.marcar(quien, ahora), [registro, quien])
}

export function useRegistroCambios(): RegistroCambios {
  return use(ContextoCambios)
}
