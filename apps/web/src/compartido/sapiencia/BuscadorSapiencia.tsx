import { type Ref, useEffect, useId, useRef, useState } from 'react'
import { BUSQUEDA } from './sapiencia-oficial'
import { IconoLupa } from './iconos'

/**
 * Formulario de búsqueda del sitio oficial: GET a https://sapiencia.gov.co/
 * con el parámetro s (el buscador de WordPress), en la misma pestaña, como
 * allá. `variante` 'escritorio' es la caja que se despliega bajo la lupa;
 * 'movil' es la del panel del menú en celulares.
 */
export function FormularioBusqueda({
  variante,
  campo,
}: {
  variante: 'escritorio' | 'movil'
  campo?: Ref<HTMLInputElement>
}) {
  const idCampo = useId()
  return (
    <form
      className={`sap-buscar-formulario sap-buscar-formulario--${variante}`}
      role="search"
      method="get"
      action={BUSQUEDA.accion}
      aria-label="Buscar en sapiencia.gov.co"
    >
      <label className="sap-sr" htmlFor={idCampo}>
        Buscar en sapiencia.gov.co
      </label>
      <input
        ref={campo}
        id={idCampo}
        className="sap-buscar-campo"
        type="search"
        name={BUSQUEDA.parametro}
        autoComplete="off"
        placeholder={variante === 'movil' ? 'Buscar..' : undefined}
      />
      <button type="submit" className="sap-buscar-enviar">
        <IconoLupa />
        <span className="sap-sr">Buscar</span>
      </button>
    </form>
  )
}

/**
 * La lupa de la cabecera (escritorio): abre y cierra la caja de búsqueda
 * (330 × 56 px, bajo la cabecera, como en el sitio). Al abrirla, el foco va al
 * campo; Escape o un clic fuera la cierran.
 */
export default function BuscadorSapiencia() {
  const idCaja = useId()
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    campo.current?.focus()
    const fuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dentro = contenedor.current?.contains(document.activeElement)
      setAbierto(false)
      if (dentro) boton.current?.focus()
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={contenedor} className={`sap-buscar${abierto ? ' is-abierto' : ''}`}>
      <button
        ref={boton}
        type="button"
        className="sap-buscar-boton"
        aria-expanded={abierto}
        aria-controls={idCaja}
        onClick={() => setAbierto((a) => !a)}
      >
        <IconoLupa />
        <span className="sap-sr">Buscar en sapiencia.gov.co</span>
      </button>
      <div id={idCaja} className="sap-buscar-caja" hidden={!abierto}>
        <FormularioBusqueda variante="escritorio" campo={campo} />
      </div>
    </div>
  )
}
