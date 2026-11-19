import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatOdes from './ChatOdes'
import { RUTA_CHAT, RUTA_ESTADO } from './cliente'
import { CLAVE_ALMACEN } from './conversacion'
import type { EstadoAsistente, EventoChat, SolicitudChat } from './protocolo'
import {
  DOCUMENTO,
  DOCUMENTO_EN,
  DOCUMENTO_ENCONTRADO,
  ESTADO_BUSQUEDA,
  ESTADO_IA,
  ESTADO_SIN_REPOSITORIO,
  respuestaJson,
  respuestaSSE,
  sse,
} from './pruebas-utiles'
import { MENSAJE_RECHAZO } from '../componentes/Respuesta'

type ManejadorChat = (cuerpo: SolicitudChat, init: RequestInit) => Response | Promise<Response>

function servidor({ estado = ESTADO_IA, chat }: { estado?: EstadoAsistente | 'falla'; chat?: ManejadorChat } = {}) {
  const fetchSimulado = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init = {}) => {
    if (url === RUTA_ESTADO) {
      if (estado === 'falla') throw new TypeError('Failed to fetch')
      return respuestaJson(estado)
    }
    if (url === RUTA_CHAT && chat) return chat(JSON.parse(String(init.body)) as SolicitudChat, init)
    throw new Error(`fetch inesperado: ${url}`)
  })
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

/** Cuerpos JSON enviados a POST /api/odes/chat. */
function solicitudesChat(fetchSimulado: ReturnType<typeof servidor>): SolicitudChat[] {
  return fetchSimulado.mock.calls
    .filter(([url]) => url === RUTA_CHAT)
    .map(([, init]) => JSON.parse(String(init?.body)) as SolicitudChat)
}

const flujo = (...eventos: EventoChat[]) => eventos.map(sse).join('')

/** Respuesta SSE abierta que la prueba va alimentando. */
function flujoAbierto() {
  const control: { empujar: (...eventos: EventoChat[]) => void; cerrar: () => void } = {
    empujar: () => {},
    cerrar: () => {},
  }
  const crear = () =>
    respuestaSSE('', {
      abierto: true,
      alCrear: (empujar, cerrar) => {
        control.empujar = (...eventos) => act(() => empujar(flujo(...eventos)))
        control.cerrar = cerrar
      },
    })
  return { control, crear }
}

async function darNombre(nombre: string | null) {
  if (nombre === null) {
    fireEvent.click(screen.getByRole('button', { name: 'Prefiero no decirlo' }))
  } else {
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: nombre } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  }
  return screen.findByLabelText<HTMLTextAreaElement>('Escribe tu pregunta')
}

function preguntar(texto: string) {
  const campo = screen.getByLabelText('Escribe tu pregunta')
  fireEvent.change(campo, { target: { value: texto } })
  fireEvent.keyDown(campo, { key: 'Enter' })
}

