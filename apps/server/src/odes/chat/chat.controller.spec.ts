import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AppOdes,
  clienteSimulado,
  configuracionPrueba,
  crearAppOdes,
  leerEventosSse,
  RepositorioEnMemoria,
  textoConCitas,
} from '../../../test/odes-apoyo.js';
import type { ConfiguracionOdes } from '../configuracion-odes.js';
import type { EventoChat } from './protocolo.js';

const PREGUNTA = { mensajes: [{ rol: 'usuario', texto: '¿Cuál fue la tasa de tránsito inmediato en 2024?' }] };

let abierta: AppOdes | null = null;
afterEach(async () => {
  await abierta?.cerrar();
  abierta = null;
});

async function app(
  opciones: {
    config?: Partial<ConfiguracionOdes>;
    ia?: boolean;
    pausaMs?: number;
    intervaloPingMs?: number;
    repositorio?: RepositorioEnMemoria;
    trustProxy?: string;
  } = {},
) {
  const { cliente, simulado } = clienteSimulado(undefined, opciones.pausaMs ?? 0);
  abierta = await crearAppOdes({
    config: configuracionPrueba({ ...(opciones.ia === false ? { claveApi: null } : {}), ...opciones.config }),
    cliente: opciones.ia === false ? null : cliente,
    repositorio: opciones.repositorio ?? new RepositorioEnMemoria(),
    intervaloPingMs: opciones.intervaloPingMs,
    trustProxy: opciones.trustProxy,
  });
  return { servidor: abierta.app.getHttpServer() as Server, simulado };
}

const ip = (direccion: string) => ({ 'X-Forwarded-For': direccion });

/** Cuerpo crudo como texto (supertest no interpreta text/event-stream). */
function texto(res: request.Response): string {
  return typeof res.text === 'string' ? res.text : String(res.body);
}

describe('GET /api/odes y /api/odes/estado', () => {
  it('informa el sitio y el estado del asistente sin caché', async () => {
    const { servidor } = await app();
    await request(servidor).get('/api/odes').expect(200, { sitio: 'odes', nombre: 'Asistente ODES' });
    const res = await request(servidor).get('/api/odes/estado').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      asistente: 'Asistente ODES',
      modo: 'ia',
      repositorio: { disponible: true, documentos: 4, documentosConTexto: 3, generado: '2026-10-08T00:00:00.000Z' },
    });
  });

  it('sin clave de API el modo es "busqueda"', async () => {
    const { servidor } = await app({ ia: false });
    const res = await request(servidor).get('/api/odes/estado').expect(200);
    expect(res.body.modo).toBe('busqueda');
  });
});

