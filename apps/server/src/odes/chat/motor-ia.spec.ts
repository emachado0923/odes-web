import { describe, expect, it } from 'vitest';
import { clienteSimulado, configuracionPrueba, RepositorioEnMemoria, textoConCitas } from '../../../test/odes-apoyo.js';
import {
  citaA,
  type CuerpoSolicitud,
  eventosMensaje,
  type Guion,
  guionPorDefecto,
  resultadosEnSolicitud,
  usoParaSolicitud,
} from '../cli/simulador-claude.js';
import type { ConfiguracionOdes } from '../configuracion-odes.js';
import type { DocumentoRepositorio } from '../repositorio/repositorio.tipos.js';
import { MAX_HERRAMIENTAS_POR_RONDA } from './herramientas.js';
import {
  AVISO_ULTIMA_RONDA,
  BETA_FALLBACKS,
  MAX_CARACTERES_RESULTADOS_PREGUNTA,
  MotorIa,
  TEXTO_DEMASIADAS_HERRAMIENTAS,
  TEXTO_PRESUPUESTO_AGOTADO,
} from './motor-ia.js';
import { FuenteContextoModelo } from './prompt-sistema.js';
import type { EventoChat, MensajeChat } from './protocolo.js';

const PREGUNTA: MensajeChat[] = [{ rol: 'usuario', texto: '¿Cuál fue la tasa de tránsito inmediato en 2024?' }];

function crearMotor(
  guion?: Guion,
  cambios: Partial<ConfiguracionOdes> = {},
  pausaMs = 0,
  repositorio = new RepositorioEnMemoria(),
) {
  const { cliente, simulado } = clienteSimulado(guion, pausaMs);
  const errores: string[] = [];
  const motor = new MotorIa({
    cliente,
    config: configuracionPrueba(cambios),
    repositorio,
    contexto: new FuenteContextoModelo(repositorio),
    registrarError: (mensaje) => errores.push(mensaje),
  });
  return { motor, simulado, repositorio, errores };
}

async function responder(motor: MotorIa, mensajes: MensajeChat[] = PREGUNTA, senal = new AbortController().signal) {
  const eventos: EventoChat[] = [];
  const resumen = await motor.responder(mensajes, (evento) => eventos.push(evento), senal, 'usuario-prueba');
  return { eventos, resumen };
}

/** Guion: primero una búsqueda; luego un texto que cita el resultado 0 dos veces y el 1. */
const guionConCitas: Guion = (cuerpo, numero, estado) => {
  const modelo = cuerpo.model ?? 'x';
  if (numero === 1) {
    return {
      tipo: 'flujo',
      eventos: eventosMensaje(
        modelo,
        [{ tipo: 'pensamiento' }, { tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 'tránsito expectativas' }, id: 'toolu_1' }],
        'tool_use',
        usoParaSolicitud(cuerpo, estado, 30),
      ),
    };
  }
  const [r0, r1] = resultadosEnSolicitud(cuerpo);
  if (!r0 || !r1) throw new Error('faltan resultados en la petición');
  return {
    tipo: 'flujo',
    eventos: eventosMensaje(
      modelo,
      [
        { tipo: 'pensamiento' },
        { tipo: 'texto', texto: 'La tasa fue del 41 % en 2024.', citas: [citaA(r0), citaA(r0, 0)] },
        { tipo: 'texto', texto: ' Además, ' },
        { tipo: 'texto', texto: 'el 78 % espera seguir estudiando.', citas: [citaA(r1)] },
        { tipo: 'texto', texto: ' Lo confirma el boletín.', citas: [citaA(r0)] },
      ],
      'end_turn',
      usoParaSolicitud(cuerpo, estado, 60),
    ),
  };
};

