import { Outlet, useNavigation } from 'react-router'
import './compartido.css'

/**
 * Ruta raíz común a todas las ramas. No agrega envoltorios ni estilos al
 * contenido: solo muestra una barra superior mientras el router carga otra
 * rama (por ejemplo, el chunk diferido de /sivu al llegar desde el inicio).
 */
export default function Raiz() {
  const navegacion = useNavigation()

  return (
    <>
      {navegacion.state === 'loading' && (
        <div className="barra-navegacion" role="progressbar" aria-label="Cargando sección" />
      )}
      <Outlet />
    </>
  )
}
