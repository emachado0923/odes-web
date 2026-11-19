import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import { GOVCO, IDIOMAS } from '../../datos/sapiencia-oficial'
import { LOGO_GOVCO } from '../../recursos/recursos'
import { AVISO_PESTANA } from './EnlaceOficial'
import { BanderaEspanol, BanderaIngles, IconoMundo, IconoPersona } from './iconos'

/**
 * Barra GOV.CO del sitio oficial (franja azul de 60 px): el logo GOV.CO
 * centrado en la mitad izquierda; "Opciones de Accesibilidad" e "Idioma"
 * centrados en la derecha. En celulares (≤ 600 px) quedan solo los íconos, a
 * la derecha (los textos siguen para lectores de pantalla).
 *
 * - "Opciones de Accesibilidad" abre el panel de accesibilidad (como en el
 *   sitio, que hace clic en la pestaña del plugin).
 * - "Idioma" muestra, al pasar el mouse o al activarlo, la franja gris con
 *   "Inglés" y "Español". Ver IDIOMAS en datos/sapiencia-oficial.ts.
 */
export default function BarraGovco({
  idPanelAccesibilidad,
  accesibilidadAbierta,
  onAccesibilidad,
  botonAccesibilidad,
}: {
  idPanelAccesibilidad: string
  accesibilidadAbierta: boolean
  onAccesibilidad: () => void
  botonAccesibilidad: RefObject<HTMLButtonElement | null>
}) {
  const idMenu = useId()
  const [idiomaAbierto, setIdiomaAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const botonIdioma = useRef<HTMLButtonElement>(null)
  // La traducción es de la página actual (se lee al abrir el menú).
  const [urlActual, setUrlActual] = useState('')

  useEffect(() => {
    if (!idiomaAbierto) return
    const fuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setIdiomaAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dentro = contenedor.current?.contains(document.activeElement)
      setIdiomaAbierto(false)
      if (dentro) botonIdioma.current?.focus()
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [idiomaAbierto])

  const leerUrl = () => setUrlActual(window.location.href)

  return (
    <div className="pe-sap-govco">
      <div className="pe-sap-govco-logo">
        <a href={GOVCO.url} target="_blank" rel="noopener noreferrer">
          <img
            src={LOGO_GOVCO.src}
            alt={`GOV.CO, portal único del Estado colombiano ${AVISO_PESTANA}`}
            width={110}
            height={22}
          />
        </a>
      </div>
      <div className="pe-sap-govco-acciones">
        <button
          ref={botonAccesibilidad}
          type="button"
          className="pe-sap-govco-boton"
          aria-expanded={accesibilidadAbierta}
          aria-controls={idPanelAccesibilidad}
          onClick={onAccesibilidad}
        >
          <IconoPersona className="pe-sap-govco-icono-persona" />
          <span className="pe-sap-govco-texto">{GOVCO.textoAccesibilidad}</span>
        </button>
        <div
          ref={contenedor}
          className={`pe-sap-idioma${idiomaAbierto ? ' is-abierto' : ''}`}
          onPointerEnter={leerUrl}
          onFocus={leerUrl}
        >
          <button
            ref={botonIdioma}
            type="button"
            className="pe-sap-govco-boton"
            aria-expanded={idiomaAbierto}
            aria-controls={idMenu}
            onClick={() => {
              leerUrl()
              setIdiomaAbierto((a) => !a)
            }}
          >
            <IconoMundo className="pe-sap-govco-icono-mundo" />
            <span className="pe-sap-govco-texto">{GOVCO.textoIdioma}</span>
          </button>
          <div id={idMenu} className="pe-sap-idioma-menu" hidden={!idiomaAbierto}>
            <a
              className="pe-sap-idioma-opcion"
              href={IDIOMAS.traductor(urlActual || window.location.href)}
              target="_blank"
              rel="noopener noreferrer"
              lang="es"
              onClick={() => setIdiomaAbierto(false)}
            >
              <BanderaIngles className="pe-sap-idioma-bandera" />
              <span>{IDIOMAS.ingles}</span> <span className="pe-sr">{AVISO_PESTANA}</span>
            </a>
            <a
              className="pe-sap-idioma-opcion"
              href={urlActual || window.location.href}
              aria-current="true"
              onClick={(e) => {
                // Ya está en español: solo cierra el menú.
                e.preventDefault()
                setIdiomaAbierto(false)
                botonIdioma.current?.focus()
              }}
            >
              <BanderaEspanol className="pe-sap-idioma-bandera" />
              <span>{IDIOMAS.espanol}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
