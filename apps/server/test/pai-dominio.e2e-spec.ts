import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AutorizacionPai,
  FichaIndicadorPai,
  ListaAutorizacionesPai,
  PaginaRegistroPai,
  RespuestaReportePai,
  TableroPai,
  VigenciaPai,
} from '../src/pai/api-pai.js';
import {
  aFilasFichas,
  type ArchivoFichasPai,
  CLAVES_BIMESTRE_JSON,
  deFilasFichas,
  type FilasFichasPai,
  type IndicadorJson,
  validarFormaFichas,
} from '../src/pai/carga/datos-fichas.js';
import { ErrorCargaFichas, guardarFichas } from '../src/pai/carga/guardar-fichas.js';
import { calcularIndicador, calculoDeColumnas } from '../src/pai/dominio/calculo-pai.js';
import { RAIZ_SERVIDOR } from '../src/config/configuracion.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import type { Conexion } from '../src/repositorio/bd/conexion.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  abrirBimestrePai,
  asignarPai,
  autorizarPai,
  crearFixturePai,
  crearUsuarioPai,
  type FixturePai,
  iniciarSesionPai,
  type SesionPaiPrueba,
} from './pai-apoyo.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAppRepositorio,
  crearBasePrueba,
  HAY_BD,
  MOTOR_PRUEBAS,
} from './repositorio-apoyo.js';

/**
 * Dominio del PAI contra una base DESECHABLE (MySQL o Postgres, ver
 * repositorio-apoyo.ts): reglas de escritura (no asignado, cerrado, vencido,
 * administrador en solo lectura, autorización otorgada y revocada),
 * concurrencia optimista, vigencia, autorizaciones, registro, la carga del
 * JSON real con guardarFichas (ida y vuelta por la base, mismos números en
 * la API, negativa y --forzar) y la exportación CSV.
 */

avisarSiNoHayBd('pai-dominio.e2e-spec.ts');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const API = '/api/pai';
const DIA = 86_400_000;
const ARCHIVO = join(RAIZ_SERVIDOR, 'datos', 'pai', '2026', 'pai-2026.json');

function leerJson(): ArchivoFichasPai {
  return validarFormaFichas(JSON.parse(readFileSync(ARCHIVO, 'utf8')));
}

function lectura(servidor: AppPrueba['servidor'], sesion: SesionPaiPrueba, ruta: string) {
  return request(servidor).get(`${API}${ruta}`).set('Cookie', sesion.cookie);
}

function escritura(
  servidor: AppPrueba['servidor'],
  sesion: SesionPaiPrueba,
  metodo: 'put' | 'post' | 'delete',
  ruta: string,
) {
  return request(servidor)[metodo](`${API}${ruta}`).set('Cookie', sesion.cookie).set('X-CSRF-Token', sesion.csrf);
}

async function bdDe(base: BasePrueba): Promise<BaseDatosRepositorio> {
  const bd = new BaseDatosRepositorio(base.config);
  bd.registro = SILENCIO;
  bd.iniciar();
  await bd.listo();
  return bd;
}

/** CSV -> filas de celdas (comillas dobles, ; y CRLF), sin el BOM. */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  const contenido = texto.replace(/^\uFEFF/, '');
  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];
    if (comillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') {
        comillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"') {
      comillas = true;
    } else if (c === ';') {
      fila.push(celda);
      celda = '';
    } else if (c === '\r' && contenido[i + 1] === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
      i++;
    } else {
      celda += c;
    }
  }
  return filas;
}

