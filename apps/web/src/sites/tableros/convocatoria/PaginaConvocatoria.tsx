import type { ComponentType } from 'react'
import { cargarScript } from '../bateria/cargar-script'
import { esperarFuentes, importarTablero } from '../carga-tablero'
import CargaTablero from '../componentes/CargaTablero'
import { URL_DATOS_CONVOCATORIA } from '../rutas'
import '../matricula/tablero-matricula.css'
import './tablero-convocatoria.css'

/**
 * Los archivos de datos tal como los genera etl_convocatoria.py (ver
 * apps/web/datos-tableros/convocatoria-pregrado/LEEME.md): scripts del mismo
 * origen que se guardan en window.ODES, así que cumplen la CSP (script-src
 * 'self'). Se reemplazan copiando la carpeta datos/ que sale del ETL.
 */
const ARCHIVOS = ['definiciones.js', 'convocatoria.js', 'comunas.js'] as const

/** Marca de la recarga automática cuando el chunk del tablero ya no existe. */
const CLAVE_RECARGA = 'tableros:convocatoria:recarga'

async function cargarDatos(): Promise<void> {
  try {
    await Promise.all(ARCHIVOS.map((archivo) => cargarScript(`${URL_DATOS_CONVOCATORIA}/${archivo}`)))
  } catch {
    throw new Error('No se pudieron descargar los datos del tablero. Revise la conexión y vuelva a intentarlo.')
  }
  const odes = (window as Window & { ODES?: { convocatoria?: { dim?: unknown } } }).ODES
  if (!odes?.convocatoria?.dim) throw new Error('El tablero recibió datos con un formato inesperado.')
}

async function cargarTablero(): Promise<ComponentType> {
  // El módulo del tablero lee window.ODES al importarse (calcula constantes con
  // los datos y registra el mapa de comunas) y mide textos con la letra cargada,
  // así que los datos y las fuentes van antes del import.
  await Promise.all([cargarDatos(), esperarFuentes()])
  return importarTablero(() => import('./TableroConvocatoria'), CLAVE_RECARGA)
}

/**
 * /tableros/convocatoria-pregrado: la caracterización de los inscritos en las
 * convocatorias de pregrado de Sapiencia. Carga los datos estáticos del ETL y
 * monta el tablero (React + ECharts, en su propio chunk).
 */
export default function PaginaConvocatoria() {
  return <CargaTablero cargar={cargarTablero} />
}
