/**
 * CRM de la Oficina de Planeación (rama /crm): tareas del equipo. Contrato de
 * la API en api-crm.ts (copia del servidor, apps/server/src/crm).
 *
 * - Export por defecto montado por src/router.tsx en "/crm/*" con carga
 *   diferida. El sitio es siempre claro (color-scheme: light).
 * - Subrutas:
 *     /crm                      equipo/Inicio: una tarjeta por persona, se entra con un clic
 *     /crm/equipo/:personaId    equipo/TableroPersona: el tablero de esa persona
 *     /crm/lider/*              lider/SitioLider: el líder, con contraseña (otro chunk)
 *     /crm/muestrario           ui/Muestrario: todas las piezas (solo en desarrollo)
 *     *                         404 de la rama
 * - Un solo <title> (React 19 lo sube al <head>); cada página pone el suyo con
 *   useTituloCrm. noindex: es una herramienta interna.
 * - Estilos: crm.css, todo bajo .crm con prefijo crm-. Piezas en ui/ (ver
 *   ui/index.ts); datos en datos/ (clienteCrm, useCarga).
 */
import { lazy, Suspense, useState, type ComponentType, type MouseEvent } from 'react'
import { Route, Routes } from 'react-router'
import CabeceraCrm from './CabeceraCrm'
import Inicio from './equipo/Inicio'
import TableroPersona from './equipo/TableroPersona'
import NoEncontradoCrm from './NoEncontradoCrm'
import { Cargando } from './ui/Estados'
import ProveedorAvisos from './ui/ProveedorAvisos'
import { ContextoTituloCrm, tituloDocumento } from './ui/titulo'
import './crm.css'

const SitioLider = lazy(() => import('./lider/SitioLider'))

/** Solo existe en desarrollo: en producción el import desaparece del paquete. */
const Muestrario: ComponentType | null = import.meta.env.DEV ? lazy(() => import('./ui/Muestrario')) : null

const ID_CONTENIDO = 'crm-contenido'

function CargandoPagina({ texto }: { texto: string }) {
  return (
    <div className="crm-contenedor crm-pagina">
      <Cargando texto={texto} />
    </div>
  )
}

function irAlContenido(evento: MouseEvent<HTMLAnchorElement>) {
  const destino = document.getElementById(ID_CONTENIDO)
  if (!destino) return
  evento.preventDefault()
  destino.focus()
}

export default function CrmSitio() {
  const [titulo, setTitulo] = useState<string | null>(null)
  return (
    <div className="crm" lang="es-CO">
      <title>{tituloDocumento(titulo)}</title>
      <meta name="robots" content="noindex, nofollow" />
      <ContextoTituloCrm value={setTitulo}>
        <ProveedorAvisos>
          <a className="crm-saltar" href={`#${ID_CONTENIDO}`} onClick={irAlContenido}>
            Saltar al contenido
          </a>
          <CabeceraCrm />
          <main id={ID_CONTENIDO} className="crm-principal" tabIndex={-1}>
            <Routes>
              <Route index element={<Inicio />} />
              <Route path="equipo/:personaId" element={<TableroPersona />} />
              <Route
                path="lider/*"
                element={
                  <Suspense fallback={<CargandoPagina texto="Cargando…" />}>
                    <SitioLider />
                  </Suspense>
                }
              />
              {Muestrario ? (
                <Route
                  path="muestrario"
                  element={
                    <Suspense fallback={<CargandoPagina texto="Cargando el muestrario…" />}>
                      <Muestrario />
                    </Suspense>
                  }
                />
              ) : null}
              <Route path="*" element={<NoEncontradoCrm />} />
            </Routes>
          </main>
        </ProveedorAvisos>
      </ContextoTituloCrm>
    </div>
  )
}
