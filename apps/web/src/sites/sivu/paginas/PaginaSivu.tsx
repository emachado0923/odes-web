import Edificio3D, { TITULO_SIVU } from '../componentes/Edificio3D'
import SeccionTableros from '../componentes/SeccionTableros'
import { ID_CONTENIDO } from '../rutas'

/** /sivu — el edificio en 3D (bloque del Observatorio) y, debajo, los tableros de información. */
export default function PaginaSivu() {
  return (
    <main id={ID_CONTENIDO} className="sv-principal" tabIndex={-1}>
      <title>{TITULO_SIVU}</title>
      <div className="sv-contenedor">
        <Edificio3D />
        <SeccionTableros />
      </div>
    </main>
  )
}
