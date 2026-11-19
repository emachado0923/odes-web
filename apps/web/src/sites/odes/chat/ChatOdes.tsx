/**
 * Chat del Asistente ODES: une el estado (conversacion.ts), el cliente HTTP +
 * SSE (cliente.ts) y los componentes de la conversación.
 *
 * Accesibilidad:
 * - La conversación es role="log" con aria-live="off": así el lector de
 *   pantalla no lee cada fragmento que llega. Las respuestas TERMINADAS (y los
 *   errores) se anuncian en una región aria-live="polite" aparte.
 * - El foco queda en el campo de texto al enviar, al detener y al pasar del
 *   nombre al chat.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import AvisoEstado, { type CargaEstado } from '../componentes/AvisoEstado'
import { Presentacion, Saludo } from '../componentes/Bienvenida'
import { BurbujaUsuario } from '../componentes/Burbujas'
import Compositor from '../componentes/Compositor'
import FormularioNombre from '../componentes/FormularioNombre'
import Icono from '../componentes/Icono'
import Respuesta, { MENSAJE_RECHAZO } from '../componentes/Respuesta'
import { ErrorSolicitudChat, MENSAJES_POR_DEFECTO, consultarEstado, enviarChat } from './cliente'
import {
  borrarConversacion,
  cargarConversacion,
  construirHistorial,
  conversacionNueva,
  estaEnCurso,
  guardarConversacion,
  nuevoId,
  quitarIntercambio,
  reducirConversacion,
  textoPlano,
  type Conversacion,
  type Entrada,
  type ErrorRespuesta,
  type RespuestaAsistente,
} from './conversacion'
import { sanitizarNombre, saludoPorHora } from './nombre'
import { NOMBRE_ASISTENTE } from './protocolo'
import { lineaDeBienvenida } from './textos'

/** id compartido por el campo del nombre y el de la pregunta (solo existe uno a la vez). */
export const ID_ENTRADA = 'odes-entrada'

const MENSAJE_CORTADO = 'La conexión se interrumpió antes de terminar la respuesta.'

/** Distancia (px) al final de la conversación dentro de la cual se sigue la respuesta que llega. */
const MARGEN_SEGUIR = 120

function aErrorRespuesta(error: unknown): ErrorRespuesta {
  if (error instanceof ErrorSolicitudChat) {
    return {
      codigo: error.codigo,
      mensaje: error.message,
      reintentarDesde: error.esperaMs !== null ? Date.now() + error.esperaMs : null,
    }
  }
  return { codigo: 'interno', mensaje: MENSAJES_POR_DEFECTO.interno, reintentarDesde: null }
}

