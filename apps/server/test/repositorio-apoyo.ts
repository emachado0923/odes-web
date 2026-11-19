import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import mysql from 'mysql2/promise';
import { Client as ClientePg } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { cargarConfiguracion, RAIZ_SERVIDOR } from '../src/config/configuracion.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { TIPOS_POSTGRES } from '../src/repositorio/bd/base-datos.js';
import { type Conexion, ConexionPostgres } from '../src/repositorio/bd/conexion.js';
import {
  aplicarEsquema,
  aplicarEsquemaPostgres,
  type ResultadoEsquema,
} from '../src/repositorio/bd/esquema.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
  cargarConfiguracionRepositorio,
  interpretarUrlMysql,
} from '../src/repositorio/configuracion-repositorio.js';
import { hashContrasena } from '../src/repositorio/dominio/contrasenas.js';
import { docxFalso, jpegFalso, pdfFalso, pngFalso, webpFalso } from './repositorio-fixtures.js';

/**
 * Apoyo de las pruebas del repositorio contra una base DESECHABLE, MySQL o
 * Postgres (las mismas pruebas para los dos motores):
 *
 *   MYSQL_PRUEBAS=mysql://root@127.0.0.1:33781 npm run test:e2e
 *   POSTGRES_PRUEBAS=postgres://postgres@127.0.0.1:54329/postgres npm run test:e2e
 *
 * Con las dos variables se usa Postgres. Sin ninguna esas pruebas se omiten
 * (con un aviso) y npm run test:e2e pasa igual en un equipo sin base. Cada
 * archivo de prueba crea su propia base (repo_prueba_<aleatorio>) y un
 * usuario con solo SELECT/INSERT/UPDATE/DELETE, como en producción, y los
 * borra al terminar. NUNCA apunte estas variables a una base real.
 */

export const URL_MYSQL_PRUEBAS = process.env.MYSQL_PRUEBAS?.trim() || null;
export const URL_POSTGRES_PRUEBAS = process.env.POSTGRES_PRUEBAS?.trim() || null;
/** Motor de las pruebas con base, o null si no hay ninguna configurada. */
export const MOTOR_PRUEBAS: 'mysql' | 'postgres' | null = URL_POSTGRES_PRUEBAS
  ? 'postgres'
  : URL_MYSQL_PRUEBAS
    ? 'mysql'
    : null;
export const HAY_BD = MOTOR_PRUEBAS !== null;
export const ES_POSTGRES = MOTOR_PRUEBAS === 'postgres';

export function avisarSiNoHayBd(archivo: string): void {
  if (!HAY_BD) {
    // Directo a stderr: vitest no muestra la consola de un archivo sin pruebas ejecutadas.
    process.stderr.write(
      `[${archivo}] Pruebas con base OMITIDAS: defina MYSQL_PRUEBAS=mysql://root@127.0.0.1:<puerto> o ` +
        'POSTGRES_PRUEBAS=postgres://postgres@127.0.0.1:<puerto>/postgres (una base desechable) para ejecutarlas.\n',
    );
  }
}

/** Paquete real de la carga inicial (si está en este equipo). */
export const PAQUETE_REAL = process.env.REPOSITORIO_PAQUETE_PRUEBAS
  ? resolve(process.env.REPOSITORIO_PAQUETE_PRUEBAS)
  : resolve(RAIZ_SERVIDOR, '..', '..', '..', '..', 'Septiembre', 'observatorio', 'repositorio-datos');

export const MINIATURAS_REALES = resolve(RAIZ_SERVIDOR, '..', 'web', 'public', 'odes', 'portadas');

export interface BasePrueba {
  nombre: string;
  config: ConfiguracionRepositorio;
  /**
   * Conexión administradora a la base de prueba (para preparar y comprobar),
   * con la forma de mysql2 en los dos motores: las consultas llevan `?`.
   */
  admin: Conexion;
  /** Vuelve a aplicar el esquema (y migraciones) con la cuenta administradora. */
  aplicarEsquema(): Promise<ResultadoEsquema>;
  /** Nombres de las tablas de la base. */
  tablas(): Promise<string[]>;
  borrar(): Promise<void>;
}

