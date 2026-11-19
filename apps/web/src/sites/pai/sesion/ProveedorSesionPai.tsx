/**
 * Sesión del PAI, adaptada de repositorio/admin/sesion/ProveedorSesion.tsx.
 *
 * - Al montar pide GET /api/pai/sesion: con sesión, "activa"; con 401,
 *   "anonima" (el ingreso aparece en la misma URL, así que al entrar se llega
 *   a la página que se pidió); con otro error (red, 503), "error" con
 *   "Reintentar".
 * - Un 401 en cualquier petición posterior (alNoAutenticado del cliente) pasa
 *   a "vencida": el ingreso aparece encima y la página sigue montada, con lo
 *   que se estaba haciendo. Al volver a entrar se ve igual que antes, y las
 *   cargas que fallaron por la sesión vencida se repiten solas (generacion).
 * - Un 403 `prohibido` (alProhibido) hace comprobar la sesión con
 *   GET /sesion: la cookie es de todo el navegador, así que en otra pestaña
 *   pudieron cerrar la sesión (-> "vencida") o entrar con otra cuenta (->
 *   esa cuenta, y las páginas se montan de nuevo: nada de la anterior queda a
 *   la vista) o con la misma (-> el CSRF nuevo).
 * - Con sesión activa (y sin contraseña temporal pendiente) pide la vigencia
 *   para la barra (bimestre abierto); las páginas de administración la
 *   reemplazan después de abrir o cerrar el bimestre (actualizarVigencia).
 * - vigenciaElegida: el año que consultan todas las páginas (null = el más
 *   reciente); se vuelve a null al cambiar de usuario.
 * - El token CSRF vive solo en memoria, dentro del cliente.
 * - El registro de cambios sin guardar (componentes/cambiosPendientes.ts) lo
 *   provee PaiSitio.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CambioContrasenaPai, CredencialesPai, VigenciaPai } from '../api-pai'
import { ClientePai, esAborto, esErrorPai, mensajeDe } from '../datos/clientePai'
import { ContextoSesionPai, type EstadoSesionPai, type ValorSesionPai } from './contexto'

export default function ProveedorSesionPai({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesionPai>({ fase: 'verificando' })
  const [intento, setIntento] = useState(0)
  const [vigencia, setVigencia] = useState<VigenciaPai | null>(null)
  const [pedidoVigencia, setPedidoVigencia] = useState(0)
  const [vigenciaElegida, setVigenciaElegida] = useState<number | null>(null)
  const [generacion, setGeneracion] = useState(0)
  /** Sube con cada 403 `prohibido`: hay que comprobar si la sesión sigue siendo la misma. */
  const [prohibidos, setProhibidos] = useState(0)
  // Un cliente por proveedor: guarda el CSRF de la sesión (solo en memoria).
  const [cliente] = useState(
    () =>
      new ClientePai({
        alNoAutenticado: () =>
          setEstado((previo) => (previo.fase === 'activa' ? { fase: 'vencida', sesion: previo.sesion } : previo)),
        alProhibido: () => setProhibidos((n) => n + 1),
      }),
  )

  useEffect(() => {
    const control = new AbortController()
    cliente
      .obtenerSesion(control.signal)
      .then((sesion) => {
        cliente.usarCsrf(sesion?.csrf ?? null)
        setEstado(sesion ? { fase: 'activa', sesion } : { fase: 'anonima' })
      })
      .catch((error: unknown) => {
        if (esAborto(error) || control.signal.aborted) return
        setEstado({ fase: 'error', mensaje: mensajeDe(error) })
      })
    return () => control.abort()
  }, [cliente, intento])

  // Estado actual para los avisos del cliente (que llegan fuera del render).
  const estadoActual = useRef(estado)
  useEffect(() => {
    estadoActual.current = estado
  }, [estado])

  // 403 prohibido: ¿sigue siendo la misma sesión? (una comprobación a la vez).
  const comprobando = useRef(false)
  useEffect(() => {
    if (prohibidos === 0 || comprobando.current) return
    comprobando.current = true
    cliente
      .obtenerSesion()
      .then((nueva) => {
        const previo = estadoActual.current
        if (previo.fase !== 'activa') return
        if (!nueva) {
          setEstado({ fase: 'vencida', sesion: previo.sesion })
          return
        }
        cliente.usarCsrf(nueva.csrf)
        if (nueva.id !== previo.sesion.id) {
          // Otra cuenta: empieza en la vigencia más reciente y las páginas se montan de nuevo.
          setVigenciaElegida(null)
          setEstado({ fase: 'activa', sesion: nueva })
        } else if (nueva.csrf !== previo.sesion.csrf) {
          // La misma persona con otra sesión (otra pestaña): solo cambia el CSRF.
          setEstado({ fase: 'activa', sesion: nueva })
        }
      })
      .catch(() => {
        // Sin poder comprobar (red): la petición ya mostró su error.
      })
      .finally(() => {
        comprobando.current = false
      })
  }, [cliente, prohibidos])

  // La vigencia solo se pide con la sesión activa y sin contraseña temporal
  // (con ella el servidor responde 403 a todo lo demás).
  const usuarioConsulta = estado.fase === 'activa' && !estado.sesion.debeCambiarContrasena ? estado.sesion.id : null

  useEffect(() => {
    if (usuarioConsulta === null) return
    const control = new AbortController()
    cliente
      .obtenerVigencia(vigenciaElegida, control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setVigencia(datos)
      })
      .catch((error: unknown) => {
        // El año elegido ya no existe (404): se vuelve a la vigencia más reciente.
        if (!control.signal.aborted && vigenciaElegida !== null && esErrorPai(error) && error.estado === 404) {
          setVigenciaElegida(null)
        }
        // Sin vigencia la barra no muestra el bimestre; las páginas cargan la suya.
      })
    return () => control.abort()
  }, [cliente, usuarioConsulta, pedidoVigencia, vigenciaElegida])

  const iniciar = useCallback(
    async (credenciales: CredencialesPai) => {
      // La vigencia es la misma para todos los usuarios: se vuelve a pedir al activarse la sesión.
      const sesion = await cliente.iniciarSesion(credenciales)
      const previo = estadoActual.current
      // Entró otra persona: empieza en la vigencia más reciente.
      if (previo.fase === 'vencida' && previo.sesion.id !== sesion.id) setVigenciaElegida(null)
      setEstado({ fase: 'activa', sesion })
      setGeneracion((n) => n + 1)
    },
    [cliente],
  )

  const cerrar = useCallback(async () => {
    try {
      await cliente.cerrarSesion()
    } catch (error) {
      // Sin sesión en el servidor ya está cerrada; cualquier otro error se informa.
      if (!(esErrorPai(error) && error.estado === 401)) throw error
    }
    cliente.usarCsrf(null)
    setVigencia(null)
    setVigenciaElegida(null)
    setEstado({ fase: 'anonima' })
  }, [cliente])

  const cambiarContrasena = useCallback(
    async (datos: CambioContrasenaPai) => {
      const sesion = await cliente.cambiarContrasena(datos)
      setEstado({ fase: 'activa', sesion })
    },
    [cliente],
  )

  const reintentar = useCallback(() => {
    setEstado({ fase: 'verificando' })
    setIntento((n) => n + 1)
  }, [])

  const recargarVigencia = useCallback(() => setPedidoVigencia((n) => n + 1), [])

  const elegirVigencia = useCallback((anio: number | null) => setVigenciaElegida(anio), [])

  const sesion = estado.fase === 'activa' || estado.fase === 'vencida' ? estado.sesion : null
  const valor = useMemo<ValorSesionPai>(
    () => ({
      estado,
      cliente,
      sesion,
      vigencia: sesion ? vigencia : null,
      vigenciaElegida,
      elegirVigencia,
      generacion,
      iniciar,
      cerrar,
      cambiarContrasena,
      reintentar,
      actualizarVigencia: setVigencia,
      recargarVigencia,
    }),
    [
      estado,
      cliente,
      sesion,
      vigencia,
      vigenciaElegida,
      elegirVigencia,
      generacion,
      iniciar,
      cerrar,
      cambiarContrasena,
      reintentar,
      recargarVigencia,
    ],
  )
  return <ContextoSesionPai value={valor}>{children}</ContextoSesionPai>
}
