import { memo, useDeferredValue, type ComponentPropsWithoutRef } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { suavizarMarkdownParcial } from '../chat/conversacion'
import { esEnlaceExterno, transformarUrlMarkdown } from '../chat/enlaces'
import remarkCitas from '../chat/remarkCitas'
import CitaVolada from './CitaVolada'

const PLUGINS = [remarkGfm, remarkCitas]

function EnlaceMarkdown({ href, children }: ComponentPropsWithoutRef<'a'>) {
  // urlTransform ya dejó vacío cualquier enlace que no sea http(s) o relativo.
  if (!href) return <span>{children}</span>
  if (!esEnlaceExterno(href)) return <a href={href}>{children}</a>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (se abre en una pestaña nueva)</span>
    </a>
  )
}

const COMPONENTES: Components = {
  a: ({ node: _node, href, children }) => <EnlaceMarkdown href={href}>{children}</EnlaceMarkdown>,
  sup: ({ node, children, ...props }) => {
    const cita = node?.properties?.dataCita
    if (cita !== undefined && cita !== null) return <CitaVolada indice={Number(cita)} />
    return <sup {...props}>{children}</sup>
  },
  // La página tiene un solo h1 (el del banner): los títulos de las respuestas bajan dos niveles.
  h1: ({ node: _node, ...props }) => <h3 {...props} />,
  h2: ({ node: _node, ...props }) => <h4 {...props} />,
  h3: ({ node: _node, ...props }) => <h5 {...props} />,
  h4: ({ node: _node, ...props }) => <h6 {...props} />,
  h5: ({ node: _node, ...props }) => <h6 {...props} />,
  // Las tablas anchas se desplazan dentro de la burbuja, nunca la página.
  table: ({ node: _node, ...props }) => (
    <div className="odes-tabla" role="region" aria-label="Tabla" tabIndex={0}>
      <table {...props} />
    </div>
  ),
}

/**
 * Markdown de una respuesta (GFM, sin HTML crudo ni imágenes, enlaces solo
 * http(s) o relativos) con las marcas ⟦n⟧ convertidas en números volados.
 *
 * useDeferredValue: mientras llega el texto, React puede saltarse renders
 * intermedios si el análisis del Markdown se atrasa.
 */
function TextoMarkdown({ texto, enCurso = false }: { texto: string; enCurso?: boolean }) {
  const diferido = useDeferredValue(enCurso ? suavizarMarkdownParcial(texto) : texto)
  return (
    <div className="odes-markdown">
      <Markdown
        remarkPlugins={PLUGINS}
        skipHtml
        disallowedElements={['img']}
        urlTransform={transformarUrlMarkdown}
        components={COMPONENTES}
      >
        {diferido}
      </Markdown>
    </div>
  )
}

export default memo(TextoMarkdown)
