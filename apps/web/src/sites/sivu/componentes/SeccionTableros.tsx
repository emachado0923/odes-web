import { useId } from 'react'
import { Link } from 'react-router'
import { TABLEROS, type Tablero } from '../datos/tableros'
import { ID_TABLEROS } from '../rutas'
import Icono from './Icono'

/** true si la URL es de otro sitio (http/https a otro origen). */
function esExterna(url: string): boolean {
  try {
    const destino = new URL(url, window.location.origin)
    return /^https?:$/.test(destino.protocol) && destino.origin !== window.location.origin
  } catch {
    return false
  }
}

/** Solo rutas propias ("/…") y direcciones http/https: nada de javascript: ni data:. */
function urlSegura(url: string | undefined): string | null {
  const limpia = url?.trim()
  if (!limpia) return null
  if (limpia.startsWith('/') && !limpia.startsWith('//')) return limpia
  return /^https?:\/\//i.test(limpia) ? limpia : null
}

function AccionTablero({ tablero }: { tablero: Tablero }) {
  const enlaces = (tablero.enlaces ?? [])
    .map((e) => ({ texto: e.texto, url: urlSegura(e.url) }))
    .filter((e): e is { texto: string; url: string } => e.url !== null && !esExterna(e.url))
  if (enlaces.length > 0) {
    return (
      <div className="sv-tablero-enlaces">
        {enlaces.map((e) => (
          <Link key={e.url} className="sv-tablero-abrir" to={e.url} reloadDocument>
            <span>{e.texto}</span>
            <Icono nombre="flecha" />
          </Link>
        ))}
      </div>
    )
  }
  const url = urlSegura(tablero.url)

  if (!url) {
    return (
      <p className="sv-tablero-pronto">
        <Icono nombre="reloj" />
        <span>Próximamente</span>
      </p>
    )
  }

  if (esExterna(url)) {
    return (
      <a className="sv-tablero-abrir" href={url} target="_blank" rel="noopener noreferrer">
        <span>Abrir tablero</span>
        <Icono nombre="externo" />
        <span className="ed-sr"> (se abre en una pestaña nueva)</span>
      </a>
    )
  }

  return (
    <Link className="sv-tablero-abrir" to={url} reloadDocument>
      <span>Abrir tablero</span>
      <Icono nombre="flecha" />
    </Link>
  )
}

/**
 * Tableros de información, debajo del edificio (destino de "Conoce más").
 * La lista sale de datos/tableros.ts; al final, una tarjeta punteada indica
 * que vienen más.
 */
export default function SeccionTableros() {
  const idTitulo = useId()

  return (
    // tabIndex -1: "Conoce más" mueve el foco aquí (no entra en el orden de Tab).
    <section id={ID_TABLEROS} className="sv-tableros" aria-labelledby={idTitulo} tabIndex={-1}>
      <div className="sv-tableros-encabezado">
        <h2 id={idTitulo} className="sv-tableros-titulo">
          Tableros de información
        </h2>
        <p className="sv-tableros-intro">
          Explora los datos del Observatorio de Sapiencia sobre la educación postsecundaria en Medellín en tableros
          interactivos.
        </p>
      </div>

      <ul className="sv-tableros-lista">
        {TABLEROS.map((tablero) => (
          <li key={tablero.id} className="sv-tablero" data-tablero={tablero.id}>
            <div className="sv-tablero-portada" aria-hidden="true">
              <Icono nombre="tablero" />
            </div>
            <div className="sv-tablero-contenido">
              <h3 className="sv-tablero-titulo">{tablero.titulo}</h3>
              <p className="sv-tablero-tema">{tablero.tema}</p>
              <p className="sv-tablero-descripcion">{tablero.descripcion}</p>
              <div className="sv-tablero-pie">
                <AccionTablero tablero={tablero} />
              </div>
            </div>
          </li>
        ))}
        <li className="sv-tablero sv-tablero-vacio">
          <Icono nombre="tablero" />
          <p>Pronto habrá más tableros aquí.</p>
        </li>
      </ul>
    </section>
  )
}
