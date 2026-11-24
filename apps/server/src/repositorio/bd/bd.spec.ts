import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfiguracionRepositorio } from '../configuracion-repositorio.js';
import { ErrorRepositorioHttp } from '../errores-repositorio.js';
import {
  BaseDatosRepositorio,
  calcularTamanoTrozo,
  TAMANO_TROZO,
} from './base-datos.js';
import { TABLAS_CON_ID } from './conexion.js';
import {
  esColaLlena,
  esDuplicado,
  esErrorDeConexion,
  esPermisoDenegado,
  esReferenciada,
  esReintentable,
  esTablaInexistente,
} from './errores-bd.js';
import {
  DIRECTORIO_MIGRACIONES,
  DIRECTORIO_MIGRACIONES_POSTGRES,
  dividirSentencias,
  planRenombre,
  RUTA_ESQUEMA,
  RUTA_ESQUEMA_POSTGRES,
  TABLAS_RENOMBRADAS,
} from './esquema.js';

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };

/** Módulo de una tabla: lo que va antes del primer guion bajo (repositorio, sivu, pai, crm, sistema). */
function modulo(tabla: string): string {
  return tabla.split('_')[0];
}

/** Sentencias de un guion, sin comentarios (basta para comparar CREATE TABLE y CREATE INDEX). */
function sentenciasDe(directorio: string, archivo: string): string[] {
  return readFileSync(join(directorio, archivo), 'utf8')
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia.length > 0);
}

/** Tablas que crea un guion (sin comentarios), en orden. */
function tablasDe(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
}

/** Columnas de una tabla en un guion, en orden (las líneas «  nombre TIPO …» en minúscula). */
function columnas(sql: string): string[] {
  return [...sql.matchAll(/^ {2}([a-z_]+) +\S/gm)].map((m) => m[1]);
}

/** Nombres de llaves, índices y CHECK del CRM en un guion (sin comentarios). */
function nombresCrmDe(sql: string): Set<string> {
  return new Set(sql.match(/\b(?:uq|ix|fk|ck)_crm_\w+/g));
}

