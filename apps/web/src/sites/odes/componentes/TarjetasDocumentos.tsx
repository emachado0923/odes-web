import type { GrupoDocumentos } from '../chat/conversacion'
import { metadatosDocumento } from '../chat/formato'
import EnlaceDocumento from './EnlaceDocumento'
import Miniatura from './Miniatura'

/**
 * Documentos del evento `documentos`: resultados del modo búsqueda (sin IA)
 * o "documentos relacionados". Tarjetas del kit (card card-lg).
 */
export default function TarjetasDocumentos({ grupo, id }: { grupo: GrupoDocumentos; id: string }) {
  if (grupo.documentos.length === 0) return null
  const idTitulo = `odes-documentos-${id}`
  return (
    <section className="odes-documentos" aria-labelledby={grupo.titulo ? idTitulo : undefined}>
      {grupo.titulo && (
        <p className="odes-documentos__titulo" id={idTitulo}>
          {grupo.titulo}
        </p>
      )}
      <ul className="odes-documentos__lista">
        {grupo.documentos.map((documento) => {
          const lang = documento.idioma === 'en' ? 'en' : undefined
          return (
            <li key={`${documento.id}-${documento.paginaInicio ?? ''}`} className="card card-lg odes-documento">
              <Miniatura documento={documento} />
              <div className="odes-documento__cuerpo">
                <p className="odes-documento__titulo" lang={lang}>
                  {documento.titulo}
                </p>
                {documento.subtitulo && (
                  <p className="odes-documento__subtitulo" lang={lang}>
                    {documento.subtitulo}
                  </p>
                )}
                <p className="odes-documento__meta">
                  {metadatosDocumento(documento, documento.paginaInicio, documento.paginaFin)}
                </p>
                {documento.extracto && (
                  <p className="odes-documento__extracto" lang={lang}>
                    “{documento.extracto}”
                  </p>
                )}
                <EnlaceDocumento url={documento.urlFragmento} titulo={documento.titulo} idioma={documento.idioma} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
