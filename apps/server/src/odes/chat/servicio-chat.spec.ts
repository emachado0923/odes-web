import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clienteSimulado, configuracionPrueba, RepositorioEnMemoria } from '../../../test/odes-apoyo.js';
import { AVISO_MODO_BUSQUEDA, AVISO_SIN_RESULTADOS } from './modo-busqueda.js';
import type { EventoChat } from './protocolo.js';
import { ServicioChat } from './servicio-chat.js';

async function preguntar(servicio: ServicioChat, texto: string, senal = new AbortController().signal) {
  const eventos: EventoChat[] = [];
  const resumen = await servicio.responder([{ rol: 'usuario', texto }], (e) => eventos.push(e), senal, 'u');
  return { eventos, resumen };
}

describe('ServicioChat', () => {
  // La línea de registro se prueba en chat.controller.spec.ts; aquí solo hace ruido.
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('modo búsqueda: hasta 6 documentos distintos con extracto corto', async () => {
    const servicio = new ServicioChat(configuracionPrueba({ claveApi: null }), null, new RepositorioEnMemoria());
    expect(servicio.modo).toBe('busqueda');
    const { eventos } = await preguntar(servicio, 'expectativas de los bachilleres y deserción');
    expect(eventos[0]).toEqual({ tipo: 'inicio', modo: 'busqueda' });
    expect(eventos[1]).toEqual({ tipo: 'texto', delta: AVISO_MODO_BUSQUEDA });
    const documentos = eventos[2] as Extract<EventoChat, { tipo: 'documentos' }>;
    const ids = documentos.documentos.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(6);
    for (const doc of documentos.documentos) {
      expect(doc.extracto!.length).toBeLessThanOrEqual(300);
      expect(doc.urlFragmento).toMatch(/^https:\/\//);
    }
    expect(eventos.at(-1)).toEqual({ tipo: 'fin', motivo: 'completo' });
  });

  it('modo búsqueda sin resultados: aviso y fin, sin lista', async () => {
    const servicio = new ServicioChat(configuracionPrueba({ claveApi: null }), null, new RepositorioEnMemoria());
    const { eventos } = await preguntar(servicio, 'astronomía');
    expect(eventos).toEqual([
      { tipo: 'inicio', modo: 'busqueda' },
      { tipo: 'texto', delta: AVISO_SIN_RESULTADOS },
      { tipo: 'fin', motivo: 'completo' },
    ]);
  });

  it('modo IA: inicio con modo ia y estado', async () => {
    const { cliente } = clienteSimulado();
    const servicio = new ServicioChat(configuracionPrueba(), cliente, new RepositorioEnMemoria());
    expect(servicio.estado()).toMatchObject({ asistente: 'Asistente ODES', modo: 'ia', repositorio: { disponible: true } });
    const { eventos, resumen } = await preguntar(servicio, 'tránsito inmediato');
    expect(eventos[0]).toEqual({ tipo: 'inicio', modo: 'ia' });
    expect(resumen.resultado).toBe('completo');
  });

  it('tiempo máximo agotado: cancela y emite error de sobrecarga con mensaje claro', async () => {
    const { cliente, simulado } = clienteSimulado(undefined, 300);
    const servicio = new ServicioChat(configuracionPrueba({ timeoutMs: 200 }), cliente, new RepositorioEnMemoria());
    const { eventos, resumen } = await preguntar(servicio, 'tránsito inmediato');
    expect(resumen.resultado).toBe('tiempo_agotado');
    expect(eventos.at(-1)).toMatchObject({ tipo: 'error', codigo: 'sobrecarga', mensaje: expect.stringContaining('tardó demasiado') });
    expect(simulado.solicitudes[0]!.cancelada).toBe(true);
  });

  it('desconexión del cliente: no emite nada más (ni error)', async () => {
    const { cliente } = clienteSimulado(undefined, 50);
    const servicio = new ServicioChat(configuracionPrueba(), cliente, new RepositorioEnMemoria());
    const control = new AbortController();
    setTimeout(() => control.abort('cliente_desconectado'), 80);
    const { eventos, resumen } = await preguntar(servicio, 'tránsito inmediato', control.signal);
    expect(resumen.resultado).toBe('cancelado');
    expect(eventos.map((e) => e.tipo)).toEqual(['inicio']);
  });
});
