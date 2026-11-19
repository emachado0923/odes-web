/**
 * Barra de navegación bajo la cabecera (kit `nav`, clases pai-barra de
 * pai.css), solo con sesión activa:
 * - enlaces: Tablero y, para el administrador, Seguimiento, Usuarios,
 *   Bimestre, Autorizaciones y Registro; "Mi cuenta" (con contraseña
 *   temporal pendiente no hay enlaces: solo se puede cambiarla o salir);
 * - el bimestre abierto ("Bimestre 4 · julio–agosto · abierto hasta el 15
 *   de septiembre" o "No hay bimestre abierto", textoVigencia.ts);
 * - si hay más de una vigencia cargada, el selector de vigencia (año) que
 *   consultan todas las páginas (p. ej., para terminar el Bimestre 6 del año
 *   anterior cuando ya se cargó el siguiente); con cambios sin guardar
 *   pregunta antes, porque cambiar de año vuelve a cargar la página;
 * - nombre y rol, y "Cerrar sesión": si una casilla se está guardando,
 *   espera a que termine ("Guardando…"); si después quedan cambios sin
 *   guardar (useRegistroCambios), pregunta antes, porque salir desmonta la
 *   página.
 */
import { useId, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { mensajeDe } from '../datos/clientePai'
import {
  RUTA_ADMIN,
  RUTA_ADMIN_AUTORIZACIONES,
  RUTA_ADMIN_BIMESTRE,
  RUTA_ADMIN_REGISTRO,
  RUTA_ADMIN_USUARIOS,
  RUTA_CUENTA,
  RUTA_PAI,
} from '../rutas'
import { esAdministrador, nombreRol, useSesionPai } from '../sesion/contexto'
import { ESTADO_SIN_GUARDIA, useRegistroCambios } from './cambiosPendientes'
import ModalPai from './ModalPai'
import { textoVigencia } from './textoVigencia'
import './barra-pai.css'

interface Enlace {
  ruta: string
  texto: string
  /** Solo activo en esa ruta exacta (no en sus subrutas). */
  exacto?: boolean
}

const ENLACES_TODOS: Enlace[] = [{ ruta: RUTA_PAI, texto: 'Tablero', exacto: true }]

const ENLACES_ADMINISTRADOR: Enlace[] = [
  { ruta: RUTA_ADMIN, texto: 'Seguimiento', exacto: true },
  { ruta: RUTA_ADMIN_USUARIOS, texto: 'Usuarios' },
  { ruta: RUTA_ADMIN_BIMESTRE, texto: 'Bimestre' },
  { ruta: RUTA_ADMIN_AUTORIZACIONES, texto: 'Autorizaciones' },
  { ruta: RUTA_ADMIN_REGISTRO, texto: 'Registro' },
]

const ENLACE_CUENTA: Enlace = { ruta: RUTA_CUENTA, texto: 'Mi cuenta' }

export default function BarraPai() {
  const { estado, vigencia, cerrar, vigenciaElegida, elegirVigencia } = useSesionPai()
  const cambios = useRegistroCambios()
  const navigate = useNavigate()
  const [cerrando, setCerrando] = useState(false)
  const [esperando, setEsperando] = useState(false)
  /** Acción que espera confirmación por los cambios sin guardar. */
  const [confirmar, setConfirmar] = useState<null | { tipo: 'salir' } | { tipo: 'vigencia'; anio: number | null }>(null)
  const [error, setError] = useState<string | null>(null)
  const idAviso = useId()
  const refSeguir = useRef<HTMLButtonElement>(null)

  if (estado.fase !== 'activa') return null
  const sesion = estado.sesion
  const completa = !sesion.debeCambiarContrasena
  const enlaces = [...ENLACES_TODOS, ...(esAdministrador(sesion) ? ENLACES_ADMINISTRADOR : []), ENLACE_CUENTA]

  async function salir(sinGuardar = false) {
    if (!sinGuardar) {
      // Al pulsar el botón, la casilla que tenía el foco se guarda (al salir de ella): se espera a que termine.
      if (cambios.guardando()) {
        setEsperando(true)
        try {
          await cambios.esperarGuardados()
        } finally {
          setEsperando(false)
        }
      }
      if (cambios.hay()) {
        setConfirmar({ tipo: 'salir' })
        return
      }
    }
    setConfirmar(null)
    setCerrando(true)
    setError(null)
    try {
      await cerrar()
      // Quien entre después empieza en el tablero (sin preguntar otra vez por los cambios: ya se descartaron).
      navigate(RUTA_PAI, { replace: true, state: ESTADO_SIN_GUARDIA })
    } catch (e) {
      setError(`No se pudo cerrar la sesión. ${mensajeDe(e)}`)
    } finally {
      setCerrando(false)
    }
  }

  function cambiarVigencia(anio: number | null, sinGuardar = false) {
    if (!sinGuardar && cambios.hay()) {
      setConfirmar({ tipo: 'vigencia', anio })
      return
    }
    setConfirmar(null)
    elegirVigencia(anio)
  }

  const vigencias = vigencia?.vigencias ?? []
  const anioElegido = vigenciaElegida ?? vigencias[0] ?? null

  return (
    <div className="pai-barra">
      <div className="pai-barra-interior">
        {completa && (
          <nav aria-label="Secciones del Plan de Acción Institucional">
            <ul className="nav pai-barra-enlaces">
              {enlaces.map((enlace) => (
                <li className="nav-item" key={enlace.ruta}>
                  <NavLink to={enlace.ruta} end={enlace.exacto} className="nav-link">
                    {enlace.texto}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="pai-barra-sesion">
          {completa && vigencias.length > 1 && (
            <div className="pai-barra-vigencia">
              <label className="pai-barra-vigencia-etiqueta" htmlFor={`${idAviso}-vigencia`}>
                Vigencia
              </label>
              <select
                id={`${idAviso}-vigencia`}
                className="form-select form-select-sm"
                value={anioElegido ?? ''}
                onChange={(evento) => {
                  const anio = Number(evento.target.value)
                  cambiarVigencia(anio === vigencias[0] ? null : anio)
                }}
              >
                {vigencias.map((anio, i) => (
                  <option key={anio} value={anio}>
                    {i === 0 ? `${anio} (la más reciente)` : anio}
                  </option>
                ))}
              </select>
            </div>
          )}
          {completa && vigencia && (
            <p className="pai-barra-bimestre">
              <span className="pai-solo-lector">Bimestre para reportar: </span>
              {textoVigencia(vigencia)}
            </p>
          )}
          <p className="pai-barra-usuario">
            <span className="pai-solo-lector">Sesión de </span>
            <strong>{sesion.nombre || sesion.usuario}</strong>
            <span className="pai-barra-rol">{nombreRol(sesion.rol)}</span>
          </p>
          <button
            type="button"
            className="btn btn-outline-neutral btn-sm"
            onClick={() => void salir()}
            disabled={cerrando || esperando}
          >
            {esperando ? 'Guardando…' : cerrando ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
      {error && (
        <div className="pai-barra-error alert alert-danger mb-0" role="alert">
          {error}
        </div>
      )}
      <ModalPai
        abierto={confirmar !== null}
        titulo="Hay cambios sin guardar"
        rol="alertdialog"
        idDescripcion={idAviso}
        onCerrar={() => setConfirmar(null)}
        enfoqueInicial={refSeguir}
        pie={
          <>
            <button ref={refSeguir} type="button" className="btn btn-primary" onClick={() => setConfirmar(null)}>
              Seguir editando
            </button>
            {confirmar?.tipo === 'vigencia' ? (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => cambiarVigencia(confirmar.anio, true)}
              >
                Cambiar de vigencia sin guardar
              </button>
            ) : (
              <button type="button" className="btn btn-outline-danger" onClick={() => void salir(true)}>
                Cerrar sesión sin guardar
              </button>
            )}
          </>
        }
      >
        <p id={idAviso} className="mb-0">
          {confirmar?.tipo === 'vigencia'
            ? 'Si cambia de vigencia ahora, la página se vuelve a cargar y se perderán los cambios que no ha guardado.'
            : 'Si cierra la sesión ahora, se perderán los cambios que no ha guardado.'}
        </p>
      </ModalPai>
    </div>
  )
}
