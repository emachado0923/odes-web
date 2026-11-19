import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { esperarFuentes, importarTablero, pedirDatosTablero } from '../carga-tablero'
import CargaTablero from '../componentes/CargaTablero'
import IngresoTablero from '../componentes/IngresoTablero'
import NoEncontradoTableros from '../paginas/NoEncontradoTableros'
import { RUTA_FONDOS, RUTA_FONDOS_VENTANILLA, URL_DATOS_FONDOS } from '../rutas'
import { cerrarSesion, ErrorSinSesion, obtenerSesion, type SesionTableros } from '../sesion-tableros'
import type { DatosTableroFondos } from './tipos'
import VentanillaFondos from './VentanillaFondos'
import '../matricula/tablero-matricula.css'
import './tablero-fondos.css'

/** Marca de la recarga automática cuando el chunk del tablero ya no existe. */
const CLAVE_RECARGA = 'tableros:fondos:recarga'

type Vista = 'tablero' | 'ventanilla'

const VISTAS: { vista: Vista; ruta: string; nombre: string; titulo: string }[] = [
  { vista: 'tablero', ruta: RUTA_FONDOS, nombre: 'Tablero', titulo: 'Tablero beneficiarios de los fondos de Sapiencia (2026)' },
  { vista: 'ventanilla', ruta: RUTA_FONDOS_VENTANILLA, nombre: 'Ventanilla de consulta', titulo: 'Ventanilla de consulta de los fondos de Sapiencia' },
]

/** La vista de la dirección, o null si la dirección no es ninguna de las dos. */
function vistaDe(pathname: string): Vista | null {
  const ruta = pathname.replace(/\/+$/, '')
  return VISTAS.find((v) => v.ruta === ruta)?.vista ?? null
}

/** Revisión mínima de la forma de la respuesta: lo demás lo garantiza la carga (validarFondos del servidor). */
function revisar(datos: DatosTableroFondos): DatosTableroFondos {
  const fondos = datos?.fondos
  if (!fondos?.meta || !fondos.dim || !Array.isArray(fondos.dim.periodo) || !Array.isArray(fondos.estados)) {
    throw new Error('El tablero recibió datos con un formato inesperado.')
  }
  return { fondos, definiciones: datos.definiciones ?? {} }
}

async function cargarTablero(): Promise<ComponentType> {
  const [datos] = await Promise.all([
    pedirDatosTablero<DatosTableroFondos>(URL_DATOS_FONDOS).then(revisar),
    esperarFuentes(),
  ])
  // Las fuentes van antes del import: el tablero mide textos con la letra
  // cargada. Los datos no van en window: se pasan por props.
  const Tablero = (await importarTablero(() => import('./TableroFondos'), CLAVE_RECARGA)) as ComponentType<{
    datos: DatosTableroFondos
  }>
  return function TableroConDatos() {
    return <Tablero datos={datos} />
  }
}

type Estado =
  | { tipo: 'verificando' }
  | { tipo: 'ingreso'; aviso: string | null }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'sesion'; sesion: SesionTableros }

/**
 * Los fondos de Sapiencia, privados (sesión de los tableros, cuentas de
 * npm run tableros:crear-usuario), en dos vistas con la misma sesión:
 *
 *   /tableros/fondos-2026             el tablero agregado (React + ECharts)
 *   /tableros/fondos-2026/ventanilla  la ventanilla de consulta por documento
 *
 * Un selector arriba cambia entre las dos al instante: es la misma página (la
 * ruta es fondos-2026/*), cada vista queda montada después de abrirla (la
 * otra solo se oculta, así no se pierde la consulta ni los filtros) y, con la
 * sesión abierta, el tablero se precarga aunque se entre por la ventanilla.
 */
