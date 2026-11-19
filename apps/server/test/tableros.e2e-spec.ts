import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../src/config/configuracion.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import {
  aFilasTablas,
  type DatosTableroMatricula,
  leerArchivosTablero,
} from '../src/sivu/tableros/datos-matricula.js';
import { guardarMatricula } from '../src/sivu/tableros/guardar-matricula.js';
import { aFilasFondos, type ConjuntoFondos, type DatosTableroFondos, leerArchivosFondos } from '../src/sivu/tableros/datos-fondos.js';
import { guardarFondos } from '../src/sivu/tableros/guardar-fondos.js';
import { hashContrasena } from '../src/repositorio/dominio/contrasenas.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAppRepositorio,
  crearAdminPrueba,
  crearBasePrueba,
  iniciarSesion,
  HAY_BD,
  MOTOR_PRUEBAS,
} from './repositorio-apoyo.js';

/**
 * Tablero de matrícula sobre una base desechable: la migración 002 crea las
 * tablas, guardarMatricula carga los datos reales (los de
 * datos/tableros/matricula-2025) y la API los devuelve iguales al archivo.
 */

avisarSiNoHayBd('tableros');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const URL_TABLERO = '/api/sivu/tableros/matricula-2025';
const CARPETA = join(RAIZ_SERVIDOR, 'datos', 'tableros', 'matricula-2025');

