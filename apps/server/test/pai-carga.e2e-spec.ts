import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ArchivoFichasPai, validarFormaFichas } from '../src/pai/carga/datos-fichas.js';
import { ErrorCargaFichas, guardarFichas } from '../src/pai/carga/guardar-fichas.js';
import { RAIZ_SERVIDOR } from '../src/config/configuracion.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import type { Conexion, ResultadoEscritura } from '../src/repositorio/bd/conexion.js';
import { asignarPai, autorizarPai, crearUsuarioPai } from './pai-apoyo.js';
import { avisarSiNoHayBd, type BasePrueba, crearBasePrueba, HAY_BD, MOTOR_PRUEBAS } from './repositorio-apoyo.js';

/**
 * Casos de borde de la carga de fichas (carga/guardar-fichas.ts) contra una
 * base DESECHABLE (MySQL o Postgres, ver repositorio-apoyo.ts), con el PAI
 * 2026 real:
 * - códigos corridos con datos del aplicativo: se niega aun con --forzar
 *   (NEG-2), salvo aceptarRenumeracion;
 * - un proceso que cambia de clave y conserva su código es un renombre
 *   (NEG-6); dos procesos que intercambian código no chocan;
 * - los riesgos conservan su id entre cargas (BD-8);
 * - las evidencias de los indicadores que desaparecen se cuentan y avisan, y
 *   el registro guarda los avisos (NEG-7, NEG-10);
 * - un reporte del aplicativo vacío (solo evidencias) recibe los valores del
 *   archivo (NEG-5);
 * - la carga no pisa un reporte que un responsable guarda mientras corre
 *   (BD-6).
 */

avisarSiNoHayBd('pai-carga.e2e-spec.ts');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const ARCHIVO = join(RAIZ_SERVIDOR, 'datos', 'pai', '2026', 'pai-2026.json');

function leerJson(): ArchivoFichasPai {
  return validarFormaFichas(JSON.parse(readFileSync(ARCHIVO, 'utf8')));
}

type ProcesoJson = ArchivoFichasPai['procesos'][number];
type IndicadorJson = ProcesoJson['acciones'][number]['indicadores'][number];

function proceso(archivo: ArchivoFichasPai, codigo: string): ProcesoJson {
  return archivo.procesos.find((p) => p.codigo === codigo) as ProcesoJson;
}

function indicador(archivo: ArchivoFichasPai, codigo: string): IndicadorJson {
  for (const p of archivo.procesos) {
    for (const a of p.acciones) {
      const encontrado = a.indicadores.find((i) => i.codigo === codigo);
      if (encontrado) return encontrado;
    }
  }
  throw new Error(`No está ${codigo}`);
}

/** Quita un indicador del archivo (y la acción si queda vacía). */
function quitar(archivo: ArchivoFichasPai, codigo: string): void {
  for (const p of archivo.procesos) {
    for (const a of p.acciones) a.indicadores = a.indicadores.filter((i) => i.codigo !== codigo);
    p.acciones = p.acciones.filter((a) => a.indicadores.length > 0);
  }
}

/**
 * `bd` cuya transacción llama a `alLeerReportes` justo después de que la carga
 * lee los reportes existentes (para simular a un responsable que guarda
 * mientras corre la carga).
 */
