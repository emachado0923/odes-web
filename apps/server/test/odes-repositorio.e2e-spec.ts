import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { cargarConfiguracion } from '../src/config/configuracion.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  OPCIONES_REINDEXACION,
  type OpcionesReindexacion,
} from '../src/odes/admin/configuracion-reindexacion.js';
import { ServicioIndiceOdes } from '../src/odes/admin/servicio-indice.js';
import type { EstadoIndiceAdmin, EventoChat } from '../src/odes/chat/protocolo.js';
import { CONFIGURACION_ODES, cargarConfiguracionOdes } from '../src/odes/configuracion-odes.js';
import { formatoDeArchivo, OPCIONES_EXTRACCION_POR_DEFECTO } from '../src/odes/repositorio/indexacion/extraccion.js';
import type { ArchivoBajoDemanda, MetadatosFuente } from '../src/odes/repositorio/indexacion/fuente.js';
import { FuenteMysql, huellaDocumentos } from '../src/odes/repositorio/indexacion/fuente-mysql.js';
import { FuentePaqueteJson } from '../src/odes/repositorio/indexacion/fuente-paquete-json.js';
import { indexar } from '../src/odes/repositorio/indexacion/indexador.js';
import { leerMetaIndice } from '../src/odes/repositorio/meta-indice.js';
import { claveComparacion } from '../src/odes/repositorio/normalizacion.js';
import { RepositorioSqlite } from '../src/odes/repositorio/repositorio-sqlite.js';
import { RepositorioOdes } from '../src/odes/repositorio/repositorio.tipos.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
  cargarConfiguracionRepositorio,
} from '../src/repositorio/configuracion-repositorio.js';
import { importarPaquete } from '../src/repositorio/importacion/importador.js';
import { marcarContenidoCambiado } from '../src/repositorio/servicios/cambios.js';
import { ServicioLecturaRepositorio } from '../src/repositorio/servicios/lectura-repositorio.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import { leerEventosSse } from './odes-apoyo.js';
import {
  avisarSiNoHayBd,
  type BasePrueba,
  crearAdminPrueba,
  crearBasePrueba,
  crearPaqueteSintetico,
  cuerpoBinario,
  HAY_BD,
  iniciarSesion,
  type PaqueteSintetico,
  type Sesion,
} from './repositorio-apoyo.js';

/**
 * Asistente ODES conectado a la base del repositorio (rama /repositorio):
 * FuenteMysql frente al paquete, documentos despublicados, enlaces y
 * miniaturas propios en el chat, y la administración del índice (sesión,
 * CSRF, cerrojo). Con MYSQL_PRUEBAS (una MySQL desechable); sin ella solo
 * corren las pruebas sin base.
 */

avisarSiNoHayBd('odes-repositorio');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN_ODES = '/api/repositorio/admin/odes';
const B19 = 'boletin-19-fe-erratas-boletin-n-19-2021';
const RETIRADO = 'estudio-satisfaccion-2020';
const USUARIO = 'admin-odes';
const CONTRASENA = 'una contraseña larga de prueba';

const sha256 = (datos: Buffer): string => createHash('sha256').update(datos).digest('hex');

/** Indexador falso: escribe --resultado tras `esperaMs` y sale bien. */
async function scriptFalso(directorio: string, esperaMs: number): Promise<string> {
  const ruta = join(directorio, 'indexador-falso.mjs');
  await writeFile(
    ruta,
    `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
console.log('Fuente:  base de datos (falsa)');
setTimeout(() => {
  writeFileSync(args[args.indexOf('--resultado') + 1], JSON.stringify({ ok: true }));
}, ${esperaMs});
`,
  );
  return ruta;
}

interface AppOdesRepositorio {
  app: NestExpressApplication;
  servidor: Server;
  cerrar(): Promise<void>;
}

async function crearApp(
  config: ConfiguracionRepositorio,
  directorioWeb: string,
  rutaIndice: string,
  reindexacion: OpcionesReindexacion,
): Promise<AppOdesRepositorio> {
  const repositorio = new RepositorioSqlite({ rutaIndice, registro: SILENCIO });
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION_REPOSITORIO)
    .useValue(config)
    .overrideProvider(CONFIGURACION_ODES)
    .useValue(cargarConfiguracionOdes({}))
    .overrideProvider(RepositorioOdes)
    .useValue(repositorio)
    .overrideProvider(OPCIONES_REINDEXACION)
    .useValue(reindexacion)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarAplicacion(app, cargarConfiguracion({ WEB_DIST_DIR: directorioWeb }));
  await app.init();
  return {
    app,
    servidor: app.getHttpServer() as Server,
    cerrar: async () => {
      await app.close();
      repositorio.cerrar();
    },
  };
}

