import type { ComponentType } from 'react'
import { esperarFuentes, importarTablero } from '../carga-tablero'
import CargaTablero from '../componentes/CargaTablero'
import { URL_DATOS_MATRICULA_HISTORICA } from '../rutas'
import type { MatriculaHistorica } from './tipos'
import '../matricula/tablero-matricula.css'
import './tablero-historica.css'

/** Marca de la recarga automática cuando el chunk del tablero ya no existe. */
const CLAVE_RECARGA = 'tableros:matricula-historica:recarga'

/** Los datos son un archivo estático del sitio: sin base de por medio, un fallo es un archivo que falta o está dañado. */
async function pedirDatos(): Promise<MatriculaHistorica> {
  const respuesta = await fetch(URL_DATOS_MATRICULA_HISTORICA, { headers: { Accept: 'application/json' } })
  if (!respuesta.ok) {
    throw new Error(
      respuesta.status === 404
        ? 'El tablero todavía no tiene datos publicados.'
        : `El servidor respondió con el código ${respuesta.status}. Intente de nuevo en unos minutos.`,
    )
  }
  const datos = (await respuesta.json()) as MatriculaHistorica
  if (!datos?.meta || !Array.isArray(datos.anios) || !Array.isArray(datos.filas) || !datos.dim?.programa || !datos.referencia) {
    throw new Error('El tablero recibió datos con un formato inesperado.')
  }
  return datos
}

async function cargarTablero(): Promise<ComponentType> {
  // Datos, fuentes y el chunk del tablero (con ECharts) se piden a la vez. El tablero mide textos al dibujar, no al
  // importarse, así que basta con que las fuentes estén antes de montarlo.
  const [datos, , Tablero] = (await Promise.all([
    pedirDatos(),
    esperarFuentes(),
    importarTablero(() => import('./TableroMatriculaHistorica'), CLAVE_RECARGA),
  ])) as [MatriculaHistorica, unknown, ComponentType<{ datos: MatriculaHistorica }>]
  return function TableroConDatos() {
    return <Tablero datos={datos} />
  }
}

/**
 * /tableros/matricula-historica: la matrícula en educación superior en
 * Medellín de 2000 a 2025. Trae el JSON del ETL y monta el tablero (React +
 * ECharts, en su propio chunk).
 */
export default function PaginaMatriculaHistorica() {
  return <CargaTablero cargar={cargarTablero} />
}
