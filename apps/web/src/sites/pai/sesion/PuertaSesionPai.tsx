/**
 * Decide qué se ve dentro de <main> según la sesión:
 * - verificando: "Verificando la sesión…"; error: aviso con "Reintentar";
 * - anonima: el ingreso (en la misma URL: al entrar se llega a la página
 *   pedida);
 * - activa con contraseña temporal: el cambio de contraseña obligatorio;
 * - activa: las páginas (children);
 * - vencida: las páginas siguen montadas pero ocultas (hidden) y encima el
 *   ingreso "Su sesión venció"; al volver a entrar se ve todo igual. Si entra
 *   otra persona, las páginas se montan de nuevo (key = id del usuario) para
 *   no mostrarle lo que estaba en pantalla de la anterior.
 */
import type { ReactNode } from 'react'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import CambioContrasenaObligatorio from './CambioContrasenaObligatorio'
import { useSesionPai } from './contexto'
import PaginaIngresoPai from './PaginaIngresoPai'

export default function PuertaSesionPai({ children }: { children: ReactNode }) {
  const { estado, reintentar } = useSesionPai()

  if (estado.fase === 'verificando') {
    return (
      <div className="pai-pagina">
        <Cargando texto="Verificando la sesión…" />
      </div>
    )
  }
  if (estado.fase === 'error') {
    return (
      <div className="pai-pagina">
        <ErrorCarga
          titulo="No se pudo abrir el Plan de Acción Institucional."
          mensaje={estado.mensaje}
          onReintentar={reintentar}
        />
      </div>
    )
  }
  if (estado.fase === 'anonima') return <PaginaIngresoPai />

  const vencida = estado.fase === 'vencida'
  if (estado.sesion.debeCambiarContrasena) {
    // Con la contraseña temporal no hay páginas montadas que conservar.
    return vencida ? <PaginaIngresoPai vencida /> : <CambioContrasenaObligatorio />
  }
  return (
    <>
      {vencida && <PaginaIngresoPai vencida />}
      <div key={estado.sesion.id} hidden={vencida} className="pai-con-sesion">
        {children}
      </div>
    </>
  )
}
