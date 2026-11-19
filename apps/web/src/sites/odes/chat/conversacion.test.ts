import { describe, expect, it } from 'vitest'
import {
  CLAVE_ALMACEN,
  cargarConversacion,
  construirHistorial,
  conversacionNueva,
  guardarConversacion,
  pasoActual,
  quitarMarcas,
  reducirConversacion,
  suavizarMarkdownParcial,
  textoPlano,
  type Accion,
  type Conversacion,
  type Entrada,
  type RespuestaAsistente,
} from './conversacion'
import { sanitizarNombre, saludoPorHora } from './nombre'
import { LIMITES_CHAT, type EventoChat } from './protocolo'
import { DOCUMENTO, DOCUMENTO_EN, DOCUMENTO_ENCONTRADO } from './pruebas-utiles'

const cita = (indice: number, documento = DOCUMENTO): EventoChat => ({
  tipo: 'cita',
  indice,
  documento,
  paginaInicio: 4,
  paginaFin: 4,
  url: `${documento.url}#page=4`,
  textoCitado: 'La deserción anual fue del 9,8 %.',
})

function conPregunta(texto = '¿Cuál fue la deserción en 2023?'): Conversacion {
  return reducirConversacion(
    reducirConversacion(conversacionNueva('¡Buenos días!'), { tipo: 'nombre', nombre: 'Ana' }),
    { tipo: 'preguntar', idPregunta: 'p1', idRespuesta: 'r1', texto },
  )
}

function aplicar(conversacion: Conversacion, ...eventos: EventoChat[]): Conversacion {
  return eventos.reduce<Conversacion>(
    (c, evento) => reducirConversacion(c, { tipo: 'evento', idRespuesta: 'r1', evento }),
    conversacion,
  )
}

const respuesta = (c: Conversacion): RespuestaAsistente => c.entradas.at(-1) as RespuestaAsistente

