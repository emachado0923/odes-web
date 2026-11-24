import { readdir } from 'node:fs/promises';
import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ArchivoCrm,
  CABECERA_CSRF,
  type CorreoCrm,
  type CuentaCorreoCrm,
  type EstadoAvisoCrm,
  LIMITES_CRM,
  type PersonaAdminCrm,
  type PersonaCrm,
  type ResultadoDevolverCrm,
  type ResultadoPruebaCorreoCrm,
  type ResultadoTerminarCrm,
  type ResumenLiderCrm,
  type SesionLiderCrm,
  type TableroPersonaCrm,
  type TareaCrm,
  type TareaDetalleCrm,
} from '../src/crm/api-crm.js';
import {
  CONFIGURACION_CORREO_CRM,
  cargarConfiguracionCorreoCrm,
  type ConfiguracionCorreoCrm,
} from '../src/crm/correo/configuracion-correo.js';
import {
  MENSAJE_AUTH_GMAIL,
  MENSAJE_CLAVE_FALTA,
  MENSAJE_HOST_FALTA,
  MENSAJE_MANDAN_VARIABLES,
  TOPE_PRUEBAS_POR_HORA,
} from '../src/crm/correo/cuenta-correo.js';
import {
  FABRICA_TRANSPORTE_CORREO_CRM,
  type FabricaTransporteCrm,
  type MensajeEnviadoCrm,
  ServicioCorreoCrm,
} from '../src/crm/correo/servicio-correo-crm.js';
import { type CorreoSalienteCrm, crearTransporteCrm } from '../src/crm/correo/transporte.js';
import { USUARIO_LIDER_CRM } from '../src/crm/sesion/servicio-sesiones-crm.js';
import { MENSAJE_CORREO_SIN_CONFIGURAR } from '../src/crm/tareas/avisos-tareas.js';
import {
  FALTA_ENTREGABLE,
  TAREA_TERMINADA_EQUIPO,
  TOPE_CAMBIOS_POR_HORA,
  TOPE_SUBIDAS_POR_HORA,
} from '../src/crm/tareas/validacion-tareas.js';
import { cargarConfiguracionRepositorio } from '../src/repositorio/configuracion-repositorio.js';
import { hashContrasena } from '../src/repositorio/dominio/contrasenas.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAppRepositorio,
  crearBasePrueba,
  cuerpoBinario,
  HAY_BD,
  MOTOR_PRUEBAS,
} from './repositorio-apoyo.js';
import { pdfFalso, pngFalso } from './repositorio-fixtures.js';

/**
 * CRM de la Oficina de Planeación (/api/crm, contrato en src/crm/api-crm.ts)
 * de punta a punta contra una base DESECHABLE, en MySQL y en Postgres
 * (MYSQL_PRUEBAS / POSTGRES_PRUEBAS, ver repositorio-apoyo.ts): la app
 * completa con supertest, la migración 010 real y el correo en modo
 * 'memoria' (nodemailer arma cada mensaje y ServicioCorreoCrm los guarda en
 * enviadosEnMemoria()).
 *
 * Un solo escenario, en orden: la sesión del líder; el equipo (personas y
 * fotos); las tareas del líder (adjuntos, aviso, edición, reasignación,
 * filtros, borrado); el tablero de una persona (estado, entregables, terminar
 * con el correo al líder); la devolución; la bandeja de correos (también con
 * el correo desactivado, en una segunda app sobre la misma base); el doble
 * clic en «Terminar» y las terminadas antiguas; el tope por IP de las
 * peticiones del equipo; el cupo de entregables con un correo de más de 18 MB;
 * la cuenta de correo guardada por el líder (cifrada en crm_correo_cuenta, en
 * una tercera app con el correo desactivado y un transporte smtp falso) y el
 * bloqueo de la cuenta del líder. Al final, la carpeta temporal de las
 * subidas queda vacía. Aparte, sin base: /api/crm/* responde 503 (corre
 * siempre).
 */

avisarSiNoHayBd('crm.e2e-spec.ts');

const RUTA = '/api/crm';
const CLAVE_LIDER = 'una-clave-del-lider-para-pruebas';
/** Nombre de la cuenta del líder (crm_acceso_usuarios), el que devuelve la sesión. */
const NOMBRE_CUENTA = 'Luciana Vélez';
const URL_SITIO = 'https://crm.sapiencia.test';
const OTRO_SITIO = 'https://otro-sitio.example';
/** Detalle de los eventos que inserta la prueba del tope (para borrarlos después). */
const MARCA_TOPE = 'tope-e2e';

const LIDER = { nombre: 'Luciana Vélez Arenas', correo: 'lider.planeacion@sapiencia.gov.co' };
const JOSE = { nombre: 'José David Ramírez Abraham', correo: 'jose.ramirez@sapiencia.gov.co' };
const CARLOS = { nombre: 'Carlos Pérez', correo: 'carlos.perez@sapiencia.gov.co' };
const CARLOS_RENOMBRADO = 'Carlos Andrés Pérez';

const TITULO_T1 = 'Informe de matrícula 2026-2';
const TITULO_T1_EDITADO = 'Informe de matrícula 2026-2 (consolidado)';
const DESCRIPCION_T1 = 'Consolidar la matrícula por IES.\nIncluir la tabla de deserción.';
const NOMBRE_ADJUNTO = 'Lineamientos de matrícula 2026.pdf';

const CONTEO_VACIO = { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 };

const CORREO_EN_MEMORIA = cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'memoria', CRM_URL_SITIO: URL_SITIO });
const CORREO_DESACTIVADO = cargarConfiguracionCorreoCrm({});

interface SesionPrueba {
  cookie: string;
  csrf: string;
}

type Mutacion = 'post' | 'patch' | 'put' | 'delete';