const regionAnuncios = () => document.querySelector('[aria-live="polite"]') as HTMLElement

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bienvenida y nombre', () => {
  it('saluda según la hora, pregunta el nombre y lo usa sin enviarlo nunca al servidor', async () => {
    const fetchSimulado = servidor({
      chat: () => respuestaSSE(flujo({ tipo: 'texto', delta: 'Respuesta' }, { tipo: 'fin', motivo: 'completo' })),
    })
    render(<ChatOdes />)

    // El título va en la franja de la página (ConversacionOdes), no dentro del chat.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent(
      /¡Buen(os días|as tardes|as noches)! Soy el Asistente ODES, asistente virtual del Observatorio de Sapiencia\./,
    )
    expect(screen.getByText('¿Cuál es tu nombre?')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveAttribute('placeholder', 'Escribe tu nombre…')

    const campo = await darNombre('  Ana   Lucía 123 ')

    // Un saludo corto: lo que puede hacer el asistente va en el panel lateral, y no hay aviso debajo del chat.
    const bienvenida = within(screen.getByRole('log')).getByText('¡Mucho gusto, Ana Lucía! ¿En qué te puedo ayudar?')
    expect(bienvenida.closest('.odes-grupo')?.querySelectorAll('.odes-burbuja')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^¿/ })).toHaveLength(4)
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute('placeholder', 'Escribe tu pregunta…')
    expect(campo).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(/inteligencia artificial|Puedo equivocarme|no se envía a nuestros servidores/)).not.toBeInTheDocument()

    preguntar('¿Qué es Matrícula Cero?')
    expect(await screen.findByText('Respuesta')).toBeInTheDocument()
    expect(campo).toHaveFocus()

    const [solicitud] = solicitudesChat(fetchSimulado)
    expect(solicitud).toEqual({ mensajes: [{ rol: 'usuario', texto: '¿Qué es Matrícula Cero?' }] })
    expect(JSON.stringify(solicitud)).not.toMatch(/Ana|Lucía/)
    // El nombre sí queda en el navegador (sessionStorage) para sobrevivir a una recarga.
    await waitFor(() => expect(sessionStorage.getItem(CLAVE_ALMACEN)).toContain('Ana Lucía'))
  })

  it('"Prefiero no decirlo" sigue con una línea neutral y no guarda ningún nombre', async () => {
    servidor()
    render(<ChatOdes />)
    await darNombre(null)

    expect(screen.getByText('¡Listo! ¿En qué te puedo ayudar?')).toBeInTheDocument()
    expect(within(screen.getByRole('log')).getByText('Prefiero no decirlo')).toBeInTheDocument()
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(CLAVE_ALMACEN) ?? '{}')).toMatchObject({ nombre: null }))
  })

  it('el campo de texto solo lleva fondo cuando queda pegado abajo, encima de la conversación', async () => {
    servidor()
    render(<ChatOdes />)
    const compositor = document.querySelector('.odes-compositor') as HTMLElement
    // En su lugar (jsdom no hace diseño: todo mide 0): sin fondo, se ve el fondo de partículas.
    expect(compositor).not.toHaveAttribute('data-pegado')

    // Su lugar normal (la marca que va después) queda más abajo de la ventana: está pegado.
    const marca = compositor.nextElementSibling as HTMLElement
    expect(marca).toHaveClass('odes-fin')
    vi.spyOn(marca, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, window.innerHeight + 200, 10, 0))
    fireEvent.scroll(window)
    await waitFor(() => expect(compositor).toHaveAttribute('data-pegado'))
  })

  it('un nombre sin letras muestra un error y no avanza', () => {
    servidor()
    render(<ChatOdes />)
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: '1234 !!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu nombre con letras')
    expect(screen.getByLabelText('Tu nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByLabelText('Escribe tu pregunta')).not.toBeInTheDocument()
  })

  it('una sugerencia se envía como pregunta', async () => {
    const fetchSimulado = servidor({ chat: () => respuestaSSE(flujo({ tipo: 'fin', motivo: 'completo' })) })
    render(<ChatOdes />)
    await darNombre('Ana')
    const [sugerencia] = screen.getAllByRole('button', { name: /^¿/ })
    const texto = sugerencia.textContent ?? ''
    fireEvent.click(sugerencia)

    await waitFor(() => expect(solicitudesChat(fetchSimulado)).toHaveLength(1))
    expect(solicitudesChat(fetchSimulado)[0].mensajes.at(-1)?.texto).toBe(texto.replace(/^chat/, ''))
    // Tras la primera pregunta las sugerencias desaparecen.
    expect(screen.queryAllByRole('button', { name: /^¿/ })).toHaveLength(0)
  })
})

