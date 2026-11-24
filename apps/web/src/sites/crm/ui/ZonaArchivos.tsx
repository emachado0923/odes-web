import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Icono from './Icono'

function traeArchivos(evento: DragEvent | globalThis.DragEvent): boolean {
  return Array.from(evento.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Dónde elegir archivos: se sueltan encima o se eligen con el botón «Elegir
 * archivo». No sube nada: entrega los archivos a `alElegir` y quien la usa
 * los valida (validarArchivo) y los sube.
 *
 * `aceptar` va al selector del sistema (p. ej. ACEPTAR_ARCHIVOS_CRM); lo que se
 * suelta no se filtra. Sin `multiple`, solo el primero. Mientras está montada,
 * un archivo soltado fuera de la zona no hace que el navegador lo abra y se
 * salga de la página.
 */
export default function ZonaArchivos({
  aceptar,
  multiple = false,
  alElegir,
  deshabilitada = false,
  texto,
  ayuda,
}: {
  aceptar: string
  multiple?: boolean
  alElegir: (archivos: File[]) => void
  deshabilitada?: boolean
  texto?: string
  ayuda?: string
}) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)

  useEffect(() => {
    const evitar = (evento: globalThis.DragEvent) => {
      if (!traeArchivos(evento)) return
      evento.preventDefault()
      if (evento.dataTransfer && evento.type === 'dragover') evento.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', evitar)
    window.addEventListener('drop', evitar)
    return () => {
      window.removeEventListener('dragover', evitar)
      window.removeEventListener('drop', evitar)
    }
  }, [])

  function entregar(lista: FileList | null) {
    const archivos = Array.from(lista ?? [])
    if (archivos.length === 0) return
    alElegir(multiple ? archivos : archivos.slice(0, 1))
  }

  function alPasar(evento: DragEvent<HTMLDivElement>) {
    if (!traeArchivos(evento)) return
    evento.preventDefault()
    evento.stopPropagation()
    evento.dataTransfer.dropEffect = deshabilitada ? 'none' : 'copy'
    if (!deshabilitada && !encima) setEncima(true)
  }

  function alSalir(evento: DragEvent<HTMLDivElement>) {
    const hacia = evento.relatedTarget
    if (hacia instanceof Node && evento.currentTarget.contains(hacia)) return
    setEncima(false)
  }

  function alSoltar(evento: DragEvent<HTMLDivElement>) {
    if (!traeArchivos(evento)) return
    evento.preventDefault()
    evento.stopPropagation()
    setEncima(false)
    if (!deshabilitada) entregar(evento.dataTransfer.files)
  }

  function alCambiar(evento: ChangeEvent<HTMLInputElement>) {
    entregar(evento.target.files)
    evento.target.value = '' // para poder elegir otra vez el mismo archivo
  }

  return (
    <div
      className="crm-zona"
      data-encima={encima ? '' : undefined}
      data-deshabilitada={deshabilitada ? '' : undefined}
      onDragEnter={alPasar}
      onDragOver={alPasar}
      onDragLeave={alSalir}
      onDrop={alSoltar}
    >
      <Icono nombre="subir" tamano={26} className="crm-zona-icono" />
      <p className="crm-zona-texto">
        {texto ?? (multiple ? 'Suelte los archivos aquí o' : 'Suelte el archivo aquí o')}
      </p>
      <button
        type="button"
        className="crm-boton crm-boton-secundario crm-boton-sm"
        disabled={deshabilitada}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        onClick={() => entrada.current?.click()}
      >
        {multiple ? 'Elegir archivos' : 'Elegir archivo'}
      </button>
      {ayuda ? (
        <p className="crm-zona-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      <input
        ref={entrada}
        type="file"
        className="crm-sr"
        accept={aceptar}
        multiple={multiple}
        disabled={deshabilitada}
        tabIndex={-1}
        aria-hidden="true"
        onChange={alCambiar}
      />
    </div>
  )
}
