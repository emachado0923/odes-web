/**
 * Carga la plantilla de Sapiencia (kit "kitUnal", fork de Bootstrap 5.3) solo
 * en la rama ODES.
 *
 * Los archivos son copias SIN MODIFICAR de Octubre/plantilla-sapiencia y se
 * sirven tal cual desde apps/web/public/odes/kit/ (ver ../LEEME.md):
 * - styles.css: no pasa por Vite porque su minificador (Lightning CSS) borra
 *   los 14 avisos de licencia /*! … *\/ que la plantilla exige conservar y
 *   descarta reglas que no entiende.
 * - script.js: UMD que define el global `kitUnal`; aporta el botón flotante
 *   de accesibilidad. No usa eval ni manejadores en línea, así que cumple la
 *   CSP del servidor (script-src 'self').
 *
 * El CSS del kit es global (body, :root, h1…). Para que nunca conviva con
 * /sivu en el mismo documento, todos los enlaces que salen de una rama
 * recargan la página (reloadDocument).
 *
 * Pruebas: <link rel="stylesheet" precedence> hace que React espere a que la
 * hoja cargue antes de mostrar la rama (sin parpadeo sin estilos), pero jsdom
 * nunca la carga y React esperaría 60 s. Las pruebas que montan la rama
 * completa deben simular este módulo:
 *   vi.mock('./sites/odes/kit/KitPlantilla', () => ({ default: () => null }))
 */
import { useEffect } from 'react'
import { RUTA_KIT } from './rutas'

const ID_SCRIPT = 'odes-kit-script'

interface KitUnal {
  Accessibility?: { initModal?: () => void; initFab?: () => void }
}

/**
 * El kit crea el botón de accesibilidad en el evento `load` de la ventana.
 * Como aquí el script se agrega después (al entrar a la rama), se llama a mano
 * a lo mismo; las dos funciones son idempotentes (no duplican el botón).
 */
function iniciarAccesibilidad(): void {
  const kit = (window as Window & { kitUnal?: KitUnal }).kitUnal
  try {
    kit?.Accessibility?.initModal?.()
    kit?.Accessibility?.initFab?.()
  } catch (error) {
    console.warn('[ODES] No se pudo iniciar el botón de accesibilidad del kit.', error)
  }
}

function cargarScriptKit(): void {
  if (document.getElementById(ID_SCRIPT)) {
    iniciarAccesibilidad()
    return
  }
  const script = document.createElement('script')
  script.id = ID_SCRIPT
  script.src = `${RUTA_KIT}script.js`
  script.async = true
  script.addEventListener('load', iniciarAccesibilidad)
  script.addEventListener('error', () => {
    console.warn('[ODES] No se pudo cargar el script del kit: el botón de accesibilidad no estará disponible.')
  })
  document.body.appendChild(script)
}

export default function KitPlantilla() {
  useEffect(() => {
    cargarScriptKit()
  }, [])

  return (
    <>
      {/* Las dos fuentes que se ven de inmediato, como en la plantilla. */}
      <link rel="preload" href={`${RUTA_KIT}fonts/Rubik-latin-normal.woff2`} as="font" type="font/woff2" crossOrigin="" />
      <link
        rel="preload"
        href={`${RUTA_KIT}fonts/MaterialSymbolsOutlined.woff2`}
        as="font"
        type="font/woff2"
        crossOrigin=""
      />
      <link rel="stylesheet" href={`${RUTA_KIT}styles.css`} precedence="odes-kit" />
    </>
  )
}
