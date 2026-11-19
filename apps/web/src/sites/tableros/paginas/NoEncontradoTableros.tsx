import { Link } from 'react-router'
import { RUTA_BATERIA, RUTA_FONDOS, RUTA_MATRICULA } from '../rutas'

/** Ruta desconocida dentro de /tableros. */
export default function NoEncontradoTableros() {
  return (
    <div className="container-fluid p-4 p-xl-8">
      <h2 className="h4">No encontramos ese tablero</h2>
      <p className="mb-0">
        Puede ver el tablero de{' '}
        <Link to={RUTA_MATRICULA}>matrícula en educación superior en Medellín (2025)</Link>, el de{' '}
        <Link to={RUTA_FONDOS}>beneficiarios de los fondos de Sapiencia (2026)</Link>, la{' '}
        <Link to={RUTA_BATERIA}>batería de indicadores de educación postsecundaria</Link> o volver a los{' '}
        <a href="/sivu#tableros">tableros de SIVU</a>.
      </p>
    </div>
  )
}
