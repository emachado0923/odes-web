import { useCallback, useId, useRef, useState } from 'react'
import { URL_SAPIENCIA } from './sapiencia-oficial'
import { LOGO_SAPIENCIA } from './recursos'
import BarraGovco from './BarraGovco'
import BuscadorSapiencia from './BuscadorSapiencia'
import MenuMovil from './MenuMovil'
import MenuPrincipal from './MenuPrincipal'
import PanelAccesibilidad from './PanelAccesibilidad'
import type { Accesibilidad } from './useAccesibilidad'
import './sapiencia.css'

/**
 * Recreación del header oficial de https://sapiencia.gov.co/ (medido el 26 de
 * octubre de 2026; contenido en datos/sapiencia-oficial.ts, estilos en
 * sapiencia.css).
 *
 * De arriba abajo:
 * 1. Barra GOV.CO (60 px, azul #4267C5): logo GOV.CO, "Opciones de
 *    Accesibilidad" e "Idioma". Se va con el desplazamiento.
 * 2. Panel de accesibilidad (fijo a la izquierda, con su pestaña).
 * 3. Cabecera blanca (130 px; 120 px desde 1140 px hacia abajo): logo de
 *    Sapiencia y la Alcaldía (va al inicio del sitio oficial, en la misma
 *    pestaña), el menú en la barra azul redondeada y la lupa. En escritorio
 *    (≥ 1141 px) queda pegada arriba al desplazar, como en el sitio; hacia
 *    abajo, la hamburguesa abre el menú en un panel.
 * 4. Panel del menú para tablet y celular (fuera del <header> para que los
 *    filtros de accesibilidad no lo saquen de su posición fija).
 */
export default function CabeceraSapiencia({ accesibilidad }: { accesibilidad: Accesibilidad }) {
  const id = useId()
  const idPanelAccesibilidad = `${id}-accesibilidad`
  const idMenuMovil = `${id}-menu-movil`

  const cabecera = useRef<HTMLElement>(null)
  const hamburguesa = useRef<HTMLButtonElement>(null)
  const botonGovco = useRef<HTMLButtonElement>(null)
  const pestana = useRef<HTMLButtonElement>(null)
  /** Quién abrió el panel de accesibilidad: recibe el foco al cerrarlo. */
  const abridor = useRef<HTMLButtonElement | null>(null)

  const [accesibilidadAbierta, setAccesibilidadAbierta] = useState(false)
  const [movilAbierto, setMovilAbierto] = useState(false)

  const alternarAccesibilidad = (desde: HTMLButtonElement | null) => {
    abridor.current = desde
    setAccesibilidadAbierta((a) => !a)
  }

  // Escape: cierra y, si el foco estaba en el panel o en el botón de la barra, lo devuelve a quien lo abrió.
  const cerrarAccesibilidad = useCallback(() => {
    const activo = document.activeElement
    const dentro = Boolean(document.getElementById(idPanelAccesibilidad)?.contains(activo)) || activo === botonGovco.current
    setAccesibilidadAbierta(false)
    if (dentro) abridor.current?.focus()
  }, [idPanelAccesibilidad])

  const cerrarMovil = useCallback((devolverFoco: boolean) => {
    setMovilAbierto(false)
    if (devolverFoco) hamburguesa.current?.focus()
  }, [])

  return (
    <>
      <BarraGovco
        idPanelAccesibilidad={idPanelAccesibilidad}
        accesibilidadAbierta={accesibilidadAbierta}
        onAccesibilidad={() => alternarAccesibilidad(botonGovco.current)}
        botonAccesibilidad={botonGovco}
      />
      <PanelAccesibilidad
        id={idPanelAccesibilidad}
        abierto={accesibilidadAbierta}
        onAlternar={() => alternarAccesibilidad(pestana.current)}
        onCerrar={cerrarAccesibilidad}
        accesibilidad={accesibilidad}
        pestana={pestana}
      />
      <header ref={cabecera} className="sap-cabecera">
        <div className="sap-cabecera-interior">
          <a className="sap-logo" href={URL_SAPIENCIA}>
            <img
              src={LOGO_SAPIENCIA.src}
              alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía de Medellín: ir al inicio de sapiencia.gov.co"
              width={LOGO_SAPIENCIA.ancho}
              height={LOGO_SAPIENCIA.alto}
            />
          </a>
          <div className="sap-cabecera-navegacion">
            <MenuPrincipal />
            <BuscadorSapiencia />
          </div>
          <button
            ref={hamburguesa}
            type="button"
            className={`sap-hamburguesa${movilAbierto ? ' is-abierto' : ''}`}
            aria-expanded={movilAbierto}
            aria-controls={idMenuMovil}
            onClick={() => setMovilAbierto((a) => !a)}
          >
            <span className="sap-hamburguesa-linea" />
            <span className="sap-hamburguesa-linea" />
            <span className="sap-hamburguesa-linea" />
            <span className="sap-sr">Menú</span>
          </button>
        </div>
      </header>
      <MenuMovil id={idMenuMovil} abierto={movilAbierto} onCerrar={cerrarMovil} hamburguesa={hamburguesa} cabecera={cabecera} />
    </>
  )
}