describe('respuesta en streaming', () => {
  it('muestra el progreso, el texto con citas y las fuentes, y anuncia solo la respuesta terminada', async () => {
    const { control, crear } = flujoAbierto()
    servidor({ chat: crear })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('¿Cuál fue la deserción en 2023?')

    const pasos = () => document.querySelectorAll('.odes-paso')
    expect(await screen.findByText('Analizando tu pregunta…')).toBeInTheDocument()
    // El servidor manda la frase completa: se muestra tal cual, sin anteponer otro verbo.
    control.empujar({ tipo: 'inicio', modo: 'ia' }, { tipo: 'busqueda', herramienta: 'buscar', descripcion: 'Buscando “deserción 2023”' })
    expect(await screen.findByText('Buscando “deserción 2023”…')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Respuesta del asistente' })).toHaveAttribute('aria-busy', 'true')
    // En vivo, no un historial: cada paso reemplaza al anterior.
    control.empujar({ tipo: 'busqueda', herramienta: 'leer', descripcion: 'Leyendo “Panorama de la deserción”, págs. 3–5' })
    expect(await screen.findByText('Leyendo “Panorama de la deserción”, págs. 3–5…')).toBeInTheDocument()
    expect(screen.queryByText(/Buscando|Analizando/)).not.toBeInTheDocument()
    expect(pasos()).toHaveLength(1)

    control.empujar(
      { tipo: 'texto', delta: '**La deserción** fue del 9,8 %' },
      {
        tipo: 'cita',
        indice: 1,
        documento: DOCUMENTO,
        paginaInicio: 4,
        paginaFin: 4,
        url: `${DOCUMENTO.url}#page=4`,
        textoCitado: 'La tasa de deserción anual fue del 9,8 %.',
      },
      { tipo: 'texto', delta: ' en 2023.' },
    )
    expect(await screen.findByText('La deserción', { selector: 'strong' })).toBeInTheDocument()
    expect(pasos()).toHaveLength(0)
    // Mientras llega el texto, nada de eso se anuncia.
    expect(regionAnuncios()).not.toHaveTextContent('deserción')

    control.empujar(
      {
        tipo: 'cita',
        indice: 2,
        documento: DOCUMENTO_EN,
        paginaInicio: null,
        paginaFin: null,
        url: DOCUMENTO_EN.url,
        textoCitado: '',
      },
      { tipo: 'fin', motivo: 'completo' },
    )

    const enlaceCita = await screen.findByRole('link', { name: `Fuente 1: ${DOCUMENTO.titulo}` })
    expect(enlaceCita.getAttribute('href')).toMatch(/^#odes-fuente-.+-1$/)
    expect(enlaceCita.closest('sup')).not.toBeNull()

    const fuentes = within(screen.getByRole('list', { name: 'Fuentes' })).getAllByRole('listitem')
    expect(fuentes).toHaveLength(2)
    expect(within(fuentes[0]).getByText('Estudio · 2023 · pág. 4')).toBeInTheDocument()
    expect(fuentes[0].querySelector('img')).toHaveAttribute('src', '/odes/portadas/estudio-panorama-desercion-2023.webp')
    const ver = within(fuentes[0]).getByRole('link', { name: /^Ver documento: Panorama/ })
    expect(ver).toHaveAttribute('href', `${DOCUMENTO.url}#page=4`)
    expect(ver).toHaveAttribute('target', '_blank')
    expect(ver).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(fuentes[0]).getByText('Texto citado')).toBeInTheDocument()
    // Documento en inglés: lang="en"; sin portada, un icono en lugar de la miniatura.
    expect(within(fuentes[1]).getByText(DOCUMENTO_EN.titulo, { selector: 'p' })).toHaveAttribute('lang', 'en')
    expect(fuentes[1].querySelector('img')).toBeNull()
    expect(within(fuentes[1]).getByText('Infografía · S. F.')).toBeInTheDocument()

    // Al terminar no queda la lista de lo que consultó.
    expect(screen.queryByText(/Buscando|Leyendo|Consulté/)).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Respuesta del asistente' })).toHaveAttribute('aria-busy', 'false')
    await waitFor(() =>
      expect(regionAnuncios()).toHaveTextContent('Asistente ODES: La deserción fue del 9,8 % en 2023. 2 fuentes citadas.'),
    )
  })

  it('el número volado lleva a su fuente y despliega el texto citado', async () => {
    servidor({
      chat: () =>
        respuestaSSE(
          flujo(
            { tipo: 'texto', delta: 'Dato' },
            { tipo: 'cita', indice: 1, documento: DOCUMENTO, paginaInicio: 2, paginaFin: 3, url: DOCUMENTO.url, textoCitado: 'Cita exacta' },
            { tipo: 'fin', motivo: 'completo' },
          ),
        ),
    })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('Pregunta')

    const enlace = await screen.findByRole('link', { name: /^Fuente 1/ })
    fireEvent.focus(enlace)
    expect(document.querySelector('.odes-globo')).toHaveTextContent('Cita exacta')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.odes-globo')).toBeNull()

    fireEvent.click(enlace)
    const fuente = document.getElementById(enlace.getAttribute('href')!.slice(1))!
    expect(fuente).toHaveFocus()
    expect(fuente.querySelector('details')).toHaveProperty('open', true)
    expect(within(fuente).getByText('Estudio · 2023 · págs. 2–3')).toBeInTheDocument()
  })

  it('no dibuja HTML crudo, imágenes ni enlaces que no sean http(s); los externos abren en otra pestaña', async () => {
    servidor({
      chat: () =>
        respuestaSSE(
          flujo(
            {
              tipo: 'texto',
              delta: 'Hola <img src=x onerror=alert(1)> ![foto](https://x.co/a.png) [malo](javascript:alert(1)) [bueno](https://ejemplo.org)',
            },
            { tipo: 'fin', motivo: 'completo' },
          ),
        ),
    })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('Pregunta')

    const bueno = await screen.findByRole('link', { name: /bueno/ })
    expect(bueno).toHaveAttribute('href', 'https://ejemplo.org')
    expect(bueno).toHaveAttribute('target', '_blank')
    expect(bueno).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: 'malo' })).not.toBeInTheDocument()
    expect(screen.getByText('malo')).toBeInTheDocument()
    const burbuja = bueno.closest('.odes-burbuja')!
    expect(burbuja.querySelector('img')).toBeNull()
  })

  it('Detener corta la respuesta, conserva el texto y devuelve el foco al campo', async () => {
    const { control, crear } = flujoAbierto()
    let senal: AbortSignal | undefined
    servidor({
      chat: (_cuerpo, init) => {
        senal = init.signal ?? undefined
        return crear()
      },
    })
    render(<ChatOdes />)
    const campo = await darNombre('Ana')
    preguntar('Pregunta larga')
    control.empujar({ tipo: 'texto', delta: 'Texto parcial' })
    expect(await screen.findByText('Texto parcial')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Detener' }))

    expect(await screen.findByText('Detuviste la respuesta.')).toBeInTheDocument()
    expect(screen.getByText('Texto parcial')).toBeInTheDocument()
    expect(senal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
    expect(campo).toHaveFocus()
    await waitFor(() => expect(regionAnuncios()).toHaveTextContent('Respuesta detenida.'))
  })

  it('fin por límite de tokens y rechazo muestran su aviso', async () => {
    const respuestas = [
      flujo({ tipo: 'texto', delta: 'Muy largo' }, { tipo: 'fin', motivo: 'limite_tokens' }),
      flujo({ tipo: 'fin', motivo: 'rechazo' }),
    ]
    servidor({ chat: () => respuestaSSE(respuestas.shift() ?? '') })
    render(<ChatOdes />)
    await darNombre('Ana')

    preguntar('Uno')
    expect(await screen.findByText(/La respuesta se cortó porque era demasiado larga/)).toBeInTheDocument()
    preguntar('Dos')
    expect(await screen.findByText(MENSAJE_RECHAZO)).toBeInTheDocument()
  })

  it('rechazo a mitad del flujo: un solo aviso, sin el texto parcial, y la pregunta no vuelve en el historial', async () => {
    const respuestas = [
      flujo(
        { tipo: 'texto', delta: 'Respuesta parcial antes del rechazo.' },
        // Texto de rechazo propio que enviaba antes el servidor; si llega, también se descarta.
        { tipo: 'texto', delta: '\n\nLo siento, no puedo ayudarte con esa solicitud.' },
        { tipo: 'fin', motivo: 'rechazo' },
      ),
      flujo({ tipo: 'texto', delta: 'Matrícula Cero es…' }, { tipo: 'fin', motivo: 'completo' }),
    ]
    const fetchSimulado = servidor({ chat: () => respuestaSSE(respuestas.shift() ?? '') })
    render(<ChatOdes />)
    await darNombre('Ana')

    preguntar('¿Cómo hackeo el sitio?')
    expect(await screen.findByText(MENSAJE_RECHAZO)).toBeInTheDocument()
    const respuesta = screen.getAllByRole('article', { name: 'Respuesta del asistente' }).at(-1)!
    expect(respuesta).not.toHaveTextContent('Respuesta parcial')
    expect(respuesta).not.toHaveTextContent('Lo siento')
    await waitFor(() => expect(regionAnuncios()).toHaveTextContent(MENSAJE_RECHAZO))
    expect(regionAnuncios().textContent?.split(MENSAJE_RECHAZO)).toHaveLength(2)
    expect(regionAnuncios()).not.toHaveTextContent('Respuesta parcial')

    preguntar('¿Qué es Matrícula Cero?')
    expect(await screen.findByText('Matrícula Cero es…')).toBeInTheDocument()
    expect(solicitudesChat(fetchSimulado)[1].mensajes).toEqual([{ rol: 'usuario', texto: '¿Qué es Matrícula Cero?' }])
  })

  it('la segunda pregunta envía la primera respuesta sin marcas de cita', async () => {
    const respuestas = [
      flujo(
        { tipo: 'texto', delta: 'Fue 9,8 %' },
        { tipo: 'cita', indice: 1, documento: DOCUMENTO, paginaInicio: 1, paginaFin: 1, url: DOCUMENTO.url, textoCitado: 'x' },
        { tipo: 'fin', motivo: 'completo' },
      ),
      flujo({ tipo: 'fin', motivo: 'completo' }),
    ]
    const fetchSimulado = servidor({ chat: () => respuestaSSE(respuestas.shift() ?? '') })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('¿Deserción?')
    await screen.findByRole('link', { name: /^Fuente 1/ })
    preguntar('¿Y en 2024?')

    await waitFor(() => expect(solicitudesChat(fetchSimulado)).toHaveLength(2))
    expect(solicitudesChat(fetchSimulado)[1].mensajes).toEqual([
      { rol: 'usuario', texto: '¿Deserción?' },
      { rol: 'asistente', texto: 'Fue 9,8 %' },
      { rol: 'usuario', texto: '¿Y en 2024?' },
    ])
  })
})

