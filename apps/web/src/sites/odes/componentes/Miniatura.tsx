import { useState } from 'react'
import { urlsMiniatura } from '../chat/enlaces'
import type { DocumentoResumen } from '../chat/protocolo'
import Icono from './Icono'

const ICONO_POR_TIPO: Readonly<Record<DocumentoResumen['tipo'], string>> = {
  pdf: 'description',
  tablero: 'bar_chart',
  entrada: 'article',
  imagen: 'image',
  otro: 'draft',
}

/**
 * Miniatura de la portada de un documento: primero la que sirve la rama
 * /repositorio (urlMiniatura), luego la estática (/odes/portadas/<archivo>).
 * Si ninguna carga (o no hay), muestra un icono según el tipo. Es
 * decorativa: el título del documento está al lado.
 */
export default function Miniatura({ documento }: { documento: DocumentoResumen }) {
  const candidatas = urlsMiniatura(documento)
  // Cuántas candidatas fallaron (se reinicia si cambian las URL del documento).
  const clave = candidatas.join(' ')
  const [fallos, setFallos] = useState({ clave, cantidad: 0 })
  const cantidad = fallos.clave === clave ? fallos.cantidad : 0
  const url = candidatas[cantidad]

  if (!url) {
    return (
      <span className="odes-miniatura odes-miniatura--vacia" aria-hidden="true">
        <Icono nombre={ICONO_POR_TIPO[documento.tipo]} />
      </span>
    )
  }
  return (
    <img
      key={url}
      className="odes-miniatura"
      src={url}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      decoding="async"
      onError={() => setFallos({ clave, cantidad: cantidad + 1 })}
    />
  )
}