export default function PaginaFondos() {
  const { pathname } = useLocation()
  const vista = vistaDe(pathname)
  const [estado, setEstado] = useState<Estado>({ tipo: 'verificando' })
  // Vistas ya abiertas: siguen montadas (ocultas) al cambiar a la otra.
  const [abiertas, setAbiertas] = useState<Record<Vista, boolean>>({ tablero: vista === 'tablero', ventanilla: vista === 'ventanilla' })
  if (vista && !abiertas[vista]) setAbiertas({ ...abiertas, [vista]: true })
  const precarga = useRef<Promise<ComponentType> | null>(null)

  // Estable (CargaTablero vuelve a cargar si cambia). Una sola carga por sesión:
  // la precarga y el montaje comparten la promesa; si falla, se puede reintentar.
  // Si la sesión vence mientras carga, vuelve al ingreso con un aviso.
  const cargar = useCallback(async () => {
    precarga.current ??= cargarTablero().catch((error: unknown) => {
      precarga.current = null
      throw error
    })
    try {
      return await precarga.current
    } catch (error) {
      if (error instanceof ErrorSinSesion) setEstado({ tipo: 'ingreso', aviso: 'La sesión venció. Ingrese de nuevo.' })
      throw error
    }
  }, [])

  // Con la sesión abierta, el tablero se trae en segundo plano: al cambiar a él ya está listo.
  const entrar = useCallback(
    (sesion: SesionTableros) => {
      setEstado({ tipo: 'sesion', sesion })
      cargar().catch(() => undefined)
    },
    [cargar],
  )

  useEffect(() => {
    let vigente = true
    obtenerSesion().then(
      (sesion) => {
        if (!vigente) return
        if (sesion) entrar(sesion)
        else setEstado({ tipo: 'ingreso', aviso: null })
      },
      (error: unknown) =>
        vigente && setEstado({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'No se pudo comprobar la sesión.' }),
    )
    return () => {
      vigente = false
    }
  }, [entrar])

  if (!vista) return <NoEncontradoTableros />
  const titulo = VISTAS.find((v) => v.vista === vista)?.titulo ?? ''

  if (estado.tipo === 'verificando') {
    return (
      <div className="container-fluid p-4 p-xl-8">
        <p className="text-neutral-50 mb-0" role="status">
          Cargando…
        </p>
      </div>
    )
  }
  if (estado.tipo === 'error') {
    return (
      <div className="container-fluid p-4 p-xl-8">
        <div className="alert alert-danger" role="alert">
          <b>La página no pudo cargarse.</b>
          <br />
          {estado.mensaje}
        </div>
      </div>
    )
  }
  if (estado.tipo === 'ingreso') {
    return <IngresoTablero titulo={titulo} aviso={estado.aviso} alIngresar={entrar} />
  }
  const { sesion } = estado
  const salir = (aviso: string) => {
    precarga.current = null
    setAbiertas({ tablero: vista === 'tablero', ventanilla: vista === 'ventanilla' })
    setEstado({ tipo: 'ingreso', aviso })
  }
  return (
    <>
      <div className="tb-sesion">
        <nav className="vc-selector" aria-label="Fondos de Sapiencia">
          {VISTAS.map((v) => (
            <Link key={v.vista} to={v.ruta} className="vc-selector-opcion" aria-current={v.vista === vista ? 'page' : undefined}>
              {v.nombre}
            </Link>
          ))}
        </nav>
        <span>
          Sesión de <b>{sesion.nombre || sesion.usuario}</b>
        </span>
        <button
          type="button"
          className="tb-sesion-salir"
          onClick={() => {
            void cerrarSesion(sesion).finally(() => salir('Cerró la sesión.'))
          }}
        >
          Cerrar sesión
        </button>
      </div>
      {abiertas.tablero && (
        <div hidden={vista !== 'tablero'}>
          <CargaTablero cargar={cargar} />
        </div>
      )}
      {abiertas.ventanilla && (
        <div hidden={vista !== 'ventanilla'}>
          <VentanillaFondos sesion={sesion} alVencer={() => salir('La sesión venció. Ingrese de nuevo.')} />
        </div>
      )}
    </>
  )
}
