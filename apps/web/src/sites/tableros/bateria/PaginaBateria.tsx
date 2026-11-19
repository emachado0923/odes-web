import type { ComponentType } from 'react'
import { Navigate, useLocation } from 'react-router'
import { esperarFuentes, importarTablero } from '../carga-tablero'
import CargaTablero from '../componentes/CargaTablero'
import { URL_DATOS_BATERIA } from '../rutas'
import { cargarScript } from './cargar-script'
import { rutaDesdeDireccionAntigua } from './rutas-bateria'
import './tablero-bateria.css'

/**
 * Archivos de datos que el tablero lee al importarse (window.ODES): textos
 * editables, estructura de navegación y geometrías de los mapas. Los datos de
 * cada vista (v/<vista>.js) los pide el tablero al abrirla. Son archivos
 * estáticos, generados por el ETL del Observatorio (ver LEEME.md).
 */
const ARCHIVOS_BASE = ['definiciones.js', 'vistas.js', 'geo.js'] as const

/** Marca de la recarga automática cuando el chunk del tablero ya no existe. */
const CLAVE_RECARGA = 'tableros:bateria:recarga'

async function cargarArchivosBase(): Promise<void> {
  try {
    await Promise.all(ARCHIVOS_BASE.map((archivo) => cargarScript(`${URL_DATOS_BATERIA}/${archivo}`)))
  } catch {
    throw new Error('No se pudieron descargar los datos del tablero. Revise la conexión y vuelva a intentarlo.')
  }
}

async function cargarTablero(): Promise<ComponentType> {
  // El módulo del tablero lee window.ODES al importarse (arma la navegación con
  // vistas.js y registra los mapas con geo.js) y mide textos con la letra
  // cargada, así que los datos y las fuentes van antes del import. Si el
  // módulo ya se importó, el import devuelve el mismo y los archivos no se
  // vuelven a pedir.
  await Promise.all([cargarArchivosBase(), esperarFuentes()])
  return importarTablero(() => import('./TableroBateria'), CLAVE_RECARGA)
}

/**
 * /tableros/bateria-indicadores/*: la batería de indicadores de educación
 * postsecundaria (se abre desde la puerta del edificio de SIVU). Carga los
 * datos base y monta el tablero (React + ECharts, en su propio chunk), que
 * navega entre sus vistas con las rutas de rutas-bateria.ts.
 *
 * Las direcciones del tablero estático (index.html y #/<vista>?v=<variante>)
 * se cambian por las nuevas, para que los enlaces guardados sigan sirviendo.
 */
export default function PaginaBateria() {
  const { pathname, hash } = useLocation()
  const nueva = rutaDesdeDireccionAntigua(pathname, hash)
  if (nueva) return <Navigate to={nueva} replace />
  return <CargaTablero cargar={cargarTablero} />
}
