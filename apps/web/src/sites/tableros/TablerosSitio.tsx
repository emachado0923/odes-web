/**
 * Tableros (rama /tableros): tableros de información del Observatorio que se
 * abren desde SIVU. Hoy son cuatro:
 *
 * - /tableros/matricula-2025: matrícula en educación superior en Medellín
 *   (2025), llegado como tablero estático, con los datos en la base (ver
 *   apps/server/src/sivu/tableros).
 * - /tableros/matricula-historica: la matrícula de Medellín de 2000 a 2025,
 *   con Antioquia y Colombia como referencia. Comparte la hoja de matrícula y
 *   sus datos son un JSON estático del ETL (ver historica/).
 * - /tableros/fondos-2026: beneficiarios de los fondos de Sapiencia (2026),
 *   hecho aquí con el mismo aspecto que el de matrícula (comparte su hoja) y
 *   los datos agregados en la base (datos-fondos.ts del servidor), y
 *   /tableros/fondos-2026/ventanilla: su ventanilla de consulta por documento.
 *   Los dos son privados (una sola sesión) y se cambia entre ellos al instante.
 * - /tableros/bateria-indicadores/*: batería de indicadores de educación
 *   postsecundaria, con los datos en archivos estáticos generados por el ETL
 *   del Observatorio (ver bateria/LEEME.md). Se abre desde la puerta del
 *   edificio de SIVU.
 *
 * - Export por defecto montado por src/router.tsx en "/tableros/*" con carga
 *   diferida: cada tablero y ECharts quedan en sus propios chunks.
 * - Usa la plantilla de Sapiencia (kit), igual que /odes: su CSS es global,
 *   por eso los enlaces que salen de la rama recargan la página. Las
 *   correcciones de los tableros estáticos van en otra hoja, después de la del
 *   kit (precedence de React 19, en ese orden).
 * - Cabecera y pie: en los tableros, los azules de los tableros estáticos
 *   (CabeceraAzul y PieAzul), con el nombre del tablero; en el resto de la
 *   rama, los del Observatorio (magenta, logos en blanco). La clase del
 *   tablero en la raíz (tablero-matricula, tablero-bateria) acota los estilos
 *   de cada uno (la hoja en su carpeta); el de los fondos lleva
 *   'tablero-matricula tablero-fondos': la hoja de matrícula más la suya.
 */
import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import PaginaBateria from './bateria/PaginaBateria'
import { esRutaBateria } from './bateria/rutas-bateria'
import CabeceraAzul from './componentes/CabeceraAzul'
import CabeceraTableros from './componentes/CabeceraTableros'
import EstilosTableros from './componentes/EstilosTableros'
import PieAzul from './componentes/PieAzul'
import PieTableros from './componentes/PieTableros'
import PaginaFondos from './fondos/PaginaFondos'
import PaginaMatricula from './matricula/PaginaMatricula'
import NoEncontradoTableros from './paginas/NoEncontradoTableros'
import PaginaMatriculaHistorica from './historica/PaginaMatriculaHistorica'
import { ID_CONTENIDO, RUTA_FONDOS, RUTA_FONDOS_VENTANILLA, RUTA_MATRICULA, RUTA_MATRICULA_HISTORICA } from './rutas'
import './tableros.css'

const TITULO_RAMA = 'Tableros del Observatorio de Sapiencia'

interface Tablero {
  /** Clase de la raíz que acota los estilos del tablero. */
  clase: string
  /** Nombre del tablero: el h1 de la cabecera y el título de la pestaña mientras carga. */
  titulo: string
}

const MATRICULA: Tablero = {
  clase: 'tablero-matricula',
  titulo: 'Tablero matrícula en educación superior en Medellín (2025)',
}

/** Comparte la hoja de matrícula (aspecto) y suma la suya. */
const MATRICULA_HISTORICA: Tablero = {
  clase: 'tablero-matricula tablero-historica',
  titulo: 'Tablero matrícula en educación superior en Medellín (2000-2025)',
}

const FONDOS: Tablero = {
  clase: 'tablero-matricula tablero-fondos',
  titulo: 'Tablero beneficiarios de los fondos de Sapiencia (2026)',
}

/** La ventanilla comparte la página (y la sesión) con el tablero de los fondos: cambia el nombre. */
const FONDOS_VENTANILLA: Tablero = {
  clase: 'tablero-matricula tablero-fondos',
  titulo: 'Ventanilla de consulta de los fondos de Sapiencia',
}

const BATERIA: Tablero = {
  clase: 'tablero-bateria',
  titulo: 'Batería de indicadores de educación postsecundaria',
}

/** El tablero de la dirección, o null fuera de los tableros (p. ej. "no encontrado"). */
function tableroDe(pathname: string): Tablero | null {
  const ruta = pathname.replace(/\/+$/, '')
  if (ruta === RUTA_MATRICULA) return MATRICULA
  if (ruta === RUTA_MATRICULA_HISTORICA) return MATRICULA_HISTORICA
  if (ruta === RUTA_FONDOS) return FONDOS
  if (ruta === RUTA_FONDOS_VENTANILLA) return FONDOS_VENTANILLA
  if (esRutaBateria(pathname)) return BATERIA
  return null
}

function useTitulo(titulo: string) {
  useEffect(() => {
    const anterior = document.title
    document.title = titulo
    return () => {
      document.title = anterior
    }
  }, [titulo])
}

export default function TablerosSitio() {
  const { pathname } = useLocation()
  const tablero = tableroDe(pathname)
  const titulo = tablero?.titulo ?? TITULO_RAMA
  useTitulo(titulo)
  return (
    <div className={tablero ? `tableros ${tablero.clase}` : 'tableros'} data-bs-theme="light">
      <EstilosTableros />
      <a className="tb-saltar" href={`#${ID_CONTENIDO}`}>
        Saltar al contenido
      </a>
      {tablero ? <CabeceraAzul titulo={titulo} /> : <CabeceraTableros titulo={titulo} />}
      <main id={ID_CONTENIDO} className="tb-principal" tabIndex={-1}>
        <Routes>
          <Route path="matricula-2025" element={<PaginaMatricula />} />
          <Route path="matricula-historica" element={<PaginaMatriculaHistorica />} />
          {/* Una sola ruta para el tablero y la ventanilla: cambiar entre los dos no desmonta la página. */}
          <Route path="fondos-2026/*" element={<PaginaFondos />} />
          <Route path="bateria-indicadores/*" element={<PaginaBateria />} />
          <Route path="*" element={<NoEncontradoTableros />} />
        </Routes>
      </main>
      {tablero ? <PieAzul /> : <PieTableros />}
    </div>
  )
}
