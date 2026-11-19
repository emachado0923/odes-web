import { createServer, type Server as ServidorTcp } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COOKIE_SESION_PAI,
  MENSAJES_ERROR_PAI,
  RUTA_API_PAI,
} from '../src/pai/api-pai.js';
import { cargarConfiguracionRepositorio } from '../src/repositorio/configuracion-repositorio.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import { type AppPrueba, crearAppRepositorio } from './repositorio-apoyo.js';

/**
 * Sin base de datos (o con una que no responde) el servidor arranca y
 * /api/pai/* responde 503 JSON `no_disponible` con el mensaje del PAI (no
 * el del repositorio), no-store y Retry-After; nunca 401 (el navegador no
 * debe creer que se cerró la sesión). Estas pruebas no necesitan base:
 * corren siempre.
 */

const ACCEPT_NAVEGADOR = 'text/html,application/xhtml+xml,*/*;q=0.8';
const COOKIE = `${COOKIE_SESION_PAI}=${'t'.repeat(43)}`;

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Rutas de todas las partes del PAI (la guardia o el inicio de sesión tocan la base primero). */
const RUTAS: [Metodo, string][] = [
  ['get', '/sesion'],
  ['delete', '/sesion'],
  ['put', '/sesion/contrasena'],
  ['get', '/vigencia'],
  ['get', '/tablero'],
  ['get', '/indicadores/SAF-TH-02'],
  ['put', '/indicadores/1/bimestres/4'],
  ['post', '/indicadores/1/bimestres/4/evidencias/subidas'],
  ['get', '/evidencias/1'],
  ['get', '/admin/usuarios'],
  ['post', '/admin/usuarios'],
  ['patch', '/admin/usuarios/1'],
  ['put', '/admin/usuarios/1/asignaciones'],
  ['put', '/admin/vigencia'],
  ['get', '/admin/autorizaciones'],
  ['get', '/admin/registro'],
  ['get', '/admin/exportar.csv'],
];

function esperarNoDisponible(res: request.Response): void {
  expect(res.status).toBe(503);
  expect(res.body).toEqual({
    codigo: 'no_disponible',
    mensaje: MENSAJES_ERROR_PAI.no_disponible,
  });
  expect(res.headers['cache-control']).toBe('no-store');
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
}

describe('PAI sin base de datos (e2e)', () => {
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
      prueba = await crearAppRepositorio(
        cargarConfiguracionRepositorio({}),
        dist.directorio,
      );
    });

    afterAll(async () => {
      await prueba.cerrar();
    });

    it.each(RUTAS)(
      '%s /api/pai%s sin cookie -> 503 no_disponible',
      async (metodo, ruta) => {
        const agente = request(prueba.servidor);
        const res = await agente[metodo](`${RUTA_API_PAI}${ruta}`).send({});
        expect(res.status).toBe(503);
        esperarNoDisponible(res);
      },
    );

    it.each(RUTAS)(
      '%s /api/pai%s con cookie -> 503 no_disponible',
      async (metodo, ruta) => {
        const agente = request(prueba.servidor);
        const res = await agente[metodo](`${RUTA_API_PAI}${ruta}`)
          .set('Cookie', COOKIE)
          .set('X-CSRF-Token', 'c'.repeat(43))
          .send({});
        expect(res.status).toBe(503);
        esperarNoDisponible(res);
      },
    );

    it('el inicio de sesión también responde 503 (y no 401)', async () => {
      const res = await request(prueba.servidor)
        .post(`${RUTA_API_PAI}/sesion`)
        .send({
          usuario: 'planeacion',
          contrasena: 'una contraseña cualquiera',
        })
        .expect(503);
      esperarNoDisponible(res);
    });

    it('sin base, un cuerpo inválido sigue siendo 400 y otro sitio 403', async () => {
      await request(prueba.servidor)
        .post(`${RUTA_API_PAI}/sesion`)
        .send({ usuario: 'x' })
        .expect(400);
      await request(prueba.servidor)
        .post(`${RUTA_API_PAI}/sesion`)
        .set('Origin', 'https://otro-sitio.example')
        .send({
          usuario: 'planeacion',
          contrasena: 'una contraseña cualquiera',
        })
        .expect(403);
    });

    it('la página /pai y el resto del sitio siguen funcionando', async () => {
      await request(prueba.servidor).get('/api/salud').expect(200);
      for (const ruta of [
        '/pai',
        '/pai/admin/usuarios',
        '/pai/indicadores/SAF-TH-02',
      ]) {
        const res = await request(prueba.servidor)
          .get(ruta)
          .set('Accept', ACCEPT_NAVEGADOR)
          .expect(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
      }
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

    it('503 rápido en la sesión y en la API, y el proceso sigue en pie', async () => {
      const inicio = Date.now();
      esperarNoDisponible(
        await request(prueba.servidor)
          .get(`${RUTA_API_PAI}/sesion`)
          .set('Cookie', COOKIE),
      );
      const segunda = Date.now();
      esperarNoDisponible(
        await request(prueba.servidor).post(`${RUTA_API_PAI}/sesion`).send({
          usuario: 'planeacion',
          contrasena: 'una contraseña cualquiera',
        }),
      );
      esperarNoDisponible(
        await request(prueba.servidor).get(`${RUTA_API_PAI}/tablero`),
      );
      expect(Date.now() - segunda).toBeLessThan(600);
      expect(Date.now() - inicio).toBeLessThan(5000);
      await request(prueba.servidor).get('/api/salud').expect(200);
    });
  });
});