const guionTextoEntreRondas: Guion = (cuerpo, numero, estado) =>
  numero === 1
    ? {
        tipo: 'flujo',
        eventos: eventosMensaje(
          'm',
          [{ tipo: 'texto', texto: 'Voy a revisar.' }, { tipo: 'herramienta', nombre: 'listar_documentos', entrada: {} }],
          'tool_use',
          usoParaSolicitud(cuerpo, estado, 5),
        ),
      }
    : { tipo: 'flujo', eventos: eventosMensaje('m', [{ tipo: 'texto', texto: 'Hay 4 documentos.' }], 'end_turn', usoParaSolicitud(cuerpo, estado, 5)) };

const guionSiempreHerramienta: Guion = (cuerpo, _n, estado) =>
  cuerpo.tool_choice?.type === 'none'
    ? { tipo: 'flujo', eventos: eventosMensaje('m', [{ tipo: 'texto', texto: 'Con lo encontrado: nada concluyente.' }], 'end_turn', usoParaSolicitud(cuerpo, estado, 5)) }
    : {
        tipo: 'flujo',
        eventos: eventosMensaje(
          'm',
          [{ tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 'deserción' } }],
          'tool_use',
          usoParaSolicitud(cuerpo, estado, 5),
        ),
      };

const guionEntradaInvalida: Guion = (cuerpo, numero, estado) =>
  numero === 1
    ? {
        tipo: 'flujo',
        eventos: eventosMensaje(
          'm',
          [{ tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 7, extra: true } }],
          'tool_use',
          usoParaSolicitud(cuerpo, estado, 5),
        ),
      }
    : { tipo: 'flujo', eventos: eventosMensaje('m', [{ tipo: 'texto', texto: 'Listo.' }], 'end_turn', usoParaSolicitud(cuerpo, estado, 5)) };

const guionRespaldo: Guion = (cuerpo, numero, estado) => {
  if (numero === 1) {
    return {
      tipo: 'flujo',
      eventos: eventosMensaje(
        'claude-opus-5-5',
        [
          { tipo: 'pensamiento' },
          { tipo: 'texto', texto: 'Parcial. ' },
          { tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 'antes' }, id: 'toolu_antes' },
          { tipo: 'respaldo', de: 'claude-opus-5-5', a: 'claude-opus-5' },
          { tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 'después' }, id: 'toolu_despues' },
        ],
        'tool_use',
        usoParaSolicitud(cuerpo, estado, 5),
      ),
    };
  }
  return { tipo: 'flujo', eventos: eventosMensaje('claude-opus-5', [{ tipo: 'texto', texto: 'Fin.' }], 'end_turn', usoParaSolicitud(cuerpo, estado, 5)) };
};

const guionHerramientaTruncada: Guion = (cuerpo, _n, estado) => ({
  tipo: 'flujo',
  eventos: eventosMensaje('m', [{ tipo: 'herramienta', nombre: 'buscar_documentos', entrada: { consulta: 'tru' } }], 'max_tokens', usoParaSolicitud(cuerpo, estado, 5)),
});

const bloqueResultado = (source: string) => ({ type: 'search_result', source, title: source, content: [{ type: 'text', text: 'x' }] });

