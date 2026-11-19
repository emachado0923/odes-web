import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { metadatosDocumento } from '../chat/formato'
import { ContextoCitas, idFuente } from './contexto-citas'

const LARGO_MAXIMO_GLOBO = 240

function recortar(texto: string, largo: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length <= largo ? limpio : `${limpio.slice(0, largo - 1).trimEnd()}…`
}

/**
 * Número volado de una cita (⟦n⟧ en el texto). Es un enlace a la fuente n de
 * la lista "Fuentes"; al pasar el cursor o enfocarlo muestra un globo con el
 * documento y el texto citado (WCAG 1.4.13: se cierra con Escape, se puede
 * recorrer con el cursor y no desaparece solo).
 *
 * El globo es solo visual (aria-hidden): para el lector de pantalla el nombre
 * del enlace ya dice "Fuente n: <título>", y el texto citado está en la lista.
 */
export default function CitaVolada({ indice }: { indice: number }) {
  const contexto = useContext(ContextoCitas)
  const fuente = contexto?.fuentes.get(indice)
  const [abierta, setAbierta] = useState(false)
  const [estilo, setEstilo] = useState<CSSProperties | null>(null)
  const anclaRef = useRef<HTMLAnchorElement>(null)
  const globoRef = useRef<HTMLSpanElement>(null)
  const temporizador = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierta(false)
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierta])

  // Ubica el globo debajo del número, sin salirse del ancho de la respuesta
  // (así nunca aparece desplazamiento horizontal en pantallas angostas).
  useLayoutEffect(() => {
    if (!abierta) return
    const ancla = anclaRef.current
    const globo = globoRef.current
    const contenedor = ancla?.closest('.odes-markdown')
    const base = globo?.offsetParent
    if (!ancla || !globo || !contenedor || !base) return
    const rectContenedor = contenedor.getBoundingClientRect()
    const rectAncla = ancla.getBoundingClientRect()
    const rectBase = base.getBoundingClientRect()
    const anchoMaximo = Math.min(rectContenedor.width, 320)
    globo.style.maxWidth = `${anchoMaximo}px`
    const ancho = globo.offsetWidth
    const izquierda = Math.max(
      rectContenedor.left,
      Math.min(rectAncla.left + rectAncla.width / 2 - ancho / 2, rectContenedor.right - ancho),
    )
    setEstilo({ left: izquierda - rectBase.left, top: rectAncla.bottom + 6 - rectBase.top, maxWidth: anchoMaximo })
  }, [abierta])

  if (!contexto || !fuente) {
    // Marca sin fuente conocida: se muestra el número, sin enlace.
    return <sup className="odes-cita odes-cita--sin-fuente">{indice}</sup>
  }

  const { documento } = fuente
  const lang = documento.idioma === 'en' ? 'en' : undefined
  const abrir = () => {
    window.clearTimeout(temporizador.current)
    setAbierta(true)
  }
  const cerrarPronto = () => {
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAbierta(false), 150)
  }

  return (
    <sup className="odes-cita">
      <span className="odes-cita__ancla" onMouseEnter={abrir} onMouseLeave={cerrarPronto}>
        <a
          ref={anclaRef}
          className="odes-cita__enlace"
          href={`#${idFuente(contexto.idRespuesta, indice)}`}
          onClick={(evento) => {
            evento.preventDefault()
            setAbierta(false)
            contexto.irAFuente(indice)
          }}
          onFocus={abrir}
          onBlur={() => setAbierta(false)}
        >
          <span aria-hidden="true">{indice}</span>
          <span className="visually-hidden">
            Fuente {indice}: <span lang={lang}>{documento.titulo}</span>
          </span>
        </a>
        {abierta && (
          <span
            ref={globoRef}
            className="odes-globo"
            aria-hidden="true"
            style={estilo ?? { visibility: 'hidden', left: 0, top: 0 }}
          >
            <span className="odes-globo__titulo" lang={lang}>
              {documento.titulo}
            </span>
            <span className="odes-globo__meta">
              {metadatosDocumento(documento, fuente.paginaInicio, fuente.paginaFin)}
            </span>
            {fuente.textoCitado.trim() !== '' && (
              <span className="odes-globo__texto" lang={lang}>
                “{recortar(fuente.textoCitado, LARGO_MAXIMO_GLOBO)}”
              </span>
            )}
          </span>
        )}
      </span>
    </sup>
  )
}
