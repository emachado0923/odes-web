import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asegurarReporte } from '../src/pai/compartido/reportes-comun.js';
import { registrarEnPai } from '../src/pai/compartido/registro-pai.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import { esDuplicado } from '../src/repositorio/bd/errores-bd.js';
import {
  abrirBimestrePai,
  asignarPai,
  autorizarPai,
  crearFixturePai,
  crearReportePai,
  crearUsuarioPai,
  type FixturePai,
} from './pai-apoyo.js';
import {
  avisarSiNoHayBd,
  type BasePrueba,
  crearBasePrueba,
  ES_POSTGRES,
  HAY_BD,
  MOTOR_PRUEBAS,
} from './repositorio-apoyo.js';

/**
 * Migración 003 (PAI) contra una base DESECHABLE, en MySQL y en Postgres
 * (MYSQL_PRUEBAS / POSTGRES_PRUEBAS, ver repositorio-apoyo.ts): tablas,
 * restricciones, tipos que devuelve la base y las ayudas compartidas del
 * servidor (asegurarReporte, registrarEnPai) y de las pruebas (pai-apoyo.ts).
 */

avisarSiNoHayBd('pai-esquema.e2e-spec.ts');

const TABLAS_PAI = [
  'pai_usuarios',
  'pai_sesiones',
  'pai_intentos_acceso',
  'pai_vigencias',
  'pai_dependencias',
  'pai_procesos',
  'pai_riesgos',
  'pai_acciones',
  'pai_accion_riesgos',
  'pai_indicadores',
  'pai_reportes',
  'pai_almacen_archivos',
  'pai_almacen_archivo_trozos',
  'pai_evidencias',
  'pai_subidas',
  'pai_subida_partes',
  'pai_asignaciones',
  'pai_autorizaciones',
  'pai_registro',
];

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };

/** ¿La base rechaza la operación? (los mensajes cambian según el motor). */
async function rechaza(promesa: Promise<unknown>): Promise<boolean> {
  try {
    await promesa;
    return false;
  } catch {
    return true;
  }
}

