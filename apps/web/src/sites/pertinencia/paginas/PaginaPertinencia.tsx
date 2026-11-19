import BloquePertinencia from '../componentes/BloquePertinencia'
import EspacioBanner from '../componentes/EspacioBanner'
import { ID_CONTENIDO, NOMBRE_PERTINENCIA } from '../rutas'

/**
 * /pertinencia — la página de la medida de pertinencia como se verá en
 * https://sapiencia.gov.co/metodologia_de_pertinencia/: en la columna del tema
 * de WordPress (.pe-columna: 1070 px de contenido), el banner (que en
 * WordPress pone la entidad; aquí, su marcador EspacioBanner) y debajo el
 * bloque de WordPress, que trae todo lo demás (banda del título, presentación,
 * tablero, "Conoce más" y los accesos a la normativa).
 */
export default function PaginaPertinencia() {
  return (
    <main id={ID_CONTENIDO} className="pe-principal" tabIndex={-1}>
      <title>{NOMBRE_PERTINENCIA}</title>
      <div className="pe-columna">
        <EspacioBanner />
        <BloquePertinencia />
      </div>
    </main>
  )
}