describe('MotorIa: forma de la petición', () => {
  it('usa el modelo, el esfuerzo, el beta de respaldo, herramientas estrictas y caché', async () => {
    const { motor, simulado } = crearMotor();
    await responder(motor);
    expect(simulado.solicitudes.length).toBe(2);
    const [primera] = simulado.solicitudes;
    const cuerpo = primera!.cuerpo;
    expect(cuerpo.model).toBe('claude-opus-5-5');
    expect(cuerpo.max_tokens).toBe(16000);
    expect(cuerpo.stream).toBe(true);
    expect(cuerpo.output_config).toEqual({ effort: 'medium' });
    // Opus 5.5: pensamiento adaptativo siempre activo; nunca disabled ni budget_tokens.
    expect(cuerpo).not.toHaveProperty('thinking');
    expect(cuerpo).not.toHaveProperty('temperature');
    expect(cuerpo.fallbacks).toBe('default');
    expect(primera!.cabeceras['anthropic-beta']).toBe(BETA_FALLBACKS);
    // Primera ronda: tool_choice auto por omisión (forzar herramientas da 400 en Opus 5.5).
    expect(cuerpo).not.toHaveProperty('tool_choice');
    expect(cuerpo.cache_control).toEqual({ type: 'ephemeral' });
    expect(cuerpo.system).toEqual([
      expect.objectContaining({ type: 'text', cache_control: { type: 'ephemeral' } }),
    ]);
    expect(cuerpo.metadata).toEqual({ user_id: 'usuario-prueba' });
    const herramientas = cuerpo.tools ?? [];
    expect(herramientas.map((h) => h.name)).toEqual(['buscar_documentos', 'listar_documentos', 'leer_documento']);
    for (const herramienta of herramientas) {
      expect(herramienta.strict).toBe(true);
      expect(herramienta.eager_input_streaming).toBe(true);
      expect((herramienta.input_schema as { additionalProperties: unknown }).additionalProperties).toBe(false);
    }
    // El modo estricto no admite restricciones numéricas ni de longitud.
    expect(JSON.stringify(herramientas)).not.toMatch(/"(minimum|maximum|minLength|maxLength|maxItems)"/);
  });

  it('mantiene herramientas y sistema idénticos entre peticiones (prefijo de caché estable)', async () => {
    const { motor, simulado } = crearMotor();
    await responder(motor);
    await responder(motor, [
      { rol: 'usuario', texto: 'Hola' },
      { rol: 'asistente', texto: 'Hola, ¿en qué te ayudo?' },
      { rol: 'usuario', texto: '¿Y la deserción?' },
    ]);
    const prefijos = simulado.solicitudes.map((s) => JSON.stringify([s.cuerpo.tools, s.cuerpo.system]));
    expect(new Set(prefijos).size).toBe(1);
    // Orden de render tools -> system -> messages: el sistema no lleva nada variable.
    expect(JSON.stringify(simulado.solicitudes[0]!.cuerpo.system)).not.toMatch(/2026-|usuario-prueba/);
  });

  it('reenvía el historial solo como texto y, dentro de la petición, el contenido del asistente sin cambios', async () => {
    const { motor, simulado } = crearMotor();
    const historial: MensajeChat[] = [
      { rol: 'usuario', texto: 'Hola' },
      { rol: 'asistente', texto: 'Hola. Pregúntame por el Observatorio.' },
      { rol: 'usuario', texto: '¿Qué dice el boletín 29 sobre tránsito inmediato?' },
    ];
    await responder(motor, historial);
    const [primera, segunda] = simulado.solicitudes;
    expect(primera!.cuerpo.messages).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola. Pregúntame por el Observatorio.' },
      { role: 'user', content: '¿Qué dice el boletín 29 sobre tránsito inmediato?' },
    ]);
    const mensajes = segunda!.cuerpo.messages ?? [];
    // Append-only: los tres mensajes de antes, idénticos, y luego la ronda de herramientas.
    expect(mensajes.slice(0, 3)).toEqual(primera!.cuerpo.messages);
    const asistente = mensajes[3]!.content as Array<Record<string, unknown>>;
    expect(asistente.map((b) => b.type)).toEqual(['thinking', 'tool_use']);
    expect(asistente[0]).toEqual({ type: 'thinking', thinking: '', signature: 'firma-simulada-0' });
    const usuario = mensajes[4]!.content as Array<Record<string, unknown>>;
    expect(usuario[0]).toMatchObject({ type: 'tool_result', tool_use_id: (asistente[1] as { id: string }).id });
    const contenido = usuario[0]!.content as Array<Record<string, unknown>>;
    expect(contenido.length).toBeGreaterThan(0);
    for (const bloque of contenido) {
      expect(bloque).toMatchObject({ type: 'search_result', citations: { enabled: true } });
      expect(String(bloque.source)).toMatch(/^https:\/\/ejemplo\.test\/.+#page=\d+$/);
    }
    expect(String((contenido[0]!.content as Array<{ text: string }>)[0]!.text)).toMatch(/^\[id: [a-z0-9-]+\]/);
  });

  it('con ODES_HERRAMIENTAS_ESTRICTAS=false envía las herramientas sin strict y con el mismo prefijo en cada petición', async () => {
    const { motor, simulado } = crearMotor(undefined, { herramientasEstrictas: false });
    await responder(motor);
    await responder(motor);
    const herramientas = simulado.solicitudes[0]!.cuerpo.tools ?? [];
    expect(herramientas).toHaveLength(3);
    for (const herramienta of herramientas) {
      expect(herramienta).not.toHaveProperty('strict');
      expect(herramienta.eager_input_streaming).toBe(true);
      expect((herramienta.input_schema as { additionalProperties: unknown }).additionalProperties).toBe(false);
    }
    const prefijos = simulado.solicitudes.map((s) => JSON.stringify([s.cuerpo.tools, s.cuerpo.system]));
    expect(new Set(prefijos).size).toBe(1);
  });

  it('un 400 que menciona strict deja en el registro la pista de ODES_HERRAMIENTAS_ESTRICTAS', async () => {
    const { motor, errores } = crearMotor(() => ({
      tipo: 'error',
      status: 400,
      tipoError: 'invalid_request_error',
      mensaje: 'citations are not supported with strict tool use',
    }));
    const { eventos } = await responder(motor);
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'error', codigo: 'interno' })]);
    expect(errores.join('\n')).toMatch(/api_400.*ODES_HERRAMIENTAS_ESTRICTAS=false/s);
  });

  it('sin respaldo configurado no envía el beta ni el parámetro fallbacks', async () => {
    const { motor, simulado } = crearMotor(undefined, { fallbacks: false, esfuerzo: 'low', modelo: 'claude-opus-5' });
    await responder(motor);
    const { cuerpo, cabeceras } = simulado.solicitudes[0]!;
    expect(cuerpo).not.toHaveProperty('fallbacks');
    expect(cabeceras['anthropic-beta']).toBeUndefined();
    expect(cuerpo.model).toBe('claude-opus-5');
    expect(cuerpo.output_config).toEqual({ effort: 'low' });
  });
});