describe('guion del esquema', () => {
  it('divide esquema.sql en sus 15 sentencias', () => {
    const sentencias = dividirSentencias(readFileSync(RUTA_ESQUEMA, 'utf8'));
    // La guarda de la versión 4, 12 CREATE TABLE y 2 INSERT.
    expect(sentencias).toHaveLength(15);
    expect(sentencias.filter((s) => s.startsWith('CREATE TABLE IF NOT EXISTS'))).toHaveLength(12);
    expect(sentencias.at(-1)).toMatch(/^INSERT IGNORE INTO sistema_esquema_version/);
  });

  it('toda tabla lleva el prefijo de su módulo, en los dos motores', () => {
    const PREFIJOS = /^(repositorio|sivu|pai|crm|sistema)_/;
    const guiones = [RUTA_ESQUEMA, RUTA_ESQUEMA_POSTGRES];
    for (const directorio of [DIRECTORIO_MIGRACIONES, DIRECTORIO_MIGRACIONES_POSTGRES]) {
      for (const archivo of readdirSync(directorio)) guiones.push(join(directorio, archivo));
    }
    const creadas = new Set<string>();
    for (const ruta of guiones) {
      const sql = readFileSync(ruta, 'utf8').replace(/--[^\n]*/g, '');
      for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gi)) creadas.add(m[1]);
    }
    // 39 + las 8 del tablero de los fondos (007) + las 3 del acceso a tableros (008) + las 2 de la consulta (009)
    // + las 10 del CRM (010) + la cuenta de correo del CRM (011).
    expect(creadas.size).toBe(63);
    expect([...creadas].filter((tabla) => !PREFIJOS.test(tabla))).toEqual([]);
    // SIVU: el catálogo sivu_tableros, por cada tablero sivu_tablero_<tablero>_<tabla> y el acceso a
    // los tableros privados, sivu_acceso_<tabla> (migración 008).
    const TABLA_DE_TABLERO = /^sivu_tablero_[a-z0-9]+(?:_[a-z0-9]+)+$/;
    const sivu = [...creadas].filter((tabla) => tabla.startsWith('sivu_') && tabla !== 'sivu_tableros' && !/^sivu_acceso_[a-z]+$/.test(tabla));
    expect(sivu.length).toBeGreaterThan(0);
    expect(sivu.filter((tabla) => !TABLA_DE_TABLERO.test(tabla))).toEqual([]);
    // Postgres corta (con solo un aviso) los nombres de más de 63 caracteres.
    expect([...creadas].filter((tabla) => tabla.length > 63)).toEqual([]);
    // Ningún nombre anterior sigue creándose ni se reutiliza como nombre nuevo.
    const viejos = TABLAS_RENOMBRADAS.map(([viejo]) => viejo);
    expect(viejos.filter((viejo) => creadas.has(viejo))).toEqual([]);
    expect(TABLAS_RENOMBRADAS.map(([, nuevo]) => nuevo).filter((nuevo) => !creadas.has(nuevo))).toEqual([]);
  });

  it('cada módulo tiene su almacén de archivos y ninguna llave foránea cruza de módulo', () => {
    const guiones = [RUTA_ESQUEMA, RUTA_ESQUEMA_POSTGRES];
    for (const directorio of [DIRECTORIO_MIGRACIONES, DIRECTORIO_MIGRACIONES_POSTGRES]) {
      for (const archivo of readdirSync(directorio)) guiones.push(join(directorio, archivo));
    }
    const cruces: string[] = [];
    let llaves = 0;
    for (const ruta of guiones) {
      const sql = readFileSync(ruta, 'utf8').replace(/--[^\n]*/g, '');
      // Cada CREATE TABLE o ALTER TABLE, hasta la siguiente sentencia.
      for (const m of sql.matchAll(/(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\s+`?(\w+)`?([\s\S]*?)(?=CREATE TABLE|ALTER TABLE|$)/gi)) {
        for (const r of m[2].matchAll(/REFERENCES\s+`?(\w+)`?/gi)) {
          llaves++;
          if (modulo(r[1]) !== modulo(m[1])) cruces.push(`${ruta.split('/').slice(-2).join('/')}: ${m[1]} -> ${r[1]}`);
        }
      }
    }
    expect(llaves).toBeGreaterThan(30);
    expect(cruces).toEqual([]);
  });

  it('la migración 004 crea el almacén del PAI igual que la 003 (bases que ya tenían la 3)', () => {
    for (const directorio of [DIRECTORIO_MIGRACIONES, DIRECTORIO_MIGRACIONES_POSTGRES]) {
      const tablas = (archivo: string): string[] =>
        readFileSync(join(directorio, archivo), 'utf8')
          .replace(/--[^\n]*/g, '')
          .split(';')
          .map((sentencia) => sentencia.trim())
          .filter((sentencia) => sentencia.startsWith('CREATE TABLE IF NOT EXISTS pai_almacen_'));
      const en003 = tablas('003-pai.sql');
      expect(en003).toHaveLength(2);
      expect(tablas('004-nombres-por-modulo.sql')).toEqual(en003);
    }
  });

  describe('migración 010 (CRM)', () => {
    // Sin comentarios: la cabecera menciona CREATE TABLE IF NOT EXISTS.
    const mysql = readFileSync(join(DIRECTORIO_MIGRACIONES, '010-crm.sql'), 'utf8').replace(/--[^\n]*/g, '');
    const postgres = readFileSync(join(DIRECTORIO_MIGRACIONES_POSTGRES, '010-crm.sql'), 'utf8').replace(/--[^\n]*/g, '');

    it('crea las mismas 10 tablas en los dos motores, con las de id en TABLAS_CON_ID, y no toca sistema_esquema_version', () => {
      const tablas = tablasDe(mysql);
      expect(tablas).toHaveLength(10);
      expect(tablasDe(postgres)).toEqual(tablas);
      expect(tablas.filter((tabla) => !tabla.startsWith('crm_'))).toEqual([]);
      // MySQL: 10 sentencias que se pueden repetir, sin # (el divisor lo toma por comentario).
      const divididas = dividirSentencias(mysql);
      expect(divididas).toHaveLength(10);
      expect(divididas.filter((s) => !s.startsWith('CREATE TABLE IF NOT EXISTS crm_'))).toEqual([]);
      expect(mysql).not.toContain('#');
      const conId = [...mysql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(\s*id\s+\w+ UNSIGNED NOT NULL AUTO_INCREMENT/g)].map((m) => m[1]);
      expect(conId).toEqual(tablas.filter((tabla) => tabla !== 'crm_almacen_archivo_trozos'));
      expect(conId.filter((tabla) => !TABLAS_CON_ID.has(tabla))).toEqual([]);
      const conIdentidad = [
        ...postgres.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(\s*id\s+(?:integer|bigint) GENERATED BY DEFAULT AS IDENTITY/g),
      ].map((m) => m[1]);
      expect(conIdentidad).toEqual(conId);
      for (const sql of [mysql, postgres]) expect(sql).not.toMatch(/INSERT\s+(IGNORE\s+)?INTO\s+(sistema_)?esquema_version/i);
      // Postgres: trigger de actualizado_en en las tablas que lo tienen, y RLS en todas.
      expect([...postgres.matchAll(/CREATE TRIGGER (tr_crm_\w+)_actualizado/g)].map((m) => m[1].slice(3))).toEqual([
        'crm_personas',
        'crm_tareas',
        'crm_acceso_usuarios',
      ]);
      expect([...postgres.matchAll(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1])).toEqual(tablas);
    });

    it('las llaves, índices y CHECK tienen el mismo nombre en los dos motores (Postgres suma los de UNSIGNED y activo)', () => {
      const enMysql = nombresCrmDe(mysql);
      const enPostgres = nombresCrmDe(postgres);
      expect([...enMysql].filter((nombre) => !enPostgres.has(nombre))).toEqual([]);
      expect([...enPostgres].filter((nombre) => !enMysql.has(nombre)).toSorted()).toEqual([
        'ck_crm_acceso_usuarios_activo',
        'ck_crm_almacen_archivos_bytes',
        'ck_crm_correos_intentos',
        'ck_crm_personas_foto_version',
      ]);
      // Postgres corta (con solo un aviso) los nombres de más de 63 caracteres.
      expect([...enPostgres].filter((nombre) => nombre.length > 63)).toEqual([]);
    });

    it('el almacén es el del PAI (003) y el acceso del líder el de los tableros (008), con el prefijo crm_', () => {
      for (const directorio of [DIRECTORIO_MIGRACIONES, DIRECTORIO_MIGRACIONES_POSTGRES]) {
        const en010 = sentenciasDe(directorio, '010-crm.sql');
        const copiadas = [
          ...sentenciasDe(directorio, '003-pai.sql')
            .filter((s) => /^CREATE (?:TABLE|INDEX) IF NOT EXISTS \w*pai_almacen_/.test(s))
            .map((s) => s.replaceAll('pai_', 'crm_')),
          ...sentenciasDe(directorio, '008-acceso-tableros.sql')
            .filter((s) => /^CREATE (?:TABLE|INDEX) IF NOT EXISTS \w*sivu_acceso_/.test(s))
            .map((s) => s.replaceAll('sivu_', 'crm_')),
        ];
        expect(copiadas.length).toBeGreaterThanOrEqual(5);
        expect(copiadas.filter((s) => !en010.includes(s))).toEqual([]);
      }
    });
  });

  describe('migración 011 (cuenta de correo del CRM)', () => {
    const mysql = readFileSync(join(DIRECTORIO_MIGRACIONES, '011-crm-cuenta-correo.sql'), 'utf8').replace(/--[^\n]*/g, '');
    const postgres = readFileSync(join(DIRECTORIO_MIGRACIONES_POSTGRES, '011-crm-cuenta-correo.sql'), 'utf8').replace(
      /--[^\n]*/g,
      '',
    );
    it('crea crm_correo_cuenta en los dos motores, de una sola fila (CHECK id = 1, sin autoincremento), sin tocar sistema_esquema_version', () => {
      expect(tablasDe(mysql)).toEqual(['crm_correo_cuenta']);
      expect(tablasDe(postgres)).toEqual(['crm_correo_cuenta']);
      // MySQL: una sentencia que se puede repetir, sin # (el divisor lo toma por comentario).
      expect(dividirSentencias(mysql)).toHaveLength(1);
      expect(mysql).not.toContain('#');
      for (const sql of [mysql, postgres]) {
        expect(sql).toMatch(/CONSTRAINT ck_crm_correo_cuenta_id CHECK \(id = 1\)/);
        expect(sql).not.toMatch(/AUTO_INCREMENT|IDENTITY/);
        expect(sql).not.toMatch(/INSERT\s+(IGNORE\s+)?INTO/i);
      }
      expect(TABLAS_CON_ID.has('crm_correo_cuenta')).toBe(false);
      const esperadas = ['id', 'usuario', 'clave_cifrada', 'host', 'puerto', 'seguro', 'nombre', 'actualizado_en', 'actualizado_por'];
      expect(columnas(mysql)).toEqual(esperadas);
      expect(columnas(postgres)).toEqual(esperadas);
      expect(nombresCrmDe(postgres)).toEqual(nombresCrmDe(mysql));
      // Postgres: RLS y sin permisos para la API pública de Supabase.
      expect([...postgres.matchAll(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1])).toEqual(['crm_correo_cuenta']);
      expect(postgres).toMatch(/REVOKE ALL ON crm_correo_cuenta FROM anon, authenticated/);
    });
  });

  describe('migración 012 (tareas propias del CRM)', () => {
    const mysql = readFileSync(join(DIRECTORIO_MIGRACIONES, '012-crm-tareas-propias.sql'), 'utf8').replace(/--[^\n]*/g, '');
    const postgres = readFileSync(join(DIRECTORIO_MIGRACIONES_POSTGRES, '012-crm-tareas-propias.sql'), 'utf8').replace(
      /--[^\n]*/g,
      '',
    );
    it('agrega crm_personas.puede_crear_tareas (0/1, en 0) en los dos motores, se puede repetir y no toca sistema_esquema_version', () => {
      // MySQL: la guarda por information_schema y el PREPARE (sin ADD COLUMN IF NOT EXISTS), sin #.
      expect(dividirSentencias(mysql)).toHaveLength(4);
      expect(mysql).not.toContain('#');
      expect(mysql).toMatch(/table_name = 'crm_personas' AND column_name = 'puede_crear_tareas'/);
      expect(mysql).toMatch(/ADD COLUMN puede_crear_tareas TINYINT\(1\) NOT NULL DEFAULT 0/);
      expect(postgres).toMatch(/ADD COLUMN IF NOT EXISTS puede_crear_tareas smallint NOT NULL DEFAULT 0/);
      for (const sql of [mysql, postgres]) {
        expect(sql).toMatch(/CONSTRAINT ck_crm_personas_puede_crear_tareas CHECK \(puede_crear_tareas IN \(0, 1\)\)/);
        expect(sql).not.toMatch(/INSERT\s+(IGNORE\s+)?INTO/i);
      }
    });
  });

  describe('paso a los nombres de la versión 4', () => {
    const ANTERIORES = new Set(TABLAS_RENOMBRADAS.map(([viejo]) => viejo));

    it('renombra las tablas de una base con los nombres anteriores', () => {
      expect(planRenombre(ANTERIORES)).toHaveLength(TABLAS_RENOMBRADAS.length);
      // Una base de la versión 1 (sin tablas del tablero ni del PAI).
      expect(planRenombre(new Set(['esquema_version', 'documentos', 'pai_usuarios']))).toEqual([
        ['esquema_version', 'sistema_esquema_version'],
        ['documentos', 'repositorio_documentos'],
      ]);
    });

    it('termina un renombre que quedó a medias (la tabla de versiones ya con el nombre nuevo)', () => {
      const aMedias = new Set([...ANTERIORES].filter((tabla) => tabla !== 'esquema_version'));
      aMedias.add('sistema_esquema_version');
      expect(planRenombre(aMedias, 3)).toHaveLength(TABLAS_RENOMBRADAS.length - 1);
      expect(planRenombre(aMedias, 0)).toHaveLength(TABLAS_RENOMBRADAS.length - 1);
    });

    it('no toca una base nueva, ajena o ya migrada', () => {
      expect(planRenombre(new Set())).toEqual([]);
      // Ajena: tablas que se llaman igual, pero sin tabla de versiones.
      expect(planRenombre(new Set(['documentos', 'sesiones', 'cambios']))).toEqual([]);
      // Ya en la versión 4: una tabla "documentos" sería de otra aplicación.
      expect(planRenombre(new Set(['sistema_esquema_version', 'repositorio_documentos', 'documentos']), 4)).toEqual([]);
    });

    it('se detiene si una tabla existe con el nombre anterior y con el nuevo', () => {
      expect(() => planRenombre(new Set([...ANTERIORES, 'repositorio_documentos']))).toThrow(
        /documentos y repositorio_documentos.*DROP TABLE repositorio_documentos/,
      );
      // Caso real: el esquema.sql nuevo pegado sobre una base vieja crea primero
      // sistema_esquema_version (vacía) junto a esquema_version.
      expect(() => planRenombre(new Set([...ANTERIORES, 'sistema_esquema_version']), 0)).toThrow(
        /esquema_version y sistema_esquema_version.*DROP TABLE sistema_esquema_version/,
      );
    });

    it('esquema.sql se detiene antes de crear nada en una base con los nombres anteriores', () => {
      const [guarda] = dividirSentencias(readFileSync(RUTA_ESQUEMA, 'utf8'));
      expect(guarda).toMatch(/^SELECT \(\s*SELECT 1\s+UNION ALL\s+SELECT 1 FROM information_schema\.tables/);
      expect(guarda).toMatch(/table_name = 'esquema_version'/);
      const postgres = readFileSync(RUTA_ESQUEMA_POSTGRES, 'utf8').replace(/--[^\n]*/g, '');
      expect(postgres.indexOf("to_regclass('esquema_version') IS NOT NULL")).toBeGreaterThan(-1);
      expect(postgres.indexOf("to_regclass('esquema_version')")).toBeLessThan(postgres.indexOf('CREATE TABLE'));
    });
  });

  it('respeta comillas, comentarios y punto y coma dentro de textos', () => {
    const sql = `-- comentario; con punto y coma
      INSERT INTO t VALUES ('a;b', "c;d", \`e;f\`); # otro; comentario
      /* bloque; */ SELECT 'it''s; ok';
      SELECT 'barra \\'; sigue';`;
    expect(dividirSentencias(sql)).toEqual([
      "INSERT INTO t VALUES ('a;b', \"c;d\", `e;f`)",
      "SELECT 'it''s; ok'",
      "SELECT 'barra \\'; sigue'",
    ]);
  });

  it('el esquema no usa sintaxis de MySQL 8.0.19+ ni DELIMITER', () => {
    const sql = readFileSync(RUTA_ESQUEMA, 'utf8');
    // Sobre las sentencias, sin los comentarios (que sí mencionan esas palabras).
    const sentencias = dividirSentencias(sql).join(';\n');
    expect(sentencias).not.toMatch(/\bVALUES\s+ROW\b|\bAS\s+new\b|^\s*TABLE\s|DELIMITER/im);
    expect(sql).toMatch(/utf8mb4_0900_ai_ci/);
    expect(sql).not.toMatch(/ENGINE=(?!InnoDB)/);
  });
});

