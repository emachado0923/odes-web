import KitPlantilla from '../../odes/kit/KitPlantilla'
import correcciones from '../../../compartido/plantilla/correcciones-plantilla.css?url'

/**
 * Hojas de la plantilla de Sapiencia para la rama: la del kit (igual que en
 * /odes) y, después, las correcciones que traía el tablero estático. React 19
 * las ordena por `precedence`, en el orden en que aparecen aquí.
 *
 * Pruebas: React espera a que estas hojas carguen antes de mostrar la rama y
 * jsdom nunca las carga; las pruebas simulan este módulo.
 */
export default function EstilosTableros() {
  return (
    <>
      <KitPlantilla />
      <link rel="stylesheet" href={correcciones} precedence="tablero-correcciones" />
    </>
  )
}