describe('MotorIa: bucle de herramientas y citas', () => {
  it('emite busqueda, texto y citas con índices estables sin duplicados', async () => {
    const { motor } = crearMotor(guionConCitas);
    const { eventos, resumen } = await responder(motor);
    expect(eventos[0]).toEqual({ tipo: 'busqueda', herramienta: 'buscar', descripcion: 'Buscando “tránsito expectativas”' });
    const citas = eventos.filter((e): e is Extract<EventoChat, { tipo: 'cita' }> => e.tipo === 'cita');
    // r0 citado dos veces en el mismo bloque -> una sola cita; luego r1 -> 2; luego r0 otra vez -> 1.
    expect(citas.map((c) => c.indice)).toEqual([1, 2, 1]);
    expect(citas[0]).toMatchObject({
      documento: { id: 'boletin-29-resultados-preliminares-2024', categoria: 'Boletín', anio: '2024', tipo: 'pdf' },
      paginaInicio: 1,
      paginaFin: 1,
      url: 'https://ejemplo.test/boletin-29.pdf#page=1',
    });
    expect(citas[0]!.textoCitado).toContain('41 %');
    expect(citas[0]!.textoCitado).not.toContain('[id:');
    expect(textoConCitas(eventos)).toBe(
      'La tasa fue del 41 % en 2024.⟦1⟧ Además, el 78 % espera seguir estudiando.⟦2⟧ Lo confirma el boletín.⟦1⟧',
    );
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
    expect(resumen).toMatchObject({ resultado: 'completo', llamadas: 2, herramientas: 1, modeloServido: 'claude-opus-5-5' });
    expect(resumen.uso.salida).toBe(90);
  });

  it('el guion por defecto del simulador produce una respuesta citada de punta a punta', async () => {
    const { motor } = crearMotor(guionPorDefecto);
    const { eventos } = await responder(motor);
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['busqueda', 'texto', 'cita', 'fin']));
    expect(textoConCitas(eventos)).toMatch(/^Según los documentos del repositorio del Observatorio, «.+» trata este tema\.⟦1⟧/);
  });

  it('separa con un párrafo el texto de rondas distintas', async () => {
    const { motor } = crearMotor(guionTextoEntreRondas);
    const { eventos } = await responder(motor);
    expect(textoConCitas(eventos)).toBe('Voy a revisar.\n\nHay 4 documentos.');
    expect(eventos.find((e) => e.tipo === 'busqueda')).toEqual({ tipo: 'busqueda', herramienta: 'listar', descripcion: 'Consultando el catálogo' });
  });

  it('al agotar las rondas exige la respuesta con tool_choice none y un aviso', async () => {
    const { motor, simulado } = crearMotor(guionSiempreHerramienta, { maxRondasHerramientas: 2 });
    const { eventos, resumen } = await responder(motor);
    expect(simulado.solicitudes.length).toBe(3);
    expect(simulado.solicitudes.map((s) => s.cuerpo.tool_choice)).toEqual([undefined, undefined, { type: 'none' }]);
    // Las herramientas no cambian (cambiarlas invalidaría la caché y los bloques de pensamiento).
    expect(simulado.solicitudes[2]!.cuerpo.tools).toEqual(simulado.solicitudes[0]!.cuerpo.tools);
    const ultimoUsuario = simulado.solicitudes[2]!.cuerpo.messages!.at(-1)!.content as Array<Record<string, unknown>>;
    expect(ultimoUsuario.at(-1)).toEqual({ type: 'text', text: AVISO_ULTIMA_RONDA });
    expect(ultimoUsuario[0]).toMatchObject({ type: 'tool_result' });
    expect(eventos.filter((e) => e.tipo === 'busqueda').length).toBe(2);
    expect(resumen).toMatchObject({ resultado: 'completo', llamadas: 3, herramientas: 2 });
  });

  it('valida la entrada de la herramienta y responde is_error sin ejecutarla', async () => {
    const { motor, simulado, repositorio } = crearMotor(guionEntradaInvalida);
    const { eventos } = await responder(motor);
    expect(repositorio.llamadasBuscar).toEqual([]);
    expect(eventos.some((e) => e.tipo === 'busqueda')).toBe(false);
    const resultado = (simulado.solicitudes[1]!.cuerpo.messages!.at(-1)!.content as Array<Record<string, unknown>>)[0]!;
    expect(resultado.is_error).toBe(true);
    const texto = (resultado.content as Array<{ text: string }>)[0]!.text;
    expect(JSON.parse(texto)).toMatchObject({ INVALID_JSON: '{"consulta":7,"extra":true}' });
  });

  it('tras un respaldo a mitad de respuesta omite pensamiento y herramientas previos al bloque fallback', async () => {
    const { motor, simulado, repositorio } = crearMotor(guionRespaldo);
    const { resumen } = await responder(motor);
    expect(repositorio.llamadasBuscar.map((l) => l.consulta)).toEqual(['después']);
    const asistente = simulado.solicitudes[1]!.cuerpo.messages![1]!.content as Array<Record<string, unknown>>;
    expect(asistente.map((b) => b.type)).toEqual(['text', 'fallback', 'tool_use']);
    expect(asistente[2]).toMatchObject({ id: 'toolu_despues' });
    const resultados = simulado.solicitudes[1]!.cuerpo.messages![2]!.content as Array<Record<string, unknown>>;
    expect(resultados.map((r) => r.tool_use_id)).toEqual(['toolu_despues']);
    expect(resumen.respaldo).toBe(true);
    expect(resumen.modeloServido).toBe('claude-opus-5');
  });
});

