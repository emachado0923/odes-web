import { Link } from 'react-router'
import './inicio.css'

interface Sitio {
  ruta: string
  nombre: string
  descripcion: string
}

const SITIOS: Sitio[] = [
  {
    ruta: '/principal',
    nombre: 'Página principal del Observatorio',
    descripcion: 'Cifras clave, accesos rápidos, el mapa por comuna y corregimiento, y quiénes somos.',
  },
  {
    ruta: '/sivu',
    nombre: 'Sistema de Visualización de Datos',
    descripcion: 'El edificio de Sapiencia en 3D y los tableros de información del Observatorio.',
  },
  {
    ruta: '/odes',
    nombre: 'Asistente ODES',
    descripcion: 'Pregúntale al repositorio del Observatorio de Sapiencia y recibe respuestas con sus fuentes.',
  },
  {
    ruta: '/repositorio',
    nombre: 'Repositorio de productos',
    descripcion: 'Busca, filtra, consulta y descarga los informes, boletines, infografías y estudios del Observatorio.',
  },
  {
    ruta: '/pai',
    nombre: 'Plan de Acción Institucional',
    descripcion: 'Reporte bimestral del PAI: cada responsable registra el avance de sus indicadores y Planeación hace el seguimiento.',
  },
  {
    ruta: '/pertinencia',
    nombre: 'Medida de pertinencia',
    descripcion: 'Cómo se relaciona la oferta de educación superior de Medellín con las ocupaciones y los sectores que demanda la ciudad.',
  },
  {
    ruta: '/componentes',
    nombre: 'Componentes',
    descripcion: 'Bloques listos para WordPress: míralos en vivo y descarga su HTML, su CSS, su script o el bloque completo.',
  },
]

/**
 * Página de entrada "/": enlaza las ramas independientes del sitio.
 *
 * Los enlaces recargan la página (reloadDocument): cada rama trae su propio
 * CSS (el de ODES incluye la plantilla de Sapiencia, con estilos globales) y
 * así nunca conviven dos ramas en el mismo documento. /principal ni siquiera
 * es parte de React: es la página de HTML puro con el bloque de WordPress.
 */
export default function Inicio() {
  return (
    <main className="inicio">
      <title>Sapiencia</title>
      <div className="inicio__contenido">
        <h1 className="inicio__titulo">Sapiencia</h1>
        <p className="inicio__bajada">Elige un sitio para continuar.</p>
        <nav aria-label="Sitios de Sapiencia">
          <ul className="inicio__sitios">
            {SITIOS.map((sitio) => (
              <li key={sitio.ruta} className="inicio__tarjeta">
                <h2 className="inicio__nombre">
                  <Link className="inicio__enlace" to={sitio.ruta} reloadDocument>
                    {sitio.nombre}
                  </Link>
                </h2>
                <p className="inicio__descripcion">{sitio.descripcion}</p>
                <span className="inicio__flecha" aria-hidden="true">
                  →
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  )
}
