/**
 * Medida de pertinencia (rama /pertinencia): presenta la medida que relaciona
 * la oferta de programas de educación superior de Medellín con las ocupaciones
 * y los sectores que demanda la ciudad, con el tablero de consulta y los
 * accesos a la normativa. Diseño: el mockup del 26 de octubre de 2026, con la
 * cabecera y el pie oficiales de sapiencia.gov.co (recreados) en los espacios
 * que el diseño dejaba para ellos.
 *
 * El contenido es el bloque de WordPress apps/web/pertinencia/pertinencia-bloque.html
 * (desde el 27 de octubre de 2026): el mismo archivo se pega en un "Raw HTML"
 * de https://sapiencia.gov.co/metodologia_de_pertinencia/ y esta rama lo
 * muestra tal cual (componentes/BloquePertinencia.tsx). Todo cambio del
 * contenido (textos, enlaces, tablero, estilos) se hace en el bloque; ver
 * apps/web/pertinencia/LEEME.md. Aquí queda solo lo que en WordPress pone el
 * tema: cabecera, pie, banner y la columna.
 *
 * Contrato con el resto de la aplicación:
 *
 * - Montaje: este archivo exporta POR DEFECTO el componente raíz del sitio.
 *   src/router.tsx lo carga de forma diferida (route.lazy) y lo monta en
 *   "/pertinencia/*", dentro de la ruta raíz (src/compartido/Raiz.tsx). Todo
 *   lo que se importe desde aquí queda en el chunk de la rama (también el
 *   bloque); no importes nada de src/sites/pertinencia desde fuera de esta
 *   carpeta.
 * - Subrutas (relativas a /pertinencia): index = la página, "*" = 404 propio
 *   con enlace a /pertinencia.
 * - Estilos: pertinencia.css (la página) y componentes/sapiencia/sapiencia.css
 *   (cabecera, pie y panel de accesibilidad), todo anidado bajo .pertinencia
 *   (sin selectores globales, salvo los @font-face de Rubik); clases con
 *   prefijo pe- (pe-sap- en la cabecera y el pie oficiales). Ninguna regla
 *   entra al bloque (#odes-pertinencia, con sus propios estilos), salvo los
 *   efectos del panel de accesibilidad, que imitan al plugin del sitio.
 * - Columna: .pe-columna imita la del tema de WordPress (1070 px de
 *   contenido; 20 px a cada lado por debajo de 1140 px).
 * - Cabecera y pie: recreación del header y el footer oficiales de
 *   https://sapiencia.gov.co/ (barra GOV.CO, menú con paneles, buscador,
 *   accesibilidad e idioma; pie de cuatro columnas). Su contenido está en
 *   datos/sapiencia-oficial.ts; sus enlaces van a sapiencia.gov.co (y a los
 *   sitios externos que enlaza el oficial), en la misma pestaña o en otra
 *   según lo haga el sitio.
 * - Accesibilidad: el panel de la cabecera cambia el tamaño del texto, el
 *   esquema de color, el subrayado y la letra de esta página
 *   (componentes/sapiencia/useAccesibilidad.ts): clases pe-a11y-* y la
 *   variable --pe-a11y-escala en la raíz .pertinencia, guardadas en
 *   localStorage.
 * - Recursos: imágenes de la cabecera y el pie (recursos/img/oficial) y Rubik
 *   en recursos/ (pasan por Vite); nada se pide a sapiencia.gov.co.
 * - Tablero: el bloque viaja sin dirección de tablero; BloquePertinencia le
 *   pone el tablero estático del propio sitio (/tableros/pertinencia/index.html).
 * - Banner: EspacioBanner es el marcador del diseño (en WordPress, el banner
 *   lo pone la entidad, fuera del bloque).
 *
 * Estructura:
 *   paginas/      PaginaPertinencia (index) y NoEncontradoPertinencia (*)
 *   componentes/  BloquePertinencia (el bloque de WordPress), EspacioBanner,
 *                 IconoFlecha (404)
 *   componentes/sapiencia/  cabecera y pie oficiales: CabeceraSapiencia
 *                 (BarraGovco, MenuPrincipal, BuscadorSapiencia, MenuMovil,
 *                 PanelAccesibilidad), PieSapiencia, iconos, sapiencia.css
 *   datos/        sapiencia-oficial.ts (cabecera y pie)
 *   bloque-wordpress.d.ts  tipo del script del bloque (?script)
 */
import type { MouseEvent } from 'react'
import { Route, Routes } from 'react-router'
import CabeceraSapiencia from './componentes/sapiencia/CabeceraSapiencia'
import PieSapiencia from './componentes/sapiencia/PieSapiencia'
import { useAccesibilidad } from './componentes/sapiencia/useAccesibilidad'
import NoEncontradoPertinencia from './paginas/NoEncontradoPertinencia'
import PaginaPertinencia from './paginas/PaginaPertinencia'
import { ID_CONTENIDO } from './rutas'
import './pertinencia.css'

function irAlContenido(evento: MouseEvent<HTMLAnchorElement>) {
  const destino = document.getElementById(ID_CONTENIDO)
  if (!destino) return
  evento.preventDefault()
  destino.focus()
}

export default function PertinenciaSitio() {
  const accesibilidad = useAccesibilidad()
  return (
    <div
      className={accesibilidad.clases ? `pertinencia ${accesibilidad.clases}` : 'pertinencia'}
      style={accesibilidad.estilo}
      lang="es-CO"
    >
      <a className="pe-saltar" href={`#${ID_CONTENIDO}`} onClick={irAlContenido}>
        Saltar al contenido
      </a>
      <CabeceraSapiencia accesibilidad={accesibilidad} />
      <Routes>
        <Route index element={<PaginaPertinencia />} />
        <Route path="*" element={<NoEncontradoPertinencia />} />
      </Routes>
      <PieSapiencia />
    </div>
  )
}