describe('MotorIa: motivos de parada y errores', () => {
  it('rechazo: solo fin rechazo, sin un texto de rechazo propio (la interfaz descarta el parcial y pone el suyo)', async () => {
    const { motor } = crearMotor();
    const { eventos, resumen } = await responder(motor, [{ rol: 'usuario', texto: 'algo [simular:rechazo]' }]);
    // El parcial ya se había emitido antes de saber que era un rechazo.
    expect(textoConCitas(eventos)).toBe('Respuesta parcial antes del rechazo.');
    expect(eventos.filter((e) => e.tipo === 'fin')).toEqual([{ tipo: 'fin', motivo: 'rechazo' }]);
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'rechazo' });
    expect(JSON.stringify(eventos)).not.toMatch(/no puedo ayudarte/i);
    expect(resumen.resultado).toBe('rechazo');
  });

  it('max_tokens: fin limite_tokens', async () => {
    const { motor } = crearMotor();
    const { eventos } = await responder(motor, [{ rol: 'usuario', texto: 'tránsito inmediato [simular:max_tokens]' }]);
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'limite_tokens' });
  });

  it('max_tokens con una herramienta a medias no la ejecuta', async () => {
    const { motor, repositorio, simulado } = crearMotor(guionHerramientaTruncada);
    const { eventos } = await responder(motor);
    expect(repositorio.llamadasBuscar).toEqual([]);
    expect(simulado.solicitudes.length).toBe(1);
    expect(eventos).toEqual([{ tipo: 'fin', motivo: 'limite_tokens' }]);
  });

  it.each([
    [529, 'overloaded_error', 'sobrecarga'],
    [429, 'rate_limit_error', 'sobrecarga'],
    [401, 'authentication_error', 'no_disponible'],
    [403, 'permission_error', 'no_disponible'],
    [404, 'not_found_error', 'no_disponible'],
    [400, 'invalid_request_error', 'interno'],
    [500, 'api_error', 'interno'],
  ] as const)('HTTP %i (%s) -> error %s, sin detalles', async (status, tipoError, codigo) => {
    const { motor } = crearMotor(() => ({ tipo: 'error', status, tipoError, mensaje: 'detalle interno secreto' }));
    const { eventos, resumen } = await responder(motor);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'error', codigo });
    expect(JSON.stringify(eventos)).not.toContain('secreto');
    expect(resumen.resultado).toBe('error');
  });

  it('evento error a mitad del flujo (overloaded) -> sobrecarga', async () => {
    const { motor } = crearMotor();
    const { eventos } = await responder(motor, [{ rol: 'usuario', texto: 'tránsito [simular:error-flujo]' }]);
    expect(eventos.at(-1)).toMatchObject({ tipo: 'error', codigo: 'sobrecarga' });
  });

  it('si el cliente se desconecta, aborta el flujo del SDK y no emite nada más', async () => {
    const { motor, simulado } = crearMotor(guionPorDefecto, {}, 25);
    const control = new AbortController();
    const eventos: EventoChat[] = [];
    const promesa = motor.responder(
      PREGUNTA,
      (evento) => {
        eventos.push(evento);
        if (evento.tipo === 'busqueda') control.abort('cliente_desconectado');
      },
      control.signal,
      'u',
    );
    const resumen = await promesa;
    expect(resumen.resultado).toBe('cancelado');
    expect(eventos.map((e) => e.tipo)).toEqual(['busqueda']);
    // La segunda llamada (o se canceló a mitad, o ni siquiera empezó).
    expect(simulado.solicitudes.every((s) => s.completada || s.cancelada)).toBe(true);
    expect(simulado.solicitudes.length).toBeLessThanOrEqual(2);
    expect(simulado.solicitudes.slice(1).every((s) => s.cancelada)).toBe(true);
  });

  it('la caché simulada se lee en la segunda pregunta (mismo prefijo)', async () => {
    const { motor } = crearMotor();
    const primera = await responder(motor);
    const segunda = await responder(motor, [{ rol: 'usuario', texto: '¿Y la deserción en 2023?' }]);
    expect(primera.resumen.uso.cacheEscritura).toBeGreaterThan(0);
    expect(segunda.resumen.uso.cacheLectura).toBeGreaterThan(0);
    expect(segunda.resumen.uso.cacheEscritura).toBe(0);
  });

  it('usoPrimeraLlamada separa la caché entre preguntas de la que se lee dentro de la misma pregunta', async () => {
    const { motor } = crearMotor();
    const primera = await responder(motor);
    // Dentro de la primera pregunta la segunda llamada ya lee lo que escribió la
    // primera: el total no sirve para comprobar la caché entre peticiones.
    expect(primera.resumen.llamadas).toBe(2);
    expect(primera.resumen.uso.cacheLectura).toBeGreaterThan(0);
    expect(primera.resumen.usoPrimeraLlamada).toMatchObject({ cacheLectura: 0 });
    expect(primera.resumen.usoPrimeraLlamada!.cacheEscritura).toBeGreaterThan(0);
    const segunda = await responder(motor);
    expect(segunda.resumen.usoPrimeraLlamada!.cacheLectura).toBeGreaterThan(0);
  });
});

