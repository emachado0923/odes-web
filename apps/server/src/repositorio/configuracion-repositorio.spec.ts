import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion } from '../config/configuracion.js';
import { crearOpcionesPool, crearOpcionesPoolPostgres } from './bd/base-datos.js';
import {
  cargarConfiguracionRepositorio,
  interpretarUrlMysql,
} from './configuracion-repositorio.js';

describe('configuración del repositorio', () => {
  let carpeta: string;
  let ca: string;

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'repositorio-config-'));
    ca = join(carpeta, 'server-ca.pem');
    await writeFile(ca, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
    await writeFile(join(carpeta, 'no-pem.txt'), 'hola');
  });

  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('sin variables: base sin configurar y valores por defecto', () => {
    const config = cargarConfiguracionRepositorio({});
    expect(config.mysql).toBeNull();
    expect(config.cookieSegura).toBe(false);
    expect(config.sesionInactividadMs).toBe(30 * 60_000);
    expect(config.sesionMaximaMs).toBe(12 * 3_600_000);
    expect(config.directorioTemporal).toContain('sapiencia-repositorio-subidas');
    expect(config.instanciaCongelable).toBe(false);
  });

  it('en Vercel (VERCEL=1) la instancia se congela entre peticiones', () => {
    expect(cargarConfiguracionRepositorio({ VERCEL: '1' }).instanciaCongelable).toBe(true);
  });

  it('cookie Secure en producción o si se pide', () => {
    expect(cargarConfiguracionRepositorio({ NODE_ENV: 'production' }).cookieSegura).toBe(true);
    expect(cargarConfiguracionRepositorio({ REPOSITORIO_COOKIE_SEGURA: 'true' }).cookieSegura).toBe(true);
    expect(
      cargarConfiguracionRepositorio({ NODE_ENV: 'production', REPOSITORIO_COOKIE_SEGURA: 'false' }).cookieSegura,
    ).toBe(false);
  });

  it('variables separadas, con contraseña que empieza por # y sin recortar', () => {
    const { mysql } = cargarConfiguracionRepositorio({
      REPOSITORIO_MYSQL_HOST: '35.202.0.1',
      REPOSITORIO_MYSQL_USER: 'repositorio_app',
      REPOSITORIO_MYSQL_PASSWORD: '#clave con espacio ',
    });
    expect(mysql).toMatchObject({
      host: '35.202.0.1',
      puerto: 3306,
      usuario: 'repositorio_app',
      contrasena: '#clave con espacio ',
      baseDatos: 'repositoriobd',
      ssl: null,
      conexiones: 8,
      timeoutConexionMs: 10_000,
    });
  });

  it('URL única con caracteres codificados', () => {
    expect(interpretarUrlMysql('mysql://app:%23cl%40ve@db.local:3307/otra')).toEqual({
      host: 'db.local',
      puerto: 3307,
      usuario: 'app',
      contrasena: '#cl@ve',
      baseDatos: 'otra',
    });
    expect(interpretarUrlMysql('mysql://root@127.0.0.1').baseDatos).toBe('repositoriobd');
  });

  it.each([
    [{ REPOSITORIO_MYSQL_URL: 'postgres://a@b/c' }, /mysql:\/\//],
    [{ REPOSITORIO_MYSQL_URL: 'no es url' }, /no es una URL/],
    [{ REPOSITORIO_MYSQL_URL: 'mysql://a@b/c', REPOSITORIO_MYSQL_HOST: 'x' }, /no ambas/],
    [{ REPOSITORIO_MYSQL_USER: 'app' }, /Falta REPOSITORIO_MYSQL_HOST/],
    [{ REPOSITORIO_MYSQL_HOST: 'x' }, /Falta REPOSITORIO_MYSQL_USER/],
    [{ REPOSITORIO_MYSQL_HOST: 'x', REPOSITORIO_MYSQL_USER: 'a', REPOSITORIO_MYSQL_PORT: '99999' }, /PORT/],
    [{ REPOSITORIO_MYSQL_HOST: 'x', REPOSITORIO_MYSQL_USER: 'a', REPOSITORIO_MYSQL_DATABASE: 'mala-base' }, /no es válido/],
    [{ REPOSITORIO_MYSQL_HOST: 'x', REPOSITORIO_MYSQL_USER: 'a', REPOSITORIO_MYSQL_SSL: 'quizas' }, /REPOSITORIO_MYSQL_SSL/],
    [{ REPOSITORIO_MYSQL_HOST: 'x', REPOSITORIO_MYSQL_USER: 'a', REPOSITORIO_MYSQL_SSL: 'verificar-ca' }, /necesita REPOSITORIO_MYSQL_SSL_CA/],
    [{ REPOSITORIO_SESION_INACTIVIDAD_MINUTOS: '1' }, /entre 5 y 1440/],
  ])('rechaza %j', (env, mensaje) => {
    expect(() => cargarConfiguracionRepositorio(env)).toThrow(ErrorDeConfiguracion);
    expect(() => cargarConfiguracionRepositorio(env)).toThrow(mensaje);
  });

  it('TLS: con CA se verifica la cadena (sin el nombre del host, como Cloud SQL por IP)', () => {
    const { mysql } = cargarConfiguracionRepositorio({
      REPOSITORIO_MYSQL_HOST: '35.202.0.1',
      REPOSITORIO_MYSQL_USER: 'app',
      REPOSITORIO_MYSQL_SSL_CA: ca,
    });
    expect(mysql?.ssl?.modo).toBe('verificar-ca');
    const opciones = crearOpcionesPool(mysql!);
    expect(opciones.ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: false });
    expect((opciones.ssl as { ca: string }).ca).toContain('BEGIN CERTIFICATE');
    expect(opciones.timezone).toBe('Z');
    expect(opciones.multipleStatements).toBe(false);
  });

  it('TLS: archivo inexistente o que no es PEM impide arrancar', () => {
    const base = { REPOSITORIO_MYSQL_HOST: 'x', REPOSITORIO_MYSQL_USER: 'a' };
    expect(() => cargarConfiguracionRepositorio({ ...base, REPOSITORIO_MYSQL_SSL_CA: join(carpeta, 'falta.pem') })).toThrow(
      /no se pudo leer/,
    );
    expect(() => cargarConfiguracionRepositorio({ ...base, REPOSITORIO_MYSQL_SSL_CA: join(carpeta, 'no-pem.txt') })).toThrow(
      /PEM/,
    );
  });

  it('TLS requerido sin verificar (no recomendado)', () => {
    const { mysql } = cargarConfiguracionRepositorio({
      REPOSITORIO_MYSQL_HOST: 'x',
      REPOSITORIO_MYSQL_USER: 'a',
      REPOSITORIO_MYSQL_SSL: 'requerido',
    });
    expect(crearOpcionesPool(mysql!).ssl).toMatchObject({ rejectUnauthorized: false });
  });

  describe('Postgres y Supabase Storage', () => {
    const URL_SUPABASE =
      'postgresql://postgres.abcd:cl%40ve%23segura@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

    it('URL de Supabase: datos para los mensajes, TLS obligatorio y sin sslmode en la URL', () => {
      const { postgres, mysql } = cargarConfiguracionRepositorio({ REPOSITORIO_POSTGRES_URL: URL_SUPABASE });
      expect(mysql).toBeNull();
      expect(postgres).toMatchObject({
        host: 'aws-1-us-east-1.pooler.supabase.com',
        puerto: 6543,
        usuario: 'postgres.abcd',
        baseDatos: 'postgres',
        ssl: { modo: 'requerido' },
        conexiones: 5,
        timeoutConexionMs: 10_000,
      });
      const opciones = crearOpcionesPoolPostgres(postgres!);
      expect(opciones.ssl).toMatchObject({ rejectUnauthorized: false });
      expect(opciones.max).toBe(5);
    });

    it('sslmode de la URL: disable en local, verify-full verifica el nombre del host', () => {
      const local = cargarConfiguracionRepositorio({
        REPOSITORIO_POSTGRES_URL: 'postgres://u:c@127.0.0.1:5432/repo',
      }).postgres!;
      expect(local.ssl).toBeNull();
      expect(crearOpcionesPoolPostgres(local).ssl).toBe(false);
      const estricta = cargarConfiguracionRepositorio({
        REPOSITORIO_POSTGRES_URL: `postgres://u:c@db.example.com/repo?sslmode=verify-full`,
        REPOSITORIO_POSTGRES_SSL_CA: ca,
      }).postgres!;
      expect(estricta.url).not.toContain('sslmode');
      expect(estricta.ssl).toMatchObject({ modo: 'verificar-identidad' });
      const opciones = crearOpcionesPoolPostgres(estricta).ssl as Record<string, unknown>;
      expect(opciones.rejectUnauthorized).toBe(true);
      expect(opciones.checkServerIdentity).toBeUndefined();
      expect(() =>
        cargarConfiguracionRepositorio({ REPOSITORIO_POSTGRES_URL: 'postgres://u:c@h/r?sslmode=raro' }),
      ).toThrow(/sslmode/);
    });

    it('una sola base: MySQL o Postgres', () => {
      expect(() =>
        cargarConfiguracionRepositorio({
          REPOSITORIO_POSTGRES_URL: URL_SUPABASE,
          REPOSITORIO_MYSQL_HOST: 'x',
          REPOSITORIO_MYSQL_USER: 'a',
        }),
      ).toThrow(ErrorDeConfiguracion);
      expect(() => cargarConfiguracionRepositorio({ REPOSITORIO_POSTGRES_URL: 'mysql://u@h/r' })).toThrow(/postgres:\/\//);
    });

    it('Supabase Storage: URL y clave juntas, bucket válido', () => {
      expect(cargarConfiguracionRepositorio({}).supabase).toBeNull();
      expect(
        cargarConfiguracionRepositorio({
          REPOSITORIO_SUPABASE_URL: 'https://abcd.supabase.co/',
          REPOSITORIO_SUPABASE_CLAVE: 'sb_secret_x',
        }).supabase,
      ).toEqual({ url: 'https://abcd.supabase.co', clave: 'sb_secret_x', bucket: 'repositorio' });
      expect(() => cargarConfiguracionRepositorio({ REPOSITORIO_SUPABASE_URL: 'https://abcd.supabase.co' })).toThrow(
        /van juntas/,
      );
      expect(() =>
        cargarConfiguracionRepositorio({
          REPOSITORIO_SUPABASE_URL: 'http://abcd.supabase.co',
          REPOSITORIO_SUPABASE_CLAVE: 'x',
        }),
      ).toThrow(/https/);
      expect(() =>
        cargarConfiguracionRepositorio({
          REPOSITORIO_SUPABASE_URL: 'https://abcd.supabase.co',
          REPOSITORIO_SUPABASE_CLAVE: 'x',
          REPOSITORIO_SUPABASE_BUCKET: 'Mi Bucket',
        }),
      ).toThrow(/bucket/);
    });
  });
});