/**
 * Metadatos comparables entre las dos fuentes. Lo que difiere a propósito:
 * el enlace (copia propia), el tipo MIME (la base lo detecta por contenido),
 * la miniatura (solo la base) y la grafía de las palabras clave (la base usa
 * la de la palabra ya registrada: "educacion postsecundaria" ->
 * "Educación postsecundaria").
 */
function metadatosComparables(m: MetadatosFuente) {
  const { urlVer: _u, archivoTipo: _t, urlMiniatura: _m, claves, ...resto } = m;
  return { ...resto, claves: claves.map(claveComparacion) };
}

describe('administración del índice ODES sin base de datos (e2e)', () => {
  let dist: DistTemporal;
  let app: AppOdesRepositorio;
  let temporal: string;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    dist = await crearDistTemporal();
    temporal = await mkdtemp(join(tmpdir(), 'odes-admin-sin-bd-'));
    app = await crearApp(cargarConfiguracionRepositorio({}), dist.directorio, join(temporal, 'indice.sqlite'), {
      rutaIndice: join(temporal, 'indice.sqlite'),
      comando: { ejecutable: process.execPath, argumentos: [join(temporal, 'no-existe.js')], requiere: null },
      concurrencia: 1,
      timeoutMs: 10_000,
      directorioTemporal: temporal,
    });
  });

  afterAll(async () => {
    await app?.cerrar();
    await dist?.limpiar();
    await rm(temporal, { recursive: true, force: true });
  });

  it.each([
    ['GET', `${ADMIN_ODES}/indice`],
    ['POST', `${ADMIN_ODES}/reindexar`],
  ])('%s %s -> 503 no_disponible (la sesión necesita la base)', async (metodo, ruta) => {
    const peticion = metodo === 'GET' ? request(app.servidor).get(ruta) : request(app.servidor).post(ruta);
    const res = await peticion.expect(503);
    expect(res.body).toEqual({ codigo: 'no_disponible', mensaje: expect.stringContaining('no está disponible') as unknown });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el chat sigue funcionando sin la base', async () => {
    await request(app.servidor).get('/api/odes/estado').expect(200);
  });
});

