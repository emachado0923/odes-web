/**
 * /crm/lider/*: el líder del equipo entra solo con contraseña. CrmSitio lo
 * carga aparte (React.lazy): el equipo no descarga este código.
 *
 * Fases: verificando (GET de la sesión) → ingreso (IngresoLider) → activa. Si
 * la verificación falla por otra cosa que no sea 401 (red, servidor), se
 * ofrece intentar de nuevo.
 *
 * En la fase activa provee ContextoLiderCrm (./contexto) a las pantallas del
 * líder y pinta su barra: Panel, Nueva tarea, Correos (con la insignia de los
 * correos sin enviar: pendientes más los que fallaron, en rojo si falló
 * alguno) y Equipo; a la derecha, de quién es la sesión, el tablero del equipo
 * (/crm) y «Cerrar sesión». La insignia se recarga al navegar y con
 * avisarCambioCorreos().
 *
 * Rutas (descendientes de /crm/lider):
 *   (índice)            PanelLider
 *   tareas/nueva        FormularioTarea modo="nueva"
 *   tareas/:id          DetalleTareaLider
 *   tareas/:id/editar   FormularioTarea modo="editar" (otra tarea = formulario nuevo)
 *   correos             CorreosLider
 *   equipo              EquipoLider
 *   *                   NoEncontradoCrm
 *
 * vencida() (una petición respondió 401) vuelve al ingreso con «La sesión
 * venció. Ingrese de nuevo.»; la dirección no cambia, así que al entrar otra
 * vez se sigue donde estaba. Cada pantalla pone su título con useTituloCrm (el
 * del ingreso, IngresoLider): este marco no pone uno propio en la fase activa
 * para no pisar el de la pantalla.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router'
import type { ResumenLiderCrm, SesionLiderCrm } from '../api-crm'
import { apiSesionLider, crearApiLider, esNoAutenticado, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import NoEncontradoCrm from '../NoEncontradoCrm'
import { Cargando, ErrorCarga, Icono, useAvisar, useTituloCrm } from '../ui'
import { ContextoLiderCrm, type ContextoLider } from './contexto'
import CorreosLider from './CorreosLider'
import EquipoLider from './EquipoLider'
import IngresoLider from './IngresoLider'
import PanelLider from './PanelLider'
import DetalleTareaLider from './tareas/DetalleTareaLider'
import FormularioTarea from './tareas/FormularioTarea'
import './lider.css'

const AVISO_VENCIDA = 'La sesión venció. Ingrese de nuevo.'

type Fase =
  | { tipo: 'verificando' }
  | { tipo: 'fallo'; error: unknown }
  | { tipo: 'ingreso'; aviso: string | null }
  | { tipo: 'activa'; sesion: SesionLiderCrm }

/** «José David Ramírez Abraham» → «José»; null si no hay nombre (el servidor manda «Líder»). */
function primerNombre(nombre: string): string | null {
  const primero = nombre.trim().split(/\s+/)[0] ?? ''
  return primero && primero.toLocaleLowerCase('es-CO') !== 'líder' ? primero : null
}

function numero(n: number): string {
  return n.toLocaleString('es-CO')
}

/** Mientras se comprueba la sesión, o si no se pudo comprobar. */
function Espera({ error, alReintentar }: { error?: unknown; alReintentar?: () => void }) {
  useTituloCrm('Ingreso del líder')
  return (
    <div className="crm-contenedor crm-pagina">
      {alReintentar ? (
        <ErrorCarga error={error} titulo="No se pudo comprobar la sesión." alReintentar={alReintentar} />
      ) : (
        <Cargando texto="Comprobando la sesión…" />
      )}
    </div>
  )
}

/** Editar otra tarea monta un formulario nuevo (no arrastra lo escrito en la anterior). */
function EditarTarea() {
  const { id } = useParams()
  return <FormularioTarea key={id} modo="editar" />
}

