/**
 * Estados de carga con el marcado del kit, para todas las páginas del PAI.
 */

/** Indicador de carga (spinner del kit + texto para lectores de pantalla). */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="d-flex align-items-center gap-2 py-4" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  )
}

/** Error al cargar, con botón para reintentar. */
export function ErrorCarga({
  titulo = 'No se pudo cargar la información.',
  mensaje,
  onReintentar,
}: {
  titulo?: string
  mensaje: string
  onReintentar?: () => void
}) {
  return (
    <div className="alert alert-danger" role="alert">
      <p className="fw-bold mb-1">{titulo}</p>
      <p className="mb-0">{mensaje}</p>
      {onReintentar && (
        <button type="button" className="btn btn-outline-neutral btn-sm mt-3" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}
