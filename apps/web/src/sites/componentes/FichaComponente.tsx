import { useEffect, useMemo, useState } from 'react'
import { descargar, esGrupo, partes, type Archivo, type Componente, type Ficha } from './catalogo'

/** Anchos de la vista previa. El componente responde al ancho de su bloque (container queries). */
const ANCHOS = [
  { id: 'escritorio', etiqueta: 'Escritorio', pixeles: null },
  { id: 'tableta', etiqueta: 'Tableta', pixeles: 768 },
  { id: 'celular', etiqueta: 'Celular', pixeles: 375 },
] as const

type IdAncho = (typeof ANCHOS)[number]['id']

/** Cuánto se ve el aviso de copiado. */
const DURACION_AVISO = 4000

function BotonDescarga({ etiqueta, archivo, principal = false }: { etiqueta: string; archivo: Archivo; principal?: boolean }) {
  return (
    <button
      type="button"
      className={principal ? 'co-boton co-boton--principal' : 'co-boton'}
      onClick={() => descargar(archivo)}
    >
      <span className="co-boton__etiqueta">{etiqueta}</span>{' '}
      <span className="co-boton__archivo">{archivo.nombre}</span>
    </button>
  )
}

/**
 * Una página de muestra para los componentes fijos en la ventana (vista
 * 'pagina'): bloques grises que se desplazan dentro del marco, y abajo a la
 * derecha lo que en sapiencia.gov.co ocupa esa esquina (el chat y "Ir al
 * inicio"), para ver que el componente no lo tapa. Es decorado: los lectores
 * de pantalla lo omiten.
 */
function PaginaDeMuestra() {
  return (
    <div className="co-muestra" aria-hidden="true">
      <div className="co-muestra__cabecera">
        <span className="co-muestra__logo" />
        <span className="co-muestra__menu" />
      </div>
      <div className="co-muestra__banner" />
      {[0, 1, 2, 3].map((seccion) => (
        <div key={seccion} className="co-muestra__seccion">
          <span className="co-muestra__titulo" />
          <span className="co-muestra__linea" />
          <span className="co-muestra__linea co-muestra__linea--corta" />
          <div className="co-muestra__tarjetas">
            <span />
            <span />
            <span />
          </div>
        </div>
      ))}
      <div className="co-muestra__pie" />
    </div>
  )
}

/**
 * Ficha de un componente del catálogo (o de un grupo de versiones): nombre,
 * descripción, selector de versión si es un grupo, vista previa en vivo (con
 * tres anchos) y las descargas: cada parte por separado, el bloque completo y
 * copiar el bloque al portapapeles.
 *
 * La vista previa pone los estilos y el contenido con innerHTML, igual que se
 * verían pegados en WordPress, y si el componente trae `ejecutar`, corre su
 * script después (ver catalogo/index.ts).
 */