function BarraLider({
  sesion,
  correo,
  saliendo,
  alSalir,
}: {
  sesion: SesionLiderCrm
  correo: ResumenLiderCrm['correo'] | null
  saliendo: boolean
  alSalir: () => void
}) {
  const nombre = primerNombre(sesion.nombre)
  const errores = correo?.errores ?? 0
  const sinEnviar = (correo?.pendientes ?? 0) + errores

  return (
    <div className="crm-li-barra">
      <div className="crm-contenedor crm-li-barra-interior">
        <nav className="crm-li-menu" aria-label="Menú del líder">
          <NavLink to="/crm/lider" end className="crm-li-enlace">
            Panel
          </NavLink>
          <NavLink to="/crm/lider/tareas/nueva" className="crm-li-enlace">
            Nueva tarea
          </NavLink>
          <NavLink to="/crm/lider/correos" className="crm-li-enlace">
            Correos
            {sinEnviar > 0 ? (
              <>
                <span className="crm-li-insignia" data-tono={errores > 0 ? 'error' : undefined} aria-hidden="true">
                  {numero(sinEnviar)}
                </span>
                <span className="crm-sr">
                  {`, ${numero(sinEnviar)} sin enviar${errores > 0 ? ` (${numero(errores)} con error)` : ''}`}
                </span>
              </>
            ) : null}
          </NavLink>
          <NavLink to="/crm/lider/equipo" className="crm-li-enlace">
            Equipo
          </NavLink>
        </nav>

        <div className="crm-li-sesion">
          <span className="crm-li-quien">
            <Icono nombre="usuario" tamano={18} />
            {nombre ? `Sesión de ${nombre}` : 'Sesión del líder'}
          </span>
          <Link to="/crm" className="crm-boton crm-boton-fantasma crm-boton-sm">
            <Icono nombre="equipo" tamano={16} />
            Ver tablero del equipo
          </Link>
          <button type="button" className="crm-boton crm-boton-fantasma crm-boton-sm" disabled={saliendo} onClick={alSalir}>
            <Icono nombre="salir" tamano={16} />
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** La sesión abierta: contexto, barra y rutas del líder. */
function LiderActivo({ sesion, alVencer, alSalir }: { sesion: SesionLiderCrm; alVencer: () => void; alSalir: () => void }) {
  const api = useMemo(() => crearApiLider(sesion.csrf), [sesion.csrf])
  const avisar = useAvisar()
  const { pathname } = useLocation()
  const [cambiosCorreos, setCambiosCorreos] = useState(0)
  const [saliendo, setSaliendo] = useState(false)

  const avisarCambioCorreos = useCallback(() => setCambiosCorreos((n) => n + 1), [])

  const salir = useCallback(async () => {
    setSaliendo(true)
    try {
      await api.cerrarSesion()
    } catch (error) {
      // 401: en el servidor ya no había sesión. Otro error: la sesión sigue abierta y se dice por qué.
      if (!esNoAutenticado(error)) {
        setSaliendo(false)
        avisar(`No se pudo cerrar la sesión. ${mensajeDe(error)}`, 'error')
        return
      }
    }
    alSalir()
  }, [api, alSalir, avisar])

  const contexto = useMemo<ContextoLider>(
    () => ({ sesion, api, vencida: alVencer, salir, avisarCambioCorreos }),
    [sesion, api, alVencer, salir, avisarCambioCorreos],
  )

  // Insignia de Correos: se recarga al navegar y cuando una pantalla avisa que cambiaron.
  const correo = useCarga((signal) => api.resumen(signal).then((resumen) => resumen.correo), [api, pathname, cambiosCorreos], {
    conservarAlCambiar: true,
  })
  const vencio = esNoAutenticado(correo.error)
  useEffect(() => {
    if (vencio) alVencer()
  }, [vencio, alVencer])

  return (
    <ContextoLiderCrm value={contexto}>
      <div className="crm-li">
        <BarraLider sesion={sesion} correo={correo.datos} saliendo={saliendo} alSalir={() => void salir()} />
        <Routes>
          <Route index element={<PanelLider />} />
          <Route path="tareas/nueva" element={<FormularioTarea modo="nueva" />} />
          <Route path="tareas/:id" element={<DetalleTareaLider />} />
          <Route path="tareas/:id/editar" element={<EditarTarea />} />
          <Route path="correos" element={<CorreosLider />} />
          <Route path="equipo" element={<EquipoLider />} />
          <Route path="*" element={<NoEncontradoCrm />} />
        </Routes>
      </div>
    </ContextoLiderCrm>
  )
}

export default function SitioLider() {
  const [fase, setFase] = useState<Fase>({ tipo: 'verificando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    apiSesionLider.obtener().then(
      (sesion) => {
        if (vigente) setFase(sesion ? { tipo: 'activa', sesion } : { tipo: 'ingreso', aviso: null })
      },
      (error: unknown) => {
        if (vigente) setFase({ tipo: 'fallo', error })
      },
    )
    return () => {
      vigente = false
    }
  }, [intento])

  const reintentar = useCallback(() => {
    setFase({ tipo: 'verificando' })
    setIntento((n) => n + 1)
  }, [])
  const alIngresar = useCallback((sesion: SesionLiderCrm) => setFase({ tipo: 'activa', sesion }), [])
  const alVencer = useCallback(() => setFase({ tipo: 'ingreso', aviso: AVISO_VENCIDA }), [])
  const alSalir = useCallback(() => setFase({ tipo: 'ingreso', aviso: null }), [])

  if (fase.tipo === 'verificando') return <Espera />
  if (fase.tipo === 'fallo') return <Espera error={fase.error} alReintentar={reintentar} />
  if (fase.tipo === 'ingreso') return <IngresoLider aviso={fase.aviso} alIngresar={alIngresar} />
  return <LiderActivo sesion={fase.sesion} alVencer={alVencer} alSalir={alSalir} />
}
