/**
 * SIVU — Sistema de Visualización de Datos de Sapiencia (rama /sivu): el
 * edificio de Sapiencia en 3D (visor original de Sebastian Aguilar, three.js
 * r180) con el aspecto y el comportamiento del bloque del Observatorio
 * (Septiembre/observatorio/edificio-3d/edificio-3d-bloque.html) y, debajo,
 * los tableros de información.
 *
 * Contrato con el resto de la aplicación:
 *
 * - Montaje: este archivo exporta POR DEFECTO el componente raíz del sitio.
 *   src/router.tsx lo carga de forma diferida (route.lazy) y lo monta en
 *   "/sivu/*", dentro de la ruta raíz (src/compartido/Raiz.tsx). Todo lo que
 *   se importe desde aquí —three.js incluido— queda en el chunk de SIVU; no
 *   importes nada de src/sites/sivu desde fuera de esta carpeta.
 * - Subrutas (relativas a /sivu): index = edificio + tableros, "*" = 404
 *   propio de SIVU con enlace a /sivu.
 * - Estilos: sivu.css, todo anidado bajo .sivu (sin selectores globales,
 *   salvo los @font-face de Rubik); @keyframes con prefijo ed-. Tokens de la
 *   Plantilla Sapiencia; cabecera y pie del Observatorio como /repositorio.
 * - Recursos: /sivu/edificiofinal.glb y el decodificador Draco en /sivu/draco/
 *   (copiado desde node_modules/three por scripts/copiar-draco.mjs); logos y
 *   Rubik en recursos/ (pasan por Vite).
 * - Ciclo de vida: visor/VisorEdificio.ts libera todo en dispose() (StrictMode
 *   monta los efectos dos veces en desarrollo). Los errores asíncronos (carga
 *   del .glb, WebGL no disponible, contexto perdido) se muestran en la propia
 *   escena con "Reintentar"; los de render los atrapa el errorElement de la rama.
 *
 * Estructura:
 *   paginas/      PaginaSivu (index) y NoEncontradoSivu (*)
 *   componentes/  cabecera, pie, Edificio3D (panel + escena), su barra y su
 *                 tarjeta de carga, SeccionTableros, Icono
 *   datos/        tableros.ts: la lista de tableros (editar aquí)
 *   visor/        VisorEdificio (three.js, sin React), geometria (matemática
 *                 pura, con pruebas) y estado (tipos compartidos)
 */
import type { MouseEvent } from 'react'
import { Route, Routes } from 'react-router'
import CabeceraSivu from './componentes/CabeceraSivu'
import PieSivu from './componentes/PieSivu'
import NoEncontradoSivu from './paginas/NoEncontradoSivu'
import PaginaSivu from './paginas/PaginaSivu'
import { ID_CONTENIDO } from './rutas'
import './sivu.css'

function irAlContenido(evento: MouseEvent<HTMLAnchorElement>) {
  const destino = document.getElementById(ID_CONTENIDO)
  if (!destino) return
  evento.preventDefault()
  destino.focus()
}

export default function SivuSitio() {
  return (
    <div className="sivu" lang="es-CO">
      <a className="sv-saltar" href={`#${ID_CONTENIDO}`} onClick={irAlContenido}>
        Saltar al contenido
      </a>
      <CabeceraSivu />
      <Routes>
        <Route index element={<PaginaSivu />} />
        <Route path="*" element={<NoEncontradoSivu />} />
      </Routes>
      <PieSivu />
    </div>
  )
}
