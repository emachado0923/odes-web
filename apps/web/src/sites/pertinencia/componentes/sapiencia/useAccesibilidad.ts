import { type CSSProperties, useEffect, useMemo, useState } from 'react'

/**
 * Estado del panel "Opciones de Accesibilidad" (recreación del panel del
 * plugin "One Click Accessibility" de sapiencia.gov.co) para esta página.
 *
 * - Tamaño del texto: 80 % a 200 %, de 10 en 10 (como el plugin). Se aplica con
 *   la variable --pe-a11y-escala (zoom del contenido y del pie) y la clase
 *   pe-a11y-texto-N en la raíz .pertinencia.
 * - Esquema de color (uno a la vez): escala de grises, alto contraste,
 *   contraste negativo o fondo claro: clase pe-a11y-<esquema>.
 * - Subrayar enlaces y fuente legible: clases pe-a11y-subrayar y pe-a11y-legible.
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

export const CLAVE_ALMACEN = 'pertinencia.accesibilidad'

const ESQUEMAS: readonly Esquema[] = ['grises', 'alto-contraste', 'contraste-negativo', 'fondo-claro']

export const ESTADO_INICIAL: EstadoAccesibilidad = { texto: 100, esquema: null, subrayar: false, legible: false }

/** Lee la preferencia guardada; cualquier valor raro vuelve al estado inicial. */
export function leerAccesibilidad(): EstadoAccesibilidad {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ALMACEN)
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

function guardarAccesibilidad(estado: EstadoAccesibilidad) {
  try {
    const inicial =
      estado.texto === 100 && estado.esquema === null && !estado.subrayar && !estado.legible
    if (inicial) window.localStorage.removeItem(CLAVE_ALMACEN)
    else window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(estado))
  } catch {
    /* Sin almacenamiento: la preferencia vale hasta recargar. */
  }
}

/** Clases que el estado pone en la raíz .pertinencia. */
export function clasesAccesibilidad(estado: EstadoAccesibilidad): string[] {
  const clases: string[] = []
  if (estado.texto !== 100) clases.push(`pe-a11y-texto-${estado.texto}`)
  if (estado.esquema) clases.push(`pe-a11y-${estado.esquema}`)
  if (estado.subrayar) clases.push('pe-a11y-subrayar')
  if (estado.legible) clases.push('pe-a11y-legible')
  return clases
}

export interface Accesibilidad {
  estado: EstadoAccesibilidad
  /** Clases para la raíz .pertinencia (separadas por espacios; '' si no hay). */
  clases: string
  /** Estilo de la raíz: la escala del texto (--pe-a11y-escala). */
  estilo: CSSProperties
  aumentarTexto: () => void
  disminuirTexto: () => void
  alternarEsquema: (esquema: Esquema) => void
  alternarSubrayar: () => void
  alternarLegible: () => void
  restablecer: () => void
}

export function useAccesibilidad(): Accesibilidad {
  const [estado, setEstado] = useState(leerAccesibilidad)

  useEffect(() => {
    guardarAccesibilidad(estado)
  }, [estado])

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
    estilo: { '--pe-a11y-escala': String(estado.texto / 100) } as CSSProperties,
    ...acciones,
  }
}