describe.skipIf(!HAY_BD)(`tablero de matrícula con ${MOTOR_PRUEBAS} (e2e)`, () => {
  let base: BasePrueba;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let original: { matricula: unknown; definiciones: unknown };

  beforeAll(async () => {
    base = await crearBasePrueba('tableros');
    dist = await crearDistTemporal();
    original = await leerArchivosTablero(join(CARPETA, 'matricula.js'), join(CARPETA, 'definiciones.js'));
    prueba = await crearAppRepositorio(base.config, dist.directorio);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  it('la migración 002 crea las tablas del tablero', async () => {
    const tablas = await base.tablas();
    for (const tabla of ['sivu_tableros', 'sivu_tablero_matricula_2025_meta', 'sivu_tablero_matricula_2025_categorias', 'sivu_tablero_matricula_2025_ies', 'sivu_tablero_matricula_2025_programas', 'sivu_tablero_matricula_2025_filas']) {
      expect(tablas).toContain(tabla);
    }
  });

  it('sin datos cargados responde 404 con un mensaje que dice cómo cargarlos', async () => {
    const res = await request(prueba.servidor).get(URL_TABLERO).expect(404);
    expect(res.body).toMatchObject({ codigo: 'no_encontrado' });
  });

  it('guardarMatricula carga los datos reales y la API los devuelve iguales al archivo', async () => {
    const bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    try {
      await guardarMatricula(bd, aFilasTablas(original.matricula as never, original.definiciones));
      // Una segunda carga reemplaza todo (no duplica ni choca con las llaves).
      await guardarMatricula(bd, aFilasTablas(original.matricula as never, original.definiciones));
    } finally {
      await bd.cerrar();
    }
    const res = await request(prueba.servidor).get(URL_TABLERO).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-cache');
    const datos = res.body as DatosTableroMatricula;
    expect(datos.matricula).toEqual(original.matricula);
    expect(datos.definiciones).toEqual(original.definiciones);

    // Con el mismo ETag: 304 sin cuerpo.
    await request(prueba.servidor).get(URL_TABLERO).set('If-None-Match', res.headers.etag as string).expect(304);
  });

  it('un tablero que no existe es 404', async () => {
    await request(prueba.servidor).get('/api/sivu/tableros/otro').expect(404);
  });

  it('la página /tableros/matricula-2025 es de la SPA (index.html)', async () => {
    const res = await request(prueba.servidor).get('/tableros/matricula-2025').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});

/**
 * Tablero de los fondos sobre una base desechable: es privado (cuentas de
 * tableros, migración 008). La migración 007 crea sus tablas, guardarFondos
 * carga los datos de datos/tableros/fondos-2026 y, con sesión, la API los
 * devuelve iguales al archivo.
 */
describe.skipIf(!HAY_BD)(`tablero de los fondos con ${MOTOR_PRUEBAS} (e2e)`, () => {
  const URL_FONDOS = '/api/sivu/tableros/fondos-2026';
  const CARPETA_FONDOS = join(RAIZ_SERVIDOR, 'datos', 'tableros', 'fondos-2026');
  const CLAVE = 'una-clave-de-prueba-larga';
  let base: BasePrueba;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let original: { fondos: ConjuntoFondos; definiciones: unknown };

  const ingresar = async (usuario: string, contrasena: string): Promise<{ cookie: string; csrf: string }> => {
    const res = await request(prueba.servidor).post('/api/sivu/sesion').send({ usuario, contrasena }).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sivu_sesion='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/sivu/);
    return { cookie: cookie!.split(';')[0]!, csrf: (res.body as { csrf: string }).csrf };
  };

  beforeAll(async () => {
    base = await crearBasePrueba('tableros_fondos');
    dist = await crearDistTemporal();
    original = await leerArchivosFondos(join(CARPETA_FONDOS, 'fondos.json'), join(CARPETA_FONDOS, 'definiciones.json'));
    prueba = await crearAppRepositorio(base.config, dist.directorio);
    await base.admin.query('INSERT INTO sivu_acceso_usuarios (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)', [
      'planeacion',
      'Planeación',
      await hashContrasena(CLAVE),
    ]);
    await crearAdminPrueba(base, 'admin.repositorio', CLAVE);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  it('sin sesión de tableros responde 401, y con sesión pero sin datos, 404', async () => {
    await request(prueba.servidor).get(URL_FONDOS).expect(401);
    const { cookie } = await ingresar('planeacion', CLAVE);
    const res = await request(prueba.servidor).get(URL_FONDOS).set('Cookie', cookie).expect(404);
    expect(res.body).toMatchObject({ codigo: 'no_encontrado' });
  });

  it('una contraseña equivocada no abre sesión, ni una cuenta de la administración del repositorio', async () => {
    await request(prueba.servidor).post('/api/sivu/sesion').send({ usuario: 'planeacion', contrasena: 'otra-clave-cualquiera' }).expect(401);
    await request(prueba.servidor).post('/api/sivu/sesion').send({ usuario: 'admin.repositorio', contrasena: CLAVE }).expect(401);
    const admin = await iniciarSesion(prueba.servidor, 'admin.repositorio', CLAVE);
    await request(prueba.servidor).get(URL_FONDOS).set('Cookie', admin.cookie).expect(401);
  });

  it('con sesión, la API devuelve los datos iguales al archivo; al cerrar la sesión vuelve el 401', async () => {
    const bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    try {
      await guardarFondos(bd, aFilasFondos(original.fondos, original.definiciones));
      await guardarFondos(bd, aFilasFondos(original.fondos, original.definiciones));
    } finally {
      await bd.cerrar();
    }
    const { cookie, csrf } = await ingresar('planeacion', CLAVE);
    const res = await request(prueba.servidor).get(URL_FONDOS).set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    const datos = res.body as DatosTableroFondos;
    expect(datos.fondos).toEqual(original.fondos);
    expect(datos.definiciones).toEqual(original.definiciones);
    await request(prueba.servidor).get(URL_FONDOS).set('Cookie', cookie).set('If-None-Match', res.headers.etag as string).expect(304);
    await request(prueba.servidor).get('/api/sivu/sesion').set('Cookie', cookie).expect(200);
    // Cerrar exige el token CSRF; sin él, 403.
    await request(prueba.servidor).delete('/api/sivu/sesion').set('Cookie', cookie).expect(403);
    await request(prueba.servidor).delete('/api/sivu/sesion').set('Cookie', cookie).set('X-CSRF-Token', csrf).expect(204);
    await request(prueba.servidor).get(URL_FONDOS).set('Cookie', cookie).expect(401);
  });

  it('el tablero de matrícula sigue siendo público', async () => {
    await request(prueba.servidor).get('/api/sivu/tableros/matricula-2025').expect(404);
  });
});