function cookieDe(res: request.Response, nombre: string): string | undefined {
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${nombre}=`));
}

describe.skipIf(!HAY_BD)(`CRM con ${MOTOR_PRUEBAS} (e2e)`, () => {
  let base: BasePrueba;
  let dist: DistTemporal;
  /** La app con el correo en memoria. */
  let prueba: AppPrueba;
  let sesion: SesionPrueba;
  const id = { lider: 0, jose: 0, carlos: 0 };
  const tarea = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 };
  const archivo = { adjuntoT1: 0, adjuntoT2: 0, entregableT1: 0 };
  /** Contenido del entregable de la tarea 1 (para comparar la descarga). */
  let informeFinal: Buffer = Buffer.alloc(0);
  /** Contenido del adjunto de la tarea 2. */
  const grafica = pngFalso(120, 80);

  /** Peticiones del líder: con la cookie y, en las que cambian algo, el X-CSRF-Token. */
  const lider = {
    get: (ruta: string, app: AppPrueba = prueba) =>
      request(app.servidor).get(`${RUTA}${ruta}`).set('Cookie', sesion.cookie),
    mutar: (metodo: Mutacion, ruta: string, app: AppPrueba = prueba) =>
      request(app.servidor)[metodo](`${RUTA}${ruta}`).set('Cookie', sesion.cookie).set(CABECERA_CSRF, sesion.csrf),
  };

  /** Peticiones del equipo (sin cuenta): las que cambian algo, desde el mismo sitio. */
  const equipo = {
    get: (ruta: string, app: AppPrueba = prueba) => request(app.servidor).get(`${RUTA}${ruta}`),
    mutar: (metodo: 'post' | 'delete', ruta: string, app: AppPrueba = prueba) =>
      request(app.servidor)[metodo](`${RUTA}${ruta}`).set('Sec-Fetch-Site', 'same-origin'),
  };

  const enMemoria = (): readonly MensajeEnviadoCrm[] => prueba.app.get(ServicioCorreoCrm).enviadosEnMemoria();
  const ultimoCorreo = (): MensajeEnviadoCrm | undefined => enMemoria().at(-1);

  async function consultar(sql: string, valores: unknown[] = []): Promise<RowDataPacket[]> {
    const [filas] = await base.admin.query<RowDataPacket[]>(sql, valores);
    return filas;
  }

  async function contar(tabla: string): Promise<number> {
    const [fila] = await consultar(`SELECT COUNT(*) AS n FROM ${tabla}`);
    return Number(fila?.n);
  }

  /** Ids de GET /api/crm/lider/tareas con esa consulta, en el orden de la respuesta. */
  async function idsTareasLider(consulta: string): Promise<number[]> {
    return ((await lider.get(`/lider/tareas${consulta}`).expect(200)).body as TareaCrm[]).map((t) => t.id);
  }

  /** Eventos del responsable (José) en la tarea 4, marcados con MARCA_TOPE: para la prueba del tope por IP. */
  async function insertarEventos(cantidad: number, tipo: string, ipEvento: string, creadoEn: Date): Promise<void> {
    const filas = Array.from({ length: cantidad }, () => [
      tarea.t4,
      tipo,
      'responsable',
      id.jose,
      MARCA_TOPE,
      ipEvento,
      creadoEn,
    ]);
    await base.admin.query(
      'INSERT INTO crm_tarea_eventos (tarea_id, tipo, actor, persona_id, detalle, ip, creado_en) VALUES ?',
      [filas],
    );
  }

  async function entrar(): Promise<SesionPrueba> {
    const res = await request(prueba.servidor).post(`${RUTA}/lider/sesion`).send({ contrasena: CLAVE_LIDER }).expect(200);
    const cookie = cookieDe(res, 'crm_sesion');
    if (!cookie) throw new Error('El inicio de sesión no puso la cookie crm_sesion.');
    return { cookie: cookie.split(';')[0]!, csrf: (res.body as SesionLiderCrm).csrf };
  }

  beforeAll(async () => {
    base = await crearBasePrueba('crm');
    dist = await crearDistTemporal();
    // La cuenta del líder, como la deja npm run crm:clave-lider.
    await base.admin.query(
      'INSERT INTO crm_acceso_usuarios (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)',
      [USUARIO_LIDER_CRM, NOMBRE_CUENTA, await hashContrasena(CLAVE_LIDER)],
    );
    prueba = await crearAppRepositorio(base.config, dist.directorio, {}, [
      { proveedor: CONFIGURACION_CORREO_CRM, valor: CORREO_EN_MEMORIA },
    ]);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  // ── 1. Sesión del líder ───────────────────────────────────────────────────

  describe('sesión del líder', () => {
    it('una contraseña incorrecta es 401 «Contraseña incorrecta.» y no pone cookie', async () => {
      const res = await request(prueba.servidor)
        .post(`${RUTA}/lider/sesion`)
        .send({ contrasena: 'otra-clave-cualquiera' })
        .expect(401);
      expect(res.body).toEqual({ codigo: 'no_autenticado', mensaje: 'Contraseña incorrecta.' });
      expect(cookieDe(res, 'crm_sesion')).toBeUndefined();
    });

    it('sin contraseña es 400; desde otro sitio, 403 aunque sea la correcta', async () => {
      const vacia = await request(prueba.servidor).post(`${RUTA}/lider/sesion`).send({}).expect(400);
      expect(vacia.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { contrasena: 'Escriba la contraseña.' } });
      const ajena = await request(prueba.servidor)
        .post(`${RUTA}/lider/sesion`)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ contrasena: CLAVE_LIDER })
        .expect(403);
      expect(ajena.body).toMatchObject({ codigo: 'prohibido' });
      expect(cookieDe(ajena, 'crm_sesion')).toBeUndefined();
    });

    it('la contraseña correcta pone la cookie crm_sesion (HttpOnly, Path=/api/crm) y devuelve el csrf', async () => {
      const res = await request(prueba.servidor).post(`${RUTA}/lider/sesion`).send({ contrasena: CLAVE_LIDER }).expect(200);
      const cookie = cookieDe(res, 'crm_sesion');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/crm(;|$)/);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(res.headers['cache-control']).toBe('no-store');
      const cuerpo = res.body as SesionLiderCrm;
      expect(cuerpo.nombre).toBe(NOMBRE_CUENTA);
      expect(cuerpo.csrf).toMatch(/^[\w-]{43}$/);
      expect(Number.isNaN(Date.parse(cuerpo.expira))).toBe(false);
      sesion = { cookie: cookie!.split(';')[0]!, csrf: cuerpo.csrf };

      const actual = await lider.get('/lider/sesion').expect(200);
      expect(actual.body).toMatchObject({ nombre: NOMBRE_CUENTA, csrf: sesion.csrf });
      const sinCookie = await request(prueba.servidor).get(`${RUTA}/lider/sesion`).expect(401);
      expect(sinCookie.body).toMatchObject({ codigo: 'no_autenticado' });
    });

    it('sin sesión, las rutas /api/crm/lider/* responden 401', async () => {
      for (const ruta of ['/lider/resumen', '/lider/tareas', '/lider/tareas/1', '/lider/personas', '/lider/correos']) {
        const res = await request(prueba.servidor).get(`${RUTA}${ruta}`).expect(401);
        expect(res.body).toMatchObject({ codigo: 'no_autenticado' });
      }
      await request(prueba.servidor).post(`${RUTA}/lider/tareas`).send({ titulo: 'X', responsableId: 1 }).expect(401);
      await request(prueba.servidor)
        .post(`${RUTA}/lider/personas`)
        .send({ nombre: 'X', correo: 'x@sapiencia.gov.co' })
        .expect(401);
      await request(prueba.servidor)
        .put(`${RUTA}/lider/personas/1/foto`)
        .attach('archivo', pngFalso(8, 8), 'foto.png')
        .expect(401);
      // Una cookie inventada tampoco abre nada.
      const inventada = await request(prueba.servidor)
        .get(`${RUTA}/lider/resumen`)
        .set('Cookie', `crm_sesion=${'a'.repeat(43)}`)
        .expect(401);
      expect(inventada.body).toMatchObject({ codigo: 'no_autenticado' });
    });

    it('una mutación sin X-CSRF-Token, con otro token o desde otro sitio es 403 y no guarda nada', async () => {
      const persona = { nombre: 'Nadie', correo: 'nadie@sapiencia.gov.co' };
      const sinToken = await request(prueba.servidor)
        .post(`${RUTA}/lider/personas`)
        .set('Cookie', sesion.cookie)
        .send(persona)
        .expect(403);
      expect(sinToken.body).toMatchObject({ codigo: 'prohibido' });
      await request(prueba.servidor)
        .post(`${RUTA}/lider/personas`)
        .set('Cookie', sesion.cookie)
        .set(CABECERA_CSRF, 'x'.repeat(43))
        .send(persona)
        .expect(403);
      const origen = await lider.mutar('post', '/lider/personas').set('Origin', OTRO_SITIO).send(persona).expect(403);
      expect(origen.body).toEqual({ codigo: 'prohibido', mensaje: 'Solicitud de otro sitio rechazada.' });
      await lider.mutar('post', '/lider/personas').set('Sec-Fetch-Site', 'cross-site').send(persona).expect(403);
      expect(await consultar('SELECT id FROM crm_personas')).toHaveLength(0);
    });

    it('DELETE cierra la sesión (con el CSRF) y borra la cookie; la cookie vieja queda en 401', async () => {
      await request(prueba.servidor).delete(`${RUTA}/lider/sesion`).set('Cookie', sesion.cookie).expect(403);
      const res = await lider.mutar('delete', '/lider/sesion').expect(204);
      const borrada = cookieDe(res, 'crm_sesion');
      expect(borrada).toMatch(/^crm_sesion=;/);
      expect(borrada).toMatch(/Path=\/api\/crm(;|$)/);
      expect(borrada).toMatch(/Expires=Thu, 01 Jan 1970/);
      await lider.get('/lider/sesion').expect(401);
      await lider.get('/lider/resumen').expect(401);
      // Sin sesión, cerrar responde 204 igual.
      await request(prueba.servidor).delete(`${RUTA}/lider/sesion`).expect(204);

      sesion = await entrar();
      const resumen = await lider.get('/lider/resumen').expect(200);
      expect(resumen.body).toMatchObject({ personas: [], totales: CONTEO_VACIO });
    });
  });

  // ── 2. Personas ───────────────────────────────────────────────────────────

  describe('personas', () => {
    it('el líder crea personas (correo en minúsculas, al final del orden); un correo repetido es 409', async () => {
      expect((await equipo.get('/personas').expect(200)).body).toEqual([]);

      const resLider = await lider
        .mutar('post', '/lider/personas')
        .send({ nombre: LIDER.nombre, correo: 'Lider.Planeacion@Sapiencia.gov.co', esLider: true })
        .expect(201);
      expect(resLider.body).toEqual({
        id: expect.any(Number),
        nombre: LIDER.nombre,
        iniciales: 'LV',
        esLider: true,
        foto: null,
        conteo: CONTEO_VACIO,
        correo: LIDER.correo,
        activo: true,
        orden: 1,
      });
      id.lider = (resLider.body as PersonaAdminCrm).id;

      const resJose = await lider
        .mutar('post', '/lider/personas')
        .send({ nombre: `  ${JOSE.nombre} `, correo: JOSE.correo })
        .expect(201);
      expect(resJose.body).toMatchObject({ nombre: JOSE.nombre, iniciales: 'JR', esLider: false, activo: true, orden: 2 });
      id.jose = (resJose.body as PersonaAdminCrm).id;

      const resCarlos = await lider.mutar('post', '/lider/personas').send(CARLOS).expect(201);
      expect(resCarlos.body).toMatchObject({ iniciales: 'CP', orden: 3 });
      id.carlos = (resCarlos.body as PersonaAdminCrm).id;

      const repetido = await lider
        .mutar('post', '/lider/personas')
        .send({ nombre: 'Otra Persona', correo: 'JOSE.Ramirez@sapiencia.gov.co' })
        .expect(409);
      expect(repetido.body).toEqual({ codigo: 'conflicto', mensaje: 'Ya hay una persona con ese correo.' });
      const invalida = await lider
        .mutar('post', '/lider/personas')
        .send({ nombre: '   ', correo: 'no-es-un-correo' })
        .expect(400);
      expect(invalida.body).toMatchObject({
        codigo: 'solicitud_invalida',
        campos: { nombre: expect.any(String), correo: expect.any(String) },
      });
      expect(await consultar('SELECT id FROM crm_personas')).toHaveLength(3);
    });

    it('GET /api/crm/personas (sin sesión): las activas en orden, con iniciales y conteos y SIN correo', async () => {
      const res = await equipo.get('/personas').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const personas = res.body as PersonaCrm[];
      expect(personas.map((p) => [p.id, p.iniciales, p.esLider])).toEqual([
        [id.lider, 'LV', true],
        [id.jose, 'JR', false],
        [id.carlos, 'CP', false],
      ]);
      for (const persona of personas) {
        expect(Object.keys(persona).toSorted()).toEqual(['conteo', 'esLider', 'foto', 'id', 'iniciales', 'nombre']);
        expect(persona.conteo).toEqual(CONTEO_VACIO);
      }
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    it('PATCH: no deja desactivar al único líder (409); una persona desactivada sale de la lista pública', async () => {
      const unico = await lider.mutar('patch', `/lider/personas/${id.lider}`).send({ activo: false }).expect(409);
      expect(unico.body).toEqual({ codigo: 'conflicto', mensaje: 'No se puede desactivar al único líder activo.' });

      const editada = await lider
        .mutar('patch', `/lider/personas/${id.carlos}`)
        .send({ nombre: CARLOS_RENOMBRADO, activo: false })
        .expect(200);
      expect(editada.body).toMatchObject({ id: id.carlos, nombre: CARLOS_RENOMBRADO, iniciales: 'CA', activo: false });
      const publicas = (await equipo.get('/personas').expect(200)).body as PersonaCrm[];
      expect(publicas.map((p) => p.id)).toEqual([id.lider, id.jose]);
      const todas = (await lider.get('/lider/personas').expect(200)).body as PersonaAdminCrm[];
      expect(todas.map((p) => [p.id, p.activo])).toEqual([
        [id.lider, true],
        [id.jose, true],
        [id.carlos, false],
      ]);
      // Una persona inactiva no tiene tablero.
      await equipo.get(`/personas/${id.carlos}/tareas`).expect(404);

      await lider.mutar('patch', `/lider/personas/${id.carlos}`).send({ correo: JOSE.correo.toUpperCase() }).expect(409);
      await lider.mutar('patch', `/lider/personas/${id.carlos}`).send({}).expect(400);
      await lider.mutar('patch', '/lider/personas/999999').send({ activo: true }).expect(404);
      const activa = await lider.mutar('patch', `/lider/personas/${id.carlos}`).send({ activo: true }).expect(200);
      expect(activa.body).toMatchObject({ activo: true, correo: CARLOS.correo });
    });

    it('foto: PUT da la URL con ?v=, GET la sirve como image/png y, después de DELETE, 404', async () => {
      const png = pngFalso(64, 64);
      const puesta = await lider
        .mutar('put', `/lider/personas/${id.jose}/foto`)
        .attach('archivo', png, { filename: 'jose.png', contentType: 'image/png' })
        .expect(200);
      const foto = (puesta.body as PersonaAdminCrm).foto;
      expect(foto).toBe(`/api/crm/personas/${id.jose}/foto?v=1`);
      const imagen = await request(prueba.servidor).get(foto!).buffer(true).parse(cuerpoBinario).expect(200);
      expect(imagen.headers['content-type']).toBe('image/png');
      expect(imagen.headers['cache-control']).toBe('public, max-age=300');
      expect((imagen.body as Buffer).equals(png)).toBe(true);
      const publicas = (await equipo.get('/personas').expect(200)).body as PersonaCrm[];
      expect(publicas.find((p) => p.id === id.jose)?.foto).toBe(foto);

      // Un PDF no sirve de foto, y una de más de 2 MB es 413.
      const pdf = await lider
        .mutar('put', `/lider/personas/${id.jose}/foto`)
        .attach('archivo', pdfFalso(), { filename: 'foto.pdf', contentType: 'application/pdf' })
        .expect(415);
      expect(pdf.body).toMatchObject({ codigo: 'tipo_no_permitido' });
      const grande = await lider
        .mutar('put', `/lider/personas/${id.jose}/foto`)
        .attach('archivo', Buffer.concat([pngFalso(64, 64), Buffer.alloc(LIMITES_CRM.maxBytesFoto)]), {
          filename: 'grande.png',
          contentType: 'image/png',
        })
        .expect(413);
      expect(grande.body).toMatchObject({ codigo: 'demasiado_grande' });

      // Otra foto: sube la versión y la anterior sale del almacén.
      const otra = await lider
        .mutar('put', `/lider/personas/${id.jose}/foto`)
        .attach('archivo', pngFalso(32, 48), { filename: 'jose-2.png', contentType: 'image/png' })
        .expect(200);
      expect((otra.body as PersonaAdminCrm).foto).toBe(`/api/crm/personas/${id.jose}/foto?v=2`);
      expect(await consultar('SELECT id FROM crm_almacen_archivos')).toHaveLength(1);

      const quitada = await lider.mutar('delete', `/lider/personas/${id.jose}/foto`).expect(200);
      expect(quitada.body).toMatchObject({ id: id.jose, foto: null });
      const sinFoto = await request(prueba.servidor).get(`${RUTA}/personas/${id.jose}/foto`).expect(404);
      expect(sinFoto.body).toMatchObject({ codigo: 'no_encontrado' });
      expect(await consultar('SELECT id FROM crm_almacen_archivos')).toHaveLength(0);
    });
  });

  // ── 3. Tareas del líder ───────────────────────────────────────────────────

  describe('tareas del líder', () => {
    it('crear valida los datos: 400 con campos (título vacío, responsable inexistente, fecha inválida)', async () => {
      const titulo = await lider.mutar('post', '/lider/tareas').send({ titulo: '   ', responsableId: id.jose }).expect(400);
      expect(titulo.body).toMatchObject({
        codigo: 'solicitud_invalida',
        campos: { titulo: 'Escriba el título de la tarea.' },
      });
      const responsable = await lider
        .mutar('post', '/lider/tareas')
        .send({ titulo: 'Tarea', responsableId: 999_999 })
        .expect(400);
      expect(responsable.body).toMatchObject({
        codigo: 'solicitud_invalida',
        campos: { responsableId: 'Elija una persona activa del equipo.' },
      });
      for (const fechaLimite of ['2026-02-30', '31/12/2026', '1999-12-31']) {
        const fecha = await lider
          .mutar('post', '/lider/tareas')
          .send({ titulo: 'Tarea', responsableId: id.jose, fechaLimite })
          .expect(400);
        expect(fecha.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { fechaLimite: expect.any(String) } });
      }
      // Un formulario (sin JSON) tampoco.
      await lider
        .mutar('post', '/lider/tareas')
        .type('form')
        .send({ titulo: 'Tarea', responsableId: String(id.jose) })
        .expect(400);
      expect(await consultar('SELECT id FROM crm_tareas')).toHaveLength(0);
    });

    it('crea una tarea: 201, pendiente, con el evento «creada» y sin aviso', async () => {
      const res = await lider
        .mutar('post', '/lider/tareas')
        .send({
          titulo: TITULO_T1,
          descripcion: DESCRIPCION_T1,
          responsableId: String(id.jose),
          fechaLimite: '2099-06-30',
          requiereEntregable: true,
        })
        .expect(201);
      const creada = res.body as TareaDetalleCrm;
      expect(creada).toMatchObject({
        titulo: TITULO_T1,
        estado: 'pendiente',
        responsable: { id: id.jose, nombre: JOSE.nombre, iniciales: 'JR', foto: null },
        fechaLimite: '2099-06-30',
        vencida: false,
        requiereEntregable: true,
        adjuntos: 0,
        entregables: 0,
        descripcion: DESCRIPCION_T1,
        notaCierre: null,
        terminadaEn: null,
        archivos: [],
        avisada: false,
        correos: [],
      });
      expect(creada.eventos).toEqual([expect.objectContaining({ tipo: 'creada', actor: 'lider', personaNombre: LIDER.nombre })]);
      tarea.t1 = creada.id;
    });

    it('adjunto PDF: 201; un .txt o un archivo cuya extensión no corresponde a su contenido, 415', async () => {
      const lineamientos = pdfFalso(40_000);
      const res = await lider
        .mutar('post', `/lider/tareas/${tarea.t1}/adjuntos`)
        .attach('archivo', lineamientos, { filename: NOMBRE_ADJUNTO, contentType: 'application/pdf' })
        .expect(201);
      const adjunto = res.body as ArchivoCrm;
      // El nombre con tildes llega bien (busboy lo lee como latin1 y el servidor lo arregla).
      expect(adjunto).toMatchObject({ tipo: 'adjunto', nombre: NOMBRE_ADJUNTO, mime: 'application/pdf', bytes: 40_000 });
      expect(adjunto.url).toBe(`/api/crm/lider/tareas/${tarea.t1}/archivos/${adjunto.id}`);
      archivo.adjuntoT1 = adjunto.id;

      const texto = await lider
        .mutar('post', `/lider/tareas/${tarea.t1}/adjuntos`)
        .attach('archivo', Buffer.from('Notas de la reunión\n'), { filename: 'notas.txt', contentType: 'text/plain' })
        .expect(415);
      expect(texto.body).toMatchObject({ codigo: 'tipo_no_permitido', campos: { archivo: expect.any(String) } });
      const mentirosa = await lider
        .mutar('post', `/lider/tareas/${tarea.t1}/adjuntos`)
        .attach('archivo', pngFalso(40, 40), { filename: 'informe.pdf', contentType: 'application/pdf' })
        .expect(415);
      expect(mentirosa.body).toMatchObject({ codigo: 'tipo_no_permitido' });
      // Sin el token CSRF, o a una tarea que no existe, no se sube nada.
      await request(prueba.servidor)
        .post(`${RUTA}/lider/tareas/${tarea.t1}/adjuntos`)
        .set('Cookie', sesion.cookie)
        .attach('archivo', pdfFalso(), 'otro.pdf')
        .expect(403);
      await lider.mutar('post', '/lider/tareas/999999/adjuntos').attach('archivo', pdfFalso(), 'otro.pdf').expect(404);
      expect(await consultar('SELECT id FROM crm_tarea_archivos')).toHaveLength(1);

      const descarga = await lider
        .get(`/lider/tareas/${tarea.t1}/archivos/${adjunto.id}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      expect((descarga.body as Buffer).equals(lineamientos)).toBe(true);
      expect(descarga.headers['content-disposition']).toBe(
        `attachment; filename="Lineamientos de matricula 2026.pdf"; filename*=UTF-8''${encodeURIComponent(NOMBRE_ADJUNTO)}`,
      );
    });

    it('avisar: correo al responsable con el PDF adjunto y Reply-To del líder; el detalle trae `correos`', async () => {
      const antes = enMemoria().length;
      const res = await lider.mutar('post', `/lider/tareas/${tarea.t1}/avisar`).expect(200);
      const aviso = res.body as EstadoAvisoCrm;
      expect(aviso).toEqual({ correoId: expect.any(Number), estado: 'enviado', mensaje: 'Se le avisó a José por correo.' });
      expect(enMemoria()).toHaveLength(antes + 1);
      const correo = ultimoCorreo();
      expect(correo).toMatchObject({
        correoId: aviso.correoId,
        para: JOSE.correo,
        responderA: LIDER.correo,
        asunto: `Nueva tarea: ${TITULO_T1}`,
        adjuntos: [{ nombre: NOMBRE_ADJUNTO, mime: 'application/pdf', bytes: 40_000 }],
      });
      expect(correo?.texto).toContain(`${URL_SITIO}/crm/equipo/${id.jose}?tarea=${tarea.t1}`);
      expect(correo?.html).toContain(NOMBRE_ADJUNTO);

      const detalle = (await lider.get(`/lider/tareas/${tarea.t1}`).expect(200)).body as TareaDetalleCrm;
      expect(detalle).toMatchObject({ avisada: true, adjuntos: 1, archivos: [{ id: archivo.adjuntoT1, tipo: 'adjunto' }] });
      expect(detalle.eventos.map((e) => e.tipo)).toEqual(['aviso', 'adjunto', 'creada']);
      expect(detalle.eventos[0]).toMatchObject({ actor: 'lider', personaNombre: LIDER.nombre, detalle: JOSE.nombre });
      expect(detalle.correos).toEqual([
        {
          id: aviso.correoId,
          tareaId: tarea.t1,
          tareaTitulo: TITULO_T1,
          tipo: 'tarea_asignada',
          para: JOSE.correo,
          asunto: `Nueva tarea: ${TITULO_T1}`,
          estado: 'enviado',
          intentos: 1,
          error: null,
          adjuntos: 1,
          creadoEn: expect.any(String),
          enviadoEn: expect.any(String),
        },
      ]);
    });

    it('quitar un adjunto: 204 y evento; un contenido repetido se guarda una vez y sale del almacén con su último uso', async () => {
      const antes = await contar('crm_almacen_archivos');
      const anexo = pdfFalso(5_000);
      const subir = async (nombre: string): Promise<ArchivoCrm> =>
        (
          await lider
            .mutar('post', `/lider/tareas/${tarea.t1}/adjuntos`)
            .attach('archivo', anexo, { filename: nombre, contentType: 'application/pdf' })
            .expect(201)
        ).body as ArchivoCrm;
      const anexoA = await subir('Anexo A.pdf');
      const anexoB = await subir('Anexo B.pdf');
      expect(await contar('crm_almacen_archivos')).toBe(antes + 1);

      await lider.mutar('delete', `/lider/tareas/${tarea.t1}/adjuntos/${anexoA.id}`).expect(204);
      const detalle = (await lider.get(`/lider/tareas/${tarea.t1}`).expect(200)).body as TareaDetalleCrm;
      expect(detalle.eventos[0]).toMatchObject({ tipo: 'archivo_quitado', actor: 'lider', detalle: 'Anexo A.pdf' });
      expect(detalle.archivos.map((a) => a.id)).toEqual([archivo.adjuntoT1, anexoB.id]);
      // El otro, con el mismo contenido, sigue entero.
      const descarga = await lider
        .get(`/lider/tareas/${tarea.t1}/archivos/${anexoB.id}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      expect((descarga.body as Buffer).equals(anexo)).toBe(true);

      await lider.mutar('delete', `/lider/tareas/${tarea.t1}/adjuntos/${anexoB.id}`).expect(204);
      expect(await contar('crm_almacen_archivos')).toBe(antes);
      await lider.mutar('delete', `/lider/tareas/${tarea.t1}/adjuntos/${anexoB.id}`).expect(404);
      await lider.get(`/lider/tareas/${tarea.t1}/archivos/${anexoB.id}`).expect(404);
    });

    it('editar cambia solo lo que cambia (evento «editada»); sin datos o con una fecha inválida, 400', async () => {
      const res = await lider
        .mutar('patch', `/lider/tareas/${tarea.t1}`)
        .send({ titulo: TITULO_T1_EDITADO, requiereEntregable: true, responsableId: id.jose })
        .expect(200);
      const editada = res.body as TareaDetalleCrm;
      expect(editada).toMatchObject({ titulo: TITULO_T1_EDITADO, requiereEntregable: true, avisada: true });
      expect(editada.eventos[0]).toMatchObject({ tipo: 'editada', actor: 'lider', detalle: 'Cambió el título.' });
      // Lo mismo que ya tiene: no deja evento.
      const igual = await lider.mutar('patch', `/lider/tareas/${tarea.t1}`).send({ fechaLimite: '2099-06-30' }).expect(200);
      expect((igual.body as TareaDetalleCrm).eventos).toHaveLength(editada.eventos.length);
      await lider.mutar('patch', `/lider/tareas/${tarea.t1}`).send({}).expect(400);
      const fecha = await lider.mutar('patch', `/lider/tareas/${tarea.t1}`).send({ fechaLimite: '2026-13-01' }).expect(400);
      expect(fecha.body).toMatchObject({ campos: { fechaLimite: expect.any(String) } });
      await lider.mutar('patch', '/lider/tareas/999999').send({ titulo: 'Otra' }).expect(404);
    });

    it('reasignar deja el evento «reasignada» y quita la marca de avisada', async () => {
      const creada = await lider
        .mutar('post', '/lider/tareas')
        .send({ titulo: 'Revisar indicadores del PAI', responsableId: id.jose, fechaLimite: '2025-01-31' })
        .expect(201);
      expect(creada.body).toMatchObject({ vencida: true, requiereEntregable: false });
      tarea.t2 = (creada.body as TareaDetalleCrm).id;
      const adjunto = await lider
        .mutar('post', `/lider/tareas/${tarea.t2}/adjuntos`)
        .attach('archivo', grafica, { filename: 'grafica.png', contentType: 'image/png' })
        .expect(201);
      archivo.adjuntoT2 = (adjunto.body as ArchivoCrm).id;
      await lider.mutar('post', `/lider/tareas/${tarea.t2}/avisar`).expect(200);
      expect(ultimoCorreo()).toMatchObject({ para: JOSE.correo, adjuntos: [{ nombre: 'grafica.png', mime: 'image/png' }] });

      const res = await lider.mutar('patch', `/lider/tareas/${tarea.t2}`).send({ responsableId: id.carlos }).expect(200);
      const reasignada = res.body as TareaDetalleCrm;
      expect(reasignada).toMatchObject({
        responsable: { id: id.carlos, nombre: CARLOS_RENOMBRADO, iniciales: 'CA' },
        avisada: false,
      });
      expect(reasignada.eventos[0]).toMatchObject({ tipo: 'reasignada', actor: 'lider', detalle: CARLOS_RENOMBRADO });
      const nadie = await lider.mutar('patch', `/lider/tareas/${tarea.t2}`).send({ responsableId: 999_999 }).expect(400);
      expect(nadie.body).toMatchObject({ campos: { responsableId: expect.any(String) } });
    });

    it('una foto y un adjunto con el mismo contenido comparten el almacén: quitar la foto no borra el adjunto', async () => {
      const antes = await contar('crm_almacen_archivos');
      const puesta = await lider
        .mutar('put', `/lider/personas/${id.carlos}/foto`)
        .attach('archivo', grafica, { filename: 'carlos.png', contentType: 'image/png' })
        .expect(200);
      expect((puesta.body as PersonaAdminCrm).foto).toMatch(new RegExp(`^/api/crm/personas/${id.carlos}/foto\\?v=\\d+$`));
      expect(await contar('crm_almacen_archivos')).toBe(antes);
      await lider.mutar('delete', `/lider/personas/${id.carlos}/foto`).expect(200);
      expect(await contar('crm_almacen_archivos')).toBe(antes);
      const descarga = await lider
        .get(`/lider/tareas/${tarea.t2}/archivos/${archivo.adjuntoT2}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      expect((descarga.body as Buffer).equals(grafica)).toBe(true);
    });

    it('listar con filtros: responsable, q (título y descripción), estado y terminadas', async () => {
      // La vencida primero (por fecha límite).
      expect(await idsTareasLider('')).toEqual([tarea.t2, tarea.t1]);
      expect(await idsTareasLider(`?responsable=${id.jose}`)).toEqual([tarea.t1]);
      expect(await idsTareasLider(`?responsable=${id.carlos}`)).toEqual([tarea.t2]);
      expect(await idsTareasLider(`?q=${encodeURIComponent('MATRÍCULA')}`)).toEqual([tarea.t1]);
      expect(await idsTareasLider(`?q=${encodeURIComponent('deserción')}`)).toEqual([tarea.t1]);
      expect(await idsTareasLider(`?q=${encodeURIComponent('100%_')}`)).toEqual([]);
      expect(await idsTareasLider('?estado=pendiente&terminadas=todas')).toEqual([tarea.t2, tarea.t1]);
      expect(await idsTareasLider('?estado=terminada')).toEqual([]);
      const lista = (await lider.get('/lider/tareas').expect(200)).body as TareaCrm[];
      expect(lista[0]).toMatchObject({
        id: tarea.t2,
        vencida: true,
        adjuntos: 1,
        entregables: 0,
        responsable: { id: id.carlos },
      });
      const malo = await lider.get('/lider/tareas?estado=cerrada&responsable=abc').expect(400);
      expect(malo.body).toMatchObject({
        codigo: 'solicitud_invalida',
        campos: { estado: expect.any(String), responsable: expect.any(String) },
      });
    });

    it('DELETE oculta la tarea: después es 404 para el líder y para el equipo', async () => {
      const creada = await lider
        .mutar('post', '/lider/tareas')
        .send({ titulo: 'Tarea para borrar', responsableId: id.jose })
        .expect(201);
      tarea.t3 = (creada.body as TareaDetalleCrm).id;
      await lider.mutar('delete', `/lider/tareas/${tarea.t3}`).expect(204);
      const borrada = await lider.get(`/lider/tareas/${tarea.t3}`).expect(404);
      expect(borrada.body).toEqual({ codigo: 'no_encontrado', mensaje: 'La tarea no existe.' });
      await equipo.get(`/personas/${id.jose}/tareas/${tarea.t3}`).expect(404);
      await equipo.mutar('post', `/personas/${id.jose}/tareas/${tarea.t3}/estado`).send({ estado: 'en_proceso' }).expect(404);
      await lider.mutar('post', `/lider/tareas/${tarea.t3}/avisar`).expect(404);
      await lider.mutar('patch', `/lider/tareas/${tarea.t3}`).send({ titulo: 'Otra' }).expect(404);
      await lider.mutar('delete', `/lider/tareas/${tarea.t3}`).expect(404);
      const lista = (await lider.get('/lider/tareas?terminadas=todas').expect(200)).body as TareaCrm[];
      expect(lista.map((t) => t.id)).not.toContain(tarea.t3);
      const tablero = (await equipo.get(`/personas/${id.jose}/tareas?terminadas=todas`).expect(200))
        .body as TableroPersonaCrm;
      expect(tablero.tareas.map((t) => t.id)).not.toContain(tarea.t3);
      // Sigue en la base, solo marcada.
      const [fila] = await consultar('SELECT eliminada_en FROM crm_tareas WHERE id = ?', [tarea.t3]);
      expect(fila?.eliminada_en).not.toBeNull();
    });
  });

  // ── 4. Tablero del equipo ─────────────────────────────────────────────────

  describe('tablero del equipo', () => {
    it('el tablero de la persona trae sus tareas y su conteo, sin correos', async () => {
      const res = await equipo.get(`/personas/${id.jose}/tareas`).expect(200);
      const tablero = res.body as TableroPersonaCrm;
      expect(tablero.persona).toEqual({
        id: id.jose,
        nombre: JOSE.nombre,
        iniciales: 'JR',
        esLider: false,
        foto: null,
        conteo: { ...CONTEO_VACIO, pendientes: 1 },
      });
      expect(tablero.tareas.map((t) => t.id)).toEqual([tarea.t1]);
      expect(tablero.tareas[0]).toMatchObject({ estado: 'pendiente', adjuntos: 1, requiereEntregable: true });
      expect(JSON.stringify(res.body)).not.toContain('@');

      const deCarlos = (await equipo.get(`/personas/${id.carlos}/tareas`).expect(200)).body as TableroPersonaCrm;
      expect(deCarlos.tareas.map((t) => [t.id, t.vencida])).toEqual([[tarea.t2, true]]);
      expect(deCarlos.persona.conteo).toEqual({ ...CONTEO_VACIO, pendientes: 1, vencidas: 1 });
      await equipo.get('/personas/999999/tareas').expect(404);
      await equipo.get(`/personas/${id.jose}/tareas?terminadas=algunas`).expect(400);
    });

    it('el detalle de una tarea ajena es 404; el de la suya trae las rutas del equipo y no los correos', async () => {
      const ajena = await equipo.get(`/personas/${id.jose}/tareas/${tarea.t2}`).expect(404);
      expect(ajena.body).toEqual({ codigo: 'no_encontrado', mensaje: 'La tarea no existe.' });
      await equipo.get(`/personas/${id.carlos}/tareas/${tarea.t1}`).expect(404);

      const res = await equipo.get(`/personas/${id.jose}/tareas/${tarea.t1}`).expect(200);
      const detalle = res.body as TareaDetalleCrm;
      expect(detalle.archivos).toEqual([
        expect.objectContaining({
          id: archivo.adjuntoT1,
          url: `/api/crm/personas/${id.jose}/tareas/${tarea.t1}/archivos/${archivo.adjuntoT1}`,
        }),
      ]);
      expect(detalle).not.toHaveProperty('correos');
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    it('pasa a en_proceso desde el mismo sitio (Sec-Fetch-Site u Origin igual al Host); de otro sitio, 403', async () => {
      const ruta = `/personas/${id.jose}/tareas/${tarea.t1}/estado`;
      const res = await equipo.mutar('post', ruta).send({ estado: 'en_proceso' }).expect(200);
      const enProceso = res.body as TareaDetalleCrm;
      expect(enProceso.estado).toBe('en_proceso');
      expect(enProceso).not.toHaveProperty('correos');
      expect(enProceso.eventos[0]).toMatchObject({
        tipo: 'estado',
        actor: 'responsable',
        personaNombre: JOSE.nombre,
        deEstado: 'pendiente',
        aEstado: 'en_proceso',
      });
      // Pedir el mismo estado no deja otro evento.
      const igual = await equipo.mutar('post', ruta).send({ estado: 'en_proceso' }).expect(200);
      expect((igual.body as TareaDetalleCrm).eventos).toHaveLength(enProceso.eventos.length);

      // Un navegador sin Sec-Fetch-Site: Origin igual al Host.
      const pendiente = await request(prueba.servidor)
        .post(`${RUTA}${ruta}`)
        .set('Host', 'crm.sapiencia.test')
        .set('Origin', 'http://crm.sapiencia.test')
        .send({ estado: 'pendiente' })
        .expect(200);
      expect(pendiente.body).toMatchObject({ estado: 'pendiente' });

      const ajena = await request(prueba.servidor)
        .post(`${RUTA}${ruta}`)
        .set('Origin', OTRO_SITIO)
        .send({ estado: 'en_proceso' })
        .expect(403);
      expect(ajena.body).toEqual({ codigo: 'prohibido', mensaje: 'Solicitud de otro sitio rechazada.' });
      await request(prueba.servidor)
        .post(`${RUTA}${ruta}`)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ estado: 'en_proceso' })
        .expect(403);
      // «terminada» no se pide por aquí, y la tarea ajena es 404.
      await equipo.mutar('post', ruta).send({ estado: 'terminada' }).expect(400);
      await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t2}/estado`)
        .send({ estado: 'en_proceso' })
        .expect(404);

      const final = await equipo.mutar('post', ruta).send({ estado: 'en_proceso' }).expect(200);
      expect(final.body).toMatchObject({ estado: 'en_proceso' });
    });

    it('terminar sin el entregable que pidió el líder es 400 con campos.entregable', async () => {
      const res = await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t1}/terminar`)
        .send({ nota: 'Listo.' })
        .expect(400);
      expect(res.body).toEqual({
        codigo: 'solicitud_invalida',
        mensaje: FALTA_ENTREGABLE,
        campos: { entregable: FALTA_ENTREGABLE },
      });
      const detalle = (await equipo.get(`/personas/${id.jose}/tareas/${tarea.t1}`).expect(200)).body as TareaDetalleCrm;
      expect(detalle.estado).toBe('en_proceso');
    });

    it('sube un entregable (201), lo quita y sube otro; desde otro sitio o a una tarea ajena, no', async () => {
      const rutaEntregables = `/personas/${id.jose}/tareas/${tarea.t1}/entregables`;
      const primero = await equipo
        .mutar('post', rutaEntregables)
        .attach('archivo', pdfFalso(25_000), { filename: 'Informe final.pdf', contentType: 'application/pdf' })
        .expect(201);
      const subido = primero.body as ArchivoCrm;
      expect(subido).toMatchObject({
        tipo: 'entregable',
        nombre: 'Informe final.pdf',
        mime: 'application/pdf',
        bytes: 25_000,
        url: `/api/crm/personas/${id.jose}/tareas/${tarea.t1}/archivos/${subido.id}`,
      });

      await equipo.mutar('delete', `${rutaEntregables}/${subido.id}`).expect(204);
      const sinEntregable = (await equipo.get(`/personas/${id.jose}/tareas/${tarea.t1}`).expect(200))
        .body as TareaDetalleCrm;
      expect(sinEntregable.entregables).toBe(0);
      expect(sinEntregable.eventos[0]).toMatchObject({
        tipo: 'archivo_quitado',
        actor: 'responsable',
        detalle: 'Informe final.pdf',
      });
      await equipo.mutar('delete', `${rutaEntregables}/${subido.id}`).expect(404);
      // El adjunto del líder no se quita por la ruta de los entregables.
      await equipo.mutar('delete', `${rutaEntregables}/${archivo.adjuntoT1}`).expect(404);

      informeFinal = pdfFalso(30_000);
      const segundo = await equipo
        .mutar('post', rutaEntregables)
        .attach('archivo', informeFinal, { filename: 'Informe final v2.pdf', contentType: 'application/pdf' })
        .expect(201);
      archivo.entregableT1 = (segundo.body as ArchivoCrm).id;

      const ajeno = await request(prueba.servidor)
        .post(`${RUTA}${rutaEntregables}`)
        .set('Sec-Fetch-Site', 'cross-site')
        .attach('archivo', pdfFalso(), 'otro.pdf')
        .expect(403);
      expect(ajeno.body).toMatchObject({ codigo: 'prohibido' });
      await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t2}/entregables`)
        .attach('archivo', pdfFalso(), 'otro.pdf')
        .expect(404);
      // Otra persona no quita el entregable de José.
      await equipo
        .mutar('delete', `/personas/${id.carlos}/tareas/${tarea.t1}/entregables/${archivo.entregableT1}`)
        .expect(404);
      const entregables = await consultar("SELECT id FROM crm_tarea_archivos WHERE tipo = 'entregable'");
      expect(entregables.map((f) => Number(f.id))).toEqual([archivo.entregableT1]);
    });

    it('descarga los archivos de su tarea (attachment); los de otra tarea son 404', async () => {
      const propio = await equipo
        .get(`/personas/${id.jose}/tareas/${tarea.t1}/archivos/${archivo.entregableT1}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      expect((propio.body as Buffer).equals(informeFinal)).toBe(true);
      expect(propio.headers['content-type']).toBe('application/pdf');
      expect(propio.headers['content-disposition']).toMatch(/^attachment; filename="Informe final v2\.pdf"/);
      expect(propio.headers['cache-control']).toBe('private, no-cache');
      // El adjunto del líder, también.
      await equipo
        .get(`/personas/${id.jose}/tareas/${tarea.t1}/archivos/${archivo.adjuntoT1}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);

      // El archivo de otra tarea, no: ni por la tarea propia ni por la ajena.
      const otro = await equipo.get(`/personas/${id.jose}/tareas/${tarea.t1}/archivos/${archivo.adjuntoT2}`).expect(404);
      expect(otro.body).toEqual({ codigo: 'no_encontrado', mensaje: 'El archivo no existe.' });
      await equipo.get(`/personas/${id.jose}/tareas/${tarea.t2}/archivos/${archivo.adjuntoT2}`).expect(404);
      // Su responsable sí lo descarga, y el líder descarga el entregable.
      await equipo
        .get(`/personas/${id.carlos}/tareas/${tarea.t2}/archivos/${archivo.adjuntoT2}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      await lider
        .get(`/lider/tareas/${tarea.t1}/archivos/${archivo.entregableT1}`)
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
    });

    it('terminar con nota: 200 y correo al líder con el entregable adjunto y Reply-To del responsable', async () => {
      const antes = enMemoria().length;
      const nota = 'Quedó también en la carpeta compartida.';
      const res = await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t1}/terminar`)
        .send({ nota })
        .expect(200);
      const resultado = res.body as ResultadoTerminarCrm;
      expect(resultado.tarea).toMatchObject({
        estado: 'terminada',
        notaCierre: nota,
        terminadaEn: expect.any(String),
        entregables: 1,
      });
      expect(resultado.tarea).not.toHaveProperty('correos');
      expect(resultado.tarea.eventos[0]).toMatchObject({
        tipo: 'terminada',
        actor: 'responsable',
        deEstado: 'en_proceso',
        aEstado: 'terminada',
      });
      expect(resultado.aviso).toEqual({
        correoId: expect.any(Number),
        estado: 'enviado',
        mensaje: 'Se le avisó a Luciana por correo.',
      });

      expect(enMemoria()).toHaveLength(antes + 1);
      const correo = ultimoCorreo();
      expect(correo).toMatchObject({
        correoId: resultado.aviso.correoId,
        para: LIDER.correo,
        responderA: JOSE.correo,
        asunto: `Tarea terminada: ${TITULO_T1_EDITADO} (${JOSE.nombre})`,
        adjuntos: [{ nombre: 'Informe final v2.pdf', mime: 'application/pdf', bytes: 30_000 }],
      });
      expect(correo?.texto).toContain(nota);
      expect(correo?.texto).toContain(`${URL_SITIO}/crm/lider/tareas/${tarea.t1}`);
    });

    it('una tarea terminada ya no cambia: estado, entregables y terminar dan 409', async () => {
      const rutaTarea = `/personas/${id.jose}/tareas/${tarea.t1}`;
      const estado = await equipo.mutar('post', `${rutaTarea}/estado`).send({ estado: 'en_proceso' }).expect(409);
      expect(estado.body).toEqual({ codigo: 'conflicto', mensaje: TAREA_TERMINADA_EQUIPO });
      const subida = await equipo
        .mutar('post', `${rutaTarea}/entregables`)
        .attach('archivo', pdfFalso(), 'otro.pdf')
        .expect(409);
      expect(subida.body).toMatchObject({ codigo: 'conflicto' });
      await equipo.mutar('delete', `${rutaTarea}/entregables/${archivo.entregableT1}`).expect(409);
      await equipo.mutar('post', `${rutaTarea}/terminar`).send({}).expect(409);

      const personas = (await equipo.get('/personas').expect(200)).body as PersonaCrm[];
      expect(personas.find((p) => p.id === id.jose)?.conteo).toEqual({ ...CONTEO_VACIO, terminadasRecientes: 1 });
      // El tablero, por defecto, muestra las terminadas recientes.
      const tablero = (await equipo.get(`/personas/${id.jose}/tareas`).expect(200)).body as TableroPersonaCrm;
      expect(tablero.tareas.map((t) => [t.id, t.estado])).toEqual([[tarea.t1, 'terminada']]);
      // El líder no reasigna una tarea terminada.
      const reasignar = await lider
        .mutar('patch', `/lider/tareas/${tarea.t1}`)
        .send({ responsableId: id.carlos })
        .expect(409);
      expect(reasignar.body).toMatchObject({ codigo: 'conflicto' });
    });
  });

  // ── 5. Devolver ───────────────────────────────────────────────────────────

  describe('devolver (líder)', () => {
    it('una terminada vuelve a en_proceso con la observación, y se le avisa al responsable', async () => {
      const vacia = await lider.mutar('post', `/lider/tareas/${tarea.t1}/devolver`).send({ observacion: '  ' }).expect(400);
      expect(vacia.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { observacion: expect.any(String) } });

      const observacion = 'Falta la tabla de deserción por IES.';
      const res = await lider.mutar('post', `/lider/tareas/${tarea.t1}/devolver`).send({ observacion }).expect(200);
      const resultado = res.body as ResultadoDevolverCrm;
      expect(resultado.tarea).toMatchObject({ estado: 'en_proceso', terminadaEn: null });
      expect(resultado.tarea.eventos[0]).toMatchObject({
        tipo: 'devuelta',
        actor: 'lider',
        personaNombre: LIDER.nombre,
        deEstado: 'terminada',
        aEstado: 'en_proceso',
        detalle: observacion,
      });
      expect(resultado.tarea.correos?.[0]).toMatchObject({ tipo: 'tarea_devuelta', estado: 'enviado', para: JOSE.correo });
      expect(resultado.aviso).toEqual({
        correoId: expect.any(Number),
        estado: 'enviado',
        mensaje: 'Se le avisó a José por correo.',
      });
      const correo = ultimoCorreo();
      expect(correo).toMatchObject({
        correoId: resultado.aviso.correoId,
        para: JOSE.correo,
        responderA: LIDER.correo,
        asunto: `Tarea devuelta: ${TITULO_T1_EDITADO}`,
        adjuntos: [],
      });
      expect(correo?.texto).toContain(observacion);

      const detalle = (await equipo.get(`/personas/${id.jose}/tareas/${tarea.t1}`).expect(200)).body as TareaDetalleCrm;
      expect(detalle.estado).toBe('en_proceso');
    });

    it('devolver una tarea que no está terminada es 409', async () => {
      const res = await lider
        .mutar('post', `/lider/tareas/${tarea.t1}/devolver`)
        .send({ observacion: 'Otra vez.' })
        .expect(409);
      expect(res.body).toEqual({ codigo: 'conflicto', mensaje: 'Solo se puede devolver una tarea terminada.' });
      await lider.mutar('post', `/lider/tareas/${tarea.t2}/devolver`).send({ observacion: 'Otra vez.' }).expect(409);
      await lider.mutar('post', '/lider/tareas/999999/devolver').send({ observacion: 'Otra vez.' }).expect(404);
    });
  });

  // ── 6. Bandeja de correos ─────────────────────────────────────────────────

  describe('bandeja de correos', () => {
    it('lista los correos (los más recientes primero) y los filtra por estado', async () => {
      const correos = (await lider.get('/lider/correos').expect(200)).body as CorreoCrm[];
      expect(correos.map((c) => [c.tipo, c.tareaId, c.estado])).toEqual([
        ['tarea_devuelta', tarea.t1, 'enviado'],
        ['tarea_terminada', tarea.t1, 'enviado'],
        ['tarea_asignada', tarea.t2, 'enviado'],
        ['tarea_asignada', tarea.t1, 'enviado'],
      ]);
      expect(correos[1]).toMatchObject({ para: LIDER.correo, tareaTitulo: TITULO_T1_EDITADO, adjuntos: 1, intentos: 1, error: null });
      expect((await lider.get('/lider/correos?estado=enviado').expect(200)).body).toHaveLength(4);
      expect((await lider.get('/lider/correos?estado=error').expect(200)).body).toEqual([]);
      const malo = await lider.get('/lider/correos?estado=perdido').expect(400);
      expect(malo.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { estado: expect.any(String) } });
    });

    it('reintentar un correo ya enviado es 409; uno que no existe, 404', async () => {
      const [primero] = (await lider.get('/lider/correos').expect(200)).body as CorreoCrm[];
      const res = await lider.mutar('post', `/lider/correos/${primero!.id}/reintentar`).expect(409);
      expect(res.body).toEqual({ codigo: 'conflicto', mensaje: 'Ese correo ya se envió.' });
      await lider.mutar('post', '/lider/correos/999999/reintentar').expect(404);
      await request(prueba.servidor)
        .post(`${RUTA}/lider/correos/${primero!.id}/reintentar`)
        .set('Cookie', sesion.cookie)
        .expect(403);
    });

    describe('con el correo desactivado (otra app sobre la misma base)', () => {
      let sinCorreo: AppPrueba;
      let correoTerminada = 0;

      beforeAll(async () => {
        sinCorreo = await crearAppRepositorio(base.config, dist.directorio, {}, [
          { proveedor: CONFIGURACION_CORREO_CRM, valor: CORREO_DESACTIVADO },
        ]);
      });

      afterAll(async () => {
        await sinCorreo?.cerrar();
      });

      it('terminar deja el correo «sin configurar» (la tarea sí termina) y el resumen del líder lo cuenta', async () => {
        const res = await equipo
          .mutar('post', `/personas/${id.jose}/tareas/${tarea.t1}/terminar`, sinCorreo)
          .send({ nota: null })
          .expect(200);
        const resultado = res.body as ResultadoTerminarCrm;
        expect(resultado.tarea).toMatchObject({ estado: 'terminada', notaCierre: null });
        expect(resultado.aviso).toEqual({
          correoId: expect.any(Number),
          estado: 'sin_configurar',
          mensaje: `La tarea quedó terminada. ${MENSAJE_CORREO_SIN_CONFIGURAR}`,
        });
        correoTerminada = resultado.aviso.correoId!;
        const [fila] = await consultar('SELECT estado, intentos, para, responder_a FROM crm_correos WHERE id = ?', [
          correoTerminada,
        ]);
        expect(fila).toMatchObject({ estado: 'sin_configurar', para: LIDER.correo, responder_a: JOSE.correo });
        expect(Number(fila?.intentos)).toBe(0);

        // La sesión vive en la base: la misma cookie sirve en la otra app.
        const resumen = (await lider.get('/lider/resumen', sinCorreo).expect(200)).body as ResumenLiderCrm;
        expect(resumen.correo).toEqual({ configurado: false, pendientes: 1, errores: 0 });
        expect(resumen.totales).toEqual({ pendientes: 1, enProceso: 0, terminadasRecientes: 1, vencidas: 1 });
        expect(resumen.personas.map((p) => p.id)).toEqual([id.lider, id.jose, id.carlos]);
        expect(JSON.stringify(resumen)).not.toContain('@');
        const pendientes = (await lider.get('/lider/correos?estado=sin_configurar', sinCorreo).expect(200))
          .body as CorreoCrm[];
        expect(pendientes.map((c) => c.id)).toEqual([correoTerminada]);

        // Reintentarlo sin cuenta lo deja igual, y avisar también queda guardado.
        const reintento = await lider.mutar('post', `/lider/correos/${correoTerminada}/reintentar`, sinCorreo).expect(200);
        expect(reintento.body).toMatchObject({ id: correoTerminada, estado: 'sin_configurar', intentos: 0 });
        const aviso = await lider.mutar('post', `/lider/tareas/${tarea.t2}/avisar`, sinCorreo).expect(200);
        expect(aviso.body).toMatchObject({ estado: 'sin_configurar', mensaje: MENSAJE_CORREO_SIN_CONFIGURAR });
        // La tarea 2 se reasignó: el aviso es para Carlos, con el enlace del origen de la petición.
        const [correoT2] = await consultar('SELECT para, cuerpo_texto FROM crm_correos WHERE id = ?', [
          (aviso.body as EstadoAvisoCrm).correoId,
        ]);
        expect(correoT2?.para).toBe(CARLOS.correo);
        expect(String(correoT2?.cuerpo_texto)).toMatch(
          new RegExp(`http://127\\.0\\.0\\.1:\\d+/crm/equipo/${id.carlos}\\?tarea=${tarea.t2}`),
        );
        const despues = (await lider.get('/lider/resumen', sinCorreo).expect(200)).body as ResumenLiderCrm;
        expect(despues.correo).toEqual({ configurado: false, pendientes: 2, errores: 0 });
      });

      it('con correo, reintentar envía el que quedó sin configurar, con su adjunto', async () => {
        const antes = (await lider.get('/lider/resumen').expect(200)).body as ResumenLiderCrm;
        expect(antes.correo).toEqual({ configurado: true, pendientes: 2, errores: 0 });
        const res = await lider.mutar('post', `/lider/correos/${correoTerminada}/reintentar`).expect(200);
        expect(res.body).toMatchObject({
          id: correoTerminada,
          tipo: 'tarea_terminada',
          estado: 'enviado',
          intentos: 1,
          error: null,
          enviadoEn: expect.any(String),
        });
        expect(ultimoCorreo()).toMatchObject({
          correoId: correoTerminada,
          para: LIDER.correo,
          responderA: JOSE.correo,
          adjuntos: [{ nombre: 'Informe final v2.pdf', bytes: 30_000 }],
        });
        const despues = (await lider.get('/lider/resumen').expect(200)).body as ResumenLiderCrm;
        expect(despues.correo).toEqual({ configurado: true, pendientes: 1, errores: 0 });
      });
    });
  });

  // ── 7. Doble clic y terminadas antiguas ───────────────────────────────────

  describe('doble clic en «Terminar»', () => {
    it('dos peticiones a la vez: una termina la tarea (200), la otra es 409 y sale un solo correo', async () => {
      const creada = await lider
        .mutar('post', '/lider/tareas')
        .send({ titulo: 'Tarea del doble clic', responsableId: id.jose })
        .expect(201);
      tarea.t5 = (creada.body as TareaDetalleCrm).id;
      const antes = enMemoria().length;
      const ruta = `/personas/${id.jose}/tareas/${tarea.t5}/terminar`;
      const respuestas = await Promise.all([
        equipo.mutar('post', ruta).send({ nota: 'Primero' }),
        equipo.mutar('post', ruta).send({ nota: 'Segundo' }),
      ]);
      expect(respuestas.map((r) => r.status).toSorted()).toEqual([200, 409]);
      expect(enMemoria()).toHaveLength(antes + 1);
      const correos = await consultar("SELECT id FROM crm_correos WHERE tarea_id = ? AND tipo = 'tarea_terminada'", [
        tarea.t5,
      ]);
      expect(correos).toHaveLength(1);
      const eventos = await consultar("SELECT id FROM crm_tarea_eventos WHERE tarea_id = ? AND tipo = 'terminada'", [
        tarea.t5,
      ]);
      expect(eventos).toHaveLength(1);
    });
  });

  describe('terminadas de hace más de 30 días', () => {
    it('no salen en el tablero ni en la lista del líder por defecto; sí con terminadas=todas', async () => {
      await base.admin.query('UPDATE crm_tareas SET terminada_en = ? WHERE id = ?', [
        new Date(Date.now() - 40 * 86_400_000),
        tarea.t5,
      ]);
      const recientes = (await equipo.get(`/personas/${id.jose}/tareas`).expect(200)).body as TableroPersonaCrm;
      expect(recientes.tareas.map((t) => t.id)).toEqual([tarea.t1]);
      expect(recientes.persona.conteo).toEqual({ ...CONTEO_VACIO, terminadasRecientes: 1 });
      const todas = (await equipo.get(`/personas/${id.jose}/tareas?terminadas=todas`).expect(200))
        .body as TableroPersonaCrm;
      // Las terminadas, de la más reciente a la más antigua.
      expect(todas.tareas.map((t) => t.id)).toEqual([tarea.t1, tarea.t5]);
      expect(await idsTareasLider(`?responsable=${id.jose}`)).toEqual([tarea.t1]);
      expect(await idsTareasLider(`?responsable=${id.jose}&terminadas=todas`)).toEqual(
        expect.arrayContaining([tarea.t1, tarea.t5]),
      );
    });
  });

  // ── 8. Tope por IP del equipo ─────────────────────────────────────────────

  describe('tope por IP del equipo', () => {
    /** La IP (clave) con la que el servidor anota los cambios de estas pruebas. */
    let ip = '';

    beforeAll(async () => {
      const [fila] = await consultar(
        "SELECT ip FROM crm_tarea_eventos WHERE actor = 'responsable' ORDER BY id DESC LIMIT 1",
      );
      ip = String(fila?.ip ?? '');
      const creada = await lider
        .mutar('post', '/lider/tareas')
        .send({ titulo: 'Tarea para el tope', responsableId: id.jose })
        .expect(201);
      tarea.t4 = (creada.body as TareaDetalleCrm).id;
    });

    afterAll(async () => {
      await base?.admin.query('DELETE FROM crm_tarea_eventos WHERE detalle = ?', [MARCA_TOPE]);
    });

    it('los cambios de otra IP o de hace más de una hora no cuentan', async () => {
      expect(ip).not.toBe('');
      await insertarEventos(TOPE_CAMBIOS_POR_HORA, 'estado', '203.0.113.9', new Date());
      await insertarEventos(TOPE_CAMBIOS_POR_HORA, 'estado', ip, new Date(Date.now() - 2 * 3_600_000));
      const res = await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t4}/estado`)
        .send({ estado: 'en_proceso' })
        .expect(200);
      expect(res.body).toMatchObject({ estado: 'en_proceso' });
    });

    it(`con ${TOPE_SUBIDAS_POR_HORA} entregables en la última hora desde la IP, otra subida es 429 (los demás cambios siguen)`, async () => {
      await insertarEventos(TOPE_SUBIDAS_POR_HORA, 'entregable', ip, new Date(Date.now() - 10 * 60_000));
      const res = await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t4}/entregables`)
        .attach('archivo', pdfFalso(), 'informe.pdf')
        .expect(429);
      expect(res.body).toMatchObject({ codigo: 'demasiados_intentos' });
      // Hasta que el más viejo de la ventana cumpla la hora: unos 50 minutos.
      const espera = Number(res.headers['retry-after']);
      expect(espera).toBeGreaterThan(2900);
      expect(espera).toBeLessThanOrEqual(3000);
      await equipo
        .mutar('post', `/personas/${id.jose}/tareas/${tarea.t4}/estado`)
        .send({ estado: 'pendiente' })
        .expect(200);
    });

    it(`con ${TOPE_CAMBIOS_POR_HORA} cambios en la última hora desde la IP, todo cambio es 429 con Retry-After`, async () => {
      const rutaTarea = `/personas/${id.jose}/tareas/${tarea.t4}`;
      await insertarEventos(TOPE_CAMBIOS_POR_HORA, 'estado', ip, new Date(Date.now() - 5 * 60_000));
      const estado = await equipo.mutar('post', `${rutaTarea}/estado`).send({ estado: 'en_proceso' }).expect(429);
      expect(estado.body).toMatchObject({ codigo: 'demasiados_intentos' });
      const espera = Number(estado.headers['retry-after']);
      expect(espera).toBeGreaterThan(0);
      expect(espera).toBeLessThanOrEqual(3600);
      await equipo.mutar('post', `${rutaTarea}/terminar`).send({}).expect(429);
      await equipo.mutar('delete', `${rutaTarea}/entregables/1`).expect(429);
      // Ver no cuenta.
      await equipo.get(`/personas/${id.jose}/tareas`).expect(200);

      // Fuera de la ventana (aquí: sin esos eventos), vuelve a funcionar.
      await base.admin.query('DELETE FROM crm_tarea_eventos WHERE detalle = ?', [MARCA_TOPE]);
      const libre = await equipo.mutar('post', `${rutaTarea}/estado`).send({ estado: 'en_proceso' }).expect(200);
      expect(libre.body).toMatchObject({ estado: 'en_proceso' });
    });
  });

  // ── 9. Cupo de entregables y correo con archivos grandes ──────────────────

  describe('cupo de entregables y correo con archivos grandes', () => {
    it('máximo 5 entregables (el sexto es 409); al terminar, los que no caben en 18 MB van como enlace', async () => {
      const MB = 1024 * 1024;
      const rutaTarea = `/personas/${id.jose}/tareas/${tarea.t4}`;
      const archivos = [
        { nombre: 'Parte 1.pdf', bytes: 5 * MB },
        { nombre: 'Parte 2.pdf', bytes: 5 * MB },
        { nombre: 'Parte 3.pdf', bytes: 5 * MB },
        { nombre: 'Parte 4.pdf', bytes: 5 * MB },
        { nombre: 'Resumen.pdf', bytes: 100_000 },
      ];
      for (const { nombre, bytes } of archivos) {
        await equipo
          .mutar('post', `${rutaTarea}/entregables`)
          .attach('archivo', pdfFalso(bytes), { filename: nombre, contentType: 'application/pdf' })
          .expect(201);
      }
      const sexto = await equipo
        .mutar('post', `${rutaTarea}/entregables`)
        .attach('archivo', pdfFalso(), 'Otro.pdf')
        .expect(409);
      expect(sexto.body).toEqual({
        codigo: 'conflicto',
        mensaje: `La tarea ya tiene ${LIMITES_CRM.maxEntregables} documentos entregados: quite uno para subir otro.`,
      });

      const res = await equipo.mutar('post', `${rutaTarea}/terminar`).send({}).expect(200);
      const { aviso } = res.body as ResultadoTerminarCrm;
      expect(aviso.estado).toBe('enviado');
      // En el orden en que se subieron, mientras quepan en 18 MB; el que no cabe va como enlace.
      const correo = ultimoCorreo();
      expect(correo?.correoId).toBe(aviso.correoId);
      expect(correo?.adjuntos.map((a) => [a.nombre, a.bytes])).toEqual([
        ['Parte 1.pdf', 5 * MB],
        ['Parte 2.pdf', 5 * MB],
        ['Parte 3.pdf', 5 * MB],
        ['Resumen.pdf', 100_000],
      ]);
      expect(correo?.texto).toContain('- Parte 4.pdf (5 MB): descárguelo en el CRM.');
      const [ultimo] = (await lider.get('/lider/correos').expect(200)).body as CorreoCrm[];
      expect(ultimo).toMatchObject({ id: aviso.correoId, tipo: 'tarea_terminada', adjuntos: 4, estado: 'enviado' });
    }, 60_000);
  });

  // ── 9b. Cuenta de correo guardada por el líder ─────────────────────────────

  describe('cuenta de correo guardada por el líder', () => {
    const CUENTA = { usuario: 'planeacion.crm@gmail.com', clave: 'abcd efgh ijkl mnop' };
    const CLAVE_SIN_ESPACIOS = 'abcdefghijklmnop';
    /** Lo que recibió el transporte smtp falso: con qué configuración salió cada correo. */
    const salidos: { config: ConfiguracionCorreoCrm; correo: CorreoSalienteCrm }[] = [];
    let fallo: unknown = null;
    const fabricaFalsa: FabricaTransporteCrm = (config, alArmar) =>
      config.modo !== 'smtp'
        ? crearTransporteCrm(config, alArmar)
        : {
            enviar(correo) {
              if (fallo) return Promise.reject(fallo);
              salidos.push({ config, correo });
              return Promise.resolve({ idMensaje: `<falso-${salidos.length}@smtp.test>` });
            },
          };
    /** Otra app sobre la misma base, sin variables de correo (modo desactivado) y con el transporte falso. */
    let conBase: AppPrueba;
    const cuenta = {
      get: () => lider.get('/lider/correo/cuenta', conBase),
      put: () => lider.mutar('put', '/lider/correo/cuenta', conBase),
      prueba: () => lider.mutar('post', '/lider/correo/prueba', conBase),
    };

    beforeAll(async () => {
      conBase = await crearAppRepositorio(base.config, dist.directorio, {}, [
        { proveedor: CONFIGURACION_CORREO_CRM, valor: CORREO_DESACTIVADO },
        { proveedor: FABRICA_TRANSPORTE_CORREO_CRM, valor: fabricaFalsa },
      ]);
    });

    afterAll(async () => {
      await conBase?.cerrar();
    });

    it('con las variables (modo memoria) mandan ellas: origen «variables», no editable, y PUT y DELETE son 409', async () => {
      const actual = (await lider.get('/lider/correo/cuenta').expect(200)).body as CuentaCorreoCrm;
      expect(actual).toMatchObject({ origen: 'variables', modo: 'memoria', editable: false, tieneClave: false });
      const res = await lider.mutar('put', '/lider/correo/cuenta').send(CUENTA).expect(409);
      expect(res.body).toEqual({ codigo: 'conflicto', mensaje: MENSAJE_MANDAN_VARIABLES });
      await lider.mutar('delete', '/lider/correo/cuenta').expect(409);
      expect(await contar('crm_correo_cuenta')).toBe(0);
    });

    it('sin variables: PUT valida, guarda la cuenta y ni PUT ni GET devuelven la clave', async () => {
      const antes = (await lider.get('/lider/resumen', conBase).expect(200)).body as ResumenLiderCrm;
      expect(antes.correo.configurado).toBe(false);
      expect((await cuenta.get().expect(200)).body).toMatchObject({
        origen: 'ninguna',
        modo: 'desactivado',
        editable: true,
        tieneClave: false,
      });

      const sinClave = await cuenta.put().send({ usuario: CUENTA.usuario }).expect(400);
      expect(sinClave.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { clave: MENSAJE_CLAVE_FALTA } });
      const sinHost = await cuenta.put().send({ usuario: 'planeacion@sapiencia.gov.co', clave: CUENTA.clave }).expect(400);
      expect(sinHost.body).toMatchObject({ campos: { host: MENSAJE_HOST_FALTA } });
      await cuenta.put().type('form').send('usuario=x').expect(400);
      await request(conBase.servidor).put(`${RUTA}/lider/correo/cuenta`).set('Cookie', sesion.cookie).send(CUENTA).expect(403);
      expect(await contar('crm_correo_cuenta')).toBe(0);

      const guardada = await cuenta.put().send(CUENTA).expect(200);
      expect(guardada.body).toEqual({
        origen: 'base',
        modo: 'smtp',
        usuario: CUENTA.usuario,
        host: 'smtp.gmail.com',
        puerto: 465,
        seguro: true,
        nombre: 'Planeación Sapiencia',
        tieneClave: true,
        editable: true,
        actualizadoEn: expect.any(String),
      });
      const leida = await cuenta.get().expect(200);
      expect(leida.body).toEqual(guardada.body);
      for (const res of [guardada, leida]) {
        expect(res.text).not.toContain(CLAVE_SIN_ESPACIOS);
        expect(res.text).not.toContain('abcd');
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('la fila de crm_correo_cuenta no tiene la clave en claro y dice quién la guardó', async () => {
      const filas = await consultar('SELECT * FROM crm_correo_cuenta');
      expect(filas).toHaveLength(1);
      const [fila] = filas;
      expect(fila).toMatchObject({ usuario: CUENTA.usuario, host: 'smtp.gmail.com', actualizado_por: NOMBRE_CUENTA });
      expect([Number(fila?.id), Number(fila?.puerto), Number(fila?.seguro)]).toEqual([1, 465, 1]);
      expect(String(fila?.clave_cifrada)).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
      expect(JSON.stringify(fila)).not.toContain(CLAVE_SIN_ESPACIOS);
      expect(JSON.stringify(fila)).not.toContain('abcd efgh');
    });

    it('con el correo desactivado y la cuenta en la base, queda configurado y un aviso sale con esa cuenta', async () => {
      const resumen = (await lider.get('/lider/resumen', conBase).expect(200)).body as ResumenLiderCrm;
      expect(resumen.correo.configurado).toBe(true);
      const creada = await lider
        .mutar('post', '/lider/tareas', conBase)
        .send({ titulo: 'Tarea avisada con la cuenta de la base', responsableId: id.jose })
        .expect(201);
      const tareaId = (creada.body as TareaDetalleCrm).id;
      const aviso = (await lider.mutar('post', `/lider/tareas/${tareaId}/avisar`, conBase).expect(200)).body as EstadoAvisoCrm;
      expect(aviso).toMatchObject({ estado: 'enviado' });
      expect(salidos.at(-1)?.correo).toMatchObject({ correoId: aviso.correoId, para: JOSE.correo });
      expect(salidos.at(-1)?.config).toMatchObject({
        modo: 'smtp',
        smtp: { host: 'smtp.gmail.com', puerto: 465, seguro: true, usuario: CUENTA.usuario, clave: CLAVE_SIN_ESPACIOS },
        remitente: { nombre: 'Planeación Sapiencia', correo: CUENTA.usuario },
      });
      const [fila] = await consultar('SELECT estado, id_mensaje FROM crm_correos WHERE id = ?', [aviso.correoId]);
      expect(fila).toMatchObject({ estado: 'enviado', id_mensaje: `<falso-${salidos.length}@smtp.test>` });
      await lider.mutar('delete', `/lider/tareas/${tareaId}`, conBase).expect(204);
    });

    it('PUT sin clave conserva la guardada (y cambia lo demás)', async () => {
      const cambio = await cuenta.put().send({ usuario: CUENTA.usuario, nombre: 'Oficina de Planeación', clave: '' }).expect(200);
      expect(cambio.body).toMatchObject({ origen: 'base', tieneClave: true, nombre: 'Oficina de Planeación' });
      const res = await cuenta.prueba().send({ para: CARLOS.correo }).expect(200);
      expect(res.body).toEqual({ enviado: true, para: CARLOS.correo, mensaje: `Se envió un correo de prueba a ${CARLOS.correo}.` });
      expect(salidos.at(-1)?.config).toMatchObject({
        smtp: { usuario: CUENTA.usuario, clave: CLAVE_SIN_ESPACIOS },
        remitente: { nombre: 'Oficina de Planeación' },
      });
    });

    it('POST prueba sale al líder (sin pasar por la bandeja); con un error simulado, el mensaje traducido sin la clave', async () => {
      const correos = await contar('crm_correos');
      const res = await cuenta.prueba().send({}).expect(200);
      expect(res.body as ResultadoPruebaCorreoCrm).toEqual({
        enviado: true,
        para: LIDER.correo,
        mensaje: `Se envió un correo de prueba a ${LIDER.correo}.`,
      });
      expect(salidos.at(-1)?.correo).toMatchObject({ para: LIDER.correo, asunto: 'Prueba del correo del CRM', adjuntos: [] });
      expect(salidos.at(-1)?.correo.texto).toContain('Si le llegó, los avisos de tareas ya pueden salir.');

      fallo = Object.assign(new Error(`Invalid login: 535-5.7.8 Username and Password not accepted ${CLAVE_SIN_ESPACIOS}`), {
        code: 'EAUTH',
        responseCode: 535,
        response: `535-5.7.8 ${CLAVE_SIN_ESPACIOS}`,
      });
      const rechazada = await cuenta.prueba().send({}).expect(200);
      expect(rechazada.body).toEqual({ enviado: false, para: LIDER.correo, mensaje: MENSAJE_AUTH_GMAIL });
      expect(rechazada.text).not.toContain(CLAVE_SIN_ESPACIOS);
      fallo = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      expect((await cuenta.prueba().send({}).expect(200)).body).toMatchObject({
        enviado: false,
        mensaje: 'No se pudo conectar con smtp.gmail.com:465.',
      });
      fallo = null;
      const mala = await cuenta.prueba().send({ para: 'no-es-un-correo' }).expect(400);
      expect(mala.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { para: expect.any(String) } });
      expect(await contar('crm_correos')).toBe(correos);
    });

    it(`más de ${TOPE_PRUEBAS_POR_HORA} pruebas por hora en la misma instancia: 429 con Retry-After`, async () => {
      // Ya van 4 en esta app (las de las dos pruebas anteriores que llegaron al servidor de correo).
      const estados: number[] = [];
      let ultima: request.Response | undefined;
      for (let i = 0; i < TOPE_PRUEBAS_POR_HORA; i++) {
        ultima = await cuenta.prueba().send({});
        estados.push(ultima.status);
        if (ultima.status === 429) break;
      }
      expect(estados).toEqual([...Array<number>(TOPE_PRUEBAS_POR_HORA - 4).fill(200), 429]);
      expect(ultima?.body).toMatchObject({ codigo: 'demasiados_intentos' });
      expect(Number(ultima?.headers['retry-after'])).toBeGreaterThan(3500);
    });

    it('DELETE borra la cuenta: vuelve a «ninguna» y el correo, a sin configurar', async () => {
      const borrada = await lider.mutar('delete', '/lider/correo/cuenta', conBase).expect(200);
      expect(borrada.body).toMatchObject({ origen: 'ninguna', modo: 'desactivado', tieneClave: false, usuario: null });
      expect(await contar('crm_correo_cuenta')).toBe(0);
      const resumen = (await lider.get('/lider/resumen', conBase).expect(200)).body as ResumenLiderCrm;
      expect(resumen.correo.configurado).toBe(false);
      // La app con las variables sigue igual.
      expect(((await lider.get('/lider/resumen').expect(200)).body as ResumenLiderCrm).correo.configurado).toBe(true);
    });
  });

  // ── 10. Bloqueo de la cuenta del líder y limpieza ─────────────────────────

  describe('bloqueo de la cuenta del líder', () => {
    it('tras 5 contraseñas incorrectas, ni la correcta entra (429 + Retry-After); la sesión abierta sigue', async () => {
      for (let intento = 1; intento <= 5; intento++) {
        const res = await request(prueba.servidor)
          .post(`${RUTA}/lider/sesion`)
          .send({ contrasena: `equivocada-${intento}` })
          .expect(401);
        expect(res.body).toEqual({ codigo: 'no_autenticado', mensaje: 'Contraseña incorrecta.' });
      }
      const bloqueada = await request(prueba.servidor)
        .post(`${RUTA}/lider/sesion`)
        .send({ contrasena: CLAVE_LIDER })
        .expect(429);
      expect(bloqueada.body).toMatchObject({ codigo: 'demasiados_intentos' });
      const espera = Number(bloqueada.headers['retry-after']);
      expect(espera).toBeGreaterThan(14 * 60);
      expect(espera).toBeLessThanOrEqual(15 * 60);
      expect(cookieDe(bloqueada, 'crm_sesion')).toBeUndefined();
      const actual = await lider.get('/lider/sesion').expect(200);
      expect(actual.body).toMatchObject({ csrf: sesion.csrf });
    });
  });

  describe('carpeta temporal', () => {
    it('no quedan en ella los archivos de las subidas (aceptadas o rechazadas)', async () => {
      // Se borran al terminar cada petición, sin esperar: se da un momento.
      let restantes: string[] = [];
      for (let intento = 0; intento < 40; intento++) {
        restantes = await readdir(base.config.directorioTemporal).catch(() => []);
        if (restantes.length === 0) break;
        await new Promise((listo) => setTimeout(listo, 25));
      }
      expect(restantes).toEqual([]);
    });
  });
});

