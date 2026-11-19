/**
 * Tarjeta de un documento: portada cuadrada, título h2 (lang="en" si está en
 * inglés), dos etiquetas (tipo de producto y año de publicación), descripción,
 * nota con ícono, palabras clave (en orden alfabético) y acciones (ver y
 * descargar). El subtítulo no se muestra (pedido del Observatorio, 14 de
 * noviembre de 2026): sigue en los datos y en la búsqueda.
 *
 * Todas las tarjetas de una fila alinean sus partes (repositorio.css, subgrid):
 * etiquetas, título, descripción, nota, palabras clave y botones empiezan a
 * la misma altura en cada una.
 *
 * Comentarios del Observatorio (12 de noviembre de 2026): arriba solo el tipo
 * de producto y el año (ya no el N.º, el idioma ni el formato); cada producto
 * con título, descripción de unas 30 palabras y 6 palabras clave, en el mismo
 * orden y con la misma presentación en todas las tarjetas. Sin el enlace a la
 * entrada del blog: el micrositio que la tenía va a desaparecer.
 *
 * También la usa la administración para la vista previa del formulario:
 * basta con pasarle un DocumentoPublico. Sin `onClave`, las palabras clave
 * se muestran como etiquetas en lugar de botones. Debe estar dentro del
 * elemento raíz `.repositorio` (estilos de repositorio.css).
 *
 * En el HTML el título va antes de las píldoras (para quien navega por
 * encabezados); en pantalla se ven arriba (CSS order).
 */
import { memo } from 'react'
import { nombreDescarga, type DocumentoPublico } from '../api-repositorio'
import { SIN_FECHA, datosTarjeta, idTituloDocumento } from '../datos/presentacion'
import { esExterna, urlSegura } from '../datos/enlaces'
import Icono from './Icono'
import Resaltado from './Resaltado'

export interface PropsTarjeta {
  documento: DocumentoPublico
  /** Palabras de la búsqueda que se resaltan (terminos(q)). */
  consulta?: readonly string[]
  /** Palabras clave (normalizadas) marcadas en el filtro: su botón se ve presionado. */
  clavesActivas?: ReadonlySet<string>
  /** Al pulsar una palabra clave, con su valor normalizado. Sin esta función, las claves no son botones. */
  onClave?: (valor: string) => void
  /** Al pulsar "Descargar". */
  onDescargar?: (documento: DocumentoPublico) => void
  /** id del título (aria-describedby de las acciones y destino del foco). Por defecto, idTituloDocumento(id). */
  idTitulo?: string
  /**
   * Vista previa de la administración: URL blob: de una portada que todavía
   * no se ha guardado; tiene prioridad sobre documento.urlPortada. Solo se
   * aceptan URL blob: (las crea la propia página).
   */
  urlPortadaLocal?: string
}

const SIN_CONSULTA: readonly string[] = []
const SIN_CLAVES: ReadonlySet<string> = new Set()

/** Atributos de un enlace: los externos se abren en una pestaña nueva. */
function destino(url: string) {
  return esExterna(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

function AvisoPestana({ url }: { url: string }) {
  return esExterna(url) ? <span className="rp-oculto"> (se abre en una pestaña nueva)</span> : null
}

function TarjetaDocumento({
  documento,
  consulta = SIN_CONSULTA,
  clavesActivas = SIN_CLAVES,
  onClave,
  onDescargar,
  idTitulo,
  urlPortadaLocal,
}: PropsTarjeta) {
  const t = datosTarjeta(documento)
  const id = idTitulo ?? idTituloDocumento(documento.id)
  const ingles = t.idioma === 'en'
  const lang = ingles ? 'en' : undefined
  const ver = urlSegura(documento.urlVer)
  const descarga = t.tablero || t.soloEntrada ? null : urlSegura(documento.urlDescarga)
  const portada = urlPortadaLocal?.startsWith('blob:') ? urlPortadaLocal : urlSegura(documento.urlPortada)
  const textoVer = t.tablero ? 'Abrir tablero' : t.soloEntrada ? 'Ver entrada' : 'Ver documento'
  const nombreArchivo = documento.archivo ? nombreDescarga(documento, documento.archivo.extension) : ''

  const imagen = portada ? (
    <img src={portada} alt="" width={720} height={720} loading="lazy" decoding="async" />
  ) : (
    <Icono nombre="documento" className="rp-portada-icono" />
  )

  return (
    <article className="rp-tarjeta">
      {ver ? (
        <a className="rp-portada" href={ver} tabIndex={-1} aria-hidden="true" {...destino(ver)}>
          {imagen}
        </a>
      ) : (
        <div className="rp-portada">{imagen}</div>
      )}
      <div className="rp-contenido">
        <h2 className="rp-nombre" id={id} tabIndex={-1} lang={lang}>
          <Resaltado texto={t.titulo} consulta={consulta} />
        </h2>

        <p className="rp-meta">
          <span className="rp-categoria">
            <span className="rp-oculto">Tipo de producto: </span>
            {t.textoCategoria}
          </span>
          <span className="rp-anio">
            <Icono nombre="anio" />
            <span className="rp-oculto">Año de publicación: </span>
            {t.anio === SIN_FECHA ? 'Sin fecha' : t.anio}
          </span>
        </p>

        {t.descripcion && (
          <p className="rp-descripcion" lang={lang}>
            <Resaltado texto={t.descripcion} consulta={consulta} />
          </p>
        )}

        {t.nota && (
          <p className="rp-nota">
            <Icono nombre="info" />
            <span>{t.nota}</span>
          </p>
        )}

        {t.claves.length > 0 && (
          <>
            <p className="rp-claves-titulo">Palabras clave</p>
            <ul className="rp-claves" aria-label="Palabras clave">
              {t.claves.map((c) => (
                <li key={c.valor}>
                  {onClave ? (
                    <button
                      type="button"
                      className="rp-clave"
                      aria-pressed={clavesActivas.has(c.valor)}
                      onClick={() => onClave(c.valor)}
                    >
                      <Icono nombre="check" />
                      <span className="rp-oculto">Filtrar por </span>
                      <span>
                        <Resaltado texto={c.texto} consulta={consulta} />
                      </span>
                    </button>
                  ) : (
                    <span>
                      <Resaltado texto={c.texto} consulta={consulta} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {(ver || descarga) && (
          <p className="rp-acciones">
            {ver && (
              <a className="rp-boton" href={ver} aria-describedby={id} {...destino(ver)}>
                {textoVer}
                <AvisoPestana url={ver} />
                <Icono nombre={esExterna(ver) ? 'externo' : 'ver'} />
              </a>
            )}
            {descarga && (
              <a
                className="rp-boton rp-boton-borde rp-descargar"
                href={descarga}
                download={nombreArchivo}
                aria-describedby={id}
                onClick={onDescargar ? () => onDescargar(documento) : undefined}
              >
                Descargar<span className="rp-sufijo"> documento</span>
                <Icono nombre="descargar" />
              </a>
            )}
          </p>
        )}
      </div>
    </article>
  )
}

export default memo(TarjetaDocumento)
