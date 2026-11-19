import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EventoChat } from '../src/odes/chat/protocolo.js';
import { iniciarSimuladorClaude, type SimuladorClaude } from '../src/odes/cli/simulador-claude.js';
import { cargarConfiguracionOdes } from '../src/odes/configuracion-odes.js';
import { type AppOdes, crearAppOdes, leerEventosSse, RepositorioEnMemoria, textoConCitas } from './odes-apoyo.js';

/**
 * De punta a punta SIN clave de API: el servidor real (AppModule +
 * configurarAplicacion) crea su cliente del SDK de Anthropic a partir de
 * ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY, que apuntan al simulador HTTP
 * local (src/odes/cli/simulador-claude.ts).
 */

let simulador: SimuladorClaude;
let abierta: AppOdes | null = null;

beforeAll(async () => {
  simulador = await iniciarSimuladorClaude({ puerto: 0 });
});
afterAll(async () => {
  await simulador.cerrar();
});
afterEach(async () => {
  await abierta?.cerrar();
  abierta = null;
  simulador.solicitudes.length = 0;
});

async function servidorIa(): Promise<Server> {
  abierta = await crearAppOdes({
    // Igual que en producción: la configuración sale de variables de entorno.
    config: cargarConfiguracionOdes({ ANTHROPIC_API_KEY: 'simulado', ANTHROPIC_BASE_URL: simulador.url }),
    repositorio: new RepositorioEnMemoria(),
  });
  return abierta.app.getHttpServer() as Server;
}

async function chat(servidor: Server, mensajes: Array<{ rol: string; texto: string }>): Promise<EventoChat[]> {
  const res = await request(servidor).post('/api/odes/chat').send({ mensajes }).expect(200);
  expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
  return leerEventosSse(res.text);
}

