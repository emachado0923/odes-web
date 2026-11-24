import { Link } from 'react-router'

/** 404 propio de la rama: cualquier subruta desconocida bajo /componentes. */
export default function NoEncontradoComponentes() {
  return (
    <main className="co-pagina">
      <title>Página no encontrada · Componentes</title>
      <div className="co-columna co-404">
        <p className="co-404__codigo">Error 404</p>
        <h1 className="co-titulo">Página no encontrada</h1>
        <p className="co-bajada">Esta página no existe dentro del catálogo de componentes.</p>
        <Link className="co-boton co-boton--principal" to="/componentes">
          <span className="co-boton__etiqueta">Ver los componentes</span>
        </Link>
      </div>
    </main>
  )
}
