import { NOMBRE_ASISTENTE } from '../chat/protocolo'
import { SUGERENCIAS, lineaDeBienvenida } from '../chat/textos'
import { Burbuja, BurbujaUsuario, GrupoAsistente } from './Burbujas'
import Icono from './Icono'

/**
 * Primer grupo: saludo según la hora y la pregunta por el nombre. El título
 * de la página va en la franja de arriba (BandaOdes, en ConversacionOdes).
 */
export function Saludo({ saludo }: { saludo: string }) {
  return (
    <GrupoAsistente>
      <Burbuja>
        {saludo} Soy el <strong>{NOMBRE_ASISTENTE}</strong>, asistente virtual del Observatorio de Sapiencia.
      </Burbuja>
      <Burbuja>¿Cuál es tu nombre?</Burbuja>
    </GrupoAsistente>
  )
}

/**
 * Respuesta de la persona al nombre y un saludo corto, con las sugerencias
 * (solo mientras no hay preguntas).
 */
export function Presentacion({
  nombre,
  mostrarSugerencias,
  deshabilitarSugerencias,
  onSugerencia,
}: {
  nombre: string | null
  mostrarSugerencias: boolean
  deshabilitarSugerencias: boolean
  onSugerencia: (pregunta: string) => void
}) {
  return (
    <>
      <BurbujaUsuario>{nombre ?? 'Prefiero no decirlo'}</BurbujaUsuario>
      <GrupoAsistente>
        <Burbuja>{lineaDeBienvenida(nombre)}</Burbuja>
        {mostrarSugerencias && (
          <ul className="odes-sugerencias" aria-label="Preguntas sugeridas">
            {SUGERENCIAS.map((pregunta) => (
              <li key={pregunta}>
                <button
                  type="button"
                  className="btn btn-outline-primary odes-sugerencia"
                  disabled={deshabilitarSugerencias}
                  onClick={() => onSugerencia(pregunta)}
                >
                  <Icono nombre="chat" />
                  <span>{pregunta}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GrupoAsistente>
    </>
  )
}