function espiarLecturaReportes(bd: BaseDatosRepositorio, alLeerReportes: () => Promise<void>): BaseDatosRepositorio {
  return {
    transaccion: <T>(accion: (conexion: Conexion) => Promise<T>, opciones?: { reintentos?: number }) =>
      bd.transaccion((conexion) => {
        const query = conexion.query.bind(conexion);
        const espiada = new Proxy(conexion, {
          get(objeto, propiedad) {
            if (propiedad === 'query') {
              return async (sql: string, valores?: readonly unknown[]) => {
                const respuesta = await query(sql, valores);
                if (sql.startsWith('SELECT r.id, r.indicador_id, r.bimestre, r.origen')) await alLeerReportes();
                return respuesta;
              };
            }
            const valor: unknown = Reflect.get(objeto, propiedad, objeto);
            return typeof valor === 'function' ? (valor as (...a: unknown[]) => unknown).bind(objeto) : valor;
          },
        });
        return accion(espiada);
      }, opciones),
  } as unknown as BaseDatosRepositorio;
}

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: carga de fichas, casos de borde (e2e)`, () => {
  let base: BasePrueba;
  let bd: BaseDatosRepositorio;
  let respId = 0;

  const filas = async (sql: string, valores: unknown[] = []): Promise<RowDataPacket[]> =>
    (await base.admin.query<RowDataPacket[]>(sql, valores))[0];
  const idDe = async (codigo: string): Promise<number> =>
    Number((await filas('SELECT id FROM pai_indicadores WHERE codigo = ?', [codigo]))[0].id);
  const insertar = async (sql: string, valores: unknown[]): Promise<number> => {
    const [resultado] = await base.admin.query<ResultadoEscritura>(sql, valores);
    return Number(resultado.insertId);
  };
  /** Reporte del aplicativo (como si lo hubiera guardado el responsable). */
  const reporteAplicativo = (indicadorId: number, bimestre: number, avance: number | null, logros: string | null) =>
    insertar(
      "INSERT INTO pai_reportes (indicador_id, bimestre, avance, logros, origen, actualizado_por) VALUES (?, ?, ?, ?, 'aplicativo', ?)",
      [indicadorId, bimestre, avance, logros, respId],
    );
  /** Evidencia (con su ficha de pai_almacen_archivos) en un reporte existente. */
  const evidencia = async (reporteId: number): Promise<number> => {
    const archivoId = await insertar(
      'INSERT INTO pai_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en) VALUES (?, ?, ?, 0, ?, NULL, NULL, ?)',
      [randomBytes(32).toString('hex'), 'application/pdf', 1234, 1024 * 1024, new Date()],
    );
    return insertar(
      'INSERT INTO pai_evidencias (reporte_id, archivo_id, ruta_privada, nombre, tipo, bytes, subido_por, subido_en) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
      [reporteId, archivoId, 'acta.pdf', 'application/pdf', 1234, respId, new Date()],
    );
  };

  beforeAll(async () => {
    base = await crearBasePrueba('paicarga');
    bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await bd.listo();
    await guardarFichas(bd, leerJson(), { forzar: false, bimestreAbierto: 4 });
    respId = await crearUsuarioPai(base, { usuario: 'resp.carga', rol: 'responsable' });
  }, 120_000);

  beforeEach(async () => {
    // Cada caso parte del PAI 2026 tal cual y sin datos del aplicativo.
    await base.admin.query('DELETE FROM pai_evidencias');
    await base.admin.query("DELETE FROM pai_reportes WHERE origen = 'aplicativo'");
    await base.admin.query('DELETE FROM pai_asignaciones');
    await base.admin.query('DELETE FROM pai_autorizaciones');
    await guardarFichas(bd, leerJson(), { forzar: true, aceptarRenumeracion: true });
  }, 120_000);

  afterAll(async () => {
    await bd?.cerrar();
    await base?.borrar();
  });

  it('códigos corridos con datos del aplicativo: se niega aun con forzar y lista código y nombres (NEG-2)', async () => {
    const id03 = await idDe('SAF-TH-03');
    const nombre03 = String((await filas('SELECT nombre FROM pai_indicadores WHERE id = ?', [id03]))[0].nombre);
    await asignarPai(base, respId, { indicadorId: id03 });
    await autorizarPai(base, { usuarioId: respId, bimestre: 3, indicadorId: id03 });
    await reporteAplicativo(id03, 4, 7, 'Logro del indicador 3 original');

    // Una extracción nueva sin SAF-TH-02: los códigos siguientes se corren.
    const corrido = leerJson();
    quitar(corrido, 'SAF-TH-02');
    let n = 1;
    for (const a of proceso(corrido, 'SAF-TH').acciones) {
      for (const i of a.indicadores) i.codigo = `SAF-TH-${String(n++).padStart(2, '0')}`;
    }
    const error = await guardarFichas(bd, corrido, { forzar: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorCargaFichas);
    expect((error as Error).message).toContain('SAF-TH-03');
    expect((error as Error).message).toContain(nombre03.slice(0, 40));
    expect((error as Error).message).toMatch(/--aceptar-renumeracion/);
    expect((error as Error).message).toMatch(/1 reporte del aplicativo, 1 asignación individual, 1 autorización/);
    // No se cargó nada: el reporte sigue con su indicador original.
    const [conReporte] = await filas(
      "SELECT i.nombre FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE r.logros = 'Logro del indicador 3 original'",
    );
    expect(conReporte.nombre).toBe(nombre03);
    expect(Number((await filas("SELECT COUNT(*) AS n FROM pai_indicadores WHERE codigo LIKE 'SAF-TH-%'"))[0].n)).toBe(
      proceso(leerJson(), 'SAF-TH').acciones.flatMap((a) => a.indicadores).length,
    );

    // Con aceptarRenumeracion se carga y queda el aviso.
    const resultado = await guardarFichas(bd, corrido, { forzar: true, aceptarRenumeracion: true });
    expect(resultado.avisos.join('\n')).toMatch(/aceptar-renumeracion.*SAF-TH-03/s);
  }, 120_000);

  it('sin datos del aplicativo en los códigos que cambian de nombre, la carga no se niega', async () => {
    const renombrado = leerJson();
    indicador(renombrado, 'SAF-TH-05').nombre = 'Nombre corregido en la nueva extracción';
    const resultado = await guardarFichas(bd, renombrado, { forzar: false });
    expect(resultado.indicadoresActualizados).toBe(1);
  }, 120_000);

  it('un proceso que cambia de clave con el mismo código es un renombre; dos que intercambian código no chocan (NEG-6)', async () => {
    const [ali] = await filas("SELECT id FROM pai_procesos WHERE clave = 'gep-alianzas'");
    const procesoId = Number(ali.id);
    await asignarPai(base, respId, { procesoId });
    await autorizarPai(base, { usuarioId: respId, bimestre: 3, procesoId });

    const renombrado = leerJson();
    (renombrado.procesos.find((p) => p.clave === 'gep-alianzas') as ProcesoJson).clave = 'gep-alianzas-estrategicas';
    const resultado = await guardarFichas(bd, renombrado, { forzar: true });
    expect(resultado.avisos.join('\n')).toMatch(/gep-alianzas → gep-alianzas-estrategicas \(GEP-ALI\)/);
    const [despues] = await filas("SELECT id, codigo FROM pai_procesos WHERE clave = 'gep-alianzas-estrategicas'");
    expect(Number(despues.id)).toBe(procesoId);
    expect(despues.codigo).toBe('GEP-ALI');
    expect(Number((await filas('SELECT COUNT(*) AS n FROM pai_asignaciones WHERE proceso_id = ?', [procesoId]))[0].n)).toBe(1);
    expect(Number((await filas('SELECT COUNT(*) AS n FROM pai_autorizaciones WHERE proceso_id = ?', [procesoId]))[0].n)).toBe(1);

    // Dos procesos intercambian sus códigos (cada clave conserva su fila).
    const intercambio = leerJson();
    const [a, b] = intercambio.procesos.filter((p) => p.dependencia === 'SAF').slice(0, 2);
    const [idA, idB] = [
      Number((await filas('SELECT id FROM pai_procesos WHERE clave = ?', [a.clave]))[0].id),
      Number((await filas('SELECT id FROM pai_procesos WHERE clave = ?', [b.clave]))[0].id),
    ];
    [a.codigo, b.codigo] = [b.codigo, a.codigo];
    await guardarFichas(bd, intercambio, { forzar: true });
    const [filaA] = await filas('SELECT id, codigo FROM pai_procesos WHERE clave = ?', [a.clave]);
    expect([Number(filaA.id), filaA.codigo]).toEqual([idA, a.codigo]);
    const [filaB] = await filas('SELECT id, codigo FROM pai_procesos WHERE clave = ?', [b.clave]);
    expect([Number(filaB.id), filaB.codigo]).toEqual([idB, b.codigo]);
  }, 120_000);

  it('los riesgos conservan su id entre cargas y un texto corregido se actualiza en su lugar (BD-8)', async () => {
    const consultaRiesgos =
      'SELECT r.id, p.clave, r.orden, r.texto, r.descripcion FROM pai_riesgos r JOIN pai_procesos p ON p.id = r.proceso_id ORDER BY r.id';
    const vinculos = 'SELECT accion_id, riesgo_id, orden FROM pai_accion_riesgos ORDER BY accion_id, riesgo_id';
    const antes = await filas(consultaRiesgos);
    const vinculosAntes = await filas(vinculos);
    expect(antes.length).toBeGreaterThan(100);
    await guardarFichas(bd, leerJson(), { forzar: false });
    expect(await filas(consultaRiesgos)).toEqual(antes);
    expect(await filas(vinculos)).toEqual(vinculosAntes);

    const corregido = leerJson();
    const primero = corregido.procesos.find((p) => p.extras.riesgos.length > 0) as ProcesoJson;
    primero.extras.riesgos[0].descripcion = 'Descripción corregida';
    await guardarFichas(bd, corregido, { forzar: false });
    const despues = await filas(consultaRiesgos);
    expect(despues.map((r) => Number(r.id))).toEqual(antes.map((r) => Number(r.id)));
    expect(despues.find((r) => r.clave === primero.clave && Number(r.orden) === 1)?.descripcion).toBe('Descripción corregida');
    expect(await filas(vinculos)).toEqual(vinculosAntes);
  }, 120_000);

  it('las evidencias de un indicador que desaparece se cuentan y avisan aunque su reporte sea importado; el registro guarda los avisos (NEG-7, NEG-10)', async () => {
    const id = await idDe('SAF-AC-02');
    const [importado] = await filas("SELECT id FROM pai_reportes WHERE indicador_id = ? AND bimestre = 3 AND origen = 'importado'", [id]);
    await evidencia(Number(importado.id));
    const sinAc02 = leerJson();
    quitar(sinAc02, 'SAF-AC-02');
    const resultado = await guardarFichas(bd, sinAc02, { forzar: true });
    expect(resultado.reportesPerdidos).toEqual([]);
    expect(resultado.evidenciasBorradas).toBe(1);
    expect(resultado.avisos.join('\n')).toMatch(/se perdieron con esos indicadores: 1 evidencia \(SAF-AC-02 \(1 evidencia\)\)/);
    expect(Number((await filas('SELECT COUNT(*) AS n FROM pai_evidencias'))[0].n)).toBe(0);

    const [registro] = await filas("SELECT detalle FROM pai_registro WHERE accion = 'cargar_fichas' ORDER BY id DESC LIMIT 1");
    const detalle = JSON.parse(String(registro.detalle)) as Record<string, unknown>;
    expect(detalle.avisos).toEqual(resultado.avisos);
    expect(detalle.indicadoresBorradosCodigos).toEqual(['SAF-AC-02']);
    expect(detalle.evidenciasBorradas).toBe(1);
  }, 120_000);

  it('un reporte del aplicativo vacío (solo evidencias) recibe los valores del archivo; uno con datos los tapa y se lista (NEG-5)', async () => {
    const ac02 = await idDe('SAF-AC-02');
    const ac03 = await idDe('SAF-AC-03');
    const vacio = await reporteAplicativo(ac02, 4, null, null);
    await evidencia(vacio);
    await reporteAplicativo(ac03, 4, 1, 'Del aplicativo');
    const conBim4 = leerJson();
    for (const codigo of ['SAF-AC-02', 'SAF-AC-03']) {
      const i = indicador(conBim4, codigo);
      i.seguimiento['4'] = { ...(i.seguimiento['3'] as NonNullable<(typeof i.seguimiento)['3']>), avance: 5, logros: 'Logro Bim 4 desde Excel' };
    }
    const resultado = await guardarFichas(bd, conBim4, { forzar: true });
    const [ac02b4] = await filas('SELECT avance, logros, origen, (SELECT COUNT(*) FROM pai_evidencias e WHERE e.reporte_id = r.id) AS evidencias FROM pai_reportes r WHERE id = ?', [vacio]);
    expect({ ...ac02b4, avance: Number(ac02b4.avance), evidencias: Number(ac02b4.evidencias) }).toEqual({
      avance: 5,
      logros: 'Logro Bim 4 desde Excel',
      origen: 'importado',
      evidencias: 1,
    });
    const [ac03b4] = await filas('SELECT avance, logros, origen FROM pai_reportes WHERE indicador_id = ? AND bimestre = 4', [ac03]);
    expect({ ...ac03b4, avance: Number(ac03b4.avance) }).toEqual({ avance: 1, logros: 'Del aplicativo', origen: 'aplicativo' });
    const avisos = resultado.avisos.join('\n');
    expect(avisos).toMatch(/1 reporte del archivo no se cargó .*: SAF-AC-03 \(Bimestre 4\)/);
    expect(avisos).toMatch(/1 reporte del aplicativo sin datos .* recibió los valores del archivo/);
  }, 120_000);

  it('no pisa un reporte que un responsable guarda mientras corre la carga (BD-6) y un choque al insertar da un error claro', async () => {
    const id = await idDe('SAF-AC-01');
    const corregido = leerJson();
    const ac01 = indicador(corregido, 'SAF-AC-01');
    ac01.seguimiento['3'] = { ...(ac01.seguimiento['3'] as NonNullable<(typeof ac01.seguimiento)['3']>), avance: 42 };
    // Justo después de que la carga lee los reportes, el responsable guarda
    // el del Bimestre 3 (otra conexión, ya confirmado).

    const resultado = await guardarFichas(
      espiarLecturaReportes(bd, async () => {
        await base.admin.query(
          "UPDATE pai_reportes SET avance = 99, origen = 'aplicativo', actualizado_por = ? WHERE indicador_id = ? AND bimestre = 3",
          [respId, id],
        );
      }),
      corregido,
      { forzar: true },
    );
    const [b3] = await filas('SELECT avance, origen FROM pai_reportes WHERE indicador_id = ? AND bimestre = 3', [id]);
    expect([Number(b3.avance), b3.origen]).toEqual([99, 'aplicativo']);
    expect(resultado.avisos.join('\n')).toMatch(/SAF-AC-01 \(Bimestre 3\)/);

    // Si el responsable crea un reporte que la carga iba a insertar: error
    // claro y nada cargado.
    await base.admin.query("DELETE FROM pai_reportes WHERE indicador_id = ? AND bimestre = 2 AND origen = 'importado'", [id]);
    const error = await guardarFichas(
      espiarLecturaReportes(bd, async () => {
        await reporteAplicativo(id, 2, 3, null);
      }),
      leerJson(),
      { forzar: true },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorCargaFichas);
    expect((error as Error).message).toMatch(/Mientras corría la carga/);
  }, 120_000);
});
