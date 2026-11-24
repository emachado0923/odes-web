import { useEffect, useMemo, useState } from 'react'
import { descargar, partes, type Archivo, type Componente } from './catalogo'

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
 * Ficha de un componente del catálogo: nombre, descripción, vista previa en
 * vivo (con tres anchos) y las descargas: cada parte por separado, el bloque
 * completo y copiar el bloque al portapapeles.
 *
 * La vista previa pone los estilos y el contenido con innerHTML, igual que se
 * verían pegados en WordPress. Un script del componente no correría aquí (la
 * CSP del sitio no deja correr scripts en línea): ver catalogo/index.ts.
 */
export default function FichaComponente({ componente }: { componente: Componente }) {
  const [ancho, setAncho] = useState<IdAncho>('escritorio')
  const [aviso, setAviso] = useState('')
  const archivos = useMemo(() => partes(componente), [componente])
  const vista = useMemo(() => ({ __html: `<style>${componente.css}</style>${componente.html}` }), [componente])
  const pixeles = ANCHOS.find((opcion) => opcion.id === ancho)?.pixeles ?? null
  const idTitulo = `co-${componente.slug}-titulo`

  useEffect(() => {
    if (!aviso) return
    const temporizador = setTimeout(() => setAviso(''), DURACION_AVISO)
    return () => clearTimeout(temporizador)
  }, [aviso])

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
            {componente.nombre}
          </h2>
          <p className="co-ficha__descripcion">{componente.descripcion}</p>
        </div>
        <ul className="co-ficha__partes" aria-label="Partes del componente">
          <li className="co-chip">HTML</li>
          <li className="co-chip">CSS</li>
          <li className={componente.js ? 'co-chip' : 'co-chip co-chip--apagado'}>
            {componente.js ? 'Script' : 'Sin script'}
          </li>
        </ul>
      </div>

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
        <div
          className="co-vista__marco"
          data-ancho={ancho}
          style={pixeles === null ? undefined : { maxWidth: `${pixeles}px` }}
          dangerouslySetInnerHTML={vista}
        />
      </div>

      <div className="co-ficha__descargas">
        <p className="co-ficha__rotulo">Descargar</p>
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
