import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import type { Pool as PoolPg } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type AlmacenArchivos, AlmacenArchivosBd } from '../src/repositorio/archivos/almacen-archivos.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../src/repositorio/bd/conexion.js';
import { esPermisoDenegado } from '../src/repositorio/bd/errores-bd.js';
import { dividirSentencias, RUTA_ESQUEMA, RUTA_ESQUEMA_POSTGRES, TABLAS_RENOMBRADAS } from '../src/repositorio/bd/esquema.js';
import { conteosRepositorio, importarPaquete } from '../src/repositorio/importacion/importador.js';
import { ServicioLecturaRepositorio } from '../src/repositorio/servicios/lectura-repositorio.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import { crearFixturePai } from './pai-apoyo.js';
import {
  avisarSiNoHayBd,
  type BasePrueba,
  crearAppRepositorio,
  crearBasePrueba,
  crearPaqueteSintetico,
  cuerpoBinario,
  ES_POSTGRES,
  HAY_BD,
  MOTOR_PRUEBAS,
  MINIATURAS_REALES,
  PAQUETE_REAL,
  type PaqueteSintetico,
} from './repositorio-apoyo.js';

/**
 * Base de datos real (MySQL de MYSQL_PRUEBAS o Postgres de POSTGRES_PRUEBAS,
 * desechables): esquema, archivos en trozos e importación del paquete. Sin
 * ninguna de las dos se omite.
 */

avisarSiNoHayBd('repositorio-bd');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

async function leerFlujo(flujo: NodeJS.ReadableStream): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of flujo) partes.push(parte as Buffer);
  return Buffer.concat(partes);
}

/** El error con que falla la promesa (o null si no falla). */
async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error;
  }
}

/** Posiciones "Más recientes" de una lista ordenada. */
function consecutivas(lista: Array<[string, number]>): number[] {
  return lista.map(([, orden]) => orden);
}