/**
 * Sin base configurada el servidor arranca igual y /api/crm/* responde 503
 * `no_disponible` con Retry-After (nunca 401: el navegador no debe creer que
 * se cerró la sesión). No necesita base: corre siempre.
 */
describe('CRM sin base de datos (e2e)', () => {
  const RUTAS: ['get' | 'post' | 'patch' | 'delete', string][] = [
    ['get', '/personas'],
    ['get', '/personas/1/foto'],
    ['get', '/personas/1/tareas'],
    ['get', '/personas/1/tareas/1'],
    ['post', '/personas/1/tareas/1/estado'],
    ['post', '/personas/1/tareas/1/terminar'],
    ['delete', '/personas/1/tareas/1/entregables/1'],
    ['post', '/lider/sesion'],
    ['get', '/lider/sesion'],
    ['delete', '/lider/sesion'],
    ['get', '/lider/resumen'],
    ['get', '/lider/tareas'],
    ['post', '/lider/tareas'],
    ['patch', '/lider/tareas/1'],
    ['get', '/lider/correos'],
    ['get', '/lider/personas'],
  ];
  let dist: DistTemporal;
  let prueba: AppPrueba;

  beforeAll(async () => {
    dist = await crearDistTemporal();
    prueba = await crearAppRepositorio(cargarConfiguracionRepositorio({}), dist.directorio, {}, [
      { proveedor: CONFIGURACION_CORREO_CRM, valor: CORREO_EN_MEMORIA },
    ]);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await dist?.limpiar();
  });

  it.each(RUTAS)('%s /api/crm%s -> 503 no_disponible', async (metodo, ruta) => {
    const agente = request(prueba.servidor);
    const res = await agente[metodo](`${RUTA}${ruta}`)
      .set('Cookie', `crm_sesion=${'t'.repeat(43)}`)
      .set(CABECERA_CSRF, 'c'.repeat(43))
      .send({ contrasena: 'una contraseña cualquiera', estado: 'en_proceso', titulo: 'Tarea', responsableId: 1 });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ codigo: 'no_disponible', mensaje: expect.any(String) });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sin cookie, las rutas del líder también son 503 (y no 401)', async () => {
    const res = await request(prueba.servidor).get(`${RUTA}/lider/resumen`);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ codigo: 'no_disponible' });
  });
});
