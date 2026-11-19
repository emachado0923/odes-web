/**
 * Piezas comunes de las páginas de la administración: título (h1 que recibe
 * el foco al llegar navegando dentro de la aplicación, para que el lector de
 * pantalla anuncie la página nueva), carga y error con "Intentar de nuevo".
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import Icono from './IconoAdmin'

export function TituloPagina({
  children,
  documento,
  antes,
}: {
  children: ReactNode
  /** Texto de la pestaña del navegador (sin el sufijo). */
  documento: string
  /** Contenido antes del h1 (migas, etiqueta). */
  antes?: ReactNode
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  const { key } = useLocation()
  const llegadaNavegando = useRef(key !== 'default')

  useEffect(() => {
    if (llegadaNavegando.current) ref.current?.focus()
  }, [])

  return (
    <>
      <title>{`${documento} · Administración del repositorio`}</title>
      {antes}
      <h1 className="ra-titulo" ref={ref} tabIndex={-1}>
        {children}
      </h1>
    </>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="rp-vacio rp-cargando-listado ra-cargando" role="status">
      <span className="rp-indicador" aria-hidden="true" />
      <p className="rp-vacio-texto">{texto}</p>
    </div>
  )
}

export function ErrorCarga({
  titulo,
  mensaje,
  onReintentar,
}: {
  titulo: string
  mensaje: string
  onReintentar?: () => void
}) {
  return (
    <div className="rp-vacio rp-fallo">
      <Icono nombre="error" />
      <div role="alert">
        <p className="rp-vacio-titulo">{titulo}</p>
        <p className="rp-vacio-texto">{mensaje}</p>
      </div>
      {onReintentar && (
        <button type="button" className="rp-boton rp-boton-borde rp-reintentar" onClick={onReintentar}>
          <Icono nombre="reintentar" />
          Intentar de nuevo
        </button>
      )}
    </div>
  )
}
