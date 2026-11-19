import './compartido.css'

/**
 * Indicador neutral que se muestra mientras se descarga el chunk de una rama
 * cuando se entra directamente por su URL (HydrateFallback del router).
 */
export default function CargaRama() {
  return (
    <div className="pantalla-estado pantalla-estado--carga" role="status" aria-live="polite">
      <span className="pantalla-estado__indicador" aria-hidden="true" />
      <p className="pantalla-estado__texto">Cargando…</p>
    </div>
  )
}
