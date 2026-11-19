/**
 * Portada del documento: la actual, la nueva (generada desde el PDF o desde
 * una imagen, con su miniatura) que se guarda al guardar, y los botones para
 * generarla o elegir una imagen. La composición es la de las portadas del
 * paquete (ver portada/composicion.ts).
 */
import { useId, useRef } from 'react'
import { LIMITES_REPOSITORIO, type DocumentoAdmin } from '../../api-repositorio'
import { urlSegura } from '../../datos/enlaces'
import { MensajeError } from '../componentes/Campo'
import Icono from '../componentes/IconoAdmin'
import { tamanoLegible } from '../datos/formatos'
import type { PortadaGenerada } from '../portada/generarPortada'
import { MAX_BYTES_IMAGEN_ORIGEN, revisarImagen } from './revisiones'

function explicarOrigen(p: PortadaGenerada): string {
  const tam = `${p.origenAncho} × ${p.origenAlto} px`
  if (p.origen === 'pdf') {
    return `Generada con la primera página del PDF (${tam})${p.recortada ? ', recortada desde arriba por ser muy alta' : ''}.`
  }
  if (p.origen === 'imagen-cuadrada') return `Imagen cuadrada (${tam}) usada tal cual, ajustada a 720 × 720 px.`
  return `Compuesta con la imagen elegida (${tam})${p.recortada ? ', recortada desde arriba por ser muy alta' : ''}.`
}

interface PropsPortada {
  doc: DocumentoAdmin | null
  pendiente: PortadaGenerada | null
  /** La nueva portada se generó sola al elegir un PDF. */
  automatica: boolean
  generando: boolean
  /** Hay un PDF (nuevo o el actual) del que se puede generar. */
  puedeGenerar: boolean
  ocupado: boolean
  error?: string
  onGenerarPdf: () => void
  onElegirImagen: (archivo: File) => void
  onErrorImagen: (mensaje: string) => void
  onDescartar: () => void
}

export default function EditorPortada({
  doc,
  pendiente,
  automatica,
  generando,
  puedeGenerar,
  ocupado,
  error,
  onGenerarPdf,
  onElegirImagen,
  onErrorImagen,
  onDescartar,
}: PropsPortada) {
  const id = useId()
  const refEntrada = useRef<HTMLInputElement>(null)
  const actual = urlSegura(doc?.urlPortada)
  const deshabilitado = ocupado || generando

  return (
    <div className="ra-portada">
      <div className="ra-portadas">
        <figure className="ra-portada-figura">
          {actual ? (
            <img src={actual} alt="" width={720} height={720} />
          ) : (
            <span className="ra-portada-vacia">
              <Icono nombre="imagen" />
            </span>
          )}
          <figcaption>{actual ? 'Portada actual' : 'Sin portada'}</figcaption>
        </figure>
        {pendiente && (
          <figure className="ra-portada-figura ra-portada-nueva">
            <img src={pendiente.url} alt="" width={720} height={720} />
            <figcaption>
              <strong>Nueva portada</strong> (se guarda al guardar)
            </figcaption>
          </figure>
        )}
        {pendiente && (
          <figure className="ra-portada-figura ra-miniatura-figura">
            <img src={pendiente.urlMiniatura} alt="" width={192} height={192} />
            <figcaption>Miniatura (192 px)</figcaption>
          </figure>
        )}
      </div>

      <div className="ra-portada-estado" role="status" aria-live="polite">
        {generando && (
          <p className="ra-generando">
            <span className="rp-indicador" aria-hidden="true" />
            Generando la portada…
          </p>
        )}
        {!generando && pendiente && (
          <p className="ra-ayuda">
            {automatica ? 'Portada generada automáticamente. ' : ''}
            {explicarOrigen(pendiente)} JPEG de {tamanoLegible(pendiente.portada.size)}.
          </p>
        )}
      </div>

      <div className="ra-portada-acciones">
        <button
          type="button"
          className="rp-boton rp-boton-borde ra-boton-chico"
          onClick={onGenerarPdf}
          disabled={deshabilitado || !puedeGenerar}
          aria-describedby={`${id}-ayuda`}
        >
          <Icono nombre="reintentar" />
          {pendiente?.origen === 'pdf' ? 'Generar de nuevo desde el PDF' : 'Generar desde el PDF'}
        </button>
        <button
          type="button"
          className="rp-boton rp-boton-borde ra-boton-chico"
          onClick={() => refEntrada.current?.click()}
          disabled={deshabilitado}
          aria-describedby={`${id}-ayuda`}
        >
          <Icono nombre="imagen" />
          Usar una imagen…
        </button>
        {pendiente && (
          <button type="button" className="ra-boton-texto" onClick={onDescartar} disabled={deshabilitado}>
            Descartar la nueva portada
          </button>
        )}
        <input
          ref={refEntrada}
          type="file"
          className="rp-oculto"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            e.target.value = ''
            if (!archivo) return
            const problema = revisarImagen(archivo)
            if (problema) onErrorImagen(problema)
            else onElegirImagen(archivo)
          }}
        />
      </div>
      <p className="ra-ayuda" id={`${id}-ayuda`}>
        {puedeGenerar
          ? 'La portada se arma con la primera página del PDF: completa, centrada, con sombra y sobre un fondo desenfocado de sí misma (720 × 720 px).'
          : 'Para generarla desde el PDF, primero elija un archivo PDF.'}{' '}
        Una imagen cuadrada se usa tal cual; si no es cuadrada, se compone igual que una página. Máximo{' '}
        {tamanoLegible(MAX_BYTES_IMAGEN_ORIGEN)} (la portada final pesa menos de{' '}
        {tamanoLegible(LIMITES_REPOSITORIO.maxBytesPortada)}).
      </p>
      {error && <MensajeError id={`${id}-error`} texto={error} />}
    </div>
  )
}
