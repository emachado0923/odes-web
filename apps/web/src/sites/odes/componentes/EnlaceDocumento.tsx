import { urlSegura } from '../chat/enlaces'
import Icono from './Icono'

/**
 * Botón "Ver documento": abre el documento (en la página citada, si se
 * conoce) en una pestaña nueva. Si la URL no es segura, no se dibuja.
 */
export default function EnlaceDocumento({
  url,
  titulo,
  idioma,
  texto = 'Ver documento',
}: {
  url: string
  titulo: string
  idioma: 'es' | 'en'
  texto?: string
}) {
  const href = urlSegura(url)
  if (!href) return null
  return (
    <a className="btn btn-outline-primary btn-sm odes-ver-documento" href={href} target="_blank" rel="noopener noreferrer">
      {texto}
      <span className="visually-hidden">
        : <span lang={idioma === 'en' ? 'en' : undefined}>{titulo}</span> (se abre en una pestaña nueva)
      </span>
      <Icono nombre="open_in_new" />
    </a>
  )
}