describe('POST /api/odes/chat: errores antes del flujo', () => {
  it.each([
    ['cuerpo vacío', {}, 400],
    ['sin mensajes', { mensajes: [] }, 400],
    ['rol desconocido', { mensajes: [{ rol: 'sistema', texto: 'x' }] }, 400],
    ['último mensaje del asistente', { mensajes: [{ rol: 'usuario', texto: 'a' }, { rol: 'asistente', texto: 'b' }] }, 400],
    ['pregunta vacía', { mensajes: [{ rol: 'usuario', texto: '   ' }] }, 400],
    ['pregunta demasiado larga', { mensajes: [{ rol: 'usuario', texto: 'x'.repeat(2001) }] }, 413],
    [
      'respuesta anterior demasiado larga',
      { mensajes: [{ rol: 'usuario', texto: 'a' }, { rol: 'asistente', texto: 'x'.repeat(12001) }, { rol: 'usuario', texto: 'b' }] },
      413,
    ],
    [
      'demasiados mensajes',
      { mensajes: Array.from({ length: 21 }, (_, i) => ({ rol: i % 2 === 0 ? 'usuario' : 'asistente', texto: 'x' })) },
      413,
    ],
  ])('%s -> %i con ErrorChat', async (_caso, cuerpo, status) => {
    const { servidor, simulado } = await app();
    const res = await request(servidor).post('/api/odes/chat').send(cuerpo).expect(status);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ codigo: 'solicitud_invalida', mensaje: expect.any(String) });
    expect(simulado.solicitudes).toHaveLength(0);
  });

  it('rechaza formularios (no JSON) aunque el parser urlencoded los entienda', async () => {
    const { servidor, simulado } = await app();
    const res = await request(servidor)
      .post('/api/odes/chat')
      .type('form')
      .send('mensajes[0][rol]=usuario&mensajes[0][texto]=hola')
      .expect(400);
    expect(res.body.codigo).toBe('solicitud_invalida');
    expect(simulado.solicitudes).toHaveLength(0);
  });

  it.each([
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Sec-Fetch-Site': 'same-site' }, 403],
    [{ Origin: 'https://otro-sitio.test' }, 403],
    [{ 'Sec-Fetch-Site': 'same-origin', Origin: 'https://otro-sitio.test' }, 200],
  ])('protección CSRF con %o -> %i', async (cabeceras, status) => {
    const { servidor } = await app({ ia: false });
    await request(servidor).post('/api/odes/chat').set(cabeceras).send(PREGUNTA).expect(status);
  });

  it('acepta el mismo origen por Origin/Host', async () => {
    const { servidor } = await app({ ia: false });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const { port } = servidor.address() as AddressInfo;
    await request(`http://127.0.0.1:${port}`)
      .post('/api/odes/chat')
      .set('Origin', `http://127.0.0.1:${port}`)
      .send(PREGUNTA)
      .expect(200);
  });

  it('JSON mal formado y cuerpos enormes no llegan al chat (400 / 413 del parser)', async () => {
    const { servidor, simulado } = await app();
    await request(servidor).post('/api/odes/chat').set('Content-Type', 'application/json').send('{"mensajes": [').expect(400);
    const enorme = { mensajes: [{ rol: 'usuario', texto: 'x'.repeat(200_000) }] };
    await request(servidor).post('/api/odes/chat').send(enorme).expect(413);
    expect(simulado.solicitudes).toHaveLength(0);
  });

  it('503 no_disponible si el índice del repositorio no está disponible', async () => {
    const repositorio = new RepositorioEnMemoria();
    repositorio.disponible = false;
    const { servidor } = await app({ repositorio });
    const res = await request(servidor).post('/api/odes/chat').send(PREGUNTA).expect(503);
    expect(res.body.codigo).toBe('no_disponible');
  });

  it('429 con Retry-After al superar el límite por minuto de una IP; otra IP sigue', async () => {
    const { servidor } = await app({ config: { limitePorMinuto: 2 }, ia: false, trustProxy: 'loopback' });
    await request(servidor).post('/api/odes/chat').set(ip('203.0.113.7')).send(PREGUNTA).expect(200);
    await request(servidor).post('/api/odes/chat').set(ip('203.0.113.7')).send(PREGUNTA).expect(200);
    const res = await request(servidor).post('/api/odes/chat').set(ip('203.0.113.7')).send(PREGUNTA).expect(429);
    expect(res.body.codigo).toBe('limite_uso');
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
    await request(servidor).post('/api/odes/chat').set(ip('198.51.100.9')).send(PREGUNTA).expect(200);
  });

  it('las direcciones IPv6 de un mismo /64 comparten el cupo; otro /64 no', async () => {
    const { servidor } = await app({ config: { limitePorMinuto: 2 }, ia: false, trustProxy: 'loopback' });
    await request(servidor).post('/api/odes/chat').set(ip('2001:db8:77:5::101')).send(PREGUNTA).expect(200);
    await request(servidor).post('/api/odes/chat').set(ip('2001:db8:77:5::102')).send(PREGUNTA).expect(200);
    await request(servidor).post('/api/odes/chat').set(ip('2001:db8:77:5:abcd::1')).send(PREGUNTA).expect(429);
    await request(servidor).post('/api/odes/chat').set(ip('2001:db8:77:6::1')).send(PREGUNTA).expect(200);
  });

  it('429 al superar el cupo global diario de preguntas con IA', async () => {
    const { servidor } = await app({ config: { limiteGlobalDia: 1 }, trustProxy: 'loopback' });
    await request(servidor).post('/api/odes/chat').set('X-Forwarded-For', '203.0.113.1').send(PREGUNTA).expect(200);
    const res = await request(servidor).post('/api/odes/chat').set('X-Forwarded-For', '203.0.113.2').send(PREGUNTA).expect(429);
    expect(res.body).toEqual({ codigo: 'limite_uso', mensaje: expect.stringContaining('máximo de consultas por hoy') });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('POST /api/odes/chat: flujo SSE', () => {
  it('modo búsqueda: inicio -> texto -> documentos -> fin', async () => {
    const { servidor } = await app({ ia: false });
    const res = await request(servidor).post('/api/odes/chat').send(PREGUNTA).expect(200);
    const eventos = leerEventosSse(texto(res));
    expect(eventos.map((e) => e.tipo)).toEqual(['inicio', 'texto', 'documentos', 'fin']);
    expect(eventos[0]).toEqual({ tipo: 'inicio', modo: 'busqueda' });
    const documentos = eventos[2] as Extract<EventoChat, { tipo: 'documentos' }>;
    expect(documentos.documentos[0]).toMatchObject({
      id: 'boletin-29-resultados-preliminares-2024',
      urlFragmento: 'https://ejemplo.test/boletin-29.pdf#page=1',
      paginaInicio: 1,
    });
  });

  it('modo IA: cabeceras SSE, sin compresión y cada evento en una línea data: + línea en blanco', async () => {
    const { servidor } = await app();
    const res = await request(servidor)
      .post('/api/odes/chat')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .send(PREGUNTA)
      .expect(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.headers['content-encoding']).toBeUndefined();
    const cuerpo = texto(res);
    expect(cuerpo).toMatch(/^data: \{"tipo":"inicio","modo":"ia"\}\n\n/);
    expect(cuerpo).not.toMatch(/^event:/m);
    for (const mensaje of cuerpo.split('\n\n').filter(Boolean)) {
      expect(mensaje).toMatch(/^(data: \{.*\}|: ping)$/);
    }
    const eventos = leerEventosSse(cuerpo);
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['inicio', 'busqueda', 'texto', 'cita', 'fin']));
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
    expect(textoConCitas(eventos)).toContain('⟦1⟧');
  });

  it('envía ": ping" periódicamente mientras espera', async () => {
    const { servidor } = await app({ pausaMs: 20, intervaloPingMs: 40 });
    const res = await request(servidor).post('/api/odes/chat').send(PREGUNTA).expect(200);
    expect(texto(res)).toContain('\n\n: ping\n\n');
    expect(leerEventosSse(texto(res)).at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
  });

  it('el primer evento llega antes de que termine el flujo, aunque el cliente acepte gzip', async () => {
    const { servidor } = await app({ pausaMs: 40 });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const { port } = servidor.address() as AddressInfo;
    const inicio = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/odes/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, br' },
      body: JSON.stringify(PREGUNTA),
    });
    expect(res.headers.get('content-encoding')).toBeNull();
    const lector = res.body!.getReader();
    const primero = await lector.read();
    const msPrimerEvento = performance.now() - inicio;
    expect(new TextDecoder().decode(primero.value)).toContain('data: {"tipo":"inicio","modo":"ia"}');
    expect(primero.done).toBe(false);
    let resto = '';
    for (;;) {
      const parte = await lector.read();
      if (parte.done) break;
      resto += new TextDecoder().decode(parte.value);
    }
    const msTotal = performance.now() - inicio;
    expect(resto).toContain('"tipo":"fin"');
    // El simulador tarda ~40 ms por evento (más de un segundo en total); el
    // primer evento no espera a que termine (con gzip quedaría en el búfer).
    expect(msTotal).toBeGreaterThan(600);
    expect(msPrimerEvento).toBeLessThan(msTotal / 3);
  });

  it('si el cliente se desconecta, se cancela la llamada a Claude', async () => {
    const { servidor, simulado } = await app({ pausaMs: 40 });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const { port } = servidor.address() as AddressInfo;
    const control = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/odes/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(PREGUNTA),
      signal: control.signal,
    });
    const lector = res.body!.getReader();
    let recibido = '';
    while (!recibido.includes('"tipo":"busqueda"')) {
      const parte = await lector.read();
      if (parte.done) break;
      recibido += new TextDecoder().decode(parte.value);
    }
    control.abort();
    await vi.waitFor(
      () => {
        expect(simulado.solicitudes.length).toBe(2);
        expect(simulado.solicitudes[1]!.cancelada).toBe(true);
      },
      { timeout: 3000, interval: 20 },
    );
    expect(simulado.solicitudes[1]!.completada).toBe(false);
  });

  it('registra una línea por pregunta sin contenido ni IP', async () => {
    const espia = vi.spyOn(Logger.prototype, 'log');
    try {
      const { servidor } = await app();
      await request(servidor).post('/api/odes/chat').send(PREGUNTA).expect(200);
      const lineas = espia.mock.calls.map(([mensaje]) => String(mensaje)).filter((m) => m.startsWith('chat '));
      expect(lineas).toHaveLength(1);
      expect(lineas[0]).toMatch(
        /^chat modo=ia resultado=completo modelo=claude-opus-5-5 servido_por=claude-opus-5-5 respaldo=no llamadas=2 herramientas=1 tokens_entrada=\d+ tokens_salida=\d+ cache_lectura=\d+ cache_escritura=\d+ duracion_ms=\d+ usuario=[\w-]{16}$/,
      );
      expect(lineas[0]).not.toContain('tránsito');
      expect(lineas[0]).not.toContain('127.0.0.1');
    } finally {
      espia.mockRestore();
    }
  });
});
