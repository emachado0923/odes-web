import { useEffect, useMemo, useState } from 'react'
import type { Busqueda, ErrorRespuesta, RespuestaAsistente } from '../chat/conversacion'
import { estaEnCurso, pasoActual } from '../chat/conversacion'
import { describirEspera } from '../chat/formato'
import { Burbuja, GrupoAsistente } from './Burbujas'
import { ContextoCitas, idFuente, prefiereMenosMovimiento, type ValorContextoCitas } from './contexto-citas'
import Icono from './Icono'
import ListaFuentes from './ListaFuentes'
import TarjetasDocumentos from './TarjetasDocumentos'
import TextoMarkdown from './TextoMarkdown'

/**
 * Icono de cada herramienta, la frase si el servidor no manda descripción y
 * lo que sigue haciendo el asistente cuando el paso ya terminó del lado del
 * servidor (la consulta es instantánea; lo que tarda es revisar lo que trajo).
 */
const PASOS: Readonly<Record<Busqueda['herramienta'], { icono: string; texto: string; despues: string | null }>> = {
  buscar: { icono: 'search', texto: 'Buscando en el repositorio', despues: 'Revisando lo que encontré' },
  listar: { icono: 'format_list_bulleted', texto: 'Consultando el catálogo', despues: 'Revisando los documentos del catálogo' },
  leer: { icono: 'menu_book', texto: 'Leyendo el documento', despues: null },
}

/** Tiempo (ms) que se muestra la frase del servidor antes de pasar a la de "revisando". */
export const ESPERA_REVISANDO = 2500

export const MENSAJE_RECHAZO =
  'No puedo ayudarte con esa solicitud. Puedo responder preguntas sobre los documentos del Observatorio de Sapiencia: intenta reformularla.'

/**
 * Lo que el asistente hace en este momento, en una sola línea que se
 * reemplaza con cada paso (no un historial): "Analizando tu pregunta…", luego la frase que
 * manda el servidor ("Buscando “deserción 2023”", "Leyendo “Boletín 29”,
 * págs. 3–5") y, si el paso se alarga, lo que sigue ("Revisando lo que
 * encontré"). Desaparece cuando empieza a llegar el texto.
 *
 * El componente se monta de nuevo en cada paso (key en Respuesta), así que el
 * temporizador y la animación de entrada empiezan de cero.
 */
function PasoEnVivo({ busqueda }: { busqueda: Busqueda | null }) {
  const [revisando, setRevisando] = useState(false)
  const paso = busqueda ? PASOS[busqueda.herramienta] : null
  const despues = paso?.despues ?? null

  useEffect(() => {
    if (!despues) return
    const temporizador = window.setTimeout(() => setRevisando(true), ESPERA_REVISANDO)
    return () => window.clearTimeout(temporizador)
  }, [despues])

  const texto = !busqueda || !paso ? 'Analizando tu pregunta' : revisando && despues ? despues : busqueda.descripcion.trim() || paso.texto
  const icono = !paso ? 'psychology' : revisando ? 'manage_search' : paso.icono
  return (
    <Burbuja className="odes-burbuja--paso">
      <span className="odes-paso" key={texto}>
        <Icono nombre={icono} className="odes-paso__icono" />
        <span className="odes-paso__texto">{texto}…</span>
      </span>
    </Burbuja>
  )
}

const REINTENTABLES = new Set(['sobrecarga', 'interno', 'conexion', 'cortado', 'limite_uso'])

function BloqueError({ error, onReintentar }: { error: ErrorRespuesta; onReintentar?: () => void }) {
  const [ahora, setAhora] = useState(() => Date.now())
  const espera = error.reintentarDesde !== null ? error.reintentarDesde - ahora : 0

  // Con Retry-After, "Podrás volver a preguntar en N segundos" va bajando
  // (cada segundo; cada 15 s mientras falte más de un minuto, que se muestra
  // en minutos) y "Reintentar" se habilita justo al terminar la espera. No
  // satura al lector de pantalla: la conversación es role="log" con
  // aria-live="off".
  useEffect(() => {
    if (espera <= 0) return
    const paso = espera > 60_000 ? 15_000 : 1_000
    const temporizador = window.setTimeout(() => setAhora(Date.now()), Math.min(espera, paso))
    return () => window.clearTimeout(temporizador)
  }, [espera])

  const reintentable = REINTENTABLES.has(error.codigo) && onReintentar
  return (
    <div className="odes-error">
      <Icono nombre="error" className="odes-error__icono" />
      <div className="odes-error__cuerpo">
        <p className="odes-error__mensaje">{error.mensaje}</p>
        {error.codigo === 'limite_uso' && error.reintentarDesde !== null && espera > 0 && (
          <p className="odes-error__espera">Podrás volver a preguntar en {describirEspera(espera)}.</p>
        )}
        {reintentable && (
          <button
            type="button"
            className="btn btn-outline-primary btn-sm odes-error__reintentar"
            onClick={onReintentar}
            disabled={espera > 0}
          >
            <Icono nombre="refresh" />
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}

/** Respuesta del asistente: paso en curso, texto con citas, fuentes, documentos y estado final. */
export default function Respuesta({
  respuesta,
  onReintentar,
}: {
  respuesta: RespuestaAsistente
  onReintentar?: () => void
}) {
  const { id, estado, texto, fuentes, documentos, error } = respuesta
  const enCurso = estaEnCurso(respuesta)
  const paso = pasoActual(respuesta)

  const contexto = useMemo<ValorContextoCitas>(
    () => ({
      idRespuesta: id,
      fuentes: new Map(fuentes.map((f) => [f.indice, f])),
      irAFuente: (indice) => {
        const elemento = document.getElementById(idFuente(id, indice))
        if (!elemento) return
        const detalles = elemento.querySelector('details')
        if (detalles) detalles.open = true
        elemento.scrollIntoView?.({ block: 'center', behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' })
        elemento.focus({ preventScroll: true })
      },
    }),
    [id, fuentes],
  )

  return (
    <GrupoAsistente className="odes-grupo--respuesta">
      <article className="odes-respuesta" aria-busy={enCurso} aria-label="Respuesta del asistente">
        {texto !== '' && (
          <ContextoCitas.Provider value={contexto}>
            <Burbuja className="odes-burbuja--respuesta">
              <TextoMarkdown texto={texto} enCurso={enCurso} />
            </Burbuja>
          </ContextoCitas.Provider>
        )}
        {paso && <PasoEnVivo key={paso.numero} busqueda={paso.busqueda} />}
        {estado === 'rechazada' && <Burbuja>{MENSAJE_RECHAZO}</Burbuja>}
        {estado === 'cortada' && (
          <p className="odes-nota">
            <Icono nombre="content_cut" />
            La respuesta se cortó porque era demasiado larga. Puedes pedirme que continúe o que la resuma.
          </p>
        )}
        {estado === 'detenida' && (
          <p className="odes-nota">
            <Icono nombre="stop_circle" />
            {texto === '' ? 'Detuviste la respuesta antes de que empezara.' : 'Detuviste la respuesta.'}
          </p>
        )}
        {fuentes.length > 0 && <ListaFuentes idRespuesta={id} fuentes={fuentes} />}
        {documentos.map((grupo, i) => (
          <TarjetasDocumentos key={i} grupo={grupo} id={`${id}-${i}`} />
        ))}
        {estado === 'error' && error && <BloqueError error={error} onReintentar={onReintentar} />}
      </article>
    </GrupoAsistente>
  )
}