/** La conexión suelta de mysql2 con la forma de Conexion (sin pool). */
function conexionMysql(conexion: mysql.Connection): Conexion {
  return {
    dialecto: 'mysql',
    query: (sql, valores) => conexion.query(sql, valores as any[]) as Promise<[any, unknown]>,
    execute: (sql, valores) => conexion.execute(sql, valores as any[]) as Promise<[any, unknown]>,
    beginTransaction: () => conexion.beginTransaction(),
    commit: () => conexion.commit(),
    rollback: () => conexion.rollback(),
    release: () => undefined,
  };
}

export async function crearBasePrueba(prefijo: string): Promise<BasePrueba> {
  if (ES_POSTGRES) return crearBasePruebaPostgres(prefijo);
  if (!URL_MYSQL_PRUEBAS) throw new Error('Falta MYSQL_PRUEBAS');
  const datos = interpretarUrlMysql(URL_MYSQL_PRUEBAS);
  const sufijo = randomBytes(4).toString('hex');
  const nombre = `repo_${prefijo}_${sufijo}`;
  const usuario = `rapp_${sufijo}`;
  const contrasena = `#${randomBytes(12).toString('base64url')}`;
  const admin = await mysql.createConnection({
    host: datos.host,
    port: datos.puerto,
    user: datos.usuario,
    password: datos.contrasena,
    timezone: 'Z',
    charset: 'UTF8MB4_0900_AI_CI',
  });
  await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.changeUser({ database: nombre });
  await aplicarEsquema(admin);
  await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [usuario, '%', contrasena]);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${nombre}\`.* TO ?@?`, [usuario, '%']);
  const temporal = await mkdtemp(join(tmpdir(), `${nombre}-subidas-`));
  const config = cargarConfiguracionRepositorio({
    REPOSITORIO_MYSQL_HOST: datos.host,
    REPOSITORIO_MYSQL_PORT: String(datos.puerto),
    REPOSITORIO_MYSQL_USER: usuario,
    REPOSITORIO_MYSQL_PASSWORD: contrasena,
    REPOSITORIO_MYSQL_DATABASE: nombre,
    REPOSITORIO_DIRECTORIO_TEMPORAL: temporal,
  });
  return {
    nombre,
    config,
    admin: conexionMysql(admin),
    aplicarEsquema: () => aplicarEsquema(admin),
    async tablas() {
      const [filas] = await admin.query<mysql.RowDataPacket[]>('SHOW TABLES');
      return filas.map((fila) => String(Object.values(fila)[0]));
    },
    async borrar() {
      await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``).catch(() => undefined);
      await admin.query('DROP USER IF EXISTS ?@?', [usuario, '%']).catch(() => undefined);
      await admin.end().catch(() => undefined);
      await rm(temporal, { recursive: true, force: true });
    },
  };
}

/**
 * Postgres: base nueva con el esquema y un rol con solo SELECT/INSERT/UPDATE/
 * DELETE. El rol lleva BYPASSRLS porque las tablas tienen RLS sin políticas
 * (en Supabase el servidor usa el dueño de las tablas, que no está sujeto a
 * RLS).
 */