/** Guion: en cada ronda con herramientas pide `cantidad` leer_documento en paralelo; con tool_choice none responde. */
function guionParalelo(cantidad: number, id: string, paginas: [number, number] = [1, 10]): Guion {
  return (cuerpo, numero, estado) =>
    cuerpo.tool_choice?.type === 'none'
      ? { tipo: 'flujo', eventos: eventosMensaje('m', [{ tipo: 'texto', texto: 'Con lo leído.' }], 'end_turn', usoParaSolicitud(cuerpo, estado, 5)) }
      : {
          tipo: 'flujo',
          eventos: eventosMensaje(
            'm',
            Array.from({ length: cantidad }, (_, i) => ({
              tipo: 'herramienta' as const,
              nombre: 'leer_documento',
              entrada: { id, pagina_desde: paginas[0], pagina_hasta: paginas[1] },
              id: `toolu_${numero}_${i}`,
            })),
            'tool_use',
            usoParaSolicitud(cuerpo, estado, 5),
          ),
        };
}

type BloqueResultado = { type: string; tool_use_id: string; is_error?: boolean; content: Array<{ type: string; text?: string }> };

function resultadosDe(cuerpo: CuerpoSolicitud): BloqueResultado[] {
  const contenido = cuerpo.messages!.at(-1)!.content as Array<Record<string, unknown>>;
  return contenido.filter((bloque) => bloque.type === 'tool_result') as unknown as BloqueResultado[];
}