describe.skipIf(!HAY_BD)(`repositorio con ${MOTOR_PRUEBAS}: esquema, archivos e importación (e2e)`, () => {
  let base: BasePrueba;
  let bd: BaseDatosRepositorio;

  const posiciones = async (): Promise<Array<[string, number]>> => {
    const [filas] = await base.admin.query<RowDataPacket[]>('SELECT id, orden FROM repositorio_documentos ORDER BY orden, id');
    return filas.map((f) => [String(f.id), Number(f.orden)]);
  };

  beforeAll(async () => {
    base = await crearBasePrueba('bd');
    bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await bd.listo();
  });

  afterAll(async () => {
    await bd?.cerrar();
    await base?.borrar();
  });

  it('el esquema se puede aplicar otra vez sin cambiar nada', async () => {
    const resultado = await base.aplicarEsquema();
    // Versión 4: el esquema inicial más las migraciones 002 (tablero de matrícula), 003 (PAI)
    // y 004 (nombres con el prefijo de su módulo).
    expect(resultado).toMatchObject({ versionAntes: 10, versionDespues: 10, migraciones: [], renombradas: [] });
    // En MySQL el esquema se aplica sentencia por sentencia (15); en Postgres, completo.
    expect(ES_POSTGRES || resultado.sentencias === 15).toBe(true);
    // 14 del repositorio (repositorio_*, con su almacén y las subidas por partes, y sistema_esquema_version),
    // 19 de los tableros (sivu_*: el catálogo, 5 de matrícula, 8 de los fondos, 3 del acceso y 2 de la consulta),
    // 19 del PAI (pai_*, con su almacén) y 10 del CRM (crm_*, con su almacén y el acceso del líder).
    expect(await base.tablas()).toHaveLength(62);
  });

  it('migrar aplica una migración que falta aunque haya una posterior registrada (REG-1)', async () => {
    // Como si alguien hubiera pegado a mano 003 y registrado la versión 3 sin la 2.
    await base.admin.query('DELETE FROM sistema_esquema_version WHERE version = 2');
    const resultado = await base.aplicarEsquema();
    expect(resultado.migraciones).toEqual(['2-tablero-matricula']);
    const [filas] = await base.admin.query<RowDataPacket[]>('SELECT version FROM sistema_esquema_version ORDER BY version');
    expect(filas.map((f) => Number(f.version))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await base.tablas()).toHaveLength(62);
  });

  it('una base con los nombres anteriores pasa a los nuevos sin duplicar tablas ni perder filas', async () => {
    const categoria = await bd.ejecutar('INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)', ['Categoría antes de renombrar', 90]);
    const contar = async (tabla: string, donde = ''): Promise<number> => {
      const [filas] = await base.admin.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${tabla} ${donde}`);
      return Number(filas[0].n);
    };

    // En la versión 3 las evidencias del PAI usaban el almacén del repositorio
    // (sin pai_almacen_*): una ficha solo de una evidencia, con dos trozos, y
    // otra que comparte con un documento.
    await base.admin.query(
      ES_POSTGRES
        ? 'ALTER TABLE pai_evidencias DROP CONSTRAINT fk_pai_evidencias_archivo'
        : 'ALTER TABLE pai_evidencias DROP FOREIGN KEY fk_pai_evidencias_archivo',
    );
    await base.admin.query('DROP TABLE pai_almacen_archivo_trozos, pai_almacen_archivos');
    // Tampoco tenía lo de la versión 5 (subidas por partes).
    await base.admin.query('DROP TABLE repositorio_subida_partes, repositorio_subidas, pai_subida_partes');
    await base.admin.query('ALTER TABLE pai_subidas DROP COLUMN bytes');
    await base.admin.query(
      'ALTER TABLE pai_evidencias ADD CONSTRAINT fk_pai_evidencias_archivo FOREIGN KEY (archivo_id) REFERENCES repositorio_almacen_archivos (id)',
    );
    const ficha = async (sha: string, trozos: Buffer[]): Promise<number> => {
      const nueva = await bd.ejecutar(
        'INSERT INTO repositorio_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, ?, ?, ?)',
        [sha, 'application/pdf', trozos.reduce((total, t) => total + t.length, 0), trozos.length, 1_048_576],
      );
      for (const [n, datos] of trozos.entries()) {
        await bd.ejecutar('INSERT INTO repositorio_almacen_archivo_trozos (archivo_id, n, datos) VALUES (?, ?, ?)', [nueva.insertId, n, datos]);
      }
      return Number(nueva.insertId);
    };
    const soloEvidencia = await ficha('a1'.repeat(32), [Buffer.from('trozo 0'), Buffer.from('trozo 1')]);
    const compartida = await ficha('b2'.repeat(32), [Buffer.from('compartido')]);
    await bd.ejecutar(
      "INSERT INTO repositorio_documentos (id, orden, titulo, categoria_id, idioma, tipo, archivo_id) VALUES ('doc-v3', 900, 'Documento de la versión 3', ?, 'es', 'documento', ?)",
      [categoria.insertId, compartida],
    );
    const pai = await crearFixturePai(base);
    const reporte = await bd.ejecutar("INSERT INTO pai_reportes (indicador_id, bimestre, origen) VALUES (?, 1, 'aplicativo')", [
      pai.indicadores.th01,
    ]);
    for (const [nombre, archivoId] of [['solo.pdf', soloEvidencia], ['compartida.pdf', compartida]] as const) {
      await bd.ejecutar("INSERT INTO pai_evidencias (reporte_id, archivo_id, nombre, tipo, bytes) VALUES (?, ?, ?, 'application/pdf', 5)", [
        reporte.insertId,
        archivoId,
        nombre,
      ]);
    }

    const conteos = new Map<string, number>();
    for (const [, nuevo] of TABLAS_RENOMBRADAS) conteos.set(nuevo, await contar(nuevo));
    const [maximo] = await base.admin.query<RowDataPacket[]>('SELECT MAX(id) AS id FROM repositorio_categorias');

    // Como estaba una base de la versión 3: nombres anteriores (también los de
    // las secuencias y los NOT NULL de Postgres) y sin las versiones 4 a 10.
    if (ES_POSTGRES) {
      for (const [viejo, nuevo] of TABLAS_RENOMBRADAS) {
        await base.admin.query(`ALTER TABLE ${nuevo} RENAME TO ${viejo}`);
        const [noNulos] = await base.admin.query<RowDataPacket[]>(
          "SELECT conname FROM pg_constraint WHERE conrelid = ?::regclass AND contype = 'n' AND starts_with(conname, ?)",
          [viejo, `${nuevo}_`],
        );
        for (const { conname } of noNulos) {
          await base.admin.query(`ALTER TABLE ${viejo} RENAME CONSTRAINT ${conname} TO ${viejo}${String(conname).slice(nuevo.length)}`);
        }
        const [secuencia] = await base.admin.query<RowDataPacket[]>("SELECT pg_get_serial_sequence(?, 'id') AS s", [viejo]).catch(() => [[]]);
        if (secuencia[0]?.s) await base.admin.query(`ALTER SEQUENCE ${secuencia[0].s} RENAME TO ${viejo}_id_seq`);
      }
    } else {
      await base.admin.query(`RENAME TABLE ${TABLAS_RENOMBRADAS.map(([viejo, nuevo]) => `${nuevo} TO ${viejo}`).join(', ')}`);
    }
    await base.admin.query('DELETE FROM esquema_version WHERE version IN (4, 5, 6, 7, 8, 9, 10)');
    expect(await base.tablas()).toContain('documentos');

    // Pegar el esquema.sql nuevo (o correr un dist/ viejo) se detiene en la guarda sin crear nada.
    const guarda = ES_POSTGRES
      ? (/DO \$\$\s*BEGIN\s*IF to_regclass\('esquema_version'\)[\s\S]*?\$\$;/.exec(readFileSync(RUTA_ESQUEMA_POSTGRES, 'utf8'))?.[0] ?? '')
      : dividirSentencias(readFileSync(RUTA_ESQUEMA, 'utf8'))[0];
    expect(await errorDe(base.admin.query(guarda))).toBeTruthy();
    expect(await base.tablas()).not.toContain('sistema_esquema_version');

    // Si aun así quedó creada la tabla de versiones nueva (vacía), migrar se detiene y dice qué borrar.
    await base.admin.query('CREATE TABLE sistema_esquema_version (version INT NOT NULL PRIMARY KEY, descripcion VARCHAR(200) NOT NULL)');
    expect(String(await errorDe(base.aplicarEsquema()))).toMatch(/DROP TABLE sistema_esquema_version/);
    expect(await base.tablas()).toContain('documentos');
    await base.admin.query('DROP TABLE sistema_esquema_version');

    const resultado = await base.aplicarEsquema();
    expect(resultado).toMatchObject({
      versionAntes: 3,
      versionDespues: 10,
      migraciones: [
        '4-nombres-por-modulo',
        '5-subidas-por-partes',
        '6-descripcion',
        '7-tablero-fondos',
        '8-acceso-tableros',
        '9-consulta-fondos',
        '10-crm',
      ],
    });
    expect(resultado.renombradas).toHaveLength(TABLAS_RENOMBRADAS.length);
    const tablas = await base.tablas();
    expect(tablas).toHaveLength(62);
    expect(TABLAS_RENOMBRADAS.filter(([viejo]) => tablas.includes(viejo))).toEqual([]);
    // La ficha que solo usaba la evidencia (y sus dos trozos) pasó al almacén del PAI.
    const movidas = new Map([
      ['repositorio_almacen_archivos', 1],
      ['repositorio_almacen_archivo_trozos', 2],
    ]);
    for (const [tabla, n] of conteos) expect(await contar(tabla)).toBe(n - (movidas.get(tabla) ?? 0));

    // Las dos fichas de las evidencias están en el almacén del PAI con su mismo id y sus trozos.
    const [enPai] = await base.admin.query<RowDataPacket[]>('SELECT id, sha256, trozos FROM pai_almacen_archivos ORDER BY id');
    expect(enPai.map((f) => [Number(f.id), String(f.sha256), Number(f.trozos)])).toEqual([
      [soloEvidencia, 'a1'.repeat(32), 2],
      [compartida, 'b2'.repeat(32), 1],
    ]);
    const [trozos] = await base.admin.query<RowDataPacket[]>('SELECT archivo_id, n, datos FROM pai_almacen_archivo_trozos ORDER BY archivo_id, n');
    expect(trozos.map((f) => [Number(f.archivo_id), Number(f.n), Buffer.from(f.datos as Buffer).toString()])).toEqual([
      [soloEvidencia, 0, 'trozo 0'],
      [soloEvidencia, 1, 'trozo 1'],
      [compartida, 0, 'compartido'],
    ]);
    // La compartida sigue también en el del repositorio, para el documento.
    expect(await contar('repositorio_almacen_archivos', `WHERE id = ${compartida}`)).toBe(1);
    expect(await contar('repositorio_almacen_archivos', `WHERE id = ${soloEvidencia}`)).toBe(0);
    expect(await contar('repositorio_almacen_archivo_trozos', `WHERE archivo_id = ${soloEvidencia}`)).toBe(0);
    // La llave de las evidencias apunta al almacén del PAI y el id nuevo sigue después de los copiados.
    const [llave] = await base.admin.query<RowDataPacket[]>(
      ES_POSTGRES
        ? "SELECT confrelid::regclass::text AS tabla FROM pg_constraint WHERE conname = 'fk_pai_evidencias_archivo'"
        : "SELECT referenced_table_name AS tabla FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name = 'fk_pai_evidencias_archivo'",
    );
    expect(llave.map((f) => String(f.tabla))).toEqual(['pai_almacen_archivos']);
    // Con la cuenta administradora: en Postgres, un rol propio de la aplicación (como el de
    // estas pruebas) no tiene permisos sobre las tablas que crea la migración (LEEME.md).
    const [otra] = await base.admin.query<ResultadoEscritura>(
      'INSERT INTO pai_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, 0, 0, 1048576)',
      ['c3'.repeat(32), 'application/pdf'],
    );
    expect(Number(otra.insertId)).toBeGreaterThan(Math.max(soloEvidencia, compartida));
    // Se deja la base como estaba (las pruebas siguientes cuentan documentos y archivos).
    await base.admin.query('DELETE FROM pai_evidencias');
    await base.admin.query('DELETE FROM pai_almacen_archivos');
    await base.admin.query("DELETE FROM repositorio_documentos WHERE id = 'doc-v3'");
    await base.admin.query(`DELETE FROM repositorio_almacen_archivos WHERE id = ${compartida}`);

    // El usuario de la aplicación conserva sus permisos y el id sigue después del último.
    const nuevo = await bd.ejecutar('INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)', ['Categoría después de renombrar', 91]);
    expect(Number(nuevo.insertId)).toBeGreaterThan(Number(maximo[0].id));
    await bd.ejecutar('DELETE FROM repositorio_categorias WHERE orden IN (90, 91)');
    // Volver a migrar no hace nada.
    expect(await base.aplicarEsquema()).toMatchObject({ versionAntes: 10, versionDespues: 10, migraciones: [], renombradas: [] });
  });

  it.skipIf(!ES_POSTGRES)('en Postgres, las secuencias y los NOT NULL también quedan con el nombre nuevo', async () => {
    const [secuencias] = await base.admin.query<RowDataPacket[]>(
      "SELECT sequencename AS nombre FROM pg_sequences WHERE schemaname = current_schema() AND sequencename NOT LIKE 'pai\\_%' ORDER BY 1",
    );
    expect(secuencias.map((fila) => String(fila.nombre))).toEqual([
      'crm_acceso_intentos_id_seq',
      'crm_acceso_sesiones_id_seq',
      'crm_acceso_usuarios_id_seq',
      'crm_almacen_archivos_id_seq',
      'crm_correos_id_seq',
      'crm_personas_id_seq',
      'crm_tarea_archivos_id_seq',
      'crm_tarea_eventos_id_seq',
      'crm_tareas_id_seq',
      'repositorio_administradores_id_seq',
      'repositorio_almacen_archivos_id_seq',
      'repositorio_cambios_id_seq',
      'repositorio_categorias_id_seq',
      'repositorio_intentos_acceso_id_seq',
      'repositorio_palabras_clave_id_seq',
      'repositorio_sesiones_id_seq',
      'repositorio_subidas_id_seq',
      'sivu_acceso_intentos_id_seq',
      'sivu_acceso_sesiones_id_seq',
      'sivu_acceso_usuarios_id_seq',
      'sivu_tablero_fondos_2026_consultas_id_seq',
      'sivu_tablero_fondos_2026_fichas_id_seq',
    ]);
    const [viejos] = await base.admin.query<RowDataPacket[]>(
      "SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE c.contype = 'n' AND NOT starts_with(c.conname, t.relname || '_')",
    );
    expect(viejos).toEqual([]);
  });

  it('el usuario de la aplicación no puede crear ni borrar tablas', async () => {
    expect(esPermisoDenegado(await errorDe(bd.ejecutar('CREATE TABLE intruso (id INT)')))).toBe(true);
    expect(esPermisoDenegado(await errorDe(bd.ejecutar('DROP TABLE repositorio_cambios')))).toBe(true);
  });

  it('en una instancia que se congela (Vercel) verifica en la primera petición y renueva el pool inactivo', async () => {
    const congelada = new BaseDatosRepositorio({ ...base.config, instanciaCongelable: true });
    congelada.registro = SILENCIO;
    congelada.iniciar();
    const poolPg = (): PoolPg => (congelada as unknown as { poolPg: PoolPg }).poolPg;
    try {
      expect(congelada.estado).toBe('conectando');
      // La primera consulta verifica la conexión dentro de la petición.
      expect(await congelada.filas('SELECT 1 AS uno')).toEqual([{ uno: 1 }]);
      expect(congelada.estado).toBe('disponible');
      if (!ES_POSTGRES) return;
      const viejo = poolPg();
      // Una conexión inactiva que se cortó no indica que la base esté caída.
      viejo.emit('error', new Error('Connection terminated unexpectedly'));
      expect(congelada.estado).toBe('disponible');
      // Al despertar después del plazo de inactividad, el pool se cambia por uno nuevo.
      const reloj = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000);
      try {
        await congelada.listo();
      } finally {
        reloj.mockRestore();
      }
      expect(poolPg()).not.toBe(viejo);
      expect(viejo.ending).toBe(true);
      expect(await congelada.filas('SELECT 1 AS uno')).toEqual([{ uno: 1 }]);
      // Con uso reciente se conserva.
      const actual = poolPg();
      await congelada.listo();
      expect(poolPg()).toBe(actual);
    } finally {
      await congelada.cerrar();
    }
  });

  const almacen = (): AlmacenArchivos => new AlmacenArchivosBd(bd);

  describe('archivos en trozos', () => {
    const datos = randomBytes(2_500_000);

    it('guarda en trozos de 1 MiB, lee completo y por rangos, y no duplica', async () => {
      const guardado = await bd.transaccion((conexion) =>
        almacen().guardar(conexion, { datos }, { mime: 'application/pdf' }),
      );
      expect(guardado).toMatchObject({ nuevo: true, bytes: datos.length, trozos: 3, tamanoTrozo: 1024 * 1024 });
      expect(guardado.sha256).toBe(sha256(datos));
      const [trozos] = await base.admin.query<RowDataPacket[]>(
        'SELECT n, LENGTH(datos) AS largo FROM repositorio_almacen_archivo_trozos WHERE archivo_id = ? ORDER BY n',
        [guardado.id],
      );
      expect(trozos.map((t) => Number(t.largo))).toEqual([1048576, 1048576, 2_500_000 - 2 * 1048576]);

      expect(sha256(await leerFlujo(almacen().flujo(guardado)))).toBe(guardado.sha256);
      for (const [inicio, fin] of [
        [0, 0],
        [1048570, 1048590],
        [1048576, 2097151],
        [1000, 2_400_000],
        [2_499_990, 2_499_999],
      ]) {
        expect((await leerFlujo(almacen().flujo(guardado, inicio, fin))).equals(datos.subarray(inicio, fin + 1))).toBe(
          true,
        );
      }

      const otra = await bd.transaccion((conexion) =>
        almacen().guardar(conexion, { datos: Buffer.from(datos) }, { mime: 'application/pdf' }),
      );
      expect(otra).toMatchObject({ id: guardado.id, nuevo: false });
    });

    it('recolecta los archivos huérfanos con sus trozos', async () => {
      const antes = await base.admin.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM repositorio_almacen_archivo_trozos');
      expect(Number(antes[0][0].n)).toBeGreaterThan(0);
      expect((await almacen().recolectarHuerfanos()).archivos).toBe(1);
      const [despues] = await base.admin.query<RowDataPacket[]>(
        'SELECT (SELECT COUNT(*) FROM repositorio_almacen_archivos) AS a, (SELECT COUNT(*) FROM repositorio_almacen_archivo_trozos) AS t',
      );
      expect(despues[0]).toMatchObject({ a: 0, t: 0 });
    });
  });

  describe('importación de un paquete sintético', () => {
    let paquete: PaqueteSintetico;

    beforeAll(async () => {
      paquete = await crearPaqueteSintetico();
    });

    afterAll(async () => {
      await paquete?.limpiar();
    });

    it('es idempotente: dos corridas dejan los mismos datos', async () => {
      const primera = await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
      expect(primera).toMatchObject({ creados: 5, actualizados: 0, sinCambios: 0, categoriasCreadas: 3, archivosNuevos: 13 });
      expect(primera.avisos).toEqual([]);
      const conteos = await conteosRepositorio(bd);
      const [version1] = await base.admin.query<RowDataPacket[]>('SELECT version FROM repositorio_estado');

      const segunda = await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
      expect(segunda).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 5, archivosNuevos: 0, huerfanosBorrados: 0 });
      const otra = await conteosRepositorio(bd);
      expect({ ...otra, bytesBase: 0 }).toEqual({ ...conteos, bytesBase: 0 });
      const [version2] = await base.admin.query<RowDataPacket[]>('SELECT version FROM repositorio_estado');
      expect(version2[0].version).toBe(version1[0].version);

      expect(conteos).toMatchObject({
        publicados: 5,
        porIdioma: { es: 4, en: 1 },
        tableros: 1,
        conEntradaBlog: 1,
        conNota: 1,
        conArchivo: 3,
        conPortada: 5,
        conMiniatura: 5,
      });
      const [doc] = await base.admin.query<RowDataPacket[]>(
        `SELECT url_ver_externa, url_original, notas_internas, permite_descarga, publicado
           FROM repositorio_documentos WHERE id = 'boletin-19-fe-erratas-boletin-n-19-2021'`,
      );
      expect(doc[0]).toMatchObject({
        url_ver_externa: null,
        url_original: 'https://sapiencia.gov.co/wp-content/uploads/2021/08/fe-de-erratas.pdf',
        permite_descarga: 1,
        publicado: 1,
      });
      expect(doc[0].notas_internas).toMatch(/^Evidencia: Portada: Boletín 19/);
      // Las palabras clave con distinta escritura quedan como una sola.
      const [claves] = await base.admin.query<RowDataPacket[]>(
        "SELECT texto FROM repositorio_palabras_clave WHERE clave = 'educacion postsecundaria'",
      );
      expect(claves).toEqual([{ texto: 'Educación postsecundaria' }]);
    });

    it('un documento despublicado sigue despublicado al reimportar y --solo-nuevos no toca nada', async () => {
      await base.admin.query("UPDATE repositorio_documentos SET publicado = 0, titulo = 'Editado a mano' WHERE id = 'estudio-satisfaccion-2020'");
      const solo = await importarPaquete(bd, { paquete: paquete.directorio, soloNuevos: true });
      expect(solo).toMatchObject({ omitidos: 5, creados: 0, actualizados: 0 });
      const otra = await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
      expect(otra).toMatchObject({ actualizados: 1, sinCambios: 4 });
      const [fila] = await base.admin.query<RowDataPacket[]>(
        "SELECT titulo, publicado FROM repositorio_documentos WHERE id = 'estudio-satisfaccion-2020'",
      );
      expect(fila[0]).toEqual({ titulo: 'Satisfacción 2020', publicado: 0 });
      await base.admin.query("UPDATE repositorio_documentos SET publicado = 1 WHERE id = 'estudio-satisfaccion-2020'");
    });

    it('no vuelve a crear lo borrado en la administración ni deshace sus ediciones (salvo que se pida)', async () => {
      const borrado = 'estudio-seguimiento-tablero';
      const editado = 'estudio-brecha-digital-medellin-2023';
      // Lo mismo que hace la administración al borrar: fila, hueco y registro.
      const [antes] = await base.admin.query<RowDataPacket[]>('SELECT orden FROM repositorio_documentos WHERE id = ?', [borrado]);
      await base.admin.query('DELETE FROM repositorio_documentos WHERE id = ?', [borrado]);
      await base.admin.query('UPDATE repositorio_documentos SET orden = orden - 1 WHERE orden > ?', [antes[0]!.orden]);
      await base.admin.query(
        "INSERT INTO repositorio_cambios (fecha, usuario, accion, documento_id, detalle) VALUES (?, 'revisor', 'borrar', ?, 'Borró')",
        [new Date(), borrado],
      );
      await base.admin.query(
        "UPDATE repositorio_documentos SET titulo = 'Brecha digital (corregido)', actualizado_por = 'revisor' WHERE id = ?",
        [editado],
      );

      const solo = await importarPaquete(bd, { paquete: paquete.directorio, soloNuevos: true });
      expect(solo).toMatchObject({ creados: 0, omitidos: 4, omitidosBorrados: 1, omitidosEditados: 0 });
      expect(solo.avisos.some((aviso) => aviso.includes(borrado) && aviso.includes('--restaurar-borrados'))).toBe(true);

      const completa = await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
      expect(completa).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 3, omitidosBorrados: 1, omitidosEditados: 1 });
      expect(completa.avisos.some((aviso) => aviso.includes(editado) && aviso.includes('--forzar'))).toBe(true);
      const [doc] = await base.admin.query<RowDataPacket[]>('SELECT titulo FROM repositorio_documentos WHERE id = ?', [editado]);
      expect(doc[0]!.titulo).toBe('Brecha digital (corregido)');
      expect((await posiciones()).map(([id]) => id)).not.toContain(borrado);

      const forzada = await importarPaquete(bd, {
        paquete: paquete.directorio,
        miniaturas: paquete.miniaturas,
        forzar: true,
        restaurarBorrados: true,
      });
      expect(forzada).toMatchObject({ creados: 1, actualizados: 1, omitidosBorrados: 0, omitidosEditados: 0 });
      const [otra] = await base.admin.query<RowDataPacket[]>('SELECT titulo, actualizado_por FROM repositorio_documentos WHERE id = ?', [
        editado,
      ]);
      expect(otra[0]).toEqual({ titulo: 'Brecha digital en Medellín', actualizado_por: 'importador' });
      // El restaurado vuelve a su posición del paquete (4) abriendo lugar.
      expect(await posiciones()).toEqual([
        ['boletin-19-fe-erratas-boletin-n-19-2021', 1],
        ['estudio-brecha-digital-medellin-2023', 2],
        ['infografia-en-job-placement-2022', 3],
        ['estudio-seguimiento-tablero', 4],
        ['estudio-satisfaccion-2020', 5],
      ]);
      // Y una corrida más ya no cambia nada.
      expect(await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas })).toMatchObject({
        creados: 0,
        actualizados: 0,
        sinCambios: 5,
      });
    });

    it('un documento nuevo abre su posición (sin repetidas) y los existentes conservan la suya', async () => {
      // Paquete más reciente: un documento nuevo arriba y los demás corridos.
      const directorio = await mkdtemp(join(tmpdir(), 'repositorio-paquete-nuevo-'));
      try {
        const original = JSON.parse(readFileSync(join(paquete.directorio, 'repositorio.json'), 'utf8')) as {
          documentos: Array<Record<string, unknown>>;
        };
        const nuevo = {
          ...original.documentos.find((d) => d.id === 'estudio-seguimiento-tablero'),
          id: 'estudio-tablero-nuevo-2026',
          titulo: 'Tablero nuevo 2026',
          orden: 1,
          anio: 2026,
          url_ver: 'https://app.powerbi.com/view?r=nuevo',
        };
        const documentos = [nuevo, ...original.documentos.map((d) => ({ ...d, orden: Number(d.orden) + 1 }))];
        await symlink(join(paquete.directorio, 'documentos'), join(directorio, 'documentos'));
        await symlink(join(paquete.directorio, 'portadas'), join(directorio, 'portadas'));
        await writeFile(
          join(directorio, 'repositorio.json'),
          JSON.stringify({ version: 'prueba-2', generado: '2026-10-09', total: documentos.length, documentos }),
        );
        // La administración movió un documento: su posición debe sobrevivir.
        await base.admin.query("UPDATE repositorio_documentos SET orden = 6 WHERE id = 'boletin-19-fe-erratas-boletin-n-19-2021'");
        await base.admin.query('UPDATE repositorio_documentos SET orden = orden - 1 WHERE id <> ?', ['boletin-19-fe-erratas-boletin-n-19-2021']);
        await base.admin.query("UPDATE repositorio_documentos SET orden = 5 WHERE id = 'boletin-19-fe-erratas-boletin-n-19-2021'");

        const solo = await importarPaquete(bd, { paquete: directorio, soloNuevos: true });
        expect(solo).toMatchObject({ creados: 1, omitidos: 5 });
        const tras = await posiciones();
        expect(consecutivas(tras)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(tras[0]).toEqual(['estudio-tablero-nuevo-2026', 1]);
        expect(tras.at(-1)).toEqual(['boletin-19-fe-erratas-boletin-n-19-2021', 6]);

        // Una corrida completa no devuelve las posiciones del paquete ni cuenta
        // "actualizados" por eso.
        const completa = await importarPaquete(bd, { paquete: directorio, miniaturas: paquete.miniaturas });
        expect(completa).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 6 });
        expect(await posiciones()).toEqual(tras);
      } finally {
        await rm(directorio, { recursive: true, force: true });
      }
    });
  });
});

describe.skipIf(!HAY_BD || !existsSync(join(PAQUETE_REAL, 'repositorio.json')))(
  'importación del paquete real (e2e)',
  () => {
    let base: BasePrueba;
    let bd: BaseDatosRepositorio;
    let dist: DistTemporal;

    beforeAll(async () => {
      base = await crearBasePrueba('real');
      bd = new BaseDatosRepositorio(base.config);
      bd.registro = SILENCIO;
      bd.iniciar();
      await bd.listo();
      dist = await crearDistTemporal();
    });

    afterAll(async () => {
      await bd?.cerrar();
      await base?.borrar();
      await dist?.limpiar();
    });

    it('carga los 372 documentos con los conteos de la sección 8, dos veces', { timeout: 300_000 }, async () => {
      const opciones = { paquete: PAQUETE_REAL, miniaturas: existsSync(MINIATURAS_REALES) ? MINIATURAS_REALES : null };
      const primera = await importarPaquete(bd, opciones);
      expect(primera).toMatchObject({ leidos: 372, creados: 372, categoriasCreadas: 8 });
      const segunda = await importarPaquete(bd, opciones);
      expect(segunda).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 372, archivosNuevos: 0 });

      const c = await conteosRepositorio(bd);
      expect(c.publicados).toBe(372);
      expect(Object.fromEntries(c.porCategoria.map((x) => [x.categoria, x.documentos]))).toEqual({
        Boletín: 43,
        Estudio: 62,
        Infografía: 89,
        'Informe dinámico': 54,
        'Nota temática': 48,
        'Informe de tendencias': 8,
        'Educación superior en cifras': 66,
        'Otros productos': 2,
      });
      expect(c.porIdioma).toEqual({ es: 290, en: 82 });
      expect(c).toMatchObject({ tableros: 64, conEntradaBlog: 5, conNota: 6, conArchivo: 301, conPortada: 372 });
      expect(c.conMiniatura).toBe(opciones.miniaturas ? 372 : 0);
      process.stderr.write(
        `[repositorio-bd] paquete real: ${(primera.duracionMs / 1000).toFixed(1)} s la primera carga, ` +
          `${(segunda.duracionMs / 1000).toFixed(1)} s la segunda; ${c.archivos} archivos ` +
          `(${(c.bytesArchivos / 1024 / 1024).toFixed(1)} MB), base ${(c.bytesBase / 1024 / 1024).toFixed(1)} MB\n`,
      );
    });

    it('el PDF de 12,4 MB vuelve idéntico (sha256) desde la base y por HTTP', { timeout: 120_000 }, async () => {
      const id = 'boletin-24-panorama-general-mercado-laboral-medellin-2022';
      const original = await readFile(join(PAQUETE_REAL, 'documentos', `${id}.pdf`));
      expect(original.length).toBe(12_443_275);

      const lectura = new ServicioLecturaRepositorio(bd);
      const carpeta = await mkdtemp(join(tmpdir(), 'repositorio-copia-'));
      try {
        const info = await lectura.guardarArchivoEn(id, join(carpeta, 'copia.pdf'));
        expect(info).toMatchObject({ tipo: 'application/pdf', bytes: 12_443_275, sha256: sha256(original) });
        expect(sha256(readFileSync(join(carpeta, 'copia.pdf')))).toBe(sha256(original));
      } finally {
        await rm(carpeta, { recursive: true, force: true });
      }

      const prueba = await crearAppRepositorio(base.config, dist.directorio);
      try {
        const res = await request(prueba.servidor)
          .get(`/api/repositorio/documentos/${id}/ver`)
          .buffer(true)
          .parse(cuerpoBinario)
          .expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers.etag).toBe(`"${sha256(original)}"`);
        expect(sha256(res.body as Buffer)).toBe(sha256(original));

        const rango = await request(prueba.servidor)
          .get(`/api/repositorio/documentos/${id}/ver`)
          .set('Range', 'bytes=1048000-3145800')
          .buffer(true)
          .parse(cuerpoBinario)
          .expect(206);
        expect(rango.headers['content-range']).toBe('bytes 1048000-3145800/12443275');
        expect((rango.body as Buffer).equals(original.subarray(1048000, 3145801))).toBe(true);

        const descarga = await request(prueba.servidor)
          .get('/api/repositorio/documentos/boletin-19-fe-erratas-boletin-n-19-2021/descargar')
          .expect(200);
        expect(descarga.headers['content-disposition']).toBe(
          'attachment; filename="Boletin 19 - Fe de erratas del Boletin N.o 19.pdf"; ' +
            "filename*=UTF-8''Bolet%C3%ADn%2019%20-%20Fe%20de%20erratas%20del%20Bolet%C3%ADn%20N.%C2%BA%2019.pdf",
        );
        expect(decodeURIComponent(descarga.headers['content-disposition'].split("UTF-8''")[1])).toBe(
          'Boletín 19 - Fe de erratas del Boletín N.º 19.pdf',
        );

        const listado = await request(prueba.servidor).get('/api/repositorio/documentos').expect(200);
        expect(listado.body.total).toBe(372);
        expect(listado.body.categorias).toHaveLength(8);
        expect(JSON.stringify(listado.body)).not.toMatch(/Evidencia:|curaduria|notasInternas/);
      } finally {
        await prueba.cerrar();
      }
    });
  },
);
