import correcciones from '../../../compartido/plantilla/correcciones-plantilla.css?url'
import KitPlantilla from '../../odes/kit/KitPlantilla'

/**
 * Hojas de la plantilla de Sapiencia para la rama /pai: la del kit (igual que
 * en /odes y /tableros) y, después, sus correcciones (compartidas con
 * /tableros). React 19 las ordena por `precedence`, en el orden en que
 * aparecen aquí; pai.css (Vite) va después y gana sin !important.
 *
 * Pruebas: React espera a que estas hojas carguen antes de mostrar la rama y
 * jsdom nunca las carga; las pruebas simulan este módulo:
 *   vi.mock('./componentes/EstilosPai', () => ({ default: () => null }))
 */
export default function EstilosPai() {
  return (
    <>
      <KitPlantilla />
      <link rel="stylesheet" href={correcciones} precedence="pai-correcciones" />
    </>
  )
}
