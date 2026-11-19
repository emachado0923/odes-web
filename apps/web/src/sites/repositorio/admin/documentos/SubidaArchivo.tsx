/**
 * Archivo del documento: el actual (ver, descargar, reemplazar, quitar) y el
 * nuevo, que se sube al guardar. Se puede arrastrar y soltar o elegir con el
 * botón. Antes de aceptarlo se revisan el tipo (PDF, PNG, JPEG, DOCX, PPTX)
 * y el tamaño (80 MB); el servidor vuelve a revisar el contenido real.
 *
 * Tableros y entradas de blog solo enlazan a su URL externa: no se puede
 * elegir archivo, y si el documento ya tenía uno (se convirtió desde
 * «Documento») se avisa que no se publica y que se puede quitar.
 */
import { useId, useRef, useState, type DragEvent } from 'react'
import { LIMITES_REPOSITORIO, type DocumentoAdmin } from '../../api-repositorio'
import { urlSegura } from '../../datos/enlaces'
import { MensajeError } from '../componentes/Campo'
import Icono from '../componentes/IconoAdmin'
import { EXTENSIONES_PERMITIDAS, nombreTipo, tamanoLegible, tipoPermitido } from '../datos/formatos'
import { revisarArchivo } from './revisiones'

interface PropsSubida {
  doc: DocumentoAdmin | null
  pendiente: File | null
  quitar: boolean
  /** Tableros y entradas: sin archivo propio. */
  soloEnlace: boolean
  /** Fracción subida (0–1) mientras se guarda; null si no se está subiendo. */
  progreso: number | null
  ocupado: boolean
  errorServidor?: string
  onElegir: (archivo: File) => void
  onDescartar: () => void
  onQuitar: () => void
  onDeshacerQuitar: () => void
}

export default function SubidaArchivo({
  doc,
  pendiente,
  quitar,
  soloEnlace,
  progreso,
  ocupado,
  errorServidor,
  onElegir,
  onDescartar,
  onQuitar,
  onDeshacerQuitar,
}: PropsSubida) {
  const id = useId()
  const refEntrada = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)
  const actual = doc?.archivo ?? null
  const urlVer = actual ? urlSegura(doc?.urlVer) : null
  const urlDescarga = actual ? urlSegura(doc?.urlDescarga) : null
  const deshabilitado = ocupado
  /** Archivo que el tipo actual no publica: «Ver» abre la URL externa. */
  const sinUso = soloEnlace && actual !== null && !quitar

  function elegir(lista: FileList | null) {
    const archivo = lista?.[0]
    if (!archivo) return
    const problema = revisarArchivo(archivo)
    setError(problema)
    if (!problema) onElegir(archivo)
  }

  function soltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault()
    setEncima(false)
    if (deshabilitado) return
    if (evento.dataTransfer.files.length > 1) {
      setError('Suelte un solo archivo.')
      return
    }
    elegir(evento.dataTransfer.files)
  }

  const mensaje = error ?? errorServidor
  return (
    <div className="ra-archivo">
      {actual && !quitar && (
        <div className="ra-archivo-actual">
          <Icono nombre="documento" />
          <div>
            <p className="ra-archivo-nombre">
              Archivo actual: {nombreTipo(actual.tipo || actual.extension)} · {tamanoLegible(actual.bytes)}
            </p>
            <p className="ra-acciones-texto">
              {urlVer && (
                <a href={urlVer} target="_blank" rel="noopener noreferrer">
                  Ver<span className="rp-oculto"> el archivo actual (se abre en una pestaña nueva)</span>
                </a>
              )}
              {urlDescarga && (
                <a href={urlDescarga} download>
                  Descargar<span className="rp-oculto"> el archivo actual</span>
                </a>
              )}
              {!pendiente && (
                <button type="button" className="ra-boton-texto ra-peligro" onClick={onQuitar} disabled={ocupado}>
                  Quitar archivo
                </button>
              )}
            </p>
          </div>
        </div>
      )}
      {actual && quitar && (
        <div className="ra-aviso ra-aviso-atencion">
          <Icono nombre="aviso" />
          <p>El archivo actual se quitará al guardar.</p>
          <button type="button" className="ra-boton-texto" onClick={onDeshacerQuitar} disabled={ocupado}>
            Deshacer
          </button>
        </div>
      )}
      {pendiente && (
        <div className="ra-archivo-pendiente">
          <Icono nombre="subir" />
          <div>
            <p className="ra-archivo-nombre">
              {actual ? 'Archivo nuevo (reemplaza al actual al guardar)' : 'Archivo nuevo (se sube al guardar)'}
            </p>
            <p className="ra-tenue">
              {pendiente.name} · {nombreTipo(tipoPermitido(pendiente) ?? '')} · {tamanoLegible(pendiente.size)}
            </p>
            {progreso !== null && (
              <div className="ra-progreso">
                <label htmlFor={`${id}-progreso`}>Subiendo archivo… {Math.round(progreso * 100)} %</label>
                <progress id={`${id}-progreso`} max={1} value={progreso} />
              </div>
            )}
          </div>
          {progreso === null && (
            <button type="button" className="ra-boton-texto" onClick={onDescartar} disabled={ocupado}>
              Descartar<span className="rp-oculto"> el archivo nuevo</span>
            </button>
          )}
        </div>
      )}
      {sinUso ? (
        <div className="ra-aviso ra-aviso-atencion">
          <Icono nombre="aviso" />
          <p>
            Este archivo no se publica: los tableros y las entradas de blog no llevan archivo propio y «Ver» abre la URL
            externa. Puede quitarlo con «Quitar archivo».
          </p>
        </div>
      ) : soloEnlace ? (
        !pendiente && (
          <p className="ra-ayuda">Los tableros y las entradas de blog no llevan archivo propio: «Ver» abre la URL externa.</p>
        )
      ) : (
        <div
          className={`ra-zona${encima ? ' ra-zona-encima' : ''}${deshabilitado ? ' ra-zona-deshabilitada' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!deshabilitado) setEncima(true)
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
        >
          <Icono nombre="subir" />
          <p>
            Arrastre el archivo aquí o{' '}
            <button
              type="button"
              className="rp-boton rp-boton-borde ra-boton-chico"
              onClick={() => refEntrada.current?.click()}
              disabled={deshabilitado}
              aria-describedby={`${id}-ayuda${mensaje ? ` ${id}-error` : ''}`}
            >
              {actual || pendiente ? 'Elegir otro archivo' : 'Elegir archivo'}
            </button>
          </p>
          <p className="ra-ayuda" id={`${id}-ayuda`}>
            PDF, PNG, JPEG, DOCX o PPTX de hasta {tamanoLegible(LIMITES_REPOSITORIO.maxBytesArchivo)}. Si es un PDF y el
            documento no tiene portada, la portada se genera con su primera página.
          </p>
          <input
            ref={refEntrada}
            type="file"
            className="rp-oculto"
            tabIndex={-1}
            aria-hidden="true"
            accept={EXTENSIONES_PERMITIDAS}
            onChange={(e) => {
              elegir(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {mensaje && <MensajeError id={`${id}-error`} texto={mensaje} />}
    </div>
  )
}