describe('tamaño de los trozos', () => {
  it('1 MiB con el max_allowed_packet normal y menos si es muy bajo', () => {
    expect(calcularTamanoTrozo(64 * 1024 * 1024)).toBe(TAMANO_TROZO);
    expect(calcularTamanoTrozo(4 * 1024 * 1024)).toBe(TAMANO_TROZO);
    expect(calcularTamanoTrozo(1024 * 1024)).toBe(512 * 1024 - 64 * 1024);
    expect(calcularTamanoTrozo(0)).toBe(TAMANO_TROZO);
  });
});

describe('clasificación de errores de pg (Postgres)', () => {
  it('conexión, duplicados, reintentos y tablas faltantes', () => {
    expect(esErrorDeConexion({ code: '08006' })).toBe(true);
    expect(esErrorDeConexion({ code: '57P01' })).toBe(true);
    expect(esErrorDeConexion({ code: '28P01' })).toBe(true);
    expect(esErrorDeConexion(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(esErrorDeConexion(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(esErrorDeConexion({ code: '23505' })).toBe(false);
    expect(esDuplicado({ code: '23505', constraint: 'uq_archivos_sha256' }, 'uq_archivos_sha256')).toBe(true);
    expect(esDuplicado({ code: '23505', constraint: 'uq_categorias_nombre' }, 'uq_archivos_sha256')).toBe(false);
    expect(esDuplicado({ code: '23505', constraint: 'documentos_pkey' }, 'PRIMARY')).toBe(true);
    expect(esDuplicado({ code: '23505' })).toBe(true);
    expect(esReintentable({ code: '40P01' })).toBe(true);
    expect(esReintentable({ code: '40001' })).toBe(true);
    expect(esTablaInexistente({ code: '42P01' })).toBe(true);
    expect(esReferenciada({ code: '23503' })).toBe(true);
    expect(esPermisoDenegado({ code: '42501' })).toBe(true);
    expect(esPermisoDenegado({ code: 'ER_TABLEACCESS_DENIED_ERROR' })).toBe(true);
  });
});

describe('clasificación de errores de mysql2', () => {
  it('conexión, duplicados y reintentos', () => {
    expect(esErrorDeConexion({ code: 'ECONNREFUSED' })).toBe(true);
    expect(esErrorDeConexion({ code: 'ER_ACCESS_DENIED_ERROR' })).toBe(true);
    expect(esErrorDeConexion({ code: 'X', fatal: true })).toBe(true);
    expect(esErrorDeConexion({ code: 'ER_DUP_ENTRY' })).toBe(false);
    expect(esDuplicado({ code: 'ER_DUP_ENTRY', sqlMessage: "for key 'archivos.uq_archivos_sha256'" }, 'uq_archivos_sha256')).toBe(true);
    expect(esDuplicado({ code: 'ER_DUP_ENTRY', sqlMessage: "for key 'PRIMARY'" }, 'uq_archivos_sha256')).toBe(false);
    expect(esReintentable({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
  });

  it('cola del pool llena (mysql2 3.x, sin código): 503 corto, sin marcar la base como caída', () => {
    // Igual que mysql2/lib/base/pool.js; el envoltorio de promesas copia el
    // mensaje y deja `code` sin definir.
    const error = new Error('Queue limit reached.');
    expect(esColaLlena(error)).toBe(true);
    expect(esErrorDeConexion(error)).toBe(false);
    expect(esColaLlena(Object.assign(new Error('Queue limit reached.'), { code: 'OTRO' }))).toBe(false);
    expect(esColaLlena({ message: 'Queue limit reached.' })).toBe(false);
    expect(esErrorDeConexion({ code: 'POOL_ENQUEUELIMIT' })).toBe(false);

    const avisos: string[] = [];
    const bd = new BaseDatosRepositorio(cargarConfiguracionRepositorio({}));
    bd.registro = { ...SILENCIO, warn: (mensaje: string) => avisos.push(mensaje) };
    const traducido = bd.traducir(error);
    expect(traducido).toBeInstanceOf(ErrorRepositorioHttp);
    expect((traducido as ErrorRepositorioHttp).getStatus()).toBe(503);
    expect(traducido).toMatchObject({ codigo: 'no_disponible', reintentarEn: 2 });
    for (let i = 0; i < 5; i++) bd.traducir(new Error('Queue limit reached.'));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/Pool de MySQL saturado/);
    expect(bd.estado).toBe('sin_configurar');
  });
});

describe('disponibilidad de la base', () => {
  it('sin configurar: 503 no_disponible de inmediato', async () => {
    const bd = new BaseDatosRepositorio(cargarConfiguracionRepositorio({}));
    bd.registro = SILENCIO;
    bd.iniciar();
    expect(bd.estado).toBe('sin_configurar');
    const error = await bd.listo().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRepositorioHttp);
    expect((error as ErrorRepositorioHttp).getStatus()).toBe(503);
    expect((error as ErrorRepositorioHttp).codigo).toBe('no_disponible');
    await bd.cerrar();
  });

  describe('configurada pero inalcanzable', () => {
    let servidor: Server;
    let puerto: number;
    let conexiones = 0;

    beforeAll(async () => {
      // Un puerto que acepta y cierra la conexión al instante (no es MySQL).
      servidor = createServer((socket) => {
        conexiones++;
        socket.destroy();
      });
      await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
      puerto = (servidor.address() as { port: number }).port;
    });

    afterAll(async () => {
      await new Promise((listo) => servidor.close(listo));
    });

    it('responde 503 rápido, avisa una sola vez y no tumba el proceso', async () => {
      const avisos: string[] = [];
      const bd = new BaseDatosRepositorio(
        cargarConfiguracionRepositorio({
          REPOSITORIO_MYSQL_HOST: '127.0.0.1',
          REPOSITORIO_MYSQL_PORT: String(puerto),
          REPOSITORIO_MYSQL_USER: 'nadie',
          REPOSITORIO_MYSQL_TIMEOUT_SEGUNDOS: '2',
        }),
      );
      bd.registro = { ...SILENCIO, warn: (mensaje: string) => avisos.push(mensaje) };
      bd.iniciar();
      const inicio = Date.now();
      await expect(bd.listo()).rejects.toMatchObject({ codigo: 'no_disponible' });
      expect(bd.estado).toBe('no_disponible');
      // Las siguientes peticiones no esperan: 503 inmediato.
      const otra = Date.now();
      await expect(bd.filas('SELECT 1')).rejects.toMatchObject({ codigo: 'no_disponible' });
      expect(Date.now() - otra).toBeLessThan(200);
      expect(Date.now() - inicio).toBeLessThan(5000);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatch(/Se reintentará en segundo plano/);
      await bd.cerrar();
    });

    it('en una instancia que se congela (VERCEL=1) nada queda en segundo plano: la petición verifica y reintenta', async () => {
      const avisos: string[] = [];
      const bd = new BaseDatosRepositorio(
        cargarConfiguracionRepositorio({
          REPOSITORIO_POSTGRES_URL: `postgres://nadie@127.0.0.1:${puerto}/repositoriobd`,
          REPOSITORIO_POSTGRES_TIMEOUT_SEGUNDOS: '2',
          VERCEL: '1',
        }),
      );
      bd.registro = { ...SILENCIO, warn: (mensaje: string) => avisos.push(mensaje) };
      const antes = conexiones;
      bd.iniciar();
      // Al arrancar no se conecta: lo hace la primera petición, que lo espera.
      await new Promise((listo) => setTimeout(listo, 100));
      expect(conexiones).toBe(antes);
      expect(bd.estado).toBe('conectando');
      await expect(bd.listo()).rejects.toMatchObject({ codigo: 'no_disponible' });
      expect(conexiones).toBe(antes + 1);
      expect(bd.estado).toBe('no_disponible');
      expect(avisos).toEqual([expect.stringMatching(/Se reintentará con una próxima petición/)]);
      // Antes del siguiente intento (1 s después del fallo): 503 inmediato, sin conectar.
      await expect(bd.filas('SELECT 1')).rejects.toMatchObject({ codigo: 'no_disponible', reintentarEn: 1 });
      // Sin temporizador: nadie reintenta hasta que llega otra petición.
      await new Promise((listo) => setTimeout(listo, 1100));
      expect(conexiones).toBe(antes + 1);
      await expect(bd.listo()).rejects.toMatchObject({ codigo: 'no_disponible' });
      expect(conexiones).toBe(antes + 2);
      await bd.cerrar();
    });
  });
});
