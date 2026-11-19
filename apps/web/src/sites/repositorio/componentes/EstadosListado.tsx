/**
 * Estados de la carga del listado: cargando, error (con "Intentar de nuevo")
 * y repositorio vacío. Usan el aspecto de .rp-vacio del bloque.
 */
import type { Ref } from 'react'
import type { FalloListado } from '../datos/cliente'
import Icono from './Icono'

export function CargandoDocumentos({ refCaja }: { refCaja?: Ref<HTMLDivElement> }) {
  return (
    <div className="rp-vacio rp-cargando-listado" role="status" tabIndex={-1} ref={refCaja}>
      <span className="rp-indicador" aria-hidden="true" />
      <p className="rp-vacio-texto">Cargando documentos…</p>
    </div>
  )
}

function explicar(fallo: FalloListado): string {
  switch (fallo.tipo) {
    case 'no_disponible':
      return 'El repositorio no está disponible en este momento. Inténtalo de nuevo en unos minutos.'
    case 'red':
      return 'No pudimos conectarnos con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.'
    default:
      return 'Ocurrió un error al leer los documentos. Inténtalo de nuevo en unos minutos.'
  }
}

export function ErrorDocumentos({
  fallo,
  onReintentar,
  refBoton,
}: {
  fallo: FalloListado
  onReintentar: () => void
  refBoton?: Ref<HTMLButtonElement>
}) {
  return (
    <div className="rp-vacio rp-fallo">
      <Icono nombre="error" />
      <div role="alert">
        <p className="rp-vacio-titulo">No pudimos cargar los documentos</p>
        <p className="rp-vacio-texto">{explicar(fallo)}</p>
      </div>
      <p className="rp-vacio-texto rp-fallo-contacto">
        Si el problema sigue, escríbenos a{' '}
        <a href="mailto:observatorio@sapiencia.gov.co">observatorio@sapiencia.gov.co</a>.
      </p>
      <button type="button" className="rp-boton rp-boton-borde rp-reintentar" ref={refBoton} onClick={onReintentar}>
        <Icono nombre="reintentar" />
        Intentar de nuevo
      </button>
    </div>
  )
}

export function SinDocumentos() {
  return (
    <div className="rp-vacio">
      <Icono nombre="documento" />
      <p className="rp-vacio-titulo">Todavía no hay documentos publicados</p>
      <p className="rp-vacio-texto">Vuelve pronto: aquí aparecerán los productos del Observatorio de Sapiencia.</p>
    </div>
  )
}