function plural(n: number, singular: string, varios: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${varios}`
}

/** Texto que se anuncia al lector de pantalla cuando termina una respuesta. */
function anuncioDeRespuesta(respuesta: RespuestaAsistente): string {
  const partes: string[] = []
  const texto = textoPlano(respuesta.texto)
  if (texto) partes.push(`${NOMBRE_ASISTENTE}: ${texto}`)
  const documentos = respuesta.documentos.reduce((total, grupo) => total + grupo.documentos.length, 0)
  if (respuesta.fuentes.length > 0) partes.push(`${plural(respuesta.fuentes.length, 'fuente citada', 'fuentes citadas')}.`)
  if (documentos > 0) partes.push(`${plural(documentos, 'documento encontrado', 'documentos encontrados')}.`)
  switch (respuesta.estado) {
    case 'cortada':
      partes.push('La respuesta se cortó porque era demasiado larga.')
      break
    case 'rechazada':
      partes.push(MENSAJE_RECHAZO)
      break
    case 'detenida':
      partes.push('Respuesta detenida.')
      break
    case 'error':
      if (respuesta.error) partes.push(`Error: ${respuesta.error.mensaje}`)
      break
  }
  return partes.join(' ')
}

/** Pantallas angostas o bajas (teléfono vertical u horizontal), donde cada línea visible cuenta. */
function pantallaAngosta(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 47.99rem), (max-height: 31.99rem)').matches
  )
}

/**
 * Desplaza la página (solo hacia abajo) hasta que el final del elemento quede
 * en el borde inferior de la ventana. Se calcula a mano en lugar de usar
 * scrollIntoView para no sumar el scroll-padding-bottom de odes.css, y sin
 * animación: el kit activa scroll-behavior: smooth, y un desplazamiento suave
 * por cada fragmento que llega se atrasaría y dejaría de seguir la respuesta.
 */
function desplazarHasta(elemento: HTMLElement | null): void {
  if (!elemento) return
  const destino = elemento.getBoundingClientRect().bottom + window.scrollY - window.innerHeight
  if (destino > window.scrollY + 1) document.scrollingElement?.scrollTo?.({ top: destino, behavior: 'instant' })
}

function enfocarEntrada(): void {
  document.getElementById(ID_ENTRADA)?.focus()
}

export default function ChatOdes() {
  const [conversacion, despachar] = useReducer(
    reducirConversacion,
    undefined,
    () => cargarConversacion() ?? conversacionNueva(saludoPorHora()),
  )
  const [carga, setCarga] = useState<CargaEstado>({ tipo: 'cargando' })
  const [intentoEstado, setIntentoEstado] = useState(0)
  const [anuncio, setAnuncio] = useState<{ id: number; texto: string } | null>(null)

  const controlador = useRef<AbortController | null>(null)
  const ultimaConversacion = useRef(conversacion)
  /** Final de la columna (tras "Nueva conversación") y final del campo de texto. */
  const finRef = useRef<HTMLDivElement>(null)
  const finCompositorRef = useRef<HTMLDivElement>(null)
  const compositorRef = useRef<HTMLDivElement>(null)
  const seguirAbajo = useRef(true)
  const pedirFoco = useRef(false)
  const desplazamientoPrevio = useRef<{ entradas: Entrada[]; etapa: Conversacion['etapa'] } | null>(null)
  const previa = useRef<{ id: string; enCurso: boolean } | null>(null)

  const { etapa, nombre, saludo, entradas } = conversacion
  const ultima = entradas.at(-1)
  const ultimaRespuesta = ultima?.tipo === 'asistente' ? ultima : undefined
  const enCurso = ultimaRespuesta !== undefined && estaEnCurso(ultimaRespuesta)
  const repositorioCaido = carga.tipo === 'listo' && !carga.estado.repositorio.disponible

  const anunciar = useCallback((texto: string) => {
    if (texto) setAnuncio((previo) => ({ id: (previo?.id ?? 0) + 1, texto }))
  }, [])

  // Estado del asistente (modo IA o búsqueda, repositorio disponible).
  useEffect(() => {
    const control = new AbortController()
    consultarEstado(control.signal).then(
      (estado) => setCarga({ tipo: 'listo', estado }),
      () => {
        if (!control.signal.aborted) setCarga({ tipo: 'error' })
      },
    )
    return () => control.abort()
  }, [intentoEstado])

  // Guardado en sessionStorage (con una pequeña espera para no escribir en cada fragmento).
  useEffect(() => {
    ultimaConversacion.current = conversacion
    const temporizador = window.setTimeout(() => guardarConversacion(conversacion), 250)
    return () => window.clearTimeout(temporizador)
  }, [conversacion])

  // Al salir del chat sin cerrar la pestaña (p. ej. «Atrás» hacia la pantalla
  // de ingreso a mitad de una respuesta) se guarda lo que ya llegó antes de
  // cortar el flujo: al volver se ve como respuesta detenida, igual que tras
  // una recarga.
  useEffect(() => {
    const alOcultar = () => guardarConversacion(ultimaConversacion.current)
    window.addEventListener('pagehide', alOcultar)
    return () => {
      window.removeEventListener('pagehide', alOcultar)
      guardarConversacion(ultimaConversacion.current)
      controlador.current?.abort()
    }
  }, [])

  // Anuncia la respuesta cuando pasa de "en curso" a terminada.
  useEffect(() => {
    if (!ultimaRespuesta) {
      previa.current = null
      return
    }
    const ahoraEnCurso = estaEnCurso(ultimaRespuesta)
    if (previa.current?.id === ultimaRespuesta.id && previa.current.enCurso && !ahoraEnCurso) {
      anunciar(anuncioDeRespuesta(ultimaRespuesta))
    }
    previa.current = { id: ultimaRespuesta.id, enCurso: ahoraEnCurso }
  }, [ultimaRespuesta, anunciar])

  /**
   * Hasta dónde se desplaza para seguir la respuesta: en pantallas anchas se
   * ve también "Nueva conversación"; en las angostas, solo hasta el campo de
   * texto (el botón queda justo debajo y se ve al desplazarse).
   */
  const finVisible = useCallback(
    () => (pantallaAngosta() ? finCompositorRef.current : finRef.current),
    [],
  )

  // Seguir el final de la conversación solo si la persona ya estaba abajo.
  useEffect(() => {
    const alDesplazar = () => {
      const fin = finVisible()
      if (fin) seguirAbajo.current = fin.getBoundingClientRect().bottom - window.innerHeight < MARGEN_SEGUIR
    }
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => window.removeEventListener('scroll', alDesplazar)
  }, [finVisible])

  useEffect(() => {
    const previo = desplazamientoPrevio.current
    desplazamientoPrevio.current = { entradas, etapa }
    if (previo === null) {
      // Al abrir la página no se desplaza nada, salvo para retomar una conversación guardada.
      if (entradas.length > 0) desplazarHasta(finVisible())
      return
    }
    // Sin cambios (React StrictMode repite los efectos en desarrollo).
    if (previo.entradas === entradas && previo.etapa === etapa) return
    if (seguirAbajo.current) desplazarHasta(finVisible())
  }, [entradas, etapa, finVisible])

  useEffect(() => {
    if (!pedirFoco.current) return
    pedirFoco.current = false
    enfocarEntrada()
  }, [conversacion])

  // El botón flotante de accesibilidad del kit va encima del campo de texto
  // cuando este se ve en la parte baja de la pantalla, para no tapar "Enviar"
  // (odes.css usa --odes-fab-abajo en pantallas angostas). Además, el campo
  // lleva fondo solo cuando queda pegado abajo, encima de la conversación
  // (data-pegado); en su lugar se ve el fondo de partículas.
  useEffect(() => {
    const elemento = compositorRef.current
    if (!elemento) return
    const raiz = document.documentElement
    let cuadro = 0
    const actualizar = () => {
      cuadro = 0
      const { top, bottom, height } = elemento.getBoundingClientRect()
      const alto = window.innerHeight
      const encima = bottom > 0 && top < alto && top > alto * 0.35 ? alto - top : 0
      raiz.style.setProperty('--odes-fab-abajo', `${Math.ceil(encima)}px`)
      raiz.style.setProperty('--odes-alto-compositor', `${Math.ceil(height)}px`)
      // Pegado: su lugar normal (la marca que va después) quedó más abajo de la ventana.
      const fin = finCompositorRef.current
      elemento.toggleAttribute('data-pegado', fin !== null && fin.getBoundingClientRect().top > alto + 1)
    }
    const programar = () => {
      if (!cuadro) cuadro = window.requestAnimationFrame(actualizar)
    }
    actualizar()
    window.addEventListener('scroll', programar, { passive: true })
    window.addEventListener('resize', programar)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(programar)
    observador?.observe(elemento)
    observador?.observe(document.body)
    return () => {
      window.cancelAnimationFrame(cuadro)
      window.removeEventListener('scroll', programar)
      window.removeEventListener('resize', programar)
      observador?.disconnect()
      raiz.style.removeProperty('--odes-fab-abajo')
      raiz.style.removeProperty('--odes-alto-compositor')
    }
  }, [])

  function enviar(texto: string, reemplaza?: string): boolean {
    const pregunta = texto.trim()
    if (pregunta === '' || enCurso || repositorioCaido) return false

    const base = reemplaza ? quitarIntercambio(entradas, reemplaza) : entradas
    const mensajes = construirHistorial(base, pregunta)
    const idPregunta = nuevoId()
    const idRespuesta = nuevoId()
    seguirAbajo.current = true
    despachar({ tipo: 'preguntar', idPregunta, idRespuesta, texto: pregunta, reemplaza })

    const control = new AbortController()
    controlador.current = control
    enviarChat({ mensajes }, { signal: control.signal, alEvento: (evento) => despachar({ tipo: 'evento', idRespuesta, evento }) })
      .then((fin) => {
        if (fin === 'abortado') despachar({ tipo: 'detener', idRespuesta })
        else if (fin === 'cortado') {
          despachar({
            tipo: 'fallo',
            idRespuesta,
            error: { codigo: 'cortado', mensaje: MENSAJE_CORTADO, reintentarDesde: null },
          })
        }
      })
      .catch((error: unknown) => despachar({ tipo: 'fallo', idRespuesta, error: aErrorRespuesta(error) }))
      .finally(() => {
        if (controlador.current === control) controlador.current = null
      })
    return true
  }

  function detener() {
    controlador.current?.abort()
    if (ultimaRespuesta) despachar({ tipo: 'detener', idRespuesta: ultimaRespuesta.id })
    enfocarEntrada()
  }

  function reintentar(respuesta: RespuestaAsistente) {
    const pregunta = entradas.find((e) => e.tipo === 'usuario' && e.id === respuesta.idPregunta)
    if (pregunta && enviar(pregunta.texto, respuesta.id)) enfocarEntrada()
  }

  function alNombre(valor: string | null) {
    const limpio = valor === null ? null : sanitizarNombre(valor) || null
    despachar({ tipo: 'nombre', nombre: limpio })
    pedirFoco.current = true
    anunciar(`${lineaDeBienvenida(limpio)} Escribe tu pregunta o elige una de las preguntas sugeridas.`)
  }

  function alSugerencia(pregunta: string) {
    if (enviar(pregunta)) pedirFoco.current = true
  }

  function nuevaConversacion() {
    controlador.current?.abort()
    controlador.current = null
    borrarConversacion()
    previa.current = null
    seguirAbajo.current = true
    pedirFoco.current = true
    despachar({ tipo: 'reiniciar', saludo: saludoPorHora() })
    document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'instant' })
    anunciar('Empezaste una nueva conversación. ¿Cuál es tu nombre?')
  }

  return (
    <div className="odes-pagina">
      <div className="odes-chat">
        <AvisoEstado
          carga={carga}
          onReintentar={() => {
            setCarga({ tipo: 'cargando' })
            setIntentoEstado((n) => n + 1)
          }}
        />

        <div className="odes-conversacion" role="log" aria-live="off" aria-label={`Conversación con el ${NOMBRE_ASISTENTE}`}>
          <Saludo saludo={saludo} />
          {etapa === 'chat' && (
            <Presentacion
              nombre={nombre}
              mostrarSugerencias={entradas.length === 0}
              deshabilitarSugerencias={enCurso || repositorioCaido}
              onSugerencia={alSugerencia}
            />
          )}
          {entradas.map((entrada) =>
            entrada.tipo === 'usuario' ? (
              <BurbujaUsuario key={entrada.id}>{entrada.texto}</BurbujaUsuario>
            ) : (
              <Respuesta
                key={entrada.id}
                respuesta={entrada}
                onReintentar={entrada.id === ultima?.id ? () => reintentar(entrada) : undefined}
              />
            ),
          )}
        </div>

        <div className="visually-hidden" aria-live="polite">
          {anuncio && <p key={anuncio.id}>{anuncio.texto}</p>}
        </div>

        <div className="odes-compositor" ref={compositorRef}>
          {etapa === 'nombre' ? (
            <FormularioNombre onNombre={alNombre} />
          ) : (
            <Compositor
              enCurso={enCurso}
              deshabilitado={repositorioCaido}
              onEnviar={(texto) => {
                const enviado = enviar(texto)
                if (enviado) enfocarEntrada()
                return enviado
              }}
              onDetener={detener}
            />
          )}
        </div>
        {/* Fuera del campo fijo: marca dónde termina su lugar normal en la página. */}
        <div ref={finCompositorRef} className="odes-fin" aria-hidden="true" />

        {etapa === 'chat' && (
          <div className="odes-pie-chat">
            <button type="button" className="btn btn-link-primary odes-nueva" onClick={nuevaConversacion}>
              <Icono nombre="restart_alt" />
              Nueva conversación
            </button>
          </div>
        )}
        <div ref={finRef} className="odes-fin" aria-hidden="true" />
      </div>
    </div>
  )
}
