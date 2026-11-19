/**
 * Repositorio de productos del Observatorio de Sapiencia (rama /repositorio).
 *
 * - Export por defecto montado por src/router.tsx en "/repositorio/*" con
 *   carga diferida (route.lazy).
 * - Subrutas: índice = página pública; "admin/*" = administración (otro
 *   chunk, React.lazy); "*" = 404 de la rama.
 * - La página pública y su 404 llevan la cabecera y el pie de la entidad
 *   (los de sapiencia.gov.co, src/compartido/sapiencia), con su panel de
 *   accesibilidad, que actúa sobre el <main> (clase sap-contenido). La
 *   administración, que es interna, conserva la cabecera y el pie compactos
 *   del Observatorio: el menú del sitio oficial sacaría a quien está editando.
 * - Rubik se sirve desde el propio servidor. (Sin <link rel="preload">: el
 *   CSS de la rama llega con su chunk y pide la fuente antes de que React
 *   pudiera insertar la precarga.)
 * - Todos los estilos van anidados bajo .repositorio (repositorio.css); los
 *   de la cabecera y el pie de la entidad, bajo .sap-oficial.
 *   Los enlaces que salen de la rama recargan la página (reloadDocument).
 * Ver LEEME.md.
 */
import { lazy, Suspense, type MouseEvent } from 'react'
import { Outlet, Route, Routes } from 'react-router'
import CabeceraSapiencia from '../../compartido/sapiencia/CabeceraSapiencia'
import PieSapiencia from '../../compartido/sapiencia/PieSapiencia'
import { useAccesibilidad } from '../../compartido/sapiencia/useAccesibilidad'
import CabeceraRepositorio from './componentes/CabeceraRepositorio'
import PieRepositorio from './componentes/PieRepositorio'
import NoEncontradoRepositorio from './paginas/NoEncontradoRepositorio'
import PaginaRepositorio from './paginas/PaginaRepositorio'
import { ID_CONTENIDO } from './rutas'
import './repositorio.css'

const AdminRepositorio = lazy(() => import('./admin/AdminRepositorio'))

/** Preferencias del panel de accesibilidad de esta rama (localStorage). */
export const CLAVE_ACCESIBILIDAD = 'repositorio.accesibilidad'

function irAlContenido(evento: MouseEvent<HTMLAnchorElement>) {
  const destino = document.getElementById(ID_CONTENIDO)
  if (!destino) return
  evento.preventDefault()
  destino.focus()
}

function Saltar() {
  return (
    <a className="rp-saltar" href={`#${ID_CONTENIDO}`} onClick={irAlContenido}>
      Saltar al contenido
    </a>
  )
}

/** Página pública y 404: cabecera y pie de la entidad. */
function MarcoPublico() {
  const accesibilidad = useAccesibilidad(CLAVE_ACCESIBILIDAD)
  return (
    <div
      className={`repositorio sap-oficial${accesibilidad.clases ? ` ${accesibilidad.clases}` : ''}`}
      style={accesibilidad.estilo}
      lang="es-CO"
    >
      <Saltar />
      <CabeceraSapiencia accesibilidad={accesibilidad} />
      <Outlet />
      <PieSapiencia />
    </div>
  )
}

function CargandoAdmin() {
  return (
    <main id={ID_CONTENIDO} className="rp-principal" tabIndex={-1}>
      <div className="rp-contenedor">
        <div className="rp-vacio rp-cargando-listado" role="status">
          <span className="rp-indicador" aria-hidden="true" />
          <p className="rp-vacio-texto">Cargando la administración…</p>
        </div>
      </div>
    </main>
  )
}

/** Administración: cabecera y pie compactos del Observatorio. */
function MarcoAdmin() {
  return (
    <div className="repositorio" lang="es-CO">
      <Saltar />
      <CabeceraRepositorio />
      <Suspense fallback={<CargandoAdmin />}>
        <AdminRepositorio />
      </Suspense>
      <PieRepositorio />
    </div>
  )
}

export default function RepositorioSitio() {
  return (
    <Routes>
      <Route path="admin/*" element={<MarcoAdmin />} />
      <Route element={<MarcoPublico />}>
        <Route index element={<PaginaRepositorio />} />
        <Route path="*" element={<NoEncontradoRepositorio />} />
      </Route>
    </Routes>
  )
}
