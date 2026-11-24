import { Link } from 'react-router'
import { COMPONENTES } from '../catalogo'
import FichaComponente from '../FichaComponente'

/** /componentes: una ficha por componente del catálogo. */
export default function Catalogo() {
  return (
    <main className="co-pagina">
      <title>Componentes · Sapiencia</title>
      <div className="co-columna">
        <Link className="co-volver" to="/" reloadDocument>
          ← Sapiencia
        </Link>
        <h1 className="co-titulo">Componentes</h1>
        <p className="co-bajada">
          Bloques listos para pegar en un elemento «Raw HTML» de WPBakery. Míralos en vivo y descarga sus partes o el
          bloque completo.
        </p>
        <ul className="co-lista">
          {COMPONENTES.map((componente) => (
            <li key={componente.slug}>
              <FichaComponente componente={componente} />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
