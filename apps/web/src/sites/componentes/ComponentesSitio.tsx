/**
 * Componentes (rama /componentes): catálogo de bloques listos para pegar en un
 * "Raw HTML" de WPBakery en sapiencia.gov.co. Cada componente tiene una ficha
 * con su vista previa en vivo y las descargas: el HTML, el CSS y el script por
 * separado, y el bloque completo (o copiarlo al portapapeles).
 *
 * - Montaje: export por defecto, cargado por src/router.tsx en "/componentes/*"
 *   con carga diferida (route.lazy).
 * - Subrutas: index = el catálogo; "*" = 404 propio con enlace al catálogo.
 * - Contenido: catalogo/index.ts (la lista y cómo se arma el bloque); cada
 *   componente en su carpeta, con sus partes.
 * - Estilos: componentes.css, todo bajo .componentes con prefijo co-. Nada
 *   entra a la vista previa: cada componente trae sus estilos bajo su id raíz.
 *   noindex: es una herramienta interna.
 */
import { Route, Routes } from 'react-router'
import Catalogo from './paginas/Catalogo'
import NoEncontradoComponentes from './paginas/NoEncontradoComponentes'
import './componentes.css'

export default function ComponentesSitio() {
  return (
    <div className="componentes" lang="es-CO">
      <meta name="robots" content="noindex, nofollow" />
      <Routes>
        <Route index element={<Catalogo />} />
        <Route path="*" element={<NoEncontradoComponentes />} />
      </Routes>
    </div>
  )
}
