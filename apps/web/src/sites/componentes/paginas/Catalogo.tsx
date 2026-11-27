import { Link } from 'react-router'
import { esGrupo, FICHAS } from '../catalogo'
import FichaComponente from '../FichaComponente'

/** /componentes: una ficha por componente del catálogo (o por grupo de versiones). */
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
          {FICHAS.map((ficha) => (
            <li key={esGrupo(ficha) ? ficha.id : ficha.slug}>
              <FichaComponente ficha={ficha} />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
