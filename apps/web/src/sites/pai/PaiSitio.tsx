/**
 * PAI (rama /pai): Plan de Acción Institucional de Sapiencia. Los
 * responsables reportan cada bimestre el avance de sus indicadores y
 * Planeación (administrador) hace el seguimiento. Contrato de la API en
 * api-pai.ts (idéntico al del servidor, apps/server/src/pai).
 *
 * - Export por defecto montado por src/router.tsx en "/pai/*" con carga
 *   diferida.
 * - Usa la plantilla de Sapiencia (kit), como /odes y /tableros: su CSS es
 *   global, por eso los enlaces que salen de la rama recargan la página.
 * - Cabecera y pie: los del Observatorio (magenta, logos en blanco).
 * - Sesión: ProveedorSesionPai envuelve todo; PuertaSesionPai decide, dentro
 *   de <main>, si se ve el ingreso, el cambio de contraseña obligatorio o
 *   las páginas (que siguen montadas si la sesión vence).
 * - Cambios sin guardar: GuardiaCambios pregunta antes de salir de la página
 *   (enlaces, Atrás, Adelante) y el navegador avisa al recargar o cerrar la
 *   pestaña (componentes/cambiosPendientes.ts).
 * - Tema: la rama se queda en el tema claro (data-bs-theme="light", como
 *   /tableros) aunque el kit pase la página a oscuro; sus reglas oscuras solo
 *   aplican si la propia raíz .pai declara data-bs-theme="dark".
 *
 * Rutas (rutas.ts):
 *   /pai                         tablero (ambos roles)
 *   /pai/indicadores/:codigo     ficha completa del indicador
 *   /pai/cuenta                  cambiar la contraseña
 *   /pai/admin                   seguimiento (solo administrador)
 *   /pai/admin/usuarios | bimestre | autorizaciones | registro
 */
import { useState } from 'react'
import { Route, Routes } from 'react-router'
import PaginaAutorizaciones from './admin/PaginaAutorizaciones'
import PaginaBimestre from './admin/PaginaBimestre'
import PaginaRegistro from './admin/PaginaRegistro'
import PaginaSeguimiento from './admin/PaginaSeguimiento'
import PaginaUsuarios from './admin/PaginaUsuarios'
import SoloAdministrador from './admin/SoloAdministrador'
import BarraPai from './componentes/BarraPai'
import CabeceraPai from './componentes/CabeceraPai'
import { ContextoCambios, crearRegistroCambios } from './componentes/cambiosPendientes'
import GuardiaCambios from './componentes/GuardiaCambios'
import EstilosPai from './componentes/EstilosPai'
import PiePai from './componentes/PiePai'
import PaginaFichaIndicador from './ficha/PaginaFichaIndicador'
import NoEncontradoPai from './paginas/NoEncontradoPai'
import { ID_CONTENIDO, SUBRUTAS_PAI } from './rutas'
import PaginaCuenta from './sesion/PaginaCuenta'
import ProveedorSesionPai from './sesion/ProveedorSesionPai'
import PuertaSesionPai from './sesion/PuertaSesionPai'
import PaginaTablero from './tablero/PaginaTablero'
import './pai.css'

export default function PaiSitio() {
  const [registroCambios] = useState(crearRegistroCambios)
  return (
    <div className="pai" data-bs-theme="light">
      <EstilosPai />
      <a className="pai-saltar" href={`#${ID_CONTENIDO}`}>
        Saltar al contenido
      </a>
      <CabeceraPai />
      <ContextoCambios value={registroCambios}>
        <ProveedorSesionPai>
          <BarraPai />
          <main id={ID_CONTENIDO} className="pai-principal" tabIndex={-1}>
            <PuertaSesionPai>
              <Routes>
                <Route index element={<PaginaTablero />} />
                <Route path={SUBRUTAS_PAI.ficha} element={<PaginaFichaIndicador />} />
                <Route path={SUBRUTAS_PAI.cuenta} element={<PaginaCuenta />} />
                <Route
                  path={SUBRUTAS_PAI.admin}
                  element={
                    <SoloAdministrador>
                      <PaginaSeguimiento />
                    </SoloAdministrador>
                  }
                />
                <Route
                  path={SUBRUTAS_PAI.adminUsuarios}
                  element={
                    <SoloAdministrador>
                      <PaginaUsuarios />
                    </SoloAdministrador>
                  }
                />
                <Route
                  path={SUBRUTAS_PAI.adminBimestre}
                  element={
                    <SoloAdministrador>
                      <PaginaBimestre />
                    </SoloAdministrador>
                  }
                />
                <Route
                  path={SUBRUTAS_PAI.adminAutorizaciones}
                  element={
                    <SoloAdministrador>
                      <PaginaAutorizaciones />
                    </SoloAdministrador>
                  }
                />
                <Route
                  path={SUBRUTAS_PAI.adminRegistro}
                  element={
                    <SoloAdministrador>
                      <PaginaRegistro />
                    </SoloAdministrador>
                  }
                />
                <Route path="*" element={<NoEncontradoPai />} />
              </Routes>
            </PuertaSesionPai>
          </main>
          <GuardiaCambios />
        </ProveedorSesionPai>
      </ContextoCambios>
      <PiePai />
    </div>
  )
}
