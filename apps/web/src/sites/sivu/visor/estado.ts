/**
 * Estado público del visor 3D (VisorEdificio → React).
 *
 * Vive en un archivo aparte, sin importar three.js, para que los componentes y
 * las pruebas puedan usar los tipos y el estado inicial aunque el módulo del
 * visor esté simulado (jsdom no tiene WebGL).
 */

/** Etapa de la carga del modelo. */
export type FaseVisor = 'descargando' | 'procesando' | 'listo' | 'error'

export interface ErrorVisor {
  /**
   * "webgl": el navegador no pudo crear el contexto 3D (reintentar no sirve).
   * "carga": falló la descarga o lectura del .glb.
   * "contexto": el navegador retiró el contexto WebGL (poca memoria de video).
   */
  tipo: 'webgl' | 'carga' | 'contexto'
  /** Mensaje en español, listo para mostrar. */
  mensaje: string
}

export interface EstadoVisor {
  fase: FaseVisor
  /** Porcentaje descargado (0–100); null si el servidor no informa el tamaño. */
  progreso: number | null
  /** true cuando el edificio ya está en escena (fase "listo"). */
  listo: boolean
  error: ErrorVisor | null
  /** Giro automático de OrbitControls (controles.autoRotate). */
  rotacionActiva: boolean
  /** La cámara se está acercando a la entrada (doble clic o "Ingresar"). */
  enfocandoPuerta: boolean
  /** El modelo tiene un nodo llamado "PUERTA". */
  puertaEncontrada: boolean
}

export const ESTADO_INICIAL_VISOR: EstadoVisor = {
  fase: 'descargando',
  progreso: null,
  listo: false,
  error: null,
  rotacionActiva: true,
  enfocandoPuerta: false,
  puertaEncontrada: false,
}

/** Valor de data-estado del bloque del edificio (lo usan las pruebas de extremo a extremo). */
export function estadoDatos(estado: EstadoVisor): 'cargando' | 'listo' | 'error' {
  if (estado.fase === 'error') return 'error'
  return estado.listo ? 'listo' : 'cargando'
}