describe('reductor de la conversación', () => {
  it('empieza pidiendo el nombre y pasa al chat al responderlo (sanitizado)', () => {
    const inicial = conversacionNueva('¡Buenas tardes!')
    expect(inicial).toMatchObject({ etapa: 'nombre', nombre: null, entradas: [] })
    expect(reducirConversacion(inicial, { tipo: 'nombre', nombre: '  ana   lucía 99 ' })).toMatchObject({
      etapa: 'chat',
      nombre: 'ana lucía',
    })
    expect(reducirConversacion(inicial, { tipo: 'nombre', nombre: null })).toMatchObject({ etapa: 'chat', nombre: null })
  })

  it('una pregunta agrega el mensaje de la persona y una respuesta en espera', () => {
    const c = conPregunta()
    expect(c.entradas).toEqual([
      { tipo: 'usuario', id: 'p1', texto: '¿Cuál fue la deserción en 2023?' },
      expect.objectContaining({ tipo: 'asistente', id: 'r1', idPregunta: 'p1', estado: 'esperando', texto: '' }),
    ])
  })

  it('acumula búsquedas, texto, citas (con su marca) y documentos, y termina con fin', () => {
    const c = aplicar(
      conPregunta(),
      { tipo: 'inicio', modo: 'ia' },
      { tipo: 'busqueda', herramienta: 'buscar', descripcion: 'deserción 2023' },
      { tipo: 'texto', delta: 'La deserción fue del **9,8 %**' },
      cita(1),
      { tipo: 'texto', delta: ' y bajó en 2024.' },
      cita(2, DOCUMENTO_EN),
      { tipo: 'documentos', titulo: 'Documentos relacionados', documentos: [DOCUMENTO_ENCONTRADO] },
    )
    const r = respuesta(c)
    expect(r.estado).toBe('escribiendo')
    expect(r.modo).toBe('ia')
    expect(r.busquedas).toEqual([{ herramienta: 'buscar', descripcion: 'deserción 2023', posicion: 0 }])
    expect(r.texto).toBe('La deserción fue del **9,8 %**⟦1⟧ y bajó en 2024.⟦2⟧')
    expect(r.fuentes.map((f) => [f.indice, f.documento.id])).toEqual([
      [1, DOCUMENTO.id],
      [2, DOCUMENTO_EN.id],
    ])
    expect(r.documentos).toHaveLength(1)

    expect(respuesta(aplicar(c, { tipo: 'fin', motivo: 'completo' })).estado).toBe('completa')
    expect(respuesta(aplicar(c, { tipo: 'fin', motivo: 'limite_tokens' })).estado).toBe('cortada')
    expect(respuesta(aplicar(c, { tipo: 'fin', motivo: 'rechazo' })).estado).toBe('rechazada')
  })

  it('un rechazo a mitad del flujo descarta lo que ya había llegado (texto y fuentes)', () => {
    const c = aplicar(
      conPregunta(),
      { tipo: 'busqueda', herramienta: 'buscar', descripcion: 'x' },
      { tipo: 'texto', delta: 'Respuesta parcial' },
      cita(1),
      { tipo: 'texto', delta: '\n\nLo siento, no puedo ayudarte con esa solicitud.' },
      { tipo: 'fin', motivo: 'rechazo' },
    )
    expect(respuesta(c)).toMatchObject({ estado: 'rechazada', texto: '', fuentes: [] })
    // Lo que consultó se conserva (no es salida del modelo).
    expect(respuesta(c).busquedas).toHaveLength(1)
  })

  it('una búsqueda deja la respuesta en "buscando" mientras no hay texto', () => {
    const c = aplicar(conPregunta(), { tipo: 'busqueda', herramienta: 'leer', descripcion: 'Boletín 29' })
    expect(respuesta(c).estado).toBe('buscando')
  })

  it('pasoActual: solo el último paso, mientras no llegue texto después de él', () => {
    const buscar: EventoChat = { tipo: 'busqueda', herramienta: 'buscar', descripcion: 'Buscando “deserción”' }
    const leer: EventoChat = { tipo: 'busqueda', herramienta: 'leer', descripcion: 'Leyendo “Boletín 29”' }

    // Antes de consultar nada: preparando la respuesta.
    expect(pasoActual(respuesta(conPregunta()))).toEqual({ numero: 0, busqueda: null })

    // Cada paso reemplaza al anterior.
    let c = aplicar(conPregunta(), buscar)
    expect(pasoActual(respuesta(c))).toMatchObject({ numero: 1, busqueda: { herramienta: 'buscar' } })
    c = aplicar(c, leer)
    expect(pasoActual(respuesta(c))).toMatchObject({ numero: 2, busqueda: { herramienta: 'leer' } })

    // Mientras escribe no hay paso; si vuelve a consultar, el paso aparece de nuevo (después del texto).
    c = aplicar(c, { tipo: 'texto', delta: 'La deserción' }, cita(1))
    expect(pasoActual(respuesta(c))).toBeNull()
    c = aplicar(c, buscar)
    expect(pasoActual(respuesta(c))).toMatchObject({ numero: 3, busqueda: { posicion: respuesta(c).texto.length } })
    c = aplicar(c, { tipo: 'texto', delta: ' bajó.' })
    expect(pasoActual(respuesta(c))).toBeNull()

    // Terminada: nada en vivo.
    expect(pasoActual(respuesta(aplicar(conPregunta(), buscar, { tipo: 'fin', motivo: 'completo' })))).toBeNull()
  })

  it('reutiliza la fuente cuando el servidor repite el índice y no duplica una marca seguida', () => {
    const c = aplicar(conPregunta(), { tipo: 'texto', delta: 'Uno' }, cita(1), cita(1), { tipo: 'texto', delta: ' dos' }, cita(1))
    const r = respuesta(c)
    expect(r.fuentes).toHaveLength(1)
    expect(r.texto).toBe('Uno⟦1⟧ dos⟦1⟧')
  })

  it('un evento error guarda el código y usa un mensaje por defecto si viene vacío', () => {
    const c = aplicar(conPregunta(), { tipo: 'texto', delta: 'Parcial' }, { tipo: 'error', codigo: 'sobrecarga', mensaje: '' })
    expect(respuesta(c)).toMatchObject({
      estado: 'error',
      texto: 'Parcial',
      error: { codigo: 'sobrecarga', mensaje: expect.stringMatching(/muchas consultas/) },
    })
  })

  it('una respuesta terminada ya no cambia con eventos, fallos ni detener', () => {
    const terminada = aplicar(conPregunta(), { tipo: 'texto', delta: 'Listo' }, { tipo: 'fin', motivo: 'completo' })
    const despues = [
      { tipo: 'evento', idRespuesta: 'r1', evento: { tipo: 'texto', delta: 'tarde' } },
      { tipo: 'fallo', idRespuesta: 'r1', error: { codigo: 'interno', mensaje: 'x', reintentarDesde: null } },
      { tipo: 'detener', idRespuesta: 'r1' },
    ] satisfies Accion[]
    for (const accion of despues) expect(reducirConversacion(terminada, accion)).toBe(terminada)
  })

  it('detener conserva el texto parcial', () => {
    const c = reducirConversacion(aplicar(conPregunta(), { tipo: 'texto', delta: 'Medio' }), {
      tipo: 'detener',
      idRespuesta: 'r1',
    })
    expect(respuesta(c)).toMatchObject({ estado: 'detenida', texto: 'Medio' })
  })

  it('un reintento reemplaza la pregunta y la respuesta fallidas', () => {
    const fallida = reducirConversacion(conPregunta('Hola'), {
      tipo: 'fallo',
      idRespuesta: 'r1',
      error: { codigo: 'interno', mensaje: 'x', reintentarDesde: null },
    })
    const c = reducirConversacion(fallida, { tipo: 'preguntar', idPregunta: 'p2', idRespuesta: 'r2', texto: 'Hola', reemplaza: 'r1' })
    expect(c.entradas.map((e) => e.id)).toEqual(['p2', 'r2'])
  })

  it('reiniciar vuelve a pedir el nombre', () => {
    const c = reducirConversacion(conPregunta(), { tipo: 'reiniciar', saludo: '¡Buenas noches!' })
    expect(c).toEqual(conversacionNueva('¡Buenas noches!'))
  })
})

