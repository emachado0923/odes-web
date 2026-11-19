import type { ComponentType } from 'react'
import { esperarFuentes, importarTablero } from '../carga-tablero'
import CargaTablero from '../componentes/CargaTablero'
import { URL_DATOS_MATRICULA } from '../rutas'
import './tablero-matricula.css'

/** Lo que entrega GET /api/sivu/tableros/matricula-2025 (ver apps/server/src/sivu/tableros). */
interface DatosTablero {
  matricula: unknown
  definiciones: unknown
}

/** Reintentos ante un 503: la base puede estar en un corte momentáneo. */
const REINTENTOS_NO_DISPONIBLE = 2

/** Espera antes de reintentar: la que pide Retry-After, de 0 a 3 s (1 s si no viene). */
function esperaReintento(respuesta: Response): Promise<void> {
  const segundos = Number(respuesta.headers.get('Retry-After') ?? 1)
  const ms = Number.isFinite(segundos) ? Math.min(3, Math.max(0, segundos)) * 1000 : 1000
  return new Promise((listo) => setTimeout(listo, ms))
}

async function pedirDatos(): Promise<DatosTablero> {
  for (let intento = 0; ; intento++) {
    const respuesta = await fetch(URL_DATOS_MATRICULA, { headers: { Accept: 'application/json' } })
    if (respuesta.ok) return (await respuesta.json()) as DatosTablero
    if (respuesta.status === 503 && intento < REINTENTOS_NO_DISPONIBLE) {
      await esperaReintento(respuesta)
      continue
    }
    throw new Error(
      respuesta.status === 503
        ? 'La base de datos no está disponible en este momento. Intente de nuevo en unos minutos.'
        : respuesta.status === 404
          ? 'El tablero todavía no tiene datos cargados.'
          : `El servidor respondió con el código ${respuesta.status}.`,
    )
  }
}

/** Marca de la recarga automática cuando el chunk del tablero ya no existe. */
const CLAVE_RECARGA = 'tableros:matricula:recarga'

async function cargarTablero(): Promise<ComponentType> {
  const [datos] = await Promise.all([pedirDatos(), esperarFuentes()])
  // El módulo del tablero lee window.ODES al importarse (calcula constantes con
  // los datos y mide textos con la letra cargada), así que los datos y las
  // fuentes van antes del import.
  ;(window as Window & { ODES?: DatosTablero }).ODES = {
    matricula: datos.matricula,
    definiciones: datos.definiciones,
  }
  return importarTablero(() => import('./TableroMatricula'), CLAVE_RECARGA)
}

/**
 * /tableros/matricula-2025: el tablero de matrícula en educación superior en
 * Medellín (2025). Trae los datos de la base y monta el tablero (React +
 * ECharts, en su propio chunk).
 */
export default function PaginaMatricula() {
  return <CargaTablero cargar={cargarTablero} />
}