/** Textos largos de un reporte (casi el máximo de cada campo). */
function textosLargos(letra: string) {
  return {
    logros: letra.repeat(9_900),
    observaciones: `${letra}"`.repeat(4_950),
    descripcionRiesgo: letra.repeat(9_900),
    riesgoMaterializado: 'SI',
    numeralRiesgo: '2',
    fuentesVerificacion: `${letra}\\`.repeat(4_950),
  };
}

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: reglas, reportes y administración (e2e)`, () => {
  let base: BasePrueba;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let datos: FixturePai;
  const ids = { admin: 0, th: 0, ac01: 0, nada: 0 };
  const sesiones = {} as Record<keyof typeof ids, SesionPaiPrueba>;

  beforeAll(async () => {
    base = await crearBasePrueba('paidom');
    dist = await crearDistTemporal();
    prueba = await crearAppRepositorio(base.config, dist.directorio);
    datos = await crearFixturePai(base, { bimestreAbierto: 4 });
    ids.admin = await crearUsuarioPai(base, { usuario: 'admin.pai', rol: 'administrador', nombre: 'Ana Planeación' });
    ids.th = await crearUsuarioPai(base, { usuario: 'resp.th', rol: 'responsable', nombre: 'Tomás Talento' });
    ids.ac01 = await crearUsuarioPai(base, { usuario: 'resp.ac01', rol: 'responsable', nombre: 'Alicia Ciudadanía' });
    ids.nada = await crearUsuarioPai(base, { usuario: 'resp.nada', rol: 'responsable' });
    await asignarPai(base, ids.th, { procesoId: datos.procesoTh });
    await asignarPai(base, ids.ac01, { indicadorId: datos.indicadores.ac01 });
    for (const [clave, usuario] of [
      ['admin', 'admin.pai'],
      ['th', 'resp.th'],
      ['ac01', 'resp.ac01'],
      ['nada', 'resp.nada'],
    ] as const) {
      sesiones[clave] = await iniciarSesionPai(prueba.servidor, usuario);
    }
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  const tablero = async (quien: keyof typeof ids): Promise<TableroPai> =>
    (await lectura(prueba.servidor, sesiones[quien], '/tablero').expect(200)).body as TableroPai;

  it('GET /vigencia: la más reciente, con el bimestre abierto evaluado ahora', async () => {
    const res = await lectura(prueba.servidor, sesiones.th, '/vigencia').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const vigencia = res.body as VigenciaPai;
    expect(vigencia).toMatchObject({ anio: 2026, bimestreAbierto: 4, abiertoHasta: null, abiertoAhora: true, vigencias: [2026] });
    expect(vigencia.bimestres).toHaveLength(6);
    await lectura(prueba.servidor, sesiones.th, '/vigencia?vigencia=2019').expect(404);
    await lectura(prueba.servidor, sesiones.th, '/vigencia?vigencia=abc').expect(400);
  });

  it('sin sesión: 401', async () => {
    await request(prueba.servidor).get(`${API}/tablero`).expect(401);
    await request(prueba.servidor).put(`${API}/indicadores/${datos.indicadores.th01}/bimestres/4`).send({ avance: 1 }).expect(401);
  });

  it('el responsable solo ve lo asignado (por proceso o por indicador); solo el bimestre abierto es editable', async () => {
    const th = await tablero('th');
    expect(th.indicadores.map((i) => i.codigo)).toEqual(['SAF-TH-01', 'SAF-TH-02', 'SAF-TH-03']);
    expect(th.procesos.map((p) => p.codigo)).toEqual(['SAF-TH']);
    expect(th.acciones.map((a) => a.id)).toEqual([datos.acciones.th1, datos.acciones.th2]);
    expect(th.acciones[0].riesgoIds).toEqual(datos.riesgos);
    expect(th.riesgos.map((r) => r.id)).toEqual(datos.riesgos);
    expect(th.dependencias.map((d) => d.sigla)).toEqual(['SAF']);
    for (const indicador of th.indicadores) {
      expect(indicador.editables).toEqual([false, false, false, true, false, false]);
      expect(indicador.motivos).toEqual(['cerrado', 'cerrado', 'cerrado', 'abierto', 'cerrado', 'cerrado']);
    }
    expect(th.resumen.procesos.map((p) => p.procesoId)).toEqual([datos.procesoTh]);
    expect(th.resumen.general.indicadores).toBe(3);
    // SAF-TH-01 no tiene meta en el Bimestre 4.
    expect(th.resumen.general.conteo).toEqual({ bimestre: 4, reportados: 0, pendientes: 2, sinMeta: 1 });

    const ac = await tablero('ac01');
    expect(ac.indicadores.map((i) => i.codigo)).toEqual(['SAF-AC-01']);
    // Meta 0 en el bimestre abierto: sin_meta; el 6 todavía no empieza (hoy es 2026-10).
    expect(ac.indicadores[0].estados[3]).toBe('sin_meta');

    const nada = await tablero('nada');
    expect(nada.indicadores).toEqual([]);
    expect(nada.procesos).toEqual([]);
    expect(nada.resumen.general.indicadores).toBe(0);
  });

  it('el administrador ve todo en solo lectura', async () => {
    const admin = await tablero('admin');
    expect(admin.indicadores.map((i) => i.codigo)).toEqual(['SAF-TH-01', 'SAF-TH-02', 'SAF-TH-03', 'SAF-AC-01']);
    for (const indicador of admin.indicadores) {
      expect(indicador.editables.every((e) => !e)).toBe(true);
      expect(indicador.motivos.every((m) => m === 'sin_permiso')).toBe(true);
    }
    expect(admin.resumen.dependencias).toHaveLength(1);
    expect(admin.resumen.procesos).toHaveLength(2);
  });

  it('con el Bimestre 4 abierto, los bimestres 5 y 6 sin reportes son futuros y no cuentan en el resumen', async () => {
    const admin = await tablero('admin');
    const porCodigo = new Map(admin.indicadores.map((i) => [i.codigo, i]));
    // SAF-TH-01 tiene meta 1 en el Bimestre 5 (que ya empezó): futuro, no pendiente.
    expect(porCodigo.get('SAF-TH-01')?.estados).toEqual([
      'pendiente',
      'sin_meta',
      'pendiente',
      'sin_meta',
      'futuro',
      'futuro',
    ]);
    for (const indicador of admin.indicadores) {
      expect(indicador.estados.slice(4)).toEqual(['futuro', 'futuro']);
    }
    // Bimestres 1-4 ya se debían reportar y nadie reportó: 0 % (no null);
    // 5 y 6 todavía no: null.
    const th = admin.resumen.procesos.find((p) => p.procesoId === datos.procesoTh);
    expect(th?.logros).toEqual([0, 0, 0, 0, null, null]);
    expect(th?.avanceAnual).toBe(0);
    expect(admin.resumen.general.logros.slice(4)).toEqual([null, null]);
    expect(admin.resumen.general.conteo).toEqual({ bimestre: 4, reportados: 0, pendientes: 2, sinMeta: 2 });
    const csv = leerCsv((await lectura(prueba.servidor, sesiones.admin, '/admin/exportar.csv?bimestre=5').expect(200)).text);
    const columna = csv[0].indexOf('Estado bimestre 5');
    expect(new Set(csv.slice(1).map((f) => f[columna]))).toEqual(new Set(['Futuro']));
  });

  it('GET /indicadores/:ref por código o id; 404 si no existe o no es visible', async () => {
    const res = await lectura(prueba.servidor, sesiones.th, '/indicadores/saf-th-02').expect(200);
    const ficha = res.body as FichaIndicadorPai;
    expect(ficha).toMatchObject({
      id: datos.indicadores.th02,
      codigo: 'SAF-TH-02',
      tipoMeta: 'porcentaje',
      vigencia: 2026,
      metaTotal: 100,
      proceso: { codigo: 'SAF-TH', dependencia: { sigla: 'SAF' }, objetivo: 'Objetivo de Gestión del Talento Humano' },
      accion: { id: datos.acciones.th1, orden: 1 },
      productos: 'Productos de SAF-TH-02',
      calculo: { reglaMetaTotal: 'suma', tope100: true, topePorBimestre: null },
    });
    expect(ficha.riesgos.map((r) => [r.id, r.corrupcion])).toEqual([
      [datos.riesgos[0], true],
      [datos.riesgos[1], false],
    ]);
    expect(ficha.bimestres.map((b) => b.editable)).toEqual([false, false, false, true, false, false]);
    expect(ficha.bimestres[3]).toMatchObject({ meta: 50, avance: null, estado: 'pendiente', origen: null, actualizadoEn: null });
    expect(ficha.escala).toBe('0-100');
    await lectura(prueba.servidor, sesiones.th, `/indicadores/${datos.indicadores.th02}`).expect(200);
    // ?vigencia= (NEG-3): el código se busca en esa vigencia; un id debe ser de ella.
    await lectura(prueba.servidor, sesiones.th, '/indicadores/SAF-TH-02?vigencia=2026').expect(200);
    await lectura(prueba.servidor, sesiones.th, '/indicadores/SAF-TH-02?vigencia=2019').expect(404);
    await lectura(prueba.servidor, sesiones.th, `/indicadores/${datos.indicadores.th02}?vigencia=2025`).expect(404);
    await lectura(prueba.servidor, sesiones.th, '/indicadores/SAF-TH-02?vigencia=abc').expect(400);
    await lectura(prueba.servidor, sesiones.ac01, '/indicadores/SAF-TH-02').expect(404);
    await lectura(prueba.servidor, sesiones.th, '/indicadores/SAF-XX-99').expect(404);
    await lectura(prueba.servidor, sesiones.th, '/indicadores/abc').expect(404);
    const mixto = (await lectura(prueba.servidor, sesiones.admin, '/indicadores/SAF-AC-01').expect(200)).body as FichaIndicadorPai;
    expect(mixto.calculo).toMatchObject({ tope100: null, topePorBimestre: { bimestres: [true, true, false, false, false, false], total: false } });
  });

  it('PUT del reporte: guarda, recalcula y aplica la concurrencia optimista (409)', async () => {
    const ruta = `/indicadores/${datos.indicadores.th02}/bimestres/4`;
    const primero = await escritura(prueba.servidor, sesiones.th, 'put', ruta)
      .send({ avance: 25, logros: '  Avance del plan  ', fuentesVerificacion: 'Acta 4', actualizadoEn: null })
      .expect(200);
    expect(primero.headers['cache-control']).toMatch(/no-store/);
    const respuesta = primero.body as RespuestaReportePai;
    expect(respuesta.reporte).toMatchObject({
      bimestre: 4,
      meta: 50,
      avance: 25,
      porcentaje: 0.5,
      estado: 'reportado',
      logros: 'Avance del plan',
      fuentesVerificacion: 'Acta 4',
      origen: 'aplicativo',
      actualizadoPor: 'Tomás Talento',
      editable: true,
      motivo: 'abierto',
    });
    expect(respuesta.indicador.avances).toEqual([null, null, null, 25, null, null]);
    expect(respuesta.indicador.avanceTotal).toBe(25);
    expect(respuesta.indicador.porcentajeTotal).toBe(0.25);
    expect(respuesta.indicador.tieneTextos[3]).toBe(true);
    const token = respuesta.reporte.actualizadoEn as string;
    expect(respuesta.indicador.actualizadoEn[3]).toBe(token);

    // Token viejo (null: "no había reporte") -> 409.
    const conflicto = await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: 30, actualizadoEn: null }).expect(409);
    expect(conflicto.body.codigo).toBe('conflicto');

    // Con el token vigente: guarda y cambia el token; los campos ausentes no cambian.
    const segundo = (
      await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: 60, actualizadoEn: token }).expect(200)
    ).body as RespuestaReportePai;
    expect(segundo.reporte).toMatchObject({ avance: 60, porcentaje: 1, logros: 'Avance del plan' });
    expect(segundo.reporte.actualizadoEn).not.toBe(token);
    await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: 61, actualizadoEn: token }).expect(409);

    // Sin actualizadoEn no se comprueba; null borra.
    const tercero = (await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ logros: null }).expect(200))
      .body as RespuestaReportePai;
    expect(tercero.reporte).toMatchObject({ avance: 60, logros: null });

    // El registro guarda antes y después de lo que cambió.
    const registro = (
      await lectura(prueba.servidor, sesiones.admin, '/admin/registro?accion=guardar_reporte&indicador=SAF-TH-02').expect(200)
    ).body as PaginaRegistroPai;
    expect(registro.total).toBe(3);
    expect(registro.entradas[0]).toMatchObject({
      accion: 'guardar_reporte',
      usuario: 'resp.th',
      usuarioId: ids.th,
      indicadorId: datos.indicadores.th02,
      codigoIndicador: 'SAF-TH-02',
      bimestre: 4,
      detalle: { antes: { logros: 'Avance del plan' }, despues: { logros: null }, motivo: 'abierto' },
    });
    expect(registro.entradas[2].detalle).toMatchObject({ nuevo: true, antes: { avance: null }, despues: { avance: 25 } });
  });

  it('el registro conserva los valores anteriores y nuevos de un reporte con textos largos (NEG-4)', async () => {
    const ruta = `/indicadores/${datos.indicadores.th03}/bimestres/4`;
    const textos = textosLargos;
    const primero = (await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: 10, ...textos('a') }).expect(200))
      .body as RespuestaReportePai;
    await escritura(prueba.servidor, sesiones.th, 'put', ruta)
      .send({ ...textos('b'), actualizadoEn: primero.reporte.actualizadoEn })
      .expect(200);
    const [fila] = (
      await base.admin.query<RowDataPacket[]>(
        "SELECT detalle FROM pai_registro WHERE accion = 'guardar_reporte' AND indicador_id = ? ORDER BY id DESC LIMIT 1",
        [datos.indicadores.th03],
      )
    )[0];
    const detalle = JSON.parse(String(fila.detalle)) as Record<string, Record<string, unknown>>;
    expect(detalle.recortado).toBeUndefined();
    expect(detalle.antes).toMatchObject({ logros: 'a'.repeat(9_900), fuentesVerificacion: 'a\\'.repeat(4_950) });
    expect(detalle.despues).toMatchObject({ logros: 'b'.repeat(9_900), fuentesVerificacion: 'b\\'.repeat(4_950) });
    // Se deja como estaba para las pruebas siguientes.
    await base.admin.query('DELETE FROM pai_reportes WHERE indicador_id = ? AND bimestre = 4', [datos.indicadores.th03]);
  });

  it('primeros guardados simultáneos: sin actualizadoEn todos pasan; con null solo uno (igual en MySQL y Postgres, BD-3)', async () => {
    const ruta = `/indicadores/${datos.indicadores.th03}/bimestres/4`;
    const borrar = () => base.admin.query('DELETE FROM pai_reportes WHERE indicador_id = ? AND bimestre = 4', [datos.indicadores.th03]);
    await borrar();
    const sinToken = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((avance) => escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance })),
    );
    expect(sinToken.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const [filas] = await base.admin.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM pai_reportes WHERE indicador_id = ? AND bimestre = 4',
      [datos.indicadores.th03],
    );
    expect(Number(filas[0].n)).toBe(1);
    await borrar();
    const conNull = await Promise.all(
      [1, 2, 3, 4].map((avance) =>
        escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance, actualizadoEn: null }),
      ),
    );
    expect(conNull.map((r) => r.status).toSorted()).toEqual([200, 409, 409, 409]);
    await borrar();
  });

  it('PUT: 400 con errores por campo (avance, riesgo materializado sin numeral)', async () => {
    const ruta = `/indicadores/${datos.indicadores.th01}/bimestres/4`;
    const avance = await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: -1 }).expect(400);
    expect(avance.body.campos).toHaveProperty('avance');
    const decimales = await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ avance: 1.1234567 }).expect(400);
    expect(decimales.body.campos).toHaveProperty('avance');
    const riesgo = await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ riesgoMaterializado: 'SI' }).expect(400);
    expect(Object.keys(riesgo.body.campos).toSorted()).toEqual(['descripcionRiesgo', 'numeralRiesgo']);
    await escritura(prueba.servidor, sesiones.th, 'put', ruta)
      .send({ riesgoMaterializado: 'SI', numeralRiesgo: '2', descripcionRiesgo: 'Pérdida de historias laborales; se activó el respaldo.' })
      .expect(200);
    // Ya guardados el numeral y la descripción, basta con el SI.
    await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ riesgoMaterializado: 'SI' }).expect(200);
    await escritura(prueba.servidor, sesiones.th, 'put', ruta).send({ numeralRiesgo: null }).expect(400);
  });

  it('PUT: 403 en un bimestre cerrado, 404 si no está asignado, 403 para el administrador y sin CSRF', async () => {
    const cerrado = await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/3`)
      .send({ avance: 1 })
      .expect(403);
    expect(cerrado.body).toMatchObject({ codigo: 'prohibido' });
    expect(cerrado.body.mensaje).toMatch(/El Bimestre 3 está cerrado/);
    await escritura(prueba.servidor, sesiones.ac01, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/4`).send({ avance: 1 }).expect(404);
    await escritura(prueba.servidor, sesiones.nada, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/4`).send({ avance: 1 }).expect(404);
    const admin = await escritura(prueba.servidor, sesiones.admin, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/4`)
      .send({ avance: 1 })
      .expect(403);
    expect(admin.body.mensaje).toMatch(/solo lectura/);
    await request(prueba.servidor)
      .put(`${API}/indicadores/${datos.indicadores.th01}/bimestres/4`)
      .set('Cookie', sesiones.th.cookie)
      .send({ avance: 1 })
      .expect(403);
    await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/7`).send({ avance: 1 }).expect(404);
    await escritura(prueba.servidor, sesiones.th, 'put', '/indicadores/999999/bimestres/4').send({ avance: 1 }).expect(404);
  });

  it('fecha límite vencida: el bimestre queda cerrado en la siguiente petición (sin temporizadores)', async () => {
    await abrirBimestrePai(base, datos.vigenciaId, 4, new Date(Date.now() - 60_000));
    try {
      const vigencia = (await lectura(prueba.servidor, sesiones.th, '/vigencia').expect(200)).body as VigenciaPai;
      expect(vigencia.abiertoAhora).toBe(false);
      const th = await tablero('th');
      expect(th.indicadores[0].editables).toEqual([false, false, false, false, false, false]);
      expect(th.indicadores[0].motivos[3]).toBe('cerrado');
      const vencido = await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th01}/bimestres/4`)
        .send({ avance: 2 })
        .expect(403);
      expect(vencido.body.mensaje).toMatch(/venció/);
    } finally {
      await abrirBimestrePai(base, datos.vigenciaId, 4, null);
    }
  });

  it('PUT /admin/vigencia abre y cierra el bimestre (solo el administrador) y lo registra', async () => {
    const hasta = new Date(Date.now() + 7 * DIA).toISOString();
    const abierta = (
      await escritura(prueba.servidor, sesiones.admin, 'put', '/admin/vigencia').send({ bimestreAbierto: 5, abiertoHasta: hasta }).expect(200)
    ).body as VigenciaPai;
    expect(abierta).toMatchObject({ bimestreAbierto: 5, abiertoHasta: hasta, abiertoAhora: true, actualizadoPor: 'Ana Planeación' });
    const th = await tablero('th');
    expect(th.indicadores[0].editables).toEqual([false, false, false, false, true, false]);
    await escritura(prueba.servidor, sesiones.th, 'put', '/admin/vigencia').send({ bimestreAbierto: 3 }).expect(403);
    const pasada = await escritura(prueba.servidor, sesiones.admin, 'put', '/admin/vigencia')
      .send({ bimestreAbierto: 4, abiertoHasta: new Date(Date.now() - DIA).toISOString() })
      .expect(400);
    expect(pasada.body.campos).toHaveProperty('abiertoHasta');
    const cerrada = (await escritura(prueba.servidor, sesiones.admin, 'put', '/admin/vigencia').send({ bimestreAbierto: null }).expect(200))
      .body as VigenciaPai;
    expect(cerrada).toMatchObject({ bimestreAbierto: null, abiertoHasta: null, abiertoAhora: false });
    expect((await tablero('th')).resumen.general.conteo).toBeNull();
    const registro = (await lectura(prueba.servidor, sesiones.admin, '/admin/registro').expect(200)).body as PaginaRegistroPai;
    expect(registro.entradas.slice(0, 2).map((e) => e.accion)).toEqual(['cerrar_bimestre', 'abrir_bimestre']);
    expect(registro.entradas[1].detalle).toMatchObject({ despues: { bimestreAbierto: 5, abiertoHasta: hasta } });
    await escritura(prueba.servidor, sesiones.admin, 'put', '/admin/vigencia').send({ bimestreAbierto: 4, abiertoHasta: null }).expect(200);
  });

  it('autorizaciones: abren un bimestre pasado (indicador o proceso) y al revocarlas o vencer dejan de hacerlo', async () => {
    const th01b2 = `/indicadores/${datos.indicadores.th01}/bimestres/2`;
    await escritura(prueba.servidor, sesiones.th, 'put', th01b2).send({ avance: 1 }).expect(403);
    const otorgada = await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
      .send({
        usuarioId: ids.th,
        bimestre: 2,
        indicadorId: datos.indicadores.th01,
        vigenteHasta: new Date(Date.now() + DIA).toISOString(),
        motivo: 'Corrección del avance de abril',
      })
      .expect(201);
    const autorizacion = otorgada.body as AutorizacionPai;
    expect(autorizacion).toMatchObject({
      usuarioId: ids.th,
      usuario: 'resp.th',
      nombreUsuario: 'Tomás Talento',
      bimestre: 2,
      indicadorId: datos.indicadores.th01,
      procesoId: null,
      estado: 'vigente',
      otorgadaPor: 'Ana Planeación',
      revocadaEn: null,
    });
    expect(autorizacion.alcance).toBe('SAF-TH-01 · Número de planes publicados');

    const th = await tablero('th');
    expect(th.indicadores[0].motivos[1]).toBe('autorizado');
    expect(th.indicadores[1].motivos[1]).toBe('cerrado');
    const guardado = (await escritura(prueba.servidor, sesiones.th, 'put', th01b2).send({ avance: 0 }).expect(200)).body as RespuestaReportePai;
    expect(guardado.reporte.motivo).toBe('autorizado');
    // Solo cubre SAF-TH-01.
    await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th02}/bimestres/2`).send({ avance: 1 }).expect(403);

    const revocada = (await escritura(prueba.servidor, sesiones.admin, 'delete', `/admin/autorizaciones/${autorizacion.id}`).expect(200))
      .body as AutorizacionPai;
    expect(revocada).toMatchObject({ estado: 'revocada', revocadaPor: 'Ana Planeación' });
    await escritura(prueba.servidor, sesiones.th, 'put', th01b2).send({ avance: 1 }).expect(403);
    await escritura(prueba.servidor, sesiones.admin, 'delete', `/admin/autorizaciones/${autorizacion.id}`).expect(409);
    await escritura(prueba.servidor, sesiones.admin, 'delete', '/admin/autorizaciones/999999').expect(404);

    // Por proceso: cubre todos sus indicadores.
    const deProceso = (
      await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
        .send({ usuarioId: ids.th, bimestre: 1, procesoId: datos.procesoTh, vigenteHasta: new Date(Date.now() + DIA).toISOString(), motivo: 'Cierre del Bimestre 1' })
        .expect(201)
    ).body as AutorizacionPai;
    expect(deProceso.alcance).toBe('SAF-TH · Gestión del Talento Humano');
    await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th03}/bimestres/1`).send({ avance: 100 }).expect(200);

    // Vencida: no abre nada.
    await autorizarPai(base, { usuarioId: ids.th, bimestre: 3, procesoId: datos.procesoTh, vigenteHasta: new Date(Date.now() - 60_000) });
    await escritura(prueba.servidor, sesiones.th, 'put', `/indicadores/${datos.indicadores.th03}/bimestres/3`).send({ avance: 100 }).expect(403);

    const lista = (await lectura(prueba.servidor, sesiones.admin, '/admin/autorizaciones').expect(200)).body as ListaAutorizacionesPai;
    expect(lista.autorizaciones.map((a) => a.estado)).toEqual(['vigente', 'vencida', 'revocada']);

    // Validaciones: un responsable sin ese proceso asignado, un administrador, una fecha pasada.
    await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
      .send({ usuarioId: ids.ac01, bimestre: 2, procesoId: datos.procesoTh, vigenteHasta: new Date(Date.now() + DIA).toISOString(), motivo: 'x' })
      .expect(409);
    await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
      .send({ usuarioId: ids.ac01, bimestre: 2, procesoId: datos.procesoAc, vigenteHasta: new Date(Date.now() + DIA).toISOString(), motivo: 'Su indicador está en ese proceso' })
      .expect(201);
    await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
      .send({ usuarioId: ids.admin, bimestre: 2, procesoId: datos.procesoTh, vigenteHasta: new Date(Date.now() + DIA).toISOString(), motivo: 'x' })
      .expect(400);
    const fecha = await escritura(prueba.servidor, sesiones.admin, 'post', '/admin/autorizaciones')
      .send({ usuarioId: ids.th, bimestre: 2, procesoId: datos.procesoTh, vigenteHasta: new Date(Date.now() - DIA).toISOString(), motivo: 'x' })
      .expect(400);
    expect(fecha.body.campos).toHaveProperty('vigenteHasta');
    // Solo el administrador.
    await lectura(prueba.servidor, sesiones.th, '/admin/autorizaciones').expect(403);
    await escritura(prueba.servidor, sesiones.th, 'post', '/admin/autorizaciones').send({}).expect(403);

    const registro = (await lectura(prueba.servidor, sesiones.admin, '/admin/registro?accion=revocar_autorizacion').expect(200))
      .body as PaginaRegistroPai;
    expect(registro.total).toBe(1);
  });

  it('GET /admin/registro: filtros, paginación y solo para el administrador', async () => {
    const todo = (await lectura(prueba.servidor, sesiones.admin, '/admin/registro').expect(200)).body as PaginaRegistroPai;
    expect(todo.pagina).toBe(1);
    expect(todo.porPagina).toBe(50);
    expect(todo.total).toBeGreaterThan(5);
    const ids2 = todo.entradas.map((e) => e.id);
    expect(ids2).toEqual(ids2.toSorted((a, b) => b - a));
    const deUsuario = (await lectura(prueba.servidor, sesiones.admin, `/admin/registro?usuario=${ids.th}`).expect(200)).body as PaginaRegistroPai;
    expect(deUsuario.entradas.every((e) => e.usuarioId === ids.th)).toBe(true);
    const porId = (await lectura(prueba.servidor, sesiones.admin, `/admin/registro?indicador=${datos.indicadores.th02}`).expect(200))
      .body as PaginaRegistroPai;
    expect(porId.entradas.every((e) => e.codigoIndicador === 'SAF-TH-02')).toBe(true);
    const lejana = (await lectura(prueba.servidor, sesiones.admin, '/admin/registro?pagina=50').expect(200)).body as PaginaRegistroPai;
    expect(lejana.entradas).toEqual([]);
    await lectura(prueba.servidor, sesiones.admin, '/admin/registro?accion=borrar_todo').expect(400);
    await lectura(prueba.servidor, sesiones.th, '/admin/registro').expect(403);
  });

  it('GET /admin/exportar.csv: UTF-8 con BOM, ; y los textos del bimestre elegido', async () => {
    const res = await lectura(prueba.servidor, sesiones.admin, '/admin/exportar.csv?bimestre=4').buffer(true).parse((r, fin) => {
      const trozos: Buffer[] = [];
      r.on('data', (t: Buffer) => trozos.push(t));
      r.on('end', () => fin(null, Buffer.concat(trozos)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="pai-2026-bimestre-4\.csv"/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const contenido = res.body as Buffer;
    expect(contenido.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const filas = leerCsv(contenido.toString('utf8'));
    expect(filas).toHaveLength(5);
    const encabezados = filas[0];
    expect(encabezados).toContain('Principales avances bimestre 4');
    const col = (nombre: string) => encabezados.indexOf(nombre);
    const th02 = filas.find((f) => f[col('Código del indicador')] === 'SAF-TH-02') as string[];
    expect(th02[col('Avance bimestre 4')]).toBe('60');
    expect(th02[col('% bimestre 4')]).toBe('100');
    expect(th02[col('Fuentes de verificación bimestre 4')]).toBe('Acta 4');
    expect(th02[col('Origen del reporte bimestre 4')]).toBe('Aplicativo');
    expect(th02[col('Estado bimestre 4')]).toBe('Reportado');
    const th01 = filas.find((f) => f[col('Código del indicador')] === 'SAF-TH-01') as string[];
    expect(th01[col('Descripción del riesgo y controles bimestre 4')]).toBe('Pérdida de historias laborales; se activó el respaldo.');

    const filtrado = await lectura(prueba.servidor, sesiones.admin, `/admin/exportar.csv?proceso=${datos.procesoAc}`).expect(200);
    expect(leerCsv(filtrado.text)).toHaveLength(2);
    // Sin ?bimestre: el abierto (4).
    expect(filtrado.headers['content-disposition']).toMatch(/bimestre-4\.csv/);
    await lectura(prueba.servidor, sesiones.admin, '/admin/exportar.csv?tipo=otro').expect(400);
    await lectura(prueba.servidor, sesiones.th, '/admin/exportar.csv').expect(403);
  });

  it('GET /admin/autorizaciones trae todas las vigentes aunque haya más de 1000 más recientes (SEG-7)', async () => {
    const [antes] = await base.admin.query<RowDataPacket[]>('SELECT COALESCE(MAX(id), 0) AS id FROM pai_autorizaciones');
    const desde = Number(antes[0].id);
    const antigua = await autorizarPai(base, {
      usuarioId: ids.th,
      bimestre: 1,
      procesoId: datos.procesoTh,
      vigenteHasta: new Date(Date.now() + 300 * DIA),
    });
    await base.admin.query('UPDATE pai_autorizaciones SET otorgada_en = ? WHERE id = ?', [new Date('2025-01-01T12:00:00Z'), antigua]);
    const vencida = new Date(Date.now() - DIA);
    const filas = Array.from({ length: 1000 }, (_, i) => [ids.th, 2, datos.procesoTh, null, vencida, `Vencida ${i}`, new Date(Date.now() - 2 * DIA + i * 1000)]);
    await base.admin.query(
      'INSERT INTO pai_autorizaciones (usuario_id, bimestre, proceso_id, indicador_id, vigente_hasta, motivo, otorgada_en) VALUES ?',
      [filas],
    );
    try {
      const lista = (await lectura(prueba.servidor, sesiones.admin, '/admin/autorizaciones').expect(200)).body as ListaAutorizacionesPai;
      const vigentes = lista.autorizaciones.filter((a) => a.estado === 'vigente');
      expect(vigentes.map((a) => a.id)).toContain(antigua);
      // Primero las vigentes, luego a lo sumo 1000 de las demás.
      expect(lista.autorizaciones.slice(0, vigentes.length).every((a) => a.estado === 'vigente')).toBe(true);
      expect(lista.autorizaciones.length - vigentes.length).toBe(1000);
    } finally {
      await base.admin.query('DELETE FROM pai_autorizaciones WHERE id > ?', [desde]);
    }
  });
});

// ── Carga del JSON real ────────────────────────────────────────────────────

interface FilaBd extends RowDataPacket {
  [columna: string]: unknown;
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const t = (v: unknown) => (v === null || v === undefined ? null : String(v));
/** % redondeado como en las respuestas de la API (6 decimales). */
const redondeo = (v: number | null) => (v === null ? null : Number(v.toFixed(6)));

/** Filas de la carga leídas de la base (para la ida y vuelta: base -> JSON). */
async function leerFilasDeBase(admin: Conexion, anio: number): Promise<FilasFichasPai> {
  const consultar = async (sql: string, valores: unknown[]) => (await admin.query<FilaBd[]>(sql, valores))[0];
  const [vigencia] = await consultar('SELECT id, anio, extras FROM pai_vigencias WHERE anio = ?', [anio]);
  const id = Number(vigencia.id);
  return {
    vigencia: { anio: Number(vigencia.anio), extras: String(vigencia.extras) },
    dependencias: (await consultar('SELECT sigla, nombre, orden FROM pai_dependencias WHERE vigencia_id = ?', [id])).map((f) => ({
      sigla: String(f.sigla),
      nombre: String(f.nombre),
      orden: Number(f.orden),
    })),
    procesos: (
      await consultar(
        'SELECT p.clave, p.codigo, d.sigla, p.nombre, p.hoja, p.tipo, p.codigo_proyecto, p.programa, p.linea_plan_desarrollo, ' +
          'p.dimension_plan_estrategico, p.objetivo, p.orden, p.extras FROM pai_procesos p JOIN pai_dependencias d ON d.id = p.dependencia_id WHERE p.vigencia_id = ?',
        [id],
      )
    ).map((f) => ({
      clave: String(f.clave),
      codigo: String(f.codigo),
      dependencia: String(f.sigla),
      nombre: String(f.nombre),
      hoja: t(f.hoja),
      tipo: f.tipo as 'proceso' | 'proyecto',
      codigo_proyecto: t(f.codigo_proyecto),
      programa: t(f.programa),
      linea_plan_desarrollo: t(f.linea_plan_desarrollo),
      dimension_plan_estrategico: t(f.dimension_plan_estrategico),
      objetivo: t(f.objetivo),
      orden: Number(f.orden),
      extras: String(f.extras),
    })),
    riesgos: (
      await consultar(
        'SELECT p.clave, r.orden, r.numeral, r.texto, r.descripcion, r.corrupcion, r.bloque FROM pai_riesgos r JOIN pai_procesos p ON p.id = r.proceso_id WHERE p.vigencia_id = ?',
        [id],
      )
    ).map((f) => ({
      proceso: String(f.clave),
      orden: Number(f.orden),
      numeral: n(f.numeral),
      texto: String(f.texto),
      descripcion: t(f.descripcion),
      corrupcion: Number(f.corrupcion) as 0 | 1,
      bloque: n(f.bloque),
    })),
    acciones: (
      await consultar('SELECT p.clave, a.orden, a.descripcion FROM pai_acciones a JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?', [id])
    ).map((f) => ({ proceso: String(f.clave), orden: Number(f.orden), descripcion: String(f.descripcion) })),
    accionRiesgos: (
      await consultar(
        'SELECT p.clave, a.orden AS accion, r.orden AS riesgo, ar.orden FROM pai_accion_riesgos ar JOIN pai_acciones a ON a.id = ar.accion_id ' +
          'JOIN pai_riesgos r ON r.id = ar.riesgo_id JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?',
        [id],
      )
    ).map((f) => ({ proceso: String(f.clave), accion: Number(f.accion), riesgo: Number(f.riesgo), orden: Number(f.orden) })),
    indicadores: (
      await consultar(
        'SELECT i.codigo, p.clave, a.orden AS accion, i.orden, i.nombre, i.tipo_meta, i.meta_1, i.meta_2, i.meta_3, i.meta_4, i.meta_5, i.meta_6, ' +
          'i.meta_total, i.regla_meta_total, i.divisor_meta_total, i.regla_avance_total, i.divisor_avance_total, i.tope_100, i.tope_por_bimestre, ' +
          'i.productos, i.rol_responsable, i.responsable, i.corresponsables, i.extras FROM pai_indicadores i ' +
          'JOIN pai_procesos p ON p.id = i.proceso_id JOIN pai_acciones a ON a.id = i.accion_id WHERE i.vigencia_id = ?',
        [id],
      )
    ).map((f) => ({
      codigo: String(f.codigo),
      proceso: String(f.clave),
      accion: Number(f.accion),
      orden: Number(f.orden),
      nombre: String(f.nombre),
      tipo_meta: f.tipo_meta as 'numero',
      metas: [Number(f.meta_1), Number(f.meta_2), Number(f.meta_3), Number(f.meta_4), Number(f.meta_5), Number(f.meta_6)],
      meta_total: Number(f.meta_total),
      regla_meta_total: f.regla_meta_total as 'suma',
      divisor_meta_total: n(f.divisor_meta_total),
      regla_avance_total: f.regla_avance_total as 'suma',
      divisor_avance_total: n(f.divisor_avance_total),
      tope_100: n(f.tope_100) as 0 | 1 | null,
      tope_por_bimestre: t(f.tope_por_bimestre),
      productos: t(f.productos),
      rol_responsable: t(f.rol_responsable),
      responsable: t(f.responsable),
      corresponsables: t(f.corresponsables),
      extras: String(f.extras),
    })),
    reportes: (
      await consultar(
        'SELECT i.codigo, r.bimestre, r.avance, r.logros, r.observaciones, r.riesgo_materializado, r.numeral_riesgo, r.descripcion_riesgo, ' +
          "r.fuentes_verificacion FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ? AND r.origen = 'importado'",
        [id],
      )
    ).map((f) => ({
      codigo: String(f.codigo),
      bimestre: Number(f.bimestre) as 1,
      avance: n(f.avance),
      logros: t(f.logros),
      observaciones: t(f.observaciones),
      riesgo_materializado: t(f.riesgo_materializado) as 'SI' | null,
      numeral_riesgo: t(f.numeral_riesgo),
      descripcion_riesgo: t(f.descripcion_riesgo),
      fuentes_verificacion: t(f.fuentes_verificacion),
    })),
  };
}

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: carga del JSON real y exportación (e2e)`, () => {
  let base: BasePrueba;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let bd: BaseDatosRepositorio;
  let original: ArchivoFichasPai;
  let admin: SesionPaiPrueba;
  const indicadoresJson = new Map<string, IndicadorJson>();

  beforeAll(async () => {
    base = await crearBasePrueba('paicar');
    dist = await crearDistTemporal();
    prueba = await crearAppRepositorio(base.config, dist.directorio);
    bd = await bdDe(base);
    original = leerJson();
    for (const proceso of original.procesos) {
      for (const accion of proceso.acciones) {
        for (const indicador of accion.indicadores) indicadoresJson.set(indicador.codigo, indicador);
      }
    }
    await crearUsuarioPai(base, { usuario: 'admin.carga', rol: 'administrador', nombre: 'Planeación' });
    await crearUsuarioPai(base, { usuario: 'resp.saf', rol: 'responsable', nombre: 'Responsable SAF' });
    admin = await iniciarSesionPai(prueba.servidor, 'admin.carga');
  }, 60_000);

  afterAll(async () => {
    await prueba?.cerrar();
    await bd?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  it('carga el PAI 2026 completo en una transacción', async () => {
    const resultado = await guardarFichas(bd, leerJson(), { forzar: false, bimestreAbierto: 4 });
    expect(resultado).toMatchObject({
      vigencia: 2026,
      vigenciaNueva: true,
      dependencias: 5,
      procesos: 27,
      acciones: 228,
      indicadores: 344,
      indicadoresNuevos: 344,
      indicadoresActualizados: 0,
      indicadoresBorrados: 0,
      reportesImportados: 957,
      reportesConservados: 0,
      reportesPerdidos: [],
      avisos: [],
    });
  }, 60_000);

  it('ida y vuelta por la base: las filas guardadas reconstruyen el JSON exacto', async () => {
    const filas = await leerFilasDeBase(base.admin, 2026);
    expect(deFilasFichas(filas)).toEqual(leerJson());
  });

  it('la API devuelve los mismos números del JSON (metas, avances, totales y %); mide el tamaño del tablero', async () => {
    const res = await lectura(prueba.servidor, admin, '/tablero').expect(200);
    const tablero = res.body as TableroPai;
    expect(tablero.vigencia).toMatchObject({ anio: 2026, bimestreAbierto: 4 });
    expect(tablero.indicadores).toHaveLength(344);
    expect(tablero.procesos).toHaveLength(27);
    expect(tablero.acciones).toHaveLength(228);
    expect(tablero.dependencias.map((d) => d.sigla)).toEqual(['SAF', 'DTF', 'GEP', 'OCI', 'OPE']);
    const filasCarga = new Map(aFilasFichas(original).indicadores.map((f) => [f.codigo, f]));
    for (const indicador of tablero.indicadores) {
      const json = indicadoresJson.get(indicador.codigo) as IndicadorJson;
      const avances = CLAVES_BIMESTRE_JSON.map((b) => json.seguimiento[b]?.avance ?? null);
      expect(indicador.metas).toEqual(CLAVES_BIMESTRE_JSON.map((b) => json.metas[b]));
      expect(indicador.metaTotal).toBe(json.metas.total);
      expect(indicador.avances).toEqual(avances);
      const fila = filasCarga.get(indicador.codigo);
      const esperado = calcularIndicador({
        metas: CLAVES_BIMESTRE_JSON.map((b) => json.metas[b]),
        metaTotalGuardada: json.metas.total,
        avances,
        calculo: calculoDeColumnas(fila as NonNullable<typeof fila>),
      });
      expect(indicador.avanceTotal).toBe(esperado.avanceTotal);
      expect(indicador.porcentajes).toEqual(esperado.porcentajes.map(redondeo));
      expect(indicador.porcentajeTotal).toBe(redondeo(esperado.porcentajeTotal));
      expect(indicador.editables.every((e) => !e)).toBe(true);
      // La escala de los de porcentaje (NEG-11): GEP-EDI-01 va en 0-1.
      expect(indicador.escala).toBe(
        indicador.tipoMeta !== 'porcentaje' ? null : json.extras.escala === '0-1' ? '0-1' : '0-100',
      );
    }
    expect(tablero.indicadores.filter((i) => i.escala === '0-1').map((i) => i.codigo)).toEqual(['GEP-EDI-01']);
    const gepEdi = (await lectura(prueba.servidor, admin, '/indicadores/GEP-EDI-01').expect(200)).body as FichaIndicadorPai;
    expect(gepEdi.escala).toBe('0-1');
    // Orden del archivo: dependencia, proceso, acción, indicador.
    const ordenJson = original.procesos
      .toSorted((a, b) => original.dependencias.findIndex((d) => d.sigla === a.dependencia) - original.dependencias.findIndex((d) => d.sigla === b.dependencia))
      .flatMap((p) => p.acciones.flatMap((a) => a.indicadores.map((i) => i.codigo)));
    expect(tablero.indicadores.map((i) => i.codigo)).toEqual(ordenJson);
    expect(tablero.resumen.procesos).toHaveLength(27);
    expect(tablero.resumen.general.indicadores).toBe(344);
    expect(tablero.resumen.general.conteo?.bimestre).toBe(4);

    const bytes = Buffer.byteLength(res.text);
    const gzip = gzipSync(res.text).length;
    process.stderr.write(
      `[pai-dominio ${MOTOR_PRUEBAS}] tamaño del tablero del administrador con 344 indicadores: ${(bytes / 1024).toFixed(1)} KiB (${(gzip / 1024).toFixed(1)} KiB con gzip)\n`,
    );
    expect(bytes).toBeLessThan(450 * 1024);
  });

  it('la ficha devuelve los textos del JSON', async () => {
    const ficha = (await lectura(prueba.servidor, admin, '/indicadores/SAF-AC-01').expect(200)).body as FichaIndicadorPai;
    const json = indicadoresJson.get('SAF-AC-01') as IndicadorJson;
    for (const b of CLAVES_BIMESTRE_JSON) {
      const seguimiento = json.seguimiento[b];
      const bimestre = ficha.bimestres[Number(b) - 1];
      expect(bimestre.logros).toBe(seguimiento?.logros ?? null);
      expect(bimestre.observaciones).toBe(seguimiento?.observaciones ?? null);
      expect(bimestre.riesgoMaterializado).toBe(seguimiento?.riesgo_materializado ?? null);
      expect(bimestre.fuentesVerificacion).toBe(seguimiento?.fuentes_verificacion ?? null);
      expect(bimestre.origen).toBe(seguimiento ? 'importado' : null);
    }
    expect(ficha.productos).toBe(json.productos);
    expect(ficha.responsable).toBe(json.responsable);
    const edi = (await lectura(prueba.servidor, admin, '/indicadores/GEP-EDI-01').expect(200)).body as FichaIndicadorPai;
    expect(edi.bimestres[0].meta).toBe(0.1666666667);
    expect(edi.metaTotal).toBe(1);
  });

  it('volver a cargar el mismo archivo no cambia nada (ids estables)', async () => {
    const antes = (await lectura(prueba.servidor, admin, '/tablero').expect(200)).body as TableroPai;
    const resultado = await guardarFichas(bd, leerJson(), { forzar: false });
    expect(resultado).toMatchObject({ vigenciaNueva: false, indicadoresNuevos: 0, indicadoresActualizados: 0, indicadoresBorrados: 0, reportesImportados: 957 });
    const despues = (await lectura(prueba.servidor, admin, '/tablero').expect(200)).body as TableroPai;
    expect(despues.indicadores.map((i) => [i.id, i.codigo])).toEqual(antes.indicadores.map((i) => [i.id, i.codigo]));
    expect(despues.vigencia.bimestreAbierto).toBe(4);
  }, 60_000);

  it('se niega con datos del aplicativo; con forzar conserva lo que sigue y avisa de lo que se pierde', async () => {
    const tablero = (await lectura(prueba.servidor, admin, '/tablero').expect(200)).body as TableroPai;
    const porCodigo = new Map(tablero.indicadores.map((i) => [i.codigo, i]));
    const ac01 = porCodigo.get('SAF-AC-01') as TableroPai['indicadores'][number];
    const ac02 = porCodigo.get('SAF-AC-02') as TableroPai['indicadores'][number];
    const [{ id: respId }] = (await base.admin.query<FilaBd[]>("SELECT id FROM pai_usuarios WHERE usuario = 'resp.saf'"))[0];
    await asignarPai(base, Number(respId), { procesoId: ac01.procesoId });
    const resp = await iniciarSesionPai(prueba.servidor, 'resp.saf');
    await escritura(prueba.servidor, resp, 'put', `/indicadores/${ac01.id}/bimestres/4`).send({ avance: 7, logros: 'Del aplicativo' }).expect(200);
    await escritura(prueba.servidor, resp, 'put', `/indicadores/${ac02.id}/bimestres/4`).send({ avance: 3 }).expect(200);
    // Corrige un importado (Bim 3) desde el aplicativo: el JSON ya no lo pisa.
    await autorizarPai(base, { usuarioId: Number(respId), bimestre: 3, procesoId: ac01.procesoId });
    await escritura(prueba.servidor, resp, 'put', `/indicadores/${ac01.id}/bimestres/3`).send({ avance: 2 }).expect(200);

    await expect(guardarFichas(bd, leerJson(), { forzar: false })).rejects.toThrow(ErrorCargaFichas);
    await expect(guardarFichas(bd, leerJson(), { forzar: false })).rejects.toThrow(/reportes del aplicativo/);

    // Con forzar, un archivo sin SAF-AC-02: se pierde su reporte; SAF-AC-01 conserva los suyos.
    const modificado = leerJson();
    const proceso = modificado.procesos.find((p) => p.codigo === 'SAF-AC') as ArchivoFichasPai['procesos'][number];
    for (const accion of proceso.acciones) {
      accion.indicadores = accion.indicadores.filter((i) => i.codigo !== 'SAF-AC-02');
    }
    proceso.acciones = proceso.acciones.filter((a) => a.indicadores.length > 0);
    const resultado = await guardarFichas(bd, modificado, { forzar: true });
    expect(resultado.indicadores).toBe(343);
    expect(resultado.indicadoresBorrados).toBe(1);
    expect(resultado.reportesPerdidos).toEqual(['SAF-AC-02']);
    expect(resultado.reportesConservados).toBe(2);
    expect(resultado.avisos.join('\n')).toMatch(/SAF-AC-02/);
    expect(resultado.avisos.join('\n')).toMatch(/1 reporte del archivo no se cargó/);

    const ficha = (await lectura(prueba.servidor, admin, `/indicadores/${ac01.id}`).expect(200)).body as FichaIndicadorPai;
    expect(ficha.bimestres[3]).toMatchObject({ avance: 7, logros: 'Del aplicativo', origen: 'aplicativo' });
    expect(ficha.bimestres[2]).toMatchObject({ avance: 2, origen: 'aplicativo' });
    await lectura(prueba.servidor, admin, `/indicadores/${ac02.id}`).expect(404);
    // La asignación del proceso sigue: el responsable todavía ve sus indicadores.
    const deResp = (await lectura(prueba.servidor, resp, '/tablero').expect(200)).body as TableroPai;
    expect(deResp.indicadores.map((i) => i.codigo)).toContain('SAF-AC-01');
    expect(deResp.indicadores.map((i) => i.codigo)).not.toContain('SAF-AC-02');

    // Vuelve el archivo completo (con forzar): SAF-AC-02 reaparece con id nuevo y su historial importado.
    const completo = await guardarFichas(bd, leerJson(), { forzar: true });
    expect(completo.indicadoresNuevos).toBe(1);
    expect(completo.reportesConservados).toBe(2);
    const registro = (await lectura(prueba.servidor, admin, '/admin/registro?accion=cargar_fichas').expect(200)).body as PaginaRegistroPai;
    expect(registro.total).toBe(4);
  }, 120_000);

  it('exportación CSV del PAI completo: una fila por indicador', async () => {
    const res = await lectura(prueba.servidor, admin, '/admin/exportar.csv').expect(200);
    const filas = leerCsv(res.text);
    expect(filas).toHaveLength(345);
    const encabezados = filas[0];
    const col = (nombre: string) => encabezados.indexOf(nombre);
    const edi = filas.find((f) => f[col('Código del indicador')] === 'GEP-EDI-01') as string[];
    expect(edi[col('Meta bimestre 1')]).toBe('0,1666666667');
    expect(edi[col('Meta total')]).toBe('1');
    expect(edi[col('Dependencia')]).toBe('GEP');
    const filtrado = leerCsv((await lectura(prueba.servidor, admin, '/admin/exportar.csv?q=satisfaccion&bimestre=3').expect(200)).text);
    expect(filtrado.length).toBeGreaterThan(1);
    expect(filtrado.slice(1).every((f) => /satisfacci[oó]n/i.test(f[col('Indicador')]))).toBe(true);
  });
});
