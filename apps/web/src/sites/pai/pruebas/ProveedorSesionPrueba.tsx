/**
 * Apoyo de las pruebas web del PAI: una sesión ya "activa" sin pasar por el
 * proveedor real ni por GET /sesion, para probar páginas sueltas.
 *
 *   render(
 *     <MemoryRouter>
 *       <ProveedorSesionPrueba rol="responsable" vigencia={vigenciaPrueba({ bimestreAbierto: 4 })}>
 *         <PaginaTablero />
 *       </ProveedorSesionPrueba>
 *     </MemoryRouter>,
 *   )
 *
 * El cliente es un ClientePai real (las pruebas simulan fetch con
 * vi.stubGlobal) con el CSRF de la sesión de prueba (CSRF_PRUEBA de
 * datosPrueba.ts) y sin esperas entre reintentos.
 */
import { useState, type ReactNode } from 'react'
import type { RolPai, SesionPai, VigenciaPai } from '../api-pai'
import { ClientePai } from '../datos/clientePai'
import { ContextoSesionPai, type ValorSesionPai } from '../sesion/contexto'
import { sesionPrueba, vigenciaPrueba } from './datosPrueba'

export function ProveedorSesionPrueba({
  rol = 'responsable',
  sesion,
  vigencia = vigenciaPrueba(),
  alNoAutenticado = () => undefined,
  children,
}: {
  rol?: RolPai
  sesion?: SesionPai
  vigencia?: VigenciaPai | null
  alNoAutenticado?: () => void
  children: ReactNode
}) {
  const [valor] = useState<ValorSesionPai>(() => {
    const activa = sesion ?? sesionPrueba(rol)
    const cliente = new ClientePai({ alNoAutenticado, esperar: async () => undefined })
    cliente.usarCsrf(activa.csrf)
    return {
      estado: { fase: 'activa', sesion: activa },
      cliente,
      sesion: activa,
      vigencia,
      vigenciaElegida: null,
      elegirVigencia: () => undefined,
      generacion: 0,
      iniciar: async () => undefined,
      cerrar: async () => undefined,
      cambiarContrasena: async () => undefined,
      reintentar: () => undefined,
      actualizarVigencia: () => undefined,
      recargarVigencia: () => undefined,
    }
  })
  return <ContextoSesionPai value={valor}>{children}</ContextoSesionPai>
}
