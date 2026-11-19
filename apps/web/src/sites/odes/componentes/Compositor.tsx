import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { LIMITES_CHAT } from '../chat/protocolo'

/** Altura máxima del campo antes de mostrar barra de desplazamiento (px). */
const ALTO_MAXIMO = 192
/** A partir de cuántos caracteres se muestra el contador. */
const AVISO_LARGO = LIMITES_CHAT.maxCaracteresUsuario - 300

/**
 * Campo de la pregunta: crece con el texto, Enter envía y Shift+Enter hace
 * un salto de línea. Mientras llega una respuesta, el mismo botón pasa a ser
 * "Detener" (mismo elemento, así el foco no se pierde al cambiar).
 */
export default function Compositor({
  enCurso,
  deshabilitado,
  onEnviar,
  onDetener,
}: {
  enCurso: boolean
  deshabilitado: boolean
  /** Devuelve true si la pregunta se envió (entonces se vacía el campo). */
  onEnviar: (texto: string) => boolean
  onDetener: () => void
}) {
  const [texto, setTexto] = useState('')
  const campo = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const elemento = campo.current
    if (!elemento) return
    elemento.style.height = 'auto'
    elemento.style.height = `${Math.min(elemento.scrollHeight + 2, ALTO_MAXIMO)}px`
    elemento.style.overflowY = elemento.scrollHeight + 2 > ALTO_MAXIMO ? 'auto' : 'hidden'
  }, [texto])

  const enviar = () => {
    if (enCurso || deshabilitado || texto.trim() === '') return
    if (onEnviar(texto)) setTexto('')
  }

  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (enCurso) onDetener()
    else enviar()
  }

  const alTeclear = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: no enviar mientras un teclado de composición (IME) arma la palabra.
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault()
      enviar()
    }
  }

  const largo = texto.length
  return (
    <form className="odes-formulario odes-formulario--pregunta" onSubmit={alEnviar} noValidate>
      <div className="odes-formulario__fila">
        <label htmlFor="odes-entrada" className="visually-hidden">
          Escribe tu pregunta
        </label>
        <textarea
          ref={campo}
          id="odes-entrada"
          className="form-control odes-entrada odes-entrada--pregunta"
          rows={1}
          enterKeyHint="send"
          maxLength={LIMITES_CHAT.maxCaracteresUsuario}
          placeholder="Escribe tu pregunta…"
          value={texto}
          disabled={deshabilitado}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={alTeclear}
        />
        <button
          type="submit"
          className={enCurso ? 'btn btn-outline-primary odes-enviar' : 'btn btn-primary odes-enviar'}
          disabled={deshabilitado && !enCurso}
        >
          {enCurso ? 'Detener' : 'Enviar'}
        </button>
      </div>
      {largo > AVISO_LARGO && (
        <p className="odes-contador" aria-live="polite">
          {largo} de {LIMITES_CHAT.maxCaracteresUsuario} caracteres
        </p>
      )}
    </form>
  )
}
