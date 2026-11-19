import { createServer, type Server as ServidorTcp } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfiguracionRepositorio } from '../src/repositorio/configuracion-repositorio.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import { type AppPrueba, crearAppRepositorio } from './repositorio-apoyo.js';

/**
 * Sin base de datos (o con una que no responde) el servidor arranca, /sivu
 * y /odes siguen funcionando y /api/repositorio/* responde 503 no_disponible.
 * Estas pruebas no necesitan MySQL: corren siempre.
 */

const ACCEPT_NAVEGADOR = 'text/html,application/xhtml+xml,*/*;q=0.8';

describe('repositorio sin base de datos (e2e)', () => {
  let dist: DistTemporal;

  beforeAll(async () => {
    dist = await crearDistTemporal();
  });

  afterAll(async () => {
    await dist.limpiar();
  });

  describe('sin configurar', () => {
    let prueba: AppPrueba;

    beforeAll(async () => {
      prueba = await crearAppRepositorio(cargarConfiguracionRepositorio({}), dist.directorio);
    });

    afterAll(async () => {
      await prueba.cerrar();
    });

    it.each([
      ['GET', '/api/repositorio/documentos'],
      ['GET', '/api/repositorio/documentos/boletin-19/ver'],
      ['GET', '/api/repositorio/documentos/boletin-19/portada'],
      ['GET', '/api/repositorio/admin/sesion'],
      ['GET', '/api/repositorio/admin/documentos'],
    ])('%s %s -> 503 no_disponible', async (_metodo, ruta) => {
      const res = await request(prueba.servidor).get(ruta).expect(503);
      expect(res.body).toEqual({
        codigo: 'no_disponible',
        mensaje: expect.stringContaining('no está disponible') as unknown,
      });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('el inicio de sesión también responde 503 (y no 401)', async () => {
      const res = await request(prueba.servidor)
        .post('/api/repositorio/admin/sesion')
        .send({ usuario: 'admin', contrasena: 'una contraseña cualquiera' })
        .expect(503);
      expect(res.body.codigo).toBe('no_disponible');
    });

    it('el resto del sitio sigue funcionando', async () => {
      await request(prueba.servidor).get('/api/salud').expect(200);
      await request(prueba.servidor).get('/api/sivu').expect(200);
      for (const ruta of ['/repositorio', '/repositorio/admin', '/repositorio/admin/documentos/x']) {
        const res = await request(prueba.servidor).get(ruta).set('Accept', ACCEPT_NAVEGADOR).expect(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
      }
    });

    it('una ruta desconocida de la API sigue siendo 404', async () => {
      await request(prueba.servidor).get('/api/repositorio/otra-cosa').expect(404);
    });
  });

  describe('configurada pero sin respuesta', () => {
    let tcp: ServidorTcp;
    let prueba: AppPrueba;

    beforeAll(async () => {
      // Acepta y corta: como un MySQL caído detrás de un balanceador.
      tcp = createServer((socket) => socket.destroy());
      await new Promise<void>((listo) => tcp.listen(0, '127.0.0.1', listo));
      const puerto = (tcp.address() as { port: number }).port;
      prueba = await crearAppRepositorio(
        cargarConfiguracionRepositorio({
          REPOSITORIO_MYSQL_HOST: '127.0.0.1',
          REPOSITORIO_MYSQL_PORT: String(puerto),
          REPOSITORIO_MYSQL_USER: 'nadie',
          REPOSITORIO_MYSQL_PASSWORD: 'x',
          REPOSITORIO_MYSQL_TIMEOUT_SEGUNDOS: '2',
        }),
        dist.directorio,
      );
    });

    afterAll(async () => {
      await prueba.cerrar();
      await new Promise((listo) => tcp.close(listo));
    });

    it('503 rápido y el proceso sigue en pie', async () => {
      const inicio = Date.now();
      const res = await request(prueba.servidor).get('/api/repositorio/documentos').expect(503);
      expect(res.body.codigo).toBe('no_disponible');
      const segunda = Date.now();
      await request(prueba.servidor).get('/api/repositorio/documentos').expect(503);
      expect(Date.now() - segunda).toBeLessThan(300);
      expect(Date.now() - inicio).toBeLessThan(5000);
      await request(prueba.servidor).get('/api/salud').expect(200);
    });
  });
});
