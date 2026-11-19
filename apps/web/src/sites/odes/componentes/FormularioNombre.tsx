import { useState, type FormEvent } from 'react'
import { LONGITUD_MAXIMA_NOMBRE, sanitizarNombre } from '../chat/nombre'

/**
 * Respuesta a "¿Cuál es tu nombre?": campo + "Enviar" alineados a la derecha
 * (como BelloEduca) y la opción "Prefiero no decirlo". El nombre no sale del
 * navegador (ver chat/nombre.ts).
 */
export default function FormularioNombre({ onNombre }: { onNombre: (nombre: string | null) => void }) {
  const [valor, setValor] = useState('')
  const [error, setError] = useState(false)

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const nombre = sanitizarNombre(valor)
    if (!nombre) {
      setError(true)
      return
    }
    onNombre(nombre)
  }

  return (
    <form className="odes-formulario odes-formulario--nombre" onSubmit={enviar} noValidate>
      <div className="odes-formulario__fila">
        <label htmlFor="odes-entrada" className="visually-hidden">
          Tu nombre
        </label>
        <input
          id="odes-entrada"
          className="form-control odes-entrada"
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={LONGITUD_MAXIMA_NOMBRE}
          placeholder="Escribe tu nombre…"
          value={valor}
          aria-invalid={error || undefined}
          aria-describedby={error ? 'odes-error-nombre' : undefined}
          onChange={(evento) => {
            setValor(evento.target.value)
            if (error) setError(false)
          }}
        />
        <button type="submit" className="btn btn-primary odes-enviar">
          Enviar
        </button>
      </div>
      {error && (
        <p id="odes-error-nombre" className="odes-error-campo" role="alert">
          Escribe tu nombre con letras, o elige «Prefiero no decirlo».
        </p>
      )}
      <button type="button" className="btn btn-link-primary odes-prefiero" onClick={() => onNombre(null)}>
        Prefiero no decirlo
      </button>
    </form>
  )
}
