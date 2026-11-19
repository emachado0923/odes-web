import { Fragment, useMemo } from 'react'
import { trozosResaltados } from '../busqueda/resaltar'

/** Texto con las palabras que coinciden con la búsqueda dentro de <mark>. */
export default function Resaltado({ texto, consulta }: { texto: string; consulta: readonly string[] }) {
  const trozos = useMemo(() => trozosResaltados(texto, consulta), [texto, consulta])
  if (trozos.length === 1 && !trozos[0].marca) return texto
  return trozos.map((t, i) => (t.marca ? <mark key={i}>{t.texto}</mark> : <Fragment key={i}>{t.texto}</Fragment>))
}
