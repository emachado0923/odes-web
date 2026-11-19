import { type RefObject, useEffect, useId, useRef } from 'react'
import { ACCESIBILIDAD_ENLACES } from '../../datos/sapiencia-oficial'
import EnlaceOficial from './EnlaceOficial'
import { IconoAccesibilidad, IconoAccesoUniversal, type TrazoAccesibilidad } from './iconos'
import { type Accesibilidad, type Esquema, TEXTO_MAXIMO, TEXTO_MINIMO } from './useAccesibilidad'

interface OpcionEsquema {
  texto: string
  trazo: TrazoAccesibilidad
  esquema: Esquema
}

const ESQUEMAS: readonly OpcionEsquema[] = [
  { texto: 'Escala de grises', trazo: 'grises', esquema: 'grises' },
  { texto: 'Alto contraste', trazo: 'altoContraste', esquema: 'alto-contraste' },
  { texto: 'Contraste negativo', trazo: 'contrasteNegativo', esquema: 'contraste-negativo' },
  { texto: 'Fondo claro', trazo: 'fondoClaro', esquema: 'fondo-claro' },
]

/**
 * Panel "Accesibilidad": recreación del panel del plugin "One Click
 * Accessibility" de sapiencia.gov.co (180 px, blanco con borde azul #4054B2,
 * fijo a la izquierda a 150 px de arriba —250 px en celulares—, con su pestaña
 * azul de 52 px). Lo abren la pestaña y "Opciones de Accesibilidad" de la
 * barra GOV.CO; se desliza desde la izquierda.
 *
 * Las opciones son reales para esta página (useAccesibilidad): aumentar y
 * disminuir el texto, escala de grises, alto contraste, contraste negativo,
 * fondo claro, subrayar enlaces, fuente legible y restablecer; abajo, los
 * enlaces del sitio (Centro de Relevo y el certificado de accesibilidad).
 * Las opciones activas se marcan con fondo azul (aria-pressed). Escape cierra
 * y devuelve el foco a quien lo abrió.
 */
export default function PanelAccesibilidad({
  id,
  abierto,
  onAlternar,
  onCerrar,
  accesibilidad,
  pestana,
}: {
  id: string
  abierto: boolean
  onAlternar: () => void
  onCerrar: () => void
  accesibilidad: Accesibilidad
  pestana: RefObject<HTMLButtonElement | null>
}) {
  const idTitulo = useId()
  const contenido = useRef<HTMLDivElement>(null)
  const { estado } = accesibilidad

  useEffect(() => {
    if (!abierto) return
    // Al abrir, el foco va a la primera opción (el panel está lejos en el orden de tabulación).
    contenido.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [abierto, onCerrar])

  return (
    <div id={id} className={`pe-sap-a11y${abierto ? ' is-abierto' : ''}`}>
      <div className="pe-sap-a11y-pestana">
        <button
          ref={pestana}
          type="button"
          className="pe-sap-a11y-pestana-boton"
          aria-expanded={abierto}
          aria-controls={`${id}-contenido`}
          onClick={onAlternar}
        >
          <IconoAccesoUniversal />
          <span className="pe-sr">Accesibilidad</span>
        </button>
      </div>
      <div
        ref={contenido}
        id={`${id}-contenido`}
        className="pe-sap-a11y-contenido"
        role="region"
        aria-labelledby={idTitulo}
        inert={!abierto}
      >
        <p id={idTitulo} className="pe-sap-a11y-titulo">
          Accesibilidad
        </p>
        <ul className="pe-sap-a11y-lista">
          <OpcionPanel texto="Aumentar texto" trazo="aumentar" onClick={accesibilidad.aumentarTexto} activo={estado.texto > 100} />
          <OpcionPanel texto="Disminuir texto" trazo="disminuir" onClick={accesibilidad.disminuirTexto} activo={estado.texto < 100} />
          {ESQUEMAS.map((o) => (
            <OpcionPanel
              key={o.texto}
              texto={o.texto}
              trazo={o.trazo}
              onClick={() => accesibilidad.alternarEsquema(o.esquema)}
              presionado={estado.esquema === o.esquema}
            />
          ))}
          <OpcionPanel texto="Subrayar enlaces" trazo="subrayar" onClick={accesibilidad.alternarSubrayar} presionado={estado.subrayar} />
          <OpcionPanel texto="Fuente legible" trazo="legible" onClick={accesibilidad.alternarLegible} presionado={estado.legible} />
          <OpcionPanel texto="Restablecer" trazo="restablecer" onClick={accesibilidad.restablecer} />
        </ul>
        {ACCESIBILIDAD_ENLACES.map((enlace) => (
          <ul key={enlace.url} className="pe-sap-a11y-lista pe-sap-a11y-lista--enlaces">
            <li className="pe-sap-a11y-item">
              <EnlaceOficial className="pe-sap-a11y-opcion" enlace={enlace}>
                <IconoAccesibilidad trazo="comentario" className="pe-sap-a11y-icono" />
                <span>{enlace.texto}</span>
              </EnlaceOficial>
            </li>
          </ul>
        ))}
        <p className="pe-sr" aria-live="polite">
          {`Tamaño del texto: ${estado.texto} % (de ${TEXTO_MINIMO} % a ${TEXTO_MAXIMO} %).`}
        </p>
      </div>
    </div>
  )
}

/**
 * Una opción del panel. Las que se prenden y apagan (esquemas, subrayar,
 * fuente) llevan aria-pressed; las de tamaño solo se marcan activas (fondo
 * azul) mientras el texto no está al 100 %, como en el plugin.
 */
function OpcionPanel({
  texto,
  trazo,
  onClick,
  presionado,
  activo,
}: {
  texto: string
  trazo: TrazoAccesibilidad
  onClick: () => void
  presionado?: boolean
  activo?: boolean
}) {
  return (
    <li className="pe-sap-a11y-item">
      <button
        type="button"
        className={`pe-sap-a11y-opcion${presionado || activo ? ' is-activo' : ''}`}
        aria-pressed={presionado}
        onClick={onClick}
      >
        <IconoAccesibilidad trazo={trazo} className="pe-sap-a11y-icono" />
        <span>{texto}</span>
      </button>
    </li>
  )
}