export default function FichaComponente({ ficha }: { ficha: Ficha }) {
  const versiones = esGrupo(ficha) ? ficha.versiones : null
  const [elegida, setElegida] = useState(0)
  const componente: Componente = versiones ? (versiones[elegida] ?? versiones[0]!) : (ficha as Componente)
  const [ancho, setAncho] = useState<IdAncho>('escritorio')
  const [aviso, setAviso] = useState('')
  const archivos = useMemo(() => partes(componente), [componente])
  const vista = useMemo(() => ({ __html: `<style>${componente.css}</style>${componente.html}` }), [componente])
  const pixeles = ANCHOS.find((opcion) => opcion.id === ancho)?.pixeles ?? null
  const idTitulo = `co-${esGrupo(ficha) ? ficha.id : ficha.slug}-titulo`
  const enPagina = componente.vista === 'pagina'

  useEffect(() => {
    if (!aviso) return
    const temporizador = setTimeout(() => setAviso(''), DURACION_AVISO)
    return () => clearTimeout(temporizador)
  }, [aviso])

  // El script del componente corre cuando su contenido ya está en la página (y otra vez al cambiar de versión).
  useEffect(() => {
    componente.ejecutar?.()
  }, [componente])

  async function copiarBloque() {
    try {
      await navigator.clipboard.writeText(archivos.bloque.contenido)
      setAviso('Bloque copiado. Pégalo en un elemento «Raw HTML» de WPBakery.')
    } catch {
      setAviso('No se pudo copiar. Descarga el bloque completo.')
    }
  }

  return (
    <article className="co-ficha" aria-labelledby={idTitulo}>
      <div className="co-ficha__cabecera">
        <div>
          <h2 id={idTitulo} className="co-ficha__nombre">
            {ficha.nombre}
          </h2>
          <p className="co-ficha__descripcion">{ficha.descripcion}</p>
        </div>
        <ul className="co-ficha__partes" aria-label="Partes del componente">
          <li className="co-chip">HTML</li>
          <li className="co-chip">CSS</li>
          <li className={componente.js ? 'co-chip' : 'co-chip co-chip--apagado'}>
            {componente.js ? 'Script' : 'Sin script'}
          </li>
        </ul>
      </div>

      {versiones && (
        <div className="co-versiones">
          <p className="co-ficha__rotulo" id={`${idTitulo}-versiones`}>
            Versión
          </p>
          <div className="co-versiones__lista" role="group" aria-labelledby={`${idTitulo}-versiones`}>
            {versiones.map((version, indice) => (
              <button
                key={version.slug}
                type="button"
                className="co-version"
                aria-pressed={indice === elegida}
                onClick={() => setElegida(indice)}
              >
                <span className="co-version__numero">{indice + 1}</span>
                <span className="co-version__nombre">{version.nombre.replace(/^Versión \d+: /, '')}</span>
              </button>
            ))}
          </div>
          <p className="co-versiones__detalle" aria-live="polite">
            <strong>{componente.nombre}.</strong> {componente.descripcion}
          </p>
        </div>
      )}

      <div className="co-ficha__barra">
        <p className="co-ficha__rotulo" id={`${idTitulo}-vista`}>
          Vista previa
        </p>
        <div className="co-anchos" role="group" aria-label="Ancho de la vista previa">
          {ANCHOS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className="co-ancho"
              aria-pressed={ancho === opcion.id}
              onClick={() => setAncho(opcion.id)}
            >
              {opcion.etiqueta}
              {opcion.pixeles !== null && <span className="co-ancho__px"> · {opcion.pixeles} px</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="co-vista" role="region" aria-labelledby={`${idTitulo}-vista ${idTitulo}`}>
        {enPagina ? (
          <div
            className="co-vista__marco co-vista__marco--pagina"
            data-ancho={ancho}
            style={pixeles === null ? undefined : { maxWidth: `${pixeles}px` }}
          >
            {/* Lo que se desplaza: la página de muestra y el componente (fijo en el marco, no en la ventana). */}
            <div className="co-vista__pagina" tabIndex={0} role="group" aria-label="Página de muestra: desplázala">
              <PaginaDeMuestra />
              <div className="co-vista__componente" dangerouslySetInnerHTML={vista} />
            </div>
            <span className="co-vista__chat" aria-hidden="true">
              En línea
            </span>
            <span className="co-vista__arriba" aria-hidden="true" />
          </div>
        ) : (
          <div
            className="co-vista__marco"
            data-ancho={ancho}
            style={pixeles === null ? undefined : { maxWidth: `${pixeles}px` }}
            dangerouslySetInnerHTML={vista}
          />
        )}
      </div>

      <div className="co-ficha__descargas">
        <p className="co-ficha__rotulo">{versiones ? `Descargar la versión ${elegida + 1}` : 'Descargar'}</p>
        <div className="co-botones">
          <BotonDescarga etiqueta="Bloque completo" archivo={archivos.bloque} principal />
          <button type="button" className="co-boton" onClick={copiarBloque}>
            <span className="co-boton__etiqueta">Copiar bloque</span>{' '}
            <span className="co-boton__archivo">al portapapeles</span>
          </button>
          <BotonDescarga etiqueta="HTML" archivo={archivos.html} />
          <BotonDescarga etiqueta="CSS" archivo={archivos.css} />
          {archivos.js ? (
            <BotonDescarga etiqueta="Script" archivo={archivos.js} />
          ) : (
            <button type="button" className="co-boton" disabled>
              <span className="co-boton__etiqueta">Script</span>{' '}
              <span className="co-boton__archivo">no usa script</span>
            </button>
          )}
        </div>
        <p className="co-ficha__aviso" role="status">
          {aviso}
        </p>
      </div>
    </article>
  )
}
