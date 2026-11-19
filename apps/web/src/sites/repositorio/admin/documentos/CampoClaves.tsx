/**
 * Palabras clave del documento (máximo 7): lista con botones "Quitar" y un
 * campo combobox (ARIA 1.2) con sugerencias de las palabras que ya existen
 * en el repositorio. Enter o coma agregan lo escrito; si ya existe escrita
 * de otra forma (tildes, mayúsculas), se usa la forma existente.
 *
 * Teclado: flechas para recorrer las sugerencias, Enter para elegir, Esc
 * para cerrarlas. Los cambios se anuncian en una región aria-live.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Icono from '../componentes/IconoAdmin'
import { cantidad } from '../datos/formatos'
import { LIMITES, agregarClave, sugerirClaves, type Sugerencia } from './formulario'

interface PropsCampoClaves {
  id: string
  claves: string[]
  onCambio: (claves: string[]) => void
  existentes: readonly Sugerencia[]
  error?: string
  idAyuda: string
}

export default function CampoClaves({ id, claves, onCambio, existentes, error, idAyuda }: PropsCampoClaves) {
  const idLista = useId()
  const idEstado = useId()
  const idError = `${id}-error`
  const [escrito, setEscrito] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [anuncio, setAnuncio] = useState('')
  const refCampo = useRef<HTMLInputElement>(null)
  const textos = useMemo(() => existentes.map((e) => e.texto), [existentes])
  const sugerencias = useMemo(
    () => (abierta ? sugerirClaves(escrito, existentes, claves) : []),
    [abierta, escrito, existentes, claves],
  )
  const lleno = claves.length >= LIMITES.maxClaves
  const mostrarLista = abierta && sugerencias.length > 0

  function agregar(texto: string) {
    const r = agregarClave(claves, texto, textos)
    setAnuncio(r.aviso)
    if (r.agregada) {
      onCambio(r.claves)
      setEscrito('')
      setAbierta(false)
      setActiva(-1)
    }
  }

  function quitar(indice: number) {
    const texto = claves[indice]
    const siguientes = claves.filter((_, i) => i !== indice)
    onCambio(siguientes)
    setAnuncio(`Se quitó «${texto}».`)
    // El botón desaparece: el foco vuelve al campo.
    requestAnimationFrame(() => refCampo.current?.focus())
  }

  function mover(claves: readonly string[], desde: number, hacia: number) {
    if (hacia < 0 || hacia >= claves.length) return
    const lista = [...claves]
    const [c] = lista.splice(desde, 1)
    lista.splice(hacia, 0, c)
    onCambio(lista)
    setAnuncio(`«${c}» ahora es la ${hacia + 1}.ª de ${lista.length}.`)
  }

  function teclas(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      if (!abierta) setAbierta(true)
      setActiva((a) => (sugerencias.length ? (a + 1) % sugerencias.length : -1))
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setActiva((a) => (sugerencias.length ? (a <= 0 ? sugerencias.length - 1 : a - 1) : -1))
    } else if (evento.key === 'Enter') {
      // Enter agrega y no envía el formulario.
      evento.preventDefault()
      if (mostrarLista && activa >= 0) agregar(sugerencias[activa].texto)
      else if (escrito.trim()) agregar(escrito)
    } else if (evento.key === ',' || evento.key === ';') {
      evento.preventDefault()
      if (escrito.trim()) agregar(escrito)
    } else if (evento.key === 'Escape') {
      if (mostrarLista) {
        evento.preventDefault()
        setAbierta(false)
        setActiva(-1)
      }
    }
  }

  const descritoPor = [idAyuda, error ? idError : null].filter(Boolean).join(' ')

  return (
    <div className="ra-claves">
      {claves.length > 0 && (
        <ol className="ra-claves-lista" aria-label="Palabras clave del documento">
          {claves.map((c, i) => (
            <li key={c} className="ra-clave">
              <span className="ra-clave-texto">{c}</span>
              <button
                type="button"
                className="ra-clave-boton"
                onClick={() => mover(claves, i, i - 1)}
                disabled={i === 0}
                aria-label={`Subir «${c}»`}
              >
                <Icono nombre="flecha-arriba" />
              </button>
              <button
                type="button"
                className="ra-clave-boton"
                onClick={() => mover(claves, i, i + 1)}
                disabled={i === claves.length - 1}
                aria-label={`Bajar «${c}»`}
              >
                <Icono nombre="flecha" />
              </button>
              <button type="button" className="ra-clave-boton" onClick={() => quitar(i)} aria-label={`Quitar «${c}»`}>
                <Icono nombre="cerrar" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="ra-combo">
        <input
          ref={refCampo}
          id={id}
          className="ra-control"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-activedescendant={mostrarLista && activa >= 0 ? `${idLista}-${activa}` : undefined}
          aria-describedby={descritoPor}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          value={escrito}
          disabled={lleno}
          placeholder={lleno ? `Máximo ${LIMITES.maxClaves} palabras clave` : 'Escriba y pulse Enter'}
          onChange={(e) => {
            setEscrito(e.target.value)
            setAbierta(true)
            setActiva(-1)
          }}
          onKeyDown={teclas}
          onBlur={() => {
            setAbierta(false)
            setActiva(-1)
          }}
        />
        <button
          type="button"
          className="rp-boton rp-boton-borde ra-boton-chico"
          onClick={() => agregar(escrito)}
          disabled={lleno || !escrito.trim()}
        >
          Agregar<span className="rp-oculto"> palabra clave</span>
        </button>
        <ul id={idLista} role="listbox" className="ra-sugerencias" aria-label="Palabras clave existentes" hidden={!mostrarLista}>
          {sugerencias.map((s, i) => (
            <li
              key={s.texto}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === activa}
              className="ra-sugerencia"
              // mousedown (no click) para elegir antes de que el campo pierda el foco.
              onMouseDown={(e) => {
                e.preventDefault()
                agregar(s.texto)
              }}
            >
              <span>{s.texto}</span>
              <span className="ra-tenue">{cantidad(s.documentos, 'documento')}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="ra-contador" aria-hidden="true">
        {claves.length} de {LIMITES.maxClaves}
      </p>
      <p id={idEstado} className="rp-oculto" aria-live="polite">
        {anuncio}
      </p>
    </div>
  )
}