describe('Asistente ODES con el simulador de Claude (SDK real)', () => {
  it('pregunta -> búsqueda -> respuesta citada', async () => {
    const servidor = await servidorIa();
    await request(servidor).get('/api/odes/estado').expect(200).expect((res) => expect(res.body.modo).toBe('ia'));
    const eventos = await chat(servidor, [{ rol: 'usuario', texto: '¿Qué dice el boletín sobre el tránsito inmediato y las expectativas?' }]);
    expect(eventos[0]).toEqual({ tipo: 'inicio', modo: 'ia' });
    expect(eventos[1]).toEqual({ tipo: 'busqueda', herramienta: 'buscar', descripcion: 'Buscando “boletín tránsito inmediato expectativas”' });
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
    expect(textoConCitas(eventos)).toMatch(
      /^Según los documentos del repositorio del Observatorio, «.+» trata este tema\.⟦1⟧\n\nTambién hay información relacionada en «.+»\.⟦2⟧⟦1⟧$/,
    );
    const citas = eventos.filter((e): e is Extract<EventoChat, { tipo: 'cita' }> => e.tipo === 'cita');
    expect(citas[0]!.url).toMatch(/^https:\/\/ejemplo\.test\/boletin-29\.pdf#page=\d$/);
    expect(citas[0]!.documento.id).toBe('boletin-29-resultados-preliminares-2024');

    // Lo que recibió "la API": dos llamadas por streaming, con el formato correcto.
    expect(simulador.solicitudes).toHaveLength(2);
    const [primera, segunda] = simulador.solicitudes;
    expect(primera!.cabeceras['x-api-key']).toBe('simulado');
    expect(primera!.cabeceras['anthropic-version']).toBe('2023-06-01');
    expect(primera!.cabeceras['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(primera!.cuerpo).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      stream: true,
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
    });
    expect(primera!.cuerpo).not.toHaveProperty('thinking');
    const resultado = (segunda!.cuerpo.messages!.at(-1)!.content as Array<{ type: string; content: Array<{ type: string }> }>)[0]!;
    expect(resultado.type).toBe('tool_result');
    expect(resultado.content.every((b) => b.type === 'search_result')).toBe(true);
  });

  it('segunda pregunta: historial solo texto y el mismo prefijo (herramientas + sistema)', async () => {
    const servidor = await servidorIa();
    const primera = await chat(servidor, [{ rol: 'usuario', texto: 'deserción en educación superior' }]);
    const respuesta = textoConCitas(primera);
    await chat(servidor, [
      { rol: 'usuario', texto: 'deserción en educación superior' },
      { rol: 'asistente', texto: respuesta },
      { rol: 'usuario', texto: '¿Y los factores asociados?' },
    ]);
    expect(simulador.solicitudes).toHaveLength(4);
    const tercera = simulador.solicitudes[2]!.cuerpo;
    expect(tercera.messages).toEqual([
      { role: 'user', content: 'deserción en educación superior' },
      // Las marcas ⟦n⟧ se quitan y no se reenvían bloques de pensamiento ni herramientas.
      { role: 'assistant', content: respuesta.replace(/⟦\d+⟧/g, '') },
      { role: 'user', content: '¿Y los factores asociados?' },
    ]);
    const prefijos = simulador.solicitudes.map((s) => JSON.stringify([s.cuerpo.tools, s.cuerpo.system]));
    expect(new Set(prefijos).size).toBe(1);
  });

  it('529 de la API -> evento error "sobrecarga" sin detalles', async () => {
    const servidor = await servidorIa();
    const eventos = await chat(servidor, [{ rol: 'usuario', texto: 'hola [simular:sobrecarga]' }]);
    expect(eventos).toEqual([
      { tipo: 'inicio', modo: 'ia' },
      { tipo: 'error', codigo: 'sobrecarga', mensaje: expect.any(String) },
    ]);
  });

  it('rechazo del modelo -> fin "rechazo" sin un segundo mensaje de rechazo (lo pone la interfaz)', async () => {
    const servidor = await servidorIa();
    const eventos = await chat(servidor, [{ rol: 'usuario', texto: 'algo [simular:rechazo]' }]);
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'rechazo' });
    expect(textoConCitas(eventos)).not.toMatch(/no puedo ayudarte/i);
  });

  it('respaldo (fallback) a mitad de la respuesta: el texto sigue y termina completo', async () => {
    const servidor = await servidorIa();
    const eventos = await chat(servidor, [{ rol: 'usuario', texto: 'tránsito inmediato [simular:respaldo]' }]);
    expect(textoConCitas(eventos)).toMatch(/^Inicio antes del respaldo\. Según los documentos/);
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
  });

  it('el cliente se desconecta -> la conexión con la API se cierra', async () => {
    const servidor = await servidorIa();
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const { port } = servidor.address() as AddressInfo;
    const control = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/odes/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: 'tránsito inmediato [simular:lento]' }] }),
      signal: control.signal,
    });
    const lector = res.body!.getReader();
    const primero = new TextDecoder().decode((await lector.read()).value);
    expect(primero).toContain('"tipo":"inicio"');
    control.abort();
    await vi.waitFor(
      () => {
        expect(simulador.solicitudes[0]?.cancelada).toBe(true);
      },
      { timeout: 5000, interval: 25 },
    );
    expect(simulador.solicitudes).toHaveLength(1);
  });
});

describe('Asistente ODES sin clave de API (modo búsqueda)', () => {
  it('acepta una conversación al máximo del protocolo (más de 100 kB de JSON)', async () => {
    abierta = await crearAppOdes({ config: cargarConfiguracionOdes({}), repositorio: new RepositorioEnMemoria() });
    const servidor = abierta.app.getHttpServer() as Server;
    const mensajes: Array<{ rol: string; texto: string }> = [];
    for (let i = 0; i < 9; i++) {
      mensajes.push({ rol: 'usuario', texto: 'á'.repeat(2000) }, { rol: 'asistente', texto: 'educación '.repeat(1200) });
    }
    mensajes.push({ rol: 'usuario', texto: 'deserción' });
    expect(Buffer.byteLength(JSON.stringify({ mensajes }))).toBeGreaterThan(150_000);
    const eventos = await chat(servidor, mensajes);
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
  });

  it('lista documentos sin llamar a la API', async () => {
    abierta = await crearAppOdes({ config: cargarConfiguracionOdes({}), repositorio: new RepositorioEnMemoria() });
    const servidor = abierta.app.getHttpServer() as Server;
    await request(servidor).get('/api/odes/estado').expect(200).expect((res) => expect(res.body.modo).toBe('busqueda'));
    const eventos = await chat(servidor, [{ rol: 'usuario', texto: 'deserción' }]);
    expect(eventos.map((e) => e.tipo)).toEqual(['inicio', 'texto', 'documentos', 'fin']);
    expect(simulador.solicitudes).toHaveLength(0);
  });
});
