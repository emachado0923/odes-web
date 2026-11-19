import { type CSSProperties, useEffect, useMemo, useState } from 'react'

/**
 * Estado del panel "Opciones de Accesibilidad" (recreación del panel del
 * plugin "One Click Accessibility" de sapiencia.gov.co) para esta página.
 *
 * - Tamaño del texto: 80 % a 200 %, de 10 en 10 (como el plugin). Se aplica con
 *   la variable --sap-efecto-escala (zoom del contenido y del pie) y la clase
 *   sap-efecto-texto-N en la raíz .sap-oficial.
 * - Esquema de color (uno a la vez): escala de grises, alto contraste,
 *   contraste negativo o fondo claro: clase sap-efecto-<esquema>.
 * - Subrayar enlaces y fuente legible: clases sap-efecto-subrayar y sap-efecto-legible.
 *
 * Se guarda en localStorage (solo en este navegador) para que la preferencia
 * siga al recargar; si el almacenamiento no está disponible (modo privado,
 * bloqueado), funciona igual sin recordarla.
 */

export type Esquema = 'grises' | 'alto-contraste' | 'contraste-negativo' | 'fondo-claro'

export interface EstadoAccesibilidad {
  /** Tamaño del texto en porcentaje (100 = normal). */
  texto: number
  esquema: Esquema | null
  subrayar: boolean
  legible: boolean
}

export const TEXTO_MINIMO = 80
export const TEXTO_MAXIMO = 200
export const PASO_TEXTO = 10

/** Clave por omisión en localStorage; cada sitio puede pasar la suya a useAccesibilidad(). */
export const CLAVE_ALMACEN = 'sapiencia.accesibilidad'

const ESQUEMAS: readonly Esquema[] = ['grises', 'alto-contraste', 'contraste-negativo', 'fondo-claro']

export const ESTADO_INICIAL: EstadoAccesibilidad = { texto: 100, esquema: null, subrayar: false, legible: false }

/** Lee la preferencia guardada; cualquier valor raro vuelve al estado inicial. */
export function leerAccesibilidad(clave: string = CLAVE_ALMACEN): EstadoAccesibilidad {
  try {
    const crudo = window.localStorage.getItem(clave)
    if (!crudo) return ESTADO_INICIAL
    const v = JSON.parse(crudo) as Partial<EstadoAccesibilidad>
    const texto =
      typeof v.texto === 'number' && v.texto >= TEXTO_MINIMO && v.texto <= TEXTO_MAXIMO && v.texto % PASO_TEXTO === 0
        ? v.texto
        : 100
    return {
      texto,
      esquema: ESQUEMAS.includes(v.esquema as Esquema) ? (v.esquema as Esquema) : null,
      subrayar: v.subrayar === true,
      legible: v.legible === true,
    }
  } catch {
    return ESTADO_INICIAL
  }
}

function guardarAccesibilidad(estado: EstadoAccesibilidad, clave: string) {
  try {
    const inicial =
      estado.texto === 100 && estado.esquema === null && !estado.subrayar && !estado.legible
    if (inicial) window.localStorage.removeItem(clave)
    else window.localStorage.setItem(clave, JSON.stringify(estado))
  } catch {
    /* Sin almacenamiento: la preferencia vale hasta recargar. */
  }
}

/** Clases que el estado pone en la raíz .sap-oficial. */
export function clasesAccesibilidad(estado: EstadoAccesibilidad): string[] {
  const clases: string[] = []
  if (estado.texto !== 100) clases.push(`sap-efecto-texto-${estado.texto}`)
  if (estado.esquema) clases.push(`sap-efecto-${estado.esquema}`)
  if (estado.subrayar) clases.push('sap-efecto-subrayar')
  if (estado.legible) clases.push('sap-efecto-legible')
  return clases
}

export interface Accesibilidad {
  estado: EstadoAccesibilidad
  /** Clases para la raíz .sap-oficial (separadas por espacios; '' si no hay). */
  clases: string
  /** Estilo de la raíz: la escala del texto (--sap-efecto-escala). */
  estilo: CSSProperties
  aumentarTexto: () => void
  disminuirTexto: () => void
  alternarEsquema: (esquema: Esquema) => void
  alternarSubrayar: () => void
  alternarLegible: () => void
  restablecer: () => void
}

export function useAccesibilidad(clave: string = CLAVE_ALMACEN): Accesibilidad {
  const [estado, setEstado] = useState(() => leerAccesibilidad(clave))

  useEffect(() => {
    guardarAccesibilidad(estado, clave)
  }, [estado, clave])

  const acciones = useMemo(
    () => ({
      aumentarTexto: () => setEstado((e) => ({ ...e, texto: Math.min(TEXTO_MAXIMO, e.texto + PASO_TEXTO) })),
      disminuirTexto: () => setEstado((e) => ({ ...e, texto: Math.max(TEXTO_MINIMO, e.texto - PASO_TEXTO) })),
      alternarEsquema: (esquema: Esquema) => setEstado((e) => ({ ...e, esquema: e.esquema === esquema ? null : esquema })),
      alternarSubrayar: () => setEstado((e) => ({ ...e, subrayar: !e.subrayar })),
      alternarLegible: () => setEstado((e) => ({ ...e, legible: !e.legible })),
      restablecer: () => setEstado(ESTADO_INICIAL),
    }),
    [],
  )

  return {
    estado,
    clases: clasesAccesibilidad(estado).join(' '),
    estilo: { '--sap-efecto-escala': String(estado.texto / 100) } as CSSProperties,
    ...acciones,
  }
}
