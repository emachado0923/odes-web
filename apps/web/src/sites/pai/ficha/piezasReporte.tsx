/**
 * Piezas de lectura de un reporte, compartidas por la ficha del indicador y
 * los modales: los textos de la ficha F-ES-DE-003 y la línea de una
 * evidencia (enlace de descarga + tipo, tamaño, fecha y quién la subió).
 */
import type { EvidenciaPai, ReporteBimestrePai } from '../api-pai'
import { formatoBytes, formatoFechaHora } from '../datos/formatos'
import { ETIQUETAS_OBSERVACIONES } from '../modales/formularioObservaciones'
import { nombreTipoEvidencia } from '../tablero/presentacion'

function Texto({ valor }: { valor: string | null }) {
  return valor ? <span className="pai-texto-largo">{valor}</span> : <span className="pai-sin-dato">Sin información</span>
}

/** Los textos del reporte (solo lectura). */
export function TextosReporte({ reporte }: { reporte: ReporteBimestrePai }) {
  const riesgo = reporte.riesgoMaterializado
  return (
    <dl className="pai-textos">
      <dt>{ETIQUETAS_OBSERVACIONES.logros}</dt>
      <dd>
        <Texto valor={reporte.logros} />
      </dd>
      <dt>{ETIQUETAS_OBSERVACIONES.observaciones}</dt>
      <dd>
        <Texto valor={reporte.observaciones} />
      </dd>
      <dt>Riesgo materializado</dt>
      <dd>{riesgo === 'SI' ? 'Sí' : riesgo === 'NO' ? 'No' : <span className="pai-sin-dato">Sin respuesta</span>}</dd>
      {(riesgo === 'SI' || reporte.numeralRiesgo || reporte.descripcionRiesgo) && (
        <>
          <dt>{ETIQUETAS_OBSERVACIONES.numeralRiesgo}</dt>
          <dd>
            <Texto valor={reporte.numeralRiesgo} />
          </dd>
          <dt>{ETIQUETAS_OBSERVACIONES.descripcionRiesgo}</dt>
          <dd>
            <Texto valor={reporte.descripcionRiesgo} />
          </dd>
        </>
      )}
      <dt>{ETIQUETAS_OBSERVACIONES.fuentesVerificacion}</dt>
      <dd>
        <Texto valor={reporte.fuentesVerificacion} />
      </dd>
    </dl>
  )
}

/** "Guardado por Ana el 3 sept 2026, 10:15 a. m." / "Importado del Excel de seguimiento." / null. */
export function OrigenReporte({ reporte }: { reporte: ReporteBimestrePai }) {
  if (!reporte.origen) return null
  if (reporte.origen === 'importado' && !reporte.actualizadoPor) {
    return <p className="pai-origen">Importado del Excel de seguimiento.</p>
  }
  const cuando = formatoFechaHora(reporte.actualizadoEn)
  const frase = `Guardado${reporte.actualizadoPor ? ` por ${reporte.actualizadoPor}` : ''}${cuando ? ` el ${cuando}` : ''}`
  return (
    <p className="pai-origen">
      {/* "… 9:02 p. m." ya termina en punto: no se agrega otro. */}
      {frase.endsWith('.') ? frase : `${frase}.`}
    </p>
  )
}

/** Enlace de descarga de una evidencia y sus datos. */
export function DatosEvidencia({ evidencia, url }: { evidencia: EvidenciaPai; url: string }) {
  const datos = [
    nombreTipoEvidencia(evidencia.tipo),
    formatoBytes(evidencia.bytes),
    formatoFechaHora(evidencia.subidoEn),
    evidencia.subidoPor && `subida por ${evidencia.subidoPor}`,
  ].filter(Boolean)
  return (
    <div className="pai-evidencia-datos">
      {/* download: si algo falla, se baja la respuesta en vez de salir de la página (y perder lo escrito). */}
      <a href={url} download={evidencia.nombre} className="pai-evidencia-enlace">
        {evidencia.nombre}
      </a>
      <span className="pai-evidencia-meta">{datos.join(' · ')}</span>
    </div>
  )
}
