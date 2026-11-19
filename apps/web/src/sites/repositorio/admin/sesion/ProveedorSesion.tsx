/**
 * Sesión de la administración.
 *
 * - Al montar pide GET /admin/sesion: con sesión, "activa"; con 401,
 *   "anonima" (se muestra el inicio de sesión en la misma URL, así que al
 *   entrar se llega a la página que se pidió).
 * - Un 401 en cualquier petición posterior pasa a "vencida": se muestra el
 *   inicio de sesión, pero la página de antes sigue montada (oculta), con lo
 *   que se estaba editando. Al volver a entrar, se ve igual que antes.
 * - El token CSRF vive solo en memoria (nunca en localStorage).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { CredencialesAdmin, SesionAdmin } from '../../api-repositorio'
import { ClienteAdmin, esAborto, esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { ContextoSesion, type EstadoSesion, type ValorSesion } from './contexto'

export default function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ fase: 'verificando' })
  const [intento, setIntento] = useState(0)
  // Un cliente por proveedor; guarda el token CSRF de la sesión (solo en memoria).
  const [cliente] = useState(
    () =>
      new ClienteAdmin({
        alNoAutenticado: () =>
          setEstado((previo) => (previo.fase === 'activa' ? { fase: 'vencida', sesion: previo.sesion } : previo)),
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
        if (esAborto(error)) return
        setEstado({ fase: 'error', mensaje: mensajeDe(error) })
      })
    return () => control.abort()
  }, [cliente, intento])

  function activar(sesion: SesionAdmin) {
    cliente.usarCsrf(sesion.csrf)
    setEstado({ fase: 'activa', sesion })
  }

  async function iniciar(credenciales: CredencialesAdmin) {
    activar(await cliente.iniciarSesion(credenciales))
  }

  async function cerrar() {
    try {
      await cliente.cerrarSesion()
    } catch (error) {
      // Sin sesión en el servidor ya es "cerrada"; cualquier otro error se informa.
      if (!(esErrorAdmin(error) && error.estado === 401)) throw error
    }
    cliente.usarCsrf(null)
    setEstado({ fase: 'anonima' })
  }

  function reintentar() {
    setEstado({ fase: 'verificando' })
    setIntento((n) => n + 1)
  }

  const valor: ValorSesion = { estado, cliente, iniciar, cerrar, reintentar }
  return <ContextoSesion value={valor}>{children}</ContextoSesion>
}