async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error de la base');
}

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: migración 003 (e2e)`, () => {
  let base: BasePrueba;
  let bd: BaseDatosRepositorio;
  let datos: FixturePai;

  beforeAll(async () => {
    base = await crearBasePrueba('pai');
    bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await bd.listo();
    datos = await crearFixturePai(base, { bimestreAbierto: 4 });
  });

  afterAll(async () => {
    await bd?.cerrar();
    await base?.borrar();
  });

  it('crea las 19 tablas del PAI y el esquema queda en la versión 6', async () => {
    const tablas = await base.tablas();
    for (const tabla of TABLAS_PAI) expect(tablas).toContain(tabla);
    expect(tablas.filter((t) => t.startsWith('pai_'))).toHaveLength(TABLAS_PAI.length);
    const [filas] = await base.admin.query<RowDataPacket[]>('SELECT MAX(version) AS version FROM sistema_esquema_version');
    expect(Number(filas[0].version)).toBe(9);
    expect(bd.estado).toBe('disponible');
  });

  it('los ids autoincrementales vuelven en insertId (también en Postgres) y la estructura queda enlazada', async () => {
    expect(Object.values(datos.indicadores).every((id) => id > 0)).toBe(true);
    const filas = await bd.filas<RowDataPacket>(
      `SELECT i.codigo, p.codigo AS proceso, d.sigla, v.anio, v.bimestre_abierto
         FROM pai_indicadores i
         JOIN pai_procesos p ON p.id = i.proceso_id
         JOIN pai_dependencias d ON d.id = p.dependencia_id
         JOIN pai_vigencias v ON v.id = i.vigencia_id
        ORDER BY i.codigo`,
    );
    expect(filas.map((f) => f.codigo)).toEqual(['SAF-AC-01', 'SAF-TH-01', 'SAF-TH-02', 'SAF-TH-03']);
    expect(filas[0]).toMatchObject({ proceso: 'SAF-AC', sigla: 'SAF', anio: 2026, bimestre_abierto: 4 });
  });

  it('metas y avances DECIMAL(24,10) vuelven como número con sus 10 decimales', async () => {
    await base.admin.query('UPDATE pai_indicadores SET meta_1 = ?, meta_total = ? WHERE id = ?', [
      0.1666666667,
      1,
      datos.indicadores.th01,
    ]);
    const reporte = await crearReportePai(base, { indicadorId: datos.indicadores.th01, bimestre: 1, avance: 0.1666666667 });
    const [fila] = await bd.filas<RowDataPacket>(
      'SELECT i.meta_1, i.meta_2, i.meta_total, r.avance FROM pai_indicadores i JOIN pai_reportes r ON r.indicador_id = i.id WHERE r.id = ?',
      [reporte],
    );
    expect(fila).toEqual({ meta_1: 0.1666666667, meta_2: 0, meta_total: 1, avance: 0.1666666667 });
    expect(typeof fila.meta_1).toBe('number');
  });

  it('restricciones: bimestre 1-6, un reporte por (indicador, bimestre), rol, riesgo SI/NO y origen', async () => {
    const th02 = datos.indicadores.th02;
    await crearReportePai(base, { indicadorId: th02, bimestre: 2, avance: 25 });
    expect(esDuplicado(await errorDe(crearReportePai(base, { indicadorId: th02, bimestre: 2 })))).toBe(true);
    expect(await rechaza(crearReportePai(base, { indicadorId: th02, bimestre: 7 as 1 }))).toBe(true);
    expect(await rechaza(crearReportePai(base, { indicadorId: th02, bimestre: 0 as 1 }))).toBe(true);
    expect(await rechaza(crearReportePai(base, { indicadorId: th02, bimestre: 3, avance: -1 }))).toBe(true);
    expect(await rechaza(
      base.admin.query("INSERT INTO pai_reportes (indicador_id, bimestre, riesgo_materializado, origen) VALUES (?, 4, 'TAL VEZ', 'importado')", [th02]),
    )).toBe(true);
    expect(await rechaza(
      base.admin.query("INSERT INTO pai_reportes (indicador_id, bimestre, origen) VALUES (?, 5, 'excel')", [th02]),
    )).toBe(true);
    expect(await rechaza(crearUsuarioPai(base, { usuario: 'rol-malo', rol: 'jefe' as 'responsable' }))).toBe(true);
    expect(await rechaza(abrirBimestrePai(base, datos.vigenciaId, 7 as 1))).toBe(true);
  });

  it('el usuario es único sin distinguir mayúsculas', async () => {
    await crearUsuarioPai(base, { usuario: 'maria.lopez', rol: 'responsable' });
    expect(esDuplicado(await errorDe(crearUsuarioPai(base, { usuario: 'Maria.Lopez', rol: 'responsable' })))).toBe(true);
  });

  it('asignaciones y autorizaciones: exactamente uno de proceso o indicador, sin repetir', async () => {
    const usuario = await crearUsuarioPai(base, { usuario: 'resp-asignaciones', rol: 'responsable' });
    await asignarPai(base, usuario, { procesoId: datos.procesoTh });
    await asignarPai(base, usuario, { indicadorId: datos.indicadores.ac01 });
    expect(esDuplicado(await errorDe(asignarPai(base, usuario, { procesoId: datos.procesoTh })))).toBe(true);
    expect(await rechaza(
      base.admin.query('INSERT INTO pai_asignaciones (usuario_id, proceso_id, indicador_id) VALUES (?, NULL, NULL)', [usuario]),
    )).toBe(true);
    expect(await rechaza(
      base.admin.query('INSERT INTO pai_asignaciones (usuario_id, proceso_id, indicador_id) VALUES (?, ?, ?)', [
        usuario,
        datos.procesoAc,
        datos.indicadores.th01,
      ]),
    )).toBe(true);
    expect(await autorizarPai(base, { usuarioId: usuario, bimestre: 2, procesoId: datos.procesoTh })).toBeGreaterThan(0);
    expect(await rechaza(autorizarPai(base, { usuarioId: usuario, bimestre: 2 }))).toBe(true);
    expect(await rechaza(
      autorizarPai(base, { usuarioId: usuario, bimestre: 2, procesoId: datos.procesoTh, indicadorId: datos.indicadores.th01 }),
    )).toBe(true);
    // Un proceso con asignaciones no se borra por accidente (RESTRICT).
    expect(await rechaza(base.admin.query('DELETE FROM pai_procesos WHERE id = ?', [datos.procesoAc]))).toBe(true);
  });

  it('borrar un usuario borra sus sesiones, asignaciones y autorizaciones', async () => {
    const usuario = await crearUsuarioPai(base, { usuario: 'resp-temporal', rol: 'responsable' });
    await asignarPai(base, usuario, { procesoId: datos.procesoAc });
    await autorizarPai(base, { usuarioId: usuario, bimestre: 1, indicadorId: datos.indicadores.ac01 });
    await base.admin.query(
      'INSERT INTO pai_sesiones (token_hash, csrf, usuario_id, creada_en, ultimo_uso, expira_en) VALUES (?, ?, ?, ?, ?, ?)',
      ['a'.repeat(64), 'b'.repeat(43), usuario, new Date(), new Date(), new Date(Date.now() + 60_000)],
    );
    await base.admin.query('DELETE FROM pai_usuarios WHERE id = ?', [usuario]);
    for (const tabla of ['pai_sesiones', 'pai_asignaciones', 'pai_autorizaciones']) {
      const [filas] = await base.admin.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${tabla} WHERE usuario_id = ?`, [usuario]);
      expect(Number(filas[0].n)).toBe(0);
    }
  });

  it('asegurarReporte crea un reporte vacío una sola vez y no toca uno existente; las evidencias se borran con su reporte', async () => {
    const usuario = await crearUsuarioPai(base, { usuario: 'resp-evidencias', rol: 'responsable' });
    const id = await bd.transaccion((conexion) => asegurarReporte(conexion, datos.indicadores.th03, 4, usuario));
    expect(await bd.transaccion((conexion) => asegurarReporte(conexion, datos.indicadores.th03, 4, usuario))).toBe(id);
    const [reporte] = await bd.filas<RowDataPacket>('SELECT avance, logros, origen, actualizado_por FROM pai_reportes WHERE id = ?', [id]);
    expect(reporte).toEqual({ avance: null, logros: null, origen: 'aplicativo', actualizado_por: usuario });

    const archivo = await bd.ejecutar(
      'INSERT INTO pai_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, ?, ?, ?)',
      ['c'.repeat(64), 'application/pdf', 10, 0, 1_048_576],
    );
    const archivoId = Number(archivo.insertId);
    expect(archivoId).toBeGreaterThan(0);
    await bd.ejecutar('INSERT INTO pai_evidencias (reporte_id, archivo_id, nombre, tipo, bytes, subido_por) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      archivoId,
      'acta de reunión.pdf',
      'application/pdf',
      10,
      usuario,
    ]);
    // El archivo no se puede borrar mientras una evidencia lo use.
    expect(await rechaza(bd.ejecutar('DELETE FROM pai_almacen_archivos WHERE id = ?', [archivoId]))).toBe(true);
    await bd.ejecutar('DELETE FROM pai_reportes WHERE id = ?', [id]);
    const [evidencias] = await bd.filas<RowDataPacket>('SELECT COUNT(*) AS n FROM pai_evidencias WHERE archivo_id = ?', [archivoId]);
    expect(Number(evidencias.n)).toBe(0);
    const [quedan] = await bd.filas<RowDataPacket>('SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId]);
    expect(Number(quedan.n)).toBe(1);
  });

  it('actualizado_en de un reporte cambia al modificarlo (token de concurrencia)', async () => {
    const id = await crearReportePai(base, { indicadorId: datos.indicadores.ac01, bimestre: 3, avance: 1 });
    const [antes] = await bd.filas<RowDataPacket>('SELECT actualizado_en FROM pai_reportes WHERE id = ?', [id]);
    await new Promise((resolver) => setTimeout(resolver, 15));
    // MySQL: ON UPDATE CURRENT_TIMESTAMP(3); Postgres: disparador repositorio_tocar_actualizado().
    await bd.ejecutar('UPDATE pai_reportes SET avance = ? WHERE id = ?', [2, id]);
    const [despues] = await bd.filas<RowDataPacket>('SELECT actualizado_en FROM pai_reportes WHERE id = ?', [id]);
    expect(antes.actualizado_en).toBeInstanceOf(Date);
    expect((despues.actualizado_en as Date).getTime()).toBeGreaterThan((antes.actualizado_en as Date).getTime());
  });

  it('registrarEnPai escribe la auditoría con el código del indicador y el detalle en JSON (usuario de la aplicación)', async () => {
    await bd.transaccion((conexion) =>
      registrarEnPai(conexion, {
        accion: 'guardar_reporte',
        usuarioId: 1,
        usuario: 'maria.lopez',
        indicadorId: datos.indicadores.th02,
        bimestre: 4,
        detalle: { antes: { avance: null }, despues: { avance: 30, logros: 'Se avanzó según lo previsto.' } },
      }),
    );
    const [fila] = await bd.filas<RowDataPacket>(
      'SELECT usuario, accion, codigo_indicador, bimestre, detalle FROM pai_registro WHERE indicador_id = ? ORDER BY id DESC',
      [datos.indicadores.th02],
    );
    expect(fila).toMatchObject({ usuario: 'maria.lopez', accion: 'guardar_reporte', codigo_indicador: 'SAF-TH-02', bimestre: 4 });
    expect(JSON.parse(String(fila.detalle))).toEqual({
      antes: { avance: null },
      despues: { avance: 30, logros: 'Se avanzó según lo previsto.' },
    });
  });

  it.runIf(ES_POSTGRES)('Postgres: RLS activo en todas las tablas del PAI', async () => {
    const [filas] = await base.admin.query<RowDataPacket[]>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'pai%' AND NOT rowsecurity",
    );
    expect(filas).toEqual([]);
  });
});
