import type { ReactNode } from 'react'

export interface Pregunta {
  rotulo: string
  respuesta: string
  /** Trazos del icono (viewBox 24 × 24, solo líneas). */
  icono: ReactNode
}

/** Las cuatro preguntas de la maqueta «Pregúntale a OdeS», con sus respuestas. */
export const PREGUNTAS: readonly Pregunta[] = [
  {
    rotulo: '¿Quién es OdeS?',
    respuesta: 'El asistente virtual del Observatorio de Sapiencia.',
    icono: (
      <>
        <rect x="4" y="8" width="16" height="12" rx="4" />
        <circle cx="9" cy="14" r="1.3" />
        <circle cx="15" cy="14" r="1.3" />
        <path d="M12 8V5" />
        <circle cx="12" cy="4" r="1" />
      </>
    ),
  },
  {
    rotulo: '¿En qué te puede ayudar OdeS?',
    respuesta: 'Responde tus preguntas sobre Sapiencia y educación postsecundaria en el Distrito de Medellín.',
    icono: (
      <>
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M8 9h8M8 12.5h5" />
      </>
    ),
  },
  {
    rotulo: '¿Qué información utiliza OdeS?',
    respuesta: 'Utiliza información de los estudios del Observatorio de Sapiencia y las cifras de gestión institucional.',
    icono: (
      <>
        <path d="M7 3h8l4 4v14H7z" />
        <path d="M15 3v4h4M10 12h6M10 16h6" />
      </>
    ),
  },
  {
    rotulo: '¿Cada cuánto se actualiza OdeS?',
    respuesta: 'Cada vez que el Observatorio publica o actualiza un estudio o cifra.',
    icono: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18M9 16l2 2 4-4" />
      </>
    ),
  },
]