describe('construirHistorial', () => {
  const par = (n: number, textoRespuesta = `Respuesta ${n}⟦1⟧`): Entrada[] => [
    { tipo: 'usuario', id: `p${n}`, texto: `Pregunta ${n}` },
    {
      tipo: 'asistente',
      id: `r${n}`,
      idPregunta: `p${n}`,
      estado: 'completa',
      modo: 'ia',
      texto: textoRespuesta,
      fuentes: [],
      busquedas: [],
      documentos: [],
      error: null,
    },
  ]

  it('manda los pares anteriores sin marcas de cita y la pregunta nueva al final', () => {
    expect(construirHistorial([...par(1), ...par(2)], 'Nueva')).toEqual([
      { rol: 'usuario', texto: 'Pregunta 1' },
      { rol: 'asistente', texto: 'Respuesta 1' },
      { rol: 'usuario', texto: 'Pregunta 2' },
      { rol: 'asistente', texto: 'Respuesta 2' },
      { rol: 'usuario', texto: 'Nueva' },
    ])
  })

  it('omite las preguntas sin respuesta útil para que los roles se alternen', () => {
    expect(construirHistorial([...par(1, ''), ...par(2, '⟦1⟧ ')], 'Nueva')).toEqual([{ rol: 'usuario', texto: 'Nueva' }])
  })

  it('respeta LIMITES_CHAT: máximo de mensajes (descarta los más antiguos) y de caracteres', () => {
    const muchos = Array.from({ length: 15 }, (_, i) => par(i + 1)).flat()
    const historial = construirHistorial(muchos, 'Nueva')
    expect(historial.length).toBeLessThanOrEqual(LIMITES_CHAT.maxMensajes)
    expect(historial[0]).toEqual({ rol: 'usuario', texto: 'Pregunta 7' })
    expect(historial.at(-1)).toEqual({ rol: 'usuario', texto: 'Nueva' })

    const largo = construirHistorial(par(1, 'x'.repeat(20_000)), 'y'.repeat(3000))
    expect(largo[1].texto).toHaveLength(LIMITES_CHAT.maxCaracteresAsistente)
    expect(largo[2].texto).toHaveLength(LIMITES_CHAT.maxCaracteresUsuario)
  })

  it('no reenvía una pregunta rechazada ni lo que alcanzó a escribirse antes del rechazo', () => {
    // Por el reductor: la respuesta rechazada queda sin texto.
    const rechazada = aplicar(conPregunta('¿Cómo hackeo el sitio?'), { tipo: 'texto', delta: 'Parcial' }, { tipo: 'fin', motivo: 'rechazo' })
    expect(construirHistorial(rechazada.entradas, 'Nueva')).toEqual([{ rol: 'usuario', texto: 'Nueva' }])

    // Aunque una entrada rechazada conserve texto (guardada por una versión anterior).
    const conTexto = par(2, 'Parcial\n\nLo siento, no puedo ayudarte.')
    ;(conTexto[1] as RespuestaAsistente).estado = 'rechazada'
    expect(construirHistorial([...par(1), ...conTexto, ...par(3)], 'Nueva')).toEqual([
      { rol: 'usuario', texto: 'Pregunta 1' },
      { rol: 'asistente', texto: 'Respuesta 1' },
      { rol: 'usuario', texto: 'Pregunta 3' },
      { rol: 'asistente', texto: 'Respuesta 3' },
      { rol: 'usuario', texto: 'Nueva' },
    ])
  })

  it('nunca incluye el nombre de la persona (la bienvenida no es parte de las entradas)', () => {
    const c = reducirConversacion(conversacionNueva('¡Hola!'), { tipo: 'nombre', nombre: 'Ana Lucía' })
    expect(JSON.stringify(construirHistorial(c.entradas, 'Pregunta'))).not.toContain('Ana')
  })
})