describe.skipIf(!HAY_BD)('Asistente ODES con la base del repositorio (e2e, MySQL)', () => {
  let base: BasePrueba;
  let paquete: PaqueteSintetico;
  let bd: BaseDatosRepositorio;
  let lectura: ServicioLecturaRepositorio;
  let temporal: string;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    base = await crearBasePrueba('odes');
    paquete = await crearPaqueteSintetico();
    temporal = await mkdtemp(join(tmpdir(), 'odes-repositorio-e2e-'));
    bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await bd.listo();
    await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
    lectura = new ServicioLecturaRepositorio(bd);
  }, 60_000);

  afterAll(async () => {
    await bd?.cerrar();
    await base?.borrar();
    await paquete?.limpiar();
    if (temporal) await rm(temporal, { recursive: true, force: true });
  });

  it('FuenteMysql entrega los mismos documentos que el paquete importado, con enlaces y miniaturas propios', async () => {
    const desdeBase = new FuenteMysql(lectura);
    try {
      const mysql = await desdeBase.leer();
      const json = await new FuentePaqueteJson(paquete.directorio).leer();
      expect(mysql.avisos).toEqual([]);
      expect(mysql.registros.map((r) => metadatosComparables(r.metadatos))).toEqual(
        json.registros.map((r) => metadatosComparables(r.metadatos)),
      );

      // Enlaces: la copia propia si hay archivo; si no, la misma URL externa del paquete.
      expect(mysql.registros.map((r) => r.metadatos.urlVer)).toEqual(
        json.registros.map((r) =>
          r.archivo === null ? r.metadatos.urlVer : `/api/repositorio/documentos/${r.metadatos.id}/ver`,
        ),
      );
      for (const registro of mysql.registros) {
        expect(registro.metadatos.urlMiniatura).toMatch(
          new RegExp(`^/api/repositorio/documentos/${registro.metadatos.id}/miniatura\\?v=[0-9a-f]{16}$`),
        );
      }
      // Archivos: los mismos documentos, el mismo formato y, copiado desde la
      // base, exactamente el mismo contenido.
      const conArchivo = json.registros.filter((r) => r.archivo !== null);
      const bajoDemanda = mysql.registros.filter((r) => r.archivo !== null);
      expect(bajoDemanda.map((r) => r.metadatos.id)).toEqual(conArchivo.map((r) => r.metadatos.id));
      for (const [i, registro] of bajoDemanda.entries()) {
        const original = conArchivo[i]!;
        const archivo = registro.archivo as ArchivoBajoDemanda;
        expect(formatoDeArchivo(archivo.nombre, registro.metadatos.archivoTipo)).toBe(
          formatoDeArchivo(original.archivo as string, original.metadatos.archivoTipo),
        );
        const contenido = await readFile(await archivo.obtener());
        expect(sha256(contenido)).toBe(sha256(await readFile(original.archivo as string)));
        expect(archivo.sha256).toBe(sha256(contenido));
        await archivo.liberar();
      }
    } finally {
      await desdeBase.cerrar();
    }
  });

  it('un documento despublicado no se lee ni se indexa', async () => {
    await base.admin.query('UPDATE repositorio_documentos SET publicado = 0 WHERE id = ?', [RETIRADO]);
    await marcarContenidoCambiado(base.admin);
    lectura.invalidar();
    const fuente = new FuenteMysql(lectura);
    const ids = (await fuente.leer()).registros.map((r) => r.metadatos.id);
    expect(ids).not.toContain(RETIRADO);
    expect(ids).toContain(B19);
    expect(await fuente.idsVigentes()).not.toContain(RETIRADO);
  });

  describe('índice desde la base + servidor', () => {
    let rutaIndice: string;
    let dist: DistTemporal;
    let prueba: AppOdesRepositorio;
    let sesion: Sesion;

    beforeAll(async () => {
      rutaIndice = join(temporal, 'indice.sqlite');
      const resultado = await indexar({
        fuente: new FuenteMysql(lectura),
        rutaIndice,
        soloMetadatos: true,
        extraccion: OPCIONES_EXTRACCION_POR_DEFECTO,
        directorioCache: null,
        reutilizarCache: false,
        concurrencia: 2,
        directorioMiniaturas: join(temporal, 'sin-miniaturas'),
        generarMiniaturas: false,
        registro: () => undefined,
      });
      if (resultado.escritura.documentos !== 4) {
        throw new Error(`Se esperaban 4 documentos publicados en el índice (hay ${resultado.escritura.documentos}).`);
      }
      dist = await crearDistTemporal();
      prueba = await crearApp(base.config, dist.directorio, rutaIndice, {
        rutaIndice,
        comando: { ejecutable: process.execPath, argumentos: [await scriptFalso(temporal, 500)], requiere: null },
        concurrencia: 1,
        timeoutMs: 20_000,
        directorioTemporal: temporal,
      });
      await crearAdminPrueba(base, USUARIO, CONTRASENA, 'Admin ODES');
      sesion = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
    }, 60_000);

    afterAll(async () => {
      await prueba?.cerrar();
      await dist?.limpiar();
    });

    it('el índice guarda la fuente y su huella', async () => {
      const meta = leerMetaIndice(rutaIndice);
      expect(meta).toMatchObject({ disponible: true, origen: 'mysql', documentos: 4 });
      expect(meta.huella).toBe(huellaDocumentos((await lectura.listarPublicados()).documentos));
    });

    it('modo búsqueda: los documentos enlazan a la copia propia y sus miniaturas cargan desde la base', async () => {
      const res = await request(prueba.servidor)
        .post('/api/odes/chat')
        .send({ mensajes: [{ rol: 'usuario', texto: 'fe de erratas boletín brecha digital seguimiento bachilleres job placement' }] })
        .expect(200);
      const eventos = leerEventosSse(res.text);
      const lista = eventos.find((e): e is Extract<EventoChat, { tipo: 'documentos' }> => e.tipo === 'documentos');
      expect(lista).toBeDefined();
      const porId = new Map(lista!.documentos.map((d) => [d.id, d]));
      expect([...porId.keys()].toSorted()).toEqual(
        [B19, 'estudio-brecha-digital-medellin-2023', 'estudio-seguimiento-tablero', 'infografia-en-job-placement-2022'].toSorted(),
      );
      expect(porId.get(B19)!.url).toBe(`/api/repositorio/documentos/${B19}/ver`);
      expect(porId.get('estudio-seguimiento-tablero')!.url).toBe('https://app.powerbi.com/view?r=abc');
      for (const documento of porId.values()) {
        expect(documento.urlMiniatura).toMatch(/^\/api\/repositorio\/documentos\/[a-z0-9-]+\/miniatura\?v=[0-9a-f]{16}$/);
        const miniatura = await request(prueba.servidor).get(documento.urlMiniatura!).buffer(true).parse(cuerpoBinario).expect(200);
        expect(miniatura.headers['content-type']).toBe('image/webp');
        expect(miniatura.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      }
      const pdf = await request(prueba.servidor).get(porId.get(B19)!.url).buffer(true).parse(cuerpoBinario).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(/^inline/);
      expect(sha256(pdf.body as Buffer)).toBe(sha256(paquete.archivos[`${B19}.pdf`]!));
    });

    it('sin sesión 401; sin token CSRF o desde otro sitio 403', async () => {
      const sinSesion = await request(prueba.servidor).get(`${ADMIN_ODES}/indice`).expect(401);
      expect(sinSesion.body.codigo).toBe('no_autenticado');
      await request(prueba.servidor).post(`${ADMIN_ODES}/reindexar`).expect(401);

      const sinCsrf = await request(prueba.servidor).post(`${ADMIN_ODES}/reindexar`).set('Cookie', sesion.cookie).expect(403);
      expect(sinCsrf.body).toEqual({ codigo: 'prohibido', mensaje: expect.stringMatching(/X-CSRF-Token/) as unknown });
      await request(prueba.servidor)
        .post(`${ADMIN_ODES}/reindexar`)
        .set('Cookie', sesion.cookie)
        .set('X-CSRF-Token', 'otro-token')
        .expect(403);
      await request(prueba.servidor)
        .post(`${ADMIN_ODES}/reindexar`)
        .set('Cookie', sesion.cookie)
        .set('X-CSRF-Token', sesion.csrf)
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(403);
      expect((await prueba.app.get(ServicioIndiceOdes).estado()).reindexacion.estado).toBe('inactiva');
    });

    it('estado del índice: al día con lo publicado', async () => {
      const res = await request(prueba.servidor).get(`${ADMIN_ODES}/indice`).set('Cookie', sesion.cookie).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const estado = res.body as EstadoIndiceAdmin;
      expect(estado.indice).toMatchObject({ disponible: true, origen: 'mysql', documentos: 4 });
      expect(estado.repositorio).toMatchObject({ publicados: 4, cambiado: false });
      expect(estado.reindexacion.estado).toBe('inactiva');
    });

    it('reindexar: 202 y una sola a la vez (409 mientras corre)', async () => {
      const inicio = await request(prueba.servidor)
        .post(`${ADMIN_ODES}/reindexar`)
        .set('Cookie', sesion.cookie)
        .set('X-CSRF-Token', sesion.csrf)
        .expect(202);
      expect(inicio.headers.location).toBe(`${ADMIN_ODES}/indice`);
      expect((inicio.body as EstadoIndiceAdmin).reindexacion).toMatchObject({ estado: 'en_curso', usuario: USUARIO });

      const segunda = await request(prueba.servidor)
        .post(`${ADMIN_ODES}/reindexar`)
        .set('Cookie', sesion.cookie)
        .set('X-CSRF-Token', sesion.csrf)
        .expect(409);
      expect(segunda.body).toEqual({ codigo: 'conflicto', mensaje: expect.stringMatching(/Ya hay una reindexación en curso/) as unknown });

      await prueba.app.get(ServicioIndiceOdes).esperar();
      const final = await request(prueba.servidor).get(`${ADMIN_ODES}/indice`).set('Cookie', sesion.cookie).expect(200);
      expect((final.body as EstadoIndiceAdmin).reindexacion).toMatchObject({
        estado: 'completada',
        usuario: USUARIO,
        error: null,
        registro: ['Fuente:  base de datos (falsa)'],
      });
    });

    it('si se publica otra cosa, el estado avisa que el índice quedó desactualizado', async () => {
      await base.admin.query('UPDATE repositorio_documentos SET publicado = 1 WHERE id = ?', [RETIRADO]);
      await marcarContenidoCambiado(base.admin);
      // La lectura del servidor revisa la versión de la base cada 2 s.
      await new Promise((resolver) => setTimeout(resolver, 2100));
      const res = await request(prueba.servidor).get(`${ADMIN_ODES}/indice`).set('Cookie', sesion.cookie).expect(200);
      expect((res.body as EstadoIndiceAdmin).repositorio).toMatchObject({
        publicados: 5,
        cambiado: true,
        motivo: expect.stringMatching(/después de generar el índice/) as unknown,
      });
    });
  });
});