describe('errores', () => {
  it('límite de uso (429): muestra el mensaje y cuánto esperar; Reintentar se habilita al terminar la espera', async () => {
    servidor({
      chat: () => respuestaJson({ codigo: 'limite_uso', mensaje: 'Espera un poco.' }, { status: 429, headers: { 'Retry-After': '30' } }),
    })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('Pregunta')

    expect(await screen.findByText('Espera un poco.')).toBeInTheDocument()
    expect(screen.getByText('Podrás volver a preguntar en 30 segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled()
    await waitFor(() => expect(regionAnuncios()).toHaveTextContent('Error: Espera un poco.'))
  })

  it('no disponible (503): mensaje sin botón de reintentar', async () => {
    servidor({
      chat: () => respuestaJson({ codigo: 'no_disponible', mensaje: 'El asistente no está disponible.' }, { status: 503 }),
    })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('Pregunta')

    expect(await screen.findByText('El asistente no está disponible.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('sobrecarga durante el flujo: "Reintentar" vuelve a enviar la misma pregunta y reemplaza el intento fallido', async () => {
    const respuestas = [
      flujo({ tipo: 'error', codigo: 'sobrecarga', mensaje: 'Hay muchas consultas.' }),
      flujo({ tipo: 'texto', delta: 'Ahora sí' }, { tipo: 'fin', motivo: 'completo' }),
    ]
    const fetchSimulado = servidor({ chat: () => respuestaSSE(respuestas.shift() ?? '') })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('¿Matrícula Cero?')

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Ahora sí')).toBeInTheDocument()
    expect(screen.queryByText('Hay muchas consultas.')).not.toBeInTheDocument()
    expect(within(screen.getByRole('log')).getAllByText('¿Matrícula Cero?')).toHaveLength(1)
    expect(solicitudesChat(fetchSimulado).map((s) => s.mensajes)).toEqual([
      [{ rol: 'usuario', texto: '¿Matrícula Cero?' }],
      [{ rol: 'usuario', texto: '¿Matrícula Cero?' }],
    ])
  })

  it('sin conexión o con el flujo cortado ofrece reintentar', async () => {
    const respuestas: (() => Response)[] = [
      () => {
        throw new TypeError('Failed to fetch')
      },
      () => respuestaSSE(flujo({ tipo: 'texto', delta: 'Empezó' })),
    ]
    servidor({ chat: () => respuestas.shift()!() })
    render(<ChatOdes />)
    await darNombre('Ana')

    preguntar('Uno')
    expect(await screen.findByText(/No pude conectarme con el asistente/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled()

    preguntar('Dos')
    expect(await screen.findByText('La conexión se interrumpió antes de terminar la respuesta.')).toBeInTheDocument()
    expect(screen.getByText('Empezó')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1)
  })
})

describe('estado del asistente', () => {
  it('modo búsqueda: avisa que la IA no está activada y muestra los documentos como tarjetas', async () => {
    servidor({
      estado: ESTADO_BUSQUEDA,
      chat: () =>
        respuestaSSE(
          flujo(
            { tipo: 'inicio', modo: 'busqueda' },
            { tipo: 'texto', delta: 'Estos documentos pueden ayudarte:' },
            { tipo: 'documentos', titulo: 'Documentos encontrados', documentos: [DOCUMENTO_ENCONTRADO] },
            { tipo: 'fin', motivo: 'completo' },
          ),
        ),
    })
    render(<ChatOdes />)
    expect(await screen.findByText(/La inteligencia artificial del asistente todavía no está activada/)).toBeInTheDocument()
    await darNombre('Ana')
    preguntar('deserción')

    const seccion = await screen.findByRole('region', { name: 'Documentos encontrados' })
    expect(within(seccion).getByText(DOCUMENTO.titulo, { selector: 'p' })).toBeInTheDocument()
    expect(within(seccion).getByText('Estudio · 2023 · págs. 4–5')).toBeInTheDocument()
    expect(within(seccion).getByText('“La deserción anual fue del 9,8 %.”')).toBeInTheDocument()
    expect(within(seccion).getByRole('link', { name: /^Ver documento/ })).toHaveAttribute('href', DOCUMENTO_ENCONTRADO.urlFragmento)
    await waitFor(() => expect(regionAnuncios()).toHaveTextContent('1 documento encontrado.'))
  })

  it('índice desde la base del repositorio: tarjetas con la miniatura de la base y enlace a la copia propia', async () => {
    const propia = {
      ...DOCUMENTO_ENCONTRADO,
      url: `/api/repositorio/documentos/${DOCUMENTO.id}/ver`,
      urlFragmento: `/api/repositorio/documentos/${DOCUMENTO.id}/ver#page=4`,
      urlMiniatura: `/api/repositorio/documentos/${DOCUMENTO.id}/miniatura?v=0123456789abcdef`,
    }
    servidor({
      estado: ESTADO_BUSQUEDA,
      chat: () =>
        respuestaSSE(
          flujo(
            { tipo: 'inicio', modo: 'busqueda' },
            { tipo: 'texto', delta: 'Estos documentos pueden ayudarte:' },
            { tipo: 'documentos', titulo: 'Documentos encontrados', documentos: [propia] },
            { tipo: 'fin', motivo: 'completo' },
          ),
        ),
    })
    render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('deserción')

    const seccion = await screen.findByRole('region', { name: 'Documentos encontrados' })
    const miniatura = seccion.querySelector('img')
    expect(miniatura).toHaveAttribute('src', propia.urlMiniatura)
    // Si la base no responde, la miniatura estática de /odes/portadas/.
    fireEvent.error(miniatura!)
    expect(seccion.querySelector('img')).toHaveAttribute('src', `/odes/portadas/${DOCUMENTO.portada}`)
    const ver = within(seccion).getByRole('link', { name: /^Ver documento/ })
    expect(ver).toHaveAttribute('href', propia.urlFragmento)
    expect(ver).toHaveAttribute('target', '_blank')
  })

  it('repositorio no disponible: aviso de error y el campo de la pregunta deshabilitado', async () => {
    servidor({ estado: ESTADO_SIN_REPOSITORIO })
    render(<ChatOdes />)
    expect(await screen.findByRole('alert')).toHaveTextContent('El repositorio del Observatorio no está disponible')
    const campo = await darNombre('Ana')
    expect(campo).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('si no se puede consultar el estado, avisa y "Reintentar" vuelve a consultarlo', async () => {
    const fetchSimulado = servidor({ estado: 'falla' })
    render(<ChatOdes />)
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('No pude comprobar si el asistente está disponible')

    servidor({ estado: ESTADO_IA })
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
  })
})

describe('conversación guardada', () => {
  it('salir del chat a mitad de una respuesta (p. ej. «Atrás» al ingreso) guarda lo que ya llegó', async () => {
    const { control, crear } = flujoAbierto()
    servidor({ chat: crear })
    const { unmount } = render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('¿Qué es Matrícula Cero?')
    control.empujar({ tipo: 'inicio', modo: 'ia' }, { tipo: 'texto', delta: 'Respuesta parcial' })
    expect(await screen.findByText('Respuesta parcial')).toBeInTheDocument()

    // Sin esperar el guardado diferido (250 ms): se guarda al desmontar.
    unmount()
    expect(sessionStorage.getItem(CLAVE_ALMACEN)).toContain('Respuesta parcial')

    render(<ChatOdes />)
    expect(screen.getByText('Respuesta parcial')).toBeInTheDocument()
    expect(screen.getByText('Detuviste la respuesta.')).toBeInTheDocument()
  })

  it('se recupera al recargar y "Nueva conversación" la borra y vuelve a pedir el nombre', async () => {
    servidor({ chat: () => respuestaSSE(flujo({ tipo: 'texto', delta: 'Primera respuesta' }, { tipo: 'fin', motivo: 'completo' })) })
    const { unmount } = render(<ChatOdes />)
    await darNombre('Ana')
    preguntar('Primera pregunta')
    await screen.findByText('Primera respuesta')
    await waitFor(() => expect(sessionStorage.getItem(CLAVE_ALMACEN)).toContain('Primera respuesta'))
    unmount()

    render(<ChatOdes />)
    expect(screen.getByText('Primera pregunta')).toBeInTheDocument()
    expect(screen.getByText('Primera respuesta')).toBeInTheDocument()
    expect(screen.getByText('¡Mucho gusto, Ana! ¿En qué te puedo ayudar?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }))
    expect(screen.queryByText('Primera pregunta')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveFocus()
    expect(sessionStorage.getItem(CLAVE_ALMACEN)).toBeNull()
  })
})