describe('textos auxiliares', () => {
  it('quitarMarcas y textoPlano limpian las marcas y la sintaxis Markdown', () => {
    expect(quitarMarcas('Uno⟦1⟧ dos⟦12⟧.')).toBe('Uno dos.')
    expect(textoPlano('## Título\n\n- **Uno**⟦1⟧ con [enlace](https://x.co)\n- `dos`\n\n| a | b |\n|---|---|\n| 1 | 2 |')).toBe(
      'Título Uno con enlace dos a b 1 2',
    )
  })

  it('sanitizarNombre deja solo letras y signos de nombre, con un máximo de 40 caracteres', () => {
    expect(sanitizarNombre('  María José  ')).toBe('María José')
    expect(sanitizarNombre("O'Neil-Pérez")).toBe("O'Neil-Pérez")
    expect(sanitizarNombre('<script>alert(1)</script>')).toBe('script alert script')
    expect(sanitizarNombre('Juan_Pablo\n\tEscobar')).toBe('Juan Pablo Escobar')
    expect(sanitizarNombre('12345 !!!')).toBe('')
    expect(sanitizarNombre('😀')).toBe('')
    expect(Array.from(sanitizarNombre('a'.repeat(80)))).toHaveLength(40)
  })

  it('saludoPorHora según la hora local', () => {
    const a = (hora: number) => saludoPorHora(new Date(2026, 9, 8, hora, 30))
    expect([a(4), a(5), a(11), a(12), a(18), a(19), a(23)]).toEqual([
      '¡Buenas noches!',
      '¡Buenos días!',
      '¡Buenos días!',
      '¡Buenas tardes!',
      '¡Buenas tardes!',
      '¡Buenas noches!',
      '¡Buenas noches!',
    ])
  })
})

describe('guardado en sessionStorage', () => {
  it('guarda y recupera la conversación; una respuesta que estaba llegando queda detenida', () => {
    sessionStorage.clear()
    const c = aplicar(conPregunta(), { tipo: 'texto', delta: 'A medias' })
    guardarConversacion(c, sessionStorage)
    const cargada = cargarConversacion(sessionStorage)
    expect(cargada).toMatchObject({ etapa: 'chat', nombre: 'Ana', saludo: '¡Buenos días!' })
    expect(respuesta(cargada!)).toMatchObject({ estado: 'detenida', texto: 'A medias' })
  })

  it('una respuesta rechazada guardada con texto parcial (versión anterior) se carga sin él', () => {
    sessionStorage.clear()
    const c = aplicar(conPregunta(), { tipo: 'texto', delta: 'Parcial' }, cita(1))
    const r = respuesta(c)
    const vieja: Conversacion = { ...c, entradas: [c.entradas[0], { ...r, estado: 'rechazada' }] }
    guardarConversacion(vieja, sessionStorage)
    expect(respuesta(cargarConversacion(sessionStorage)!)).toMatchObject({ estado: 'rechazada', texto: '', fuentes: [] })
    sessionStorage.clear()
  })

  it('ignora datos corruptos o de otra versión', () => {
    sessionStorage.setItem(CLAVE_ALMACEN, '{roto')
    expect(cargarConversacion(sessionStorage)).toBeNull()
    sessionStorage.setItem(CLAVE_ALMACEN, JSON.stringify({ version: 2, saludo: 'x', etapa: 'chat', entradas: [] }))
    expect(cargarConversacion(sessionStorage)).toBeNull()
    sessionStorage.setItem(
      CLAVE_ALMACEN,
      JSON.stringify({ version: 1, saludo: 'x', etapa: 'chat', nombre: '<b>Ana</b>', entradas: [{ tipo: 'otro' }, null] }),
    )
    expect(cargarConversacion(sessionStorage)).toEqual({ version: 1, saludo: 'x', etapa: 'chat', nombre: 'b Ana b', entradas: [] })
    sessionStorage.clear()
  })

  it('no falla si el almacenamiento no está disponible', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('cuota')
      },
    } as unknown as Storage
    expect(() => guardarConversacion(conPregunta(), roto)).not.toThrow()
    expect(cargarConversacion(roto)).toBeNull()
  })
})

describe('suavizarMarkdownParcial', () => {
  it('oculta los restos de Markdown sin cerrar al final del texto que llega', () => {
    expect(suavizarMarkdownParcial('Factores:\n\n- **Económicos**.\n- **')).toBe('Factores:\n\n- **Económicos**.')
    expect(suavizarMarkdownParcial('Texto con **neg')).toBe('Texto con **neg')
    expect(suavizarMarkdownParcial('Uno\n\n## ')).toBe('Uno')
    expect(suavizarMarkdownParcial('Uno\n2. ')).toBe('Uno')
    expect(suavizarMarkdownParcial('Fin del texto.')).toBe('Fin del texto.')
  })
})
