/**
 * Administración del repositorio (/repositorio/admin/*). Se carga aparte
 * (React.lazy en RepositorioSitio.tsx): nada de esto llega al chunk de la
 * página pública, y pdf.js solo se descarga al generar una portada.
 *
 * - Sesión: ver sesion/ProveedorSesion.tsx. Sin sesión se muestra el inicio
 *   de sesión en la misma URL; si la sesión vence trabajando, la página queda
 *   montada (oculta) para no perder lo editado.
 * - Subrutas: índice = documentos; documentos/nuevo; documentos/:id;
 *   categorias; palabras-clave; cambios; asistente (índice del Asistente
 *   ODES y "Reindexar"); * = no encontrada.
 * - La cabecera y el pie del Observatorio los pone RepositorioSitio; aquí va
 *   la barra "Administración" y el <main id={ID_CONTENIDO}>.
 * Ver LEEME.md de la rama.
 */
import { useId, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import { ID_CONTENIDO, RUTA_REPOSITORIO } from '../rutas'
import PaginaCambios from './catalogos/PaginaCambios'
import PaginaCategorias from './catalogos/PaginaCategorias'
import PaginaPalabras from './catalogos/PaginaPalabras'
import ProveedorAvisos from './componentes/Avisos'
import { ContextoCambios, crearRegistroCambios, useRegistroCambios } from './componentes/cambiosPendientes'
import Dialogo from './componentes/Dialogo'
import Icono from './componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from './componentes/Pagina'
import { mensajeDe } from './datos/clienteAdmin'
import PaginaDocumento from './documentos/PaginaDocumento'
import PaginaDocumentos from './documentos/PaginaDocumentos'
import PaginaAsistente from './odes/PaginaAsistente'
import { RUTA_ADMIN, RUTA_ASISTENTE, RUTA_CAMBIOS, RUTA_CATEGORIAS, RUTA_DOCUMENTOS, RUTA_PALABRAS } from './rutasAdmin'
import { useSesion } from './sesion/contexto'
import PaginaIngreso from './sesion/PaginaIngreso'
import ProveedorSesion from './sesion/ProveedorSesion'
import './admin.css'

export default function AdminRepositorio() {
  const [cambios] = useState(crearRegistroCambios)
  return (
    <ProveedorSesion>
      <ProveedorAvisos>
        <ContextoCambios value={cambios}>
          <ContenidoAdmin />
        </ContextoCambios>
      </ProveedorAvisos>
    </ProveedorSesion>
  )
}

function Principal({ children, id = true }: { children: ReactNode; id?: boolean }) {
  return (
    <main id={id ? ID_CONTENIDO : undefined} className="rp-principal ra-principal" tabIndex={-1}>
      <div className="ra-contenedor">{children}</div>
    </main>
  )
}

function ContenidoAdmin() {
  const { estado, reintentar } = useSesion()

  if (estado.fase === 'verificando') {
    return (
      <Principal>
        <title>Administración · Repositorio de productos</title>
        <Cargando texto="Verificando la sesión…" />
      </Principal>
    )
  }
  if (estado.fase === 'error') {
    return (
      <Principal>
        <title>Administración · Repositorio de productos</title>
        <ErrorCarga titulo="No se pudo abrir la administración" mensaje={estado.mensaje} onReintentar={reintentar} />
      </Principal>
    )
  }
  if (estado.fase === 'anonima') {
    return (
      <div className="ra-admin">
        <BarraAdmin />
        <Principal>
          <PaginaIngreso />
        </Principal>
      </div>
    )
  }
  const vencida = estado.fase === 'vencida'
  return (
    <div className="ra-admin">
      {vencida && (
        <>
          <BarraAdmin />
          <Principal>
            <PaginaIngreso vencida />
          </Principal>
        </>
      )}
      {/* Con la sesión vencida, la página sigue montada (oculta): no se pierde lo editado. */}
      <div hidden={vencida} className="ra-con-sesion">
        <BarraAdmin conSesion />
        <Principal id={!vencida}>
          <Routes>
            <Route index element={<PaginaDocumentos />} />
            <Route path="documentos" element={<PaginaDocumentos />} />
            <Route path="documentos/nuevo" element={<PaginaDocumento key="nuevo" id={null} />} />
            <Route path="documentos/:id" element={<RutaDocumento />} />
            <Route path="categorias" element={<PaginaCategorias />} />
            <Route path="palabras-clave" element={<PaginaPalabras />} />
            <Route path="cambios" element={<PaginaCambios />} />
            <Route path="asistente" element={<PaginaAsistente />} />
            <Route path="*" element={<NoEncontradaAdmin />} />
          </Routes>
        </Principal>
      </div>
    </div>
  )
}

function RutaDocumento() {
  const { id = '' } = useParams()
  return <PaginaDocumento key={id} id={id} />
}

function BarraAdmin({ conSesion = false }: { conSesion?: boolean }) {
  const { estado, cerrar } = useSesion()
  const navigate = useNavigate()
  const cambios = useRegistroCambios()
  const [cerrando, setCerrando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idAviso = useId()
  const sesion = estado.fase === 'activa' || estado.fase === 'vencida' ? estado.sesion : null
  const { pathname } = useLocation()
  const enDocumento = pathname.startsWith(`${RUTA_ADMIN}/documentos`)

  async function salir(conCambios = false) {
    // Cerrar la sesión desmonta la página: si hay cambios sin guardar, se pregunta antes.
    if (!conCambios && cambios.hay()) {
      setConfirmar(true)
      return
    }
    setConfirmar(false)
    setCerrando(true)
    setError(null)
    try {
      await cerrar()
      navigate(RUTA_ADMIN, { replace: true })
    } catch (e) {
      setError(`No se pudo cerrar la sesión. ${mensajeDe(e)}`)
      setCerrando(false)
    }
  }

  return (
    <section className="ra-barra" aria-label="Barra de administración">
      <div className="ra-barra-interior">
        <p className="ra-barra-contexto">
          <span className="ra-barra-etiqueta">Administración</span>
          <span className="ra-barra-nombre">Repositorio de productos</span>
        </p>
        {conSesion && (
          <nav className="ra-navegacion" aria-label="Administración">
            <ul>
              <li>
                <Link
                  to={RUTA_DOCUMENTOS}
                  aria-current={pathname === RUTA_ADMIN ? 'page' : enDocumento ? 'true' : undefined}
                >
                  Documentos
                </Link>
              </li>
              <li>
                <NavLink to={RUTA_CATEGORIAS}>Categorías</NavLink>
              </li>
              <li>
                <NavLink to={RUTA_PALABRAS}>Palabras clave</NavLink>
              </li>
              <li>
                <NavLink to={RUTA_CAMBIOS}>Registro de cambios</NavLink>
              </li>
              <li>
                <NavLink to={RUTA_ASISTENTE}>Asistente ODES</NavLink>
              </li>
            </ul>
          </nav>
        )}
        <div className="ra-barra-usuario">
          <Link to={RUTA_REPOSITORIO} className="ra-barra-enlace">
            Ver el repositorio público
          </Link>
          {conSesion && sesion && (
            <>
              <span className="ra-barra-quien">
                <span className="rp-oculto">Sesión de </span>
                {sesion.nombre ?? sesion.usuario}
              </span>
              <button type="button" className="ra-barra-salir" onClick={() => void salir()} disabled={cerrando}>
                <Icono nombre="salir" />
                {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="ra-barra-error" role="alert">
          {error}
        </p>
      )}
      <Dialogo
        abierto={confirmar}
        titulo="Hay cambios sin guardar"
        rol="alertdialog"
        onCerrar={() => setConfirmar(false)}
        idDescripcion={idAviso}
      >
        <p id={idAviso}>Si cierra la sesión ahora, se perderán los cambios que no ha guardado.</p>
        <div className="ra-dialogo-acciones">
          <button type="button" className="rp-boton" onClick={() => setConfirmar(false)}>
            Seguir editando
          </button>
          <button type="button" className="rp-boton rp-boton-borde ra-peligro-borde" onClick={() => void salir(true)}>
            Cerrar sesión sin guardar
          </button>
        </div>
      </Dialogo>
    </section>
  )
}

function NoEncontradaAdmin() {
  return (
    <div className="ra-pagina">
      <TituloPagina documento="Página no encontrada">Página no encontrada</TituloPagina>
      <p className="ra-introduccion">Esta dirección no existe en la administración.</p>
      <p>
        <Link className="rp-boton" to={RUTA_DOCUMENTOS}>
          Ir a los documentos
        </Link>
      </p>
    </div>
  )
}