async function crearBasePruebaPostgres(prefijo: string): Promise<BasePrueba> {
  if (!URL_POSTGRES_PRUEBAS) throw new Error('Falta POSTGRES_PRUEBAS');
  const sufijo = randomBytes(4).toString('hex');
  const nombre = `repo_${prefijo}_${sufijo}`;
  const usuario = `rapp_${sufijo}`;
  const contrasena = randomBytes(12).toString('base64url');
  const conBase = (base: string, credenciales?: { usuario: string; contrasena: string }): string => {
    const url = new URL(URL_POSTGRES_PRUEBAS);
    url.pathname = `/${base}`;
    if (credenciales) {
      url.username = credenciales.usuario;
      url.password = credenciales.contrasena;
    }
    return url.toString();
  };
  const raiz = new ClientePg({ connectionString: URL_POSTGRES_PRUEBAS });
  await raiz.connect();
  await raiz.query(`CREATE DATABASE "${nombre}"`);
  await raiz.query(`CREATE ROLE "${usuario}" LOGIN BYPASSRLS PASSWORD '${contrasena}'`);
  // Mismos tipos que el servidor: COUNT y BIGINT como números.
  const cliente = new ClientePg({ connectionString: conBase(nombre), types: TIPOS_POSTGRES });
  await cliente.connect();
  await aplicarEsquemaPostgres(cliente);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO "${usuario}"`);
  await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${usuario}"`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${usuario}"`);
  const temporal = await mkdtemp(join(tmpdir(), `${nombre}-subidas-`));
  const config = cargarConfiguracionRepositorio({
    REPOSITORIO_POSTGRES_URL: conBase(nombre, { usuario, contrasena }),
    REPOSITORIO_DIRECTORIO_TEMPORAL: temporal,
  });
  return {
    nombre,
    config,
    admin: new ConexionPostgres(cliente),
    aplicarEsquema: () => aplicarEsquemaPostgres(cliente),
    async tablas() {
      const { rows } = await cliente.query<{ nombre: string }>(
        "SELECT tablename AS nombre FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
      );
      return rows.map((fila) => fila.nombre);
    },
    async borrar() {
      await cliente.end().catch(() => undefined);
      await raiz.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`).catch(() => undefined);
      await raiz.query(`DROP ROLE IF EXISTS "${usuario}"`).catch(() => undefined);
      await raiz.end().catch(() => undefined);
      await rm(temporal, { recursive: true, force: true });
    },
  };
}

export interface AppPrueba {
  app: NestExpressApplication;
  servidor: Server;
  cerrar(): Promise<void>;
}

/** App completa (AppModule) con la configuración del repositorio dada. */
export async function crearAppRepositorio(
  config: ConfiguracionRepositorio,
  directorioWeb: string,
  entorno: NodeJS.ProcessEnv = {},
): Promise<AppPrueba> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION_REPOSITORIO)
    .useValue(config)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarAplicacion(app, cargarConfiguracion({ ...entorno, WEB_DIST_DIR: directorioWeb }));
  await app.init();
  return {
    app,
    servidor: app.getHttpServer() as Server,
    cerrar: () => app.close(),
  };
}

export async function crearAdminPrueba(
  base: BasePrueba,
  usuario: string,
  contrasena: string,
  nombre: string | null = null,
): Promise<void> {
  await base.admin.query(
    'INSERT INTO repositorio_administradores (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)',
    [usuario, nombre, await hashContrasena(contrasena)],
  );
}

export interface Sesion {
  cookie: string;
  csrf: string;
}

/** Inicia sesión y devuelve la cookie (para la cabecera Cookie) y el token CSRF. */
export async function iniciarSesion(servidor: Server, usuario: string, contrasena: string): Promise<Sesion> {
  const res = await request(servidor)
    .post('/api/repositorio/admin/sesion')
    .send({ usuario, contrasena })
    .expect(200);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('repositorio_sesion='));
  if (!cookie) throw new Error('Sin cookie de sesión');
  return { cookie: cookie.split(';')[0], csrf: (res.body as { csrf: string }).csrf };
}

export interface PaqueteSintetico {
  directorio: string;
  miniaturas: string;
  archivos: Record<string, Buffer>;
  limpiar(): Promise<void>;
}

/**
 * Paquete de carga inicial pequeño y completo: un boletín con PDF de 2,5 MB
 * (cruza trozos de 1 MiB), un estudio con PNG, una infografía en inglés con
 * DOCX, un tablero y un estudio de OneDrive sin archivo y con nota.
 */
export async function crearPaqueteSintetico(): Promise<PaqueteSintetico> {
  const directorio = await mkdtemp(join(tmpdir(), 'repositorio-paquete-sintetico-'));
  const miniaturas = join(directorio, 'miniaturas');
  await mkdir(join(directorio, 'documentos'));
  await mkdir(join(directorio, 'portadas'));
  await mkdir(miniaturas);
  const archivos: Record<string, Buffer> = {
    'boletin-19-fe-erratas-boletin-n-19-2021.pdf': pdfFalso(2_500_000),
    'estudio-brecha-digital-medellin-2023.png': pngFalso(800, 600),
    'infografia-en-job-placement-2022.docx': docxFalso(),
  };
  for (const [nombre, datos] of Object.entries(archivos)) {
    await writeFile(join(directorio, 'documentos', nombre), datos);
  }
  const base = {
    subtitulo: null,
    numero: null,
    mes: null,
    archivo: null,
    archivo_tipo: null,
    archivo_bytes: null,
    url_descarga: null,
    permite_descarga: false,
    url_entrada_blog: null,
    nota: null,
  };
  const documentos = [
    {
      ...base,
      id: 'boletin-19-fe-erratas-boletin-n-19-2021',
      orden: 1,
      titulo: 'Fe de erratas del Boletín N.º 19',
      categoria: 'Boletín',
      numero: '19',
      anio: 2021,
      mes: 8,
      idioma: 'es',
      tipo: 'documento',
      claves: ['Normatividad', 'Educación postsecundaria'],
      archivo: 'documentos/boletin-19-fe-erratas-boletin-n-19-2021.pdf',
      archivo_tipo: 'application/pdf',
      archivo_bytes: 2_500_000,
      url_ver: 'https://sapiencia.gov.co/wp-content/uploads/2021/08/fe-de-erratas.pdf',
      permite_descarga: true,
      origen: { pagina_sitio: '/observatorio-boletines/', subido: '2021-08', equivalente_en_espanol: null },
      curaduria: { evidencia: 'Portada: Boletín 19, fe de erratas', dudas: null },
    },
    {
      ...base,
      id: 'estudio-brecha-digital-medellin-2023',
      orden: 2,
      titulo: 'Brecha digital en Medellín',
      categoria: 'Estudio',
      anio: 2023,
      idioma: 'es',
      tipo: 'documento',
      claves: ['Brecha digital', 'educacion postsecundaria'],
      archivo: 'documentos/estudio-brecha-digital-medellin-2023.png',
      archivo_tipo: 'image/png',
      url_ver: 'https://drive.google.com/file/d/abc/view',
      permite_descarga: true,
      url_entrada_blog: 'https://sapiencia.gov.co/blog/brecha',
      origen: null,
      curaduria: null,
    },
    {
      ...base,
      id: 'infografia-en-job-placement-2022',
      orden: 3,
      titulo: 'Job placement of beneficiaries',
      categoria: 'Infografía',
      anio: 2022,
      idioma: 'en',
      tipo: 'documento',
      claves: ['Empleabilidad'],
      archivo: 'documentos/infografia-en-job-placement-2022.docx',
      url_ver: 'https://sapiencia.gov.co/en.docx',
      permite_descarga: true,
      origen: { pagina_sitio: null, subido: null, equivalente_en_espanol: 'Empleabilidad de beneficiarios (Infografía, 2022)' },
      curaduria: { evidencia: null, dudas: 'Traducción oficial' },
    },
    {
      ...base,
      id: 'estudio-seguimiento-tablero',
      orden: 4,
      titulo: 'Seguimiento a bachilleres',
      categoria: 'Estudio',
      anio: null,
      idioma: 'es',
      tipo: 'tablero',
      claves: ['Seguimiento a bachilleres'],
      url_ver: 'https://app.powerbi.com/view?r=abc',
      origen: null,
      curaduria: null,
    },
    {
      ...base,
      id: 'estudio-satisfaccion-2020',
      orden: 5,
      titulo: 'Satisfacción 2020',
      categoria: 'Estudio',
      anio: 2020,
      idioma: 'es',
      tipo: 'documento',
      claves: ['Satisfacción'],
      url_ver: 'https://sapienciagov-my.sharepoint.com/:b:/g/x',
      nota: 'El archivo está en OneDrive de Sapiencia: al abrirlo puede pedir iniciar sesión.',
      origen: null,
      curaduria: null,
    },
  ];
  for (const documento of documentos) {
    const portada = `portadas/rp-${documento.id}.jpg`;
    await writeFile(join(directorio, portada), jpegFalso(720, 720, true));
    await writeFile(join(miniaturas, `${documento.id}.webp`), webpFalso(192, 192));
    Object.assign(documento, { portada });
  }
  await writeFile(
    join(directorio, 'repositorio.json'),
    JSON.stringify({ version: 'prueba', generado: '2026-10-08', total: documentos.length, documentos }, null, 1),
  );
  return {
    directorio,
    miniaturas,
    archivos,
    limpiar: () => rm(directorio, { recursive: true, force: true }),
  };
}

/** Parser de supertest que entrega el cuerpo crudo como Buffer. */
export function cuerpoBinario(
  res: request.Response,
  listo: (error: Error | null, cuerpo: Buffer) => void,
): void {
  // En Node superagent entrega el IncomingMessage; sus tipos no lo reflejan.
  const flujo = res as unknown as NodeJS.ReadableStream;
  const partes: Buffer[] = [];
  flujo.on('data', (parte: Buffer) => partes.push(parte));
  flujo.on('end', () => listo(null, Buffer.concat(partes)));
}