/** Un documento con muchas páginas largas: cada leer_documento llega al tope de 40 000 caracteres. */
function repositorioGrande(): RepositorioEnMemoria {
  const documento: DocumentoRepositorio = {
    id: 'informe-grande',
    titulo: 'Informe muy largo',
    categoria: 'Estudio',
    anio: '2024',
    claves: [],
    idioma: 'es',
    tipo: 'pdf',
    url: 'https://ejemplo.test/grande.pdf',
    textoIndexado: true,
    paginas: 40,
  };
  const parrafo = 'La matrícula en educación superior creció en Medellín durante el periodo analizado. '.repeat(8);
  const paginas = Array.from({ length: 40 }, (_, i) => ({
    documento: documento.id,
    pagina: i + 1,
    texto: Array.from({ length: 9 }, () => parrafo).join('\n\n'),
  }));
  return new RepositorioEnMemoria([documento], paginas);
}

describe('MotorIa: tope de herramientas y de texto consultado', () => {
  it(`ejecuta como mucho ${MAX_HERRAMIENTAS_POR_RONDA} herramientas por respuesta y responde las demás con is_error`, async () => {
    const { motor, simulado } = crearMotor(guionParalelo(40, 'boletin-29-resultados-preliminares-2024', [1, 3]), {
      maxRondasHerramientas: 2,
    });
    const { eventos, resumen } = await responder(motor);
    expect(simulado.solicitudes.length).toBe(3);
    const resultados = resultadosDe(simulado.solicitudes[1]!.cuerpo);
    // Un tool_result por cada tool_use, en el mismo orden.
    expect(resultados.map((r) => r.tool_use_id)).toEqual(Array.from({ length: 40 }, (_, i) => `toolu_1_${i}`));
    const ejecutados = resultados.filter((r) => !r.is_error);
    const rechazados = resultados.filter((r) => r.is_error);
    expect(ejecutados).toHaveLength(MAX_HERRAMIENTAS_POR_RONDA);
    expect(rechazados).toHaveLength(40 - MAX_HERRAMIENTAS_POR_RONDA);
    expect(rechazados.every((r) => r.content[0]?.text === TEXTO_DEMASIADAS_HERRAMIENTAS)).toBe(true);
    // Dos rondas de 40 pedidas: 4 + 4 ejecutadas.
    expect(eventos.filter((e) => e.tipo === 'busqueda')).toHaveLength(2 * MAX_HERRAMIENTAS_POR_RONDA);
    expect(resumen.herramientas).toBe(2 * MAX_HERRAMIENTAS_POR_RONDA);
    // El tope no cambia tool_choice (eso invalidaría la caché de la conversación):
    // solo la última ronda lleva none.
    expect(simulado.solicitudes.map((s) => s.cuerpo.tool_choice)).toEqual([undefined, undefined, { type: 'none' }]);
  });

  it('al agotar el presupuesto de texto de la pregunta no ejecuta más y exige la respuesta', async () => {
    const { motor, simulado } = crearMotor(guionParalelo(40, 'informe-grande'), {}, 0, repositorioGrande());
    const { resumen } = await responder(motor);
    const cuerpos = simulado.solicitudes.map((s) => s.cuerpo);
    // Ronda 1: 4 lecturas (< presupuesto). Ronda 2: la primera lo supera y las
    // demás no se ejecutan. La tercera llamada ya es la última.
    expect(cuerpos.map((c) => c.tool_choice)).toEqual([undefined, undefined, { type: 'none' }]);
    expect(resumen.herramientas).toBe(MAX_HERRAMIENTAS_POR_RONDA + 1);
    const ronda2 = resultadosDe(cuerpos[2]!);
    expect(ronda2.filter((r) => !r.is_error)).toHaveLength(1);
    expect(ronda2.slice(1, MAX_HERRAMIENTAS_POR_RONDA).every((r) => r.content[0]?.text === TEXTO_PRESUPUESTO_AGOTADO)).toBe(true);
    const ultimoUsuario = cuerpos[2]!.messages!.at(-1)!.content as Array<Record<string, unknown>>;
    expect(ultimoUsuario.at(-1)).toEqual({ type: 'text', text: AVISO_ULTIMA_RONDA });
    // Lo reenviado queda acotado: el presupuesto más un resultado (40 000).
    const caracteres = JSON.stringify(cuerpos[2]!.messages).length;
    expect(caracteres).toBeLessThan(MAX_CARACTERES_RESULTADOS_PREGUNTA + 40_000 + 60_000);
    expect(resumen.resultado).toBe('completo');
  });
});

describe('simulador: resultadosEnSolicitud', () => {
  it('cuenta los search_result en orden a través de mensajes y tool_result', () => {
    const cuerpo: CuerpoSolicitud = {
      messages: [
        { role: 'user', content: [bloqueResultado('a'), { type: 'text', text: 'pregunta' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'n', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [bloqueResultado('b'), bloqueResultado('c')] }] },
      ],
    };
    expect(resultadosEnSolicitud(cuerpo).map((r) => [r.indice, r.source, r.enUltimoMensaje])).toEqual([
      [0, 'a', false],
      [1, 'b', true],
      [2, 'c', true],
    ]);
  });
});
