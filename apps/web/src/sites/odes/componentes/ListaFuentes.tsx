import type { Fuente } from '../chat/conversacion'
import { metadatosDocumento } from '../chat/formato'
import { idFuente } from './contexto-citas'
import EnlaceDocumento from './EnlaceDocumento'
import Miniatura from './Miniatura'

/** Lista numerada "Fuentes" debajo de una respuesta: un elemento por cada número volado. */
export default function ListaFuentes({ idRespuesta, fuentes }: { idRespuesta: string; fuentes: Fuente[] }) {
  const idTitulo = `odes-fuentes-${idRespuesta}`
  return (
    <div className="odes-fuentes">
      <p className="odes-fuentes__titulo" id={idTitulo}>
        Fuentes
      </p>
      <ol className="odes-fuentes__lista" aria-labelledby={idTitulo}>
        {fuentes.map((fuente) => {
          const { documento } = fuente
          const lang = documento.idioma === 'en' ? 'en' : undefined
          return (
            <li
              key={fuente.indice}
              value={fuente.indice}
              id={idFuente(idRespuesta, fuente.indice)}
              className="odes-fuente"
              tabIndex={-1}
            >
              <span className="odes-fuente__numero" aria-hidden="true">
                {fuente.indice}
              </span>
              <Miniatura documento={documento} />
              <div className="odes-fuente__cuerpo">
                <p className="odes-fuente__titulo" lang={lang}>
                  {documento.titulo}
                </p>
                <p className="odes-fuente__meta">
                  {metadatosDocumento(documento, fuente.paginaInicio, fuente.paginaFin)}
                </p>
                {fuente.textoCitado.trim() !== '' && (
                  <details className="odes-fuente__cita">
                    <summary>Texto citado</summary>
                    <blockquote lang={lang}>{fuente.textoCitado}</blockquote>
                  </details>
                )}
                <EnlaceDocumento url={fuente.url} titulo={documento.titulo} idioma={documento.idioma} />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
