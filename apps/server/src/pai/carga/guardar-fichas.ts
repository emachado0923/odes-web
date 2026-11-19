import type { RowDataPacket } from 'mysql2/promise';
import type { NumeroBimestre } from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type {
  Conexion,
  ResultadoEscritura,
} from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import { claveNormalizada } from '../../repositorio/dominio/normalizacion.js';
import {
  type ArchivoFichasPai,
  aFilasFichas,
  type FilaReporte,
  type FilasFichasPai,
} from './datos-fichas.js';

/**
 * Carga de las fichas en una sola transacción (bd.transaccion, reintentos 0)
 * con lotes de 500 filas, como sivu/tableros/guardar-matricula.ts. Deja la
 * estructura de la vigencia (dependencias, procesos, riesgos, acciones,
 * indicadores) y los reportes 'importado' exactamente como el JSON:
 *
 * - Sincroniza por clave (sigla de la dependencia, clave del proceso, orden
 *   del riesgo y de la acción en su proceso, código del indicador): lo que
 *   sigue existiendo conserva su id (y con él las asignaciones,
 *   autorizaciones, reportes del aplicativo, evidencias y los filtros por id
 *   guardados en enlaces, p. ej. ?riesgo=); lo nuevo se inserta en lotes; lo
 *   que cambió se actualiza (solo si cambió); lo que ya no está se borra. Los
 *   vínculos acción-riesgo se reemplazan solo si cambiaron.
 * - OJO: el código del indicador es el consecutivo dentro de la hoja (nota
 *   8), no una identidad: si una extracción nueva quita o agrega una fila en
 *   medio, los códigos siguientes se corren. Por eso, si un código existente
 *   cambia de nombre y tiene datos del aplicativo (reportes, evidencias,
 *   asignaciones individuales o autorizaciones), la carga se niega (también
 *   con `forzar`) y lista código, nombre anterior y nombre nuevo, salvo con
 *   `aceptarRenumeracion` (esos datos quedan con el indicador que ahora
 *   tiene ese código).
 * - Un proceso cuya clave cambió pero conserva su código (p. ej., se
 *   renombró la hoja) se trata como renombre: conserva su id, asignaciones
 *   y autorizaciones. Los códigos de proceso que cambian de dueño se liberan
 *   antes de escribir (sin chocar con el UNIQUE).
 * - Se niega (ErrorCargaFichas) si la vigencia ya tiene reportes del
 *   aplicativo, evidencias, asignaciones o autorizaciones, salvo con
 *   `forzar`. Con `forzar` conserva los reportes del aplicativo con datos de
 *   los indicadores cuyo código sigue existiendo (el JSON no los pisa; un
 *   reporte del aplicativo vacío, creado solo para guardar evidencias, sí
 *   recibe los valores del JSON) y avisa de lo que se pierde: reportes,
 *   evidencias, asignaciones y autorizaciones de los indicadores y procesos
 *   que desaparecen.
 * - Solo toca reportes 'importado' (UPDATE … AND origen = 'importado'): si
 *   un responsable guarda uno mientras corre la carga, se conserva lo suyo.
 *   Aun así conviene cerrar el bimestre antes de cargar.
 * - Postgres: las tablas usan IDENTITY (no se insertan ids) y un INSERT de
 *   varias filas devuelve solo el primer id: los ids se buscan por clave
 *   después de insertar.
 * - Registra 'cargar_fichas' con registrarEnPai, con los avisos y lo que se
 *   borró.
 */

/** Filas por INSERT: unos miles de parámetros, lejos del límite de Postgres (65.535). */
const TAMANO_LOTE = 500;

export interface OpcionesCargaFichas {
  /** Cargar aunque haya datos del aplicativo (ver arriba). */
  forzar: boolean;
  /**
   * Cargar aunque códigos con datos del aplicativo cambien de nombre (los
   * datos quedan con el indicador que ahora tiene ese código).
   */
  aceptarRenumeracion?: boolean;
  /** Bimestre abierto al terminar (undefined = no cambia; null = cerrado). */
  bimestreAbierto?: NumeroBimestre | null;
}

export interface ResultadoCargaFichas {
  vigencia: number;
  /** true si la vigencia no existía. */
  vigenciaNueva: boolean;
  dependencias: number;
  procesos: number;
  acciones: number;
  indicadores: number;
  /** Indicadores nuevos / con cambios / borrados en esta carga. */
  indicadoresNuevos: number;
  indicadoresActualizados: number;
  indicadoresBorrados: number;
  /** Reportes 'importado' que quedaron (los del JSON, salvo los que tapa un reporte del aplicativo). */
  reportesImportados: number;
  /** Reportes del aplicativo conservados. */
  reportesConservados: number;
  /** Códigos de indicador cuyos reportes del aplicativo se perdieron (solo con forzar). */
  reportesPerdidos: string[];
  /**
   * Evidencias borradas de la base con los indicadores que desaparecieron
   * (de cualquier reporte, importado o del aplicativo): sus archivos quedan
   * para npm run pai:recolectar-evidencias.
   */
  evidenciasBorradas: number;
  avisos: string[];
}

/**
 * La carga no se hizo: la vigencia ya tiene datos del aplicativo (sin
 * forzar), códigos con datos cambian de nombre (sin aceptarRenumeracion) o
 * alguien guardó un reporte mientras corría.
 */
export class ErrorCargaFichas extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCargaFichas';
  }
}

interface FilaConteo extends RowDataPacket {
  n: number;
}

interface FilaId extends RowDataPacket {
  id: number;
}

type Valor = string | number | null;

/** "1 asignación", "3 asignaciones". */
function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Suma de los conteos de un mapa id -> n. */
function sumar(mapa: Map<number, number>): number {
  return [...mapa.values()].reduce((total, n) => total + n, 0);
}

/** Firma (independiente del orden) de un conjunto de filas numéricas. */
function firma(filas: readonly (readonly unknown[])[]): string {
  return filas
    .map((f) => f.map((v) => (v === null ? '' : String(Number(v)))).join('#'))
    .toSorted()
    .join('|');
}

/** Elementos que se listan en un aviso o un error (el resto se resume). */
const MAX_LISTA = 30;

function lista(elementos: readonly string[]): string {
  if (elementos.length <= MAX_LISTA) return elementos.join(', ');
  return `${elementos.slice(0, MAX_LISTA).join(', ')} y ${elementos.length - MAX_LISTA} más`;
}

/** id -> n de una consulta `SELECT <id> AS id, COUNT(*) AS n … IN (?) GROUP BY …`, por lotes. */
async function contarPorId(
  conexion: Conexion,
  sql: string,
  ids: readonly number[],
): Promise<Map<number, number>> {
  const conteo = new Map<number, number>();
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const [filas] = await conexion.query<
      (RowDataPacket & { id: number; n: number })[]
    >(sql, [ids.slice(i, i + TAMANO_LOTE)]);
    for (const fila of filas) {
      conteo.set(
        Number(fila.id),
        (conteo.get(Number(fila.id)) ?? 0) + Number(fila.n),
      );
    }
  }
  return conteo;
}

/** Datos del aplicativo de unos indicadores (por id). */
interface DatosAplicativoIndicador {
  reportes: number;
  evidencias: number;
  asignaciones: number;
  autorizaciones: number;
}

async function datosAplicativoDe(
  conexion: Conexion,
  ids: readonly number[],
): Promise<Map<number, DatosAplicativoIndicador>> {
  const reportes = await contarPorId(
    conexion,
    "SELECT r.indicador_id AS id, COUNT(*) AS n FROM pai_reportes r WHERE r.origen = 'aplicativo' AND r.indicador_id IN (?) GROUP BY r.indicador_id",
    ids,
  );
  const evidencias = await contarPorId(
    conexion,
    'SELECT r.indicador_id AS id, COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id WHERE r.indicador_id IN (?) GROUP BY r.indicador_id',
    ids,
  );
  const asignaciones = await contarPorId(
    conexion,
    'SELECT indicador_id AS id, COUNT(*) AS n FROM pai_asignaciones WHERE indicador_id IN (?) GROUP BY indicador_id',
    ids,
  );
  const autorizaciones = await contarPorId(
    conexion,
    'SELECT indicador_id AS id, COUNT(*) AS n FROM pai_autorizaciones WHERE indicador_id IN (?) GROUP BY indicador_id',
    ids,
  );
  return new Map(
    ids.map((id) => [
      id,
      {
        reportes: reportes.get(id) ?? 0,
        evidencias: evidencias.get(id) ?? 0,
        asignaciones: asignaciones.get(id) ?? 0,
        autorizaciones: autorizaciones.get(id) ?? 0,
      },
    ]),
  );
}

function describirDatos(datos: DatosAplicativoIndicador): string {
  return [
    datos.reportes
      ? cantidad(
          datos.reportes,
          'reporte del aplicativo',
          'reportes del aplicativo',
        )
      : '',
    datos.evidencias
      ? cantidad(datos.evidencias, 'evidencia', 'evidencias')
      : '',
    datos.asignaciones
      ? cantidad(
          datos.asignaciones,
          'asignación individual',
          'asignaciones individuales',
        )
      : '',
    datos.autorizaciones
      ? cantidad(datos.autorizaciones, 'autorización', 'autorizaciones')
      : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function tieneDatos(datos: DatosAplicativoIndicador | undefined): boolean {
  return Boolean(
    datos &&
    datos.reportes +
      datos.evidencias +
      datos.asignaciones +
      datos.autorizaciones >
      0,
  );
}

async function insertarLotes(
  conexion: Conexion,
  tabla: string,
  columnas: readonly string[],
  filas: readonly (readonly Valor[])[],
): Promise<void> {
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE);
    const marcas = lote
      .map(() => `(${columnas.map(() => '?').join(', ')})`)
      .join(', ');
    await conexion.query(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${marcas}`,
      lote.flat(),
    );
  }
}

async function contar(
  conexion: Conexion,
  sql: string,
  valores: unknown[],
): Promise<number> {
  const [filas] = await conexion.query<FilaConteo[]>(sql, valores);
  return Number(filas[0]?.n ?? 0);
}

/** Igualdad de un valor leído de la base con el que se va a escribir. */
function mismoValor(guardado: unknown, nuevo: Valor): boolean {
  if (guardado === null || guardado === undefined) return nuevo === null;
  if (nuevo === null) return false;
  if (typeof nuevo === 'number') return Number(guardado) === nuevo;
  return String(guardado) === nuevo;
}

interface Existente {
  id: number;
  fila: Record<string, unknown>;
}

/**
 * Sincroniza las filas de una tabla por clave: inserta las nuevas (en
 * lotes), actualiza las que cambiaron y devuelve las claves que sobran
 * (para borrarlas después, cuando ya nada las referencia).
 */
async function sincronizar(
  conexion: Conexion,
  opciones: {
    tabla: string;
    columnas: readonly string[];
    existentes: Map<string, Existente>;
    filas: readonly { clave: string; valores: readonly Valor[] }[];
  },
): Promise<{ nuevas: number; actualizadas: number; sobrantes: Existente[] }> {
  const { tabla, columnas, existentes, filas } = opciones;
  const nuevas: (readonly Valor[])[] = [];
  let actualizadas = 0;
  const vistas = new Set<string>();
  for (const { clave, valores } of filas) {
    vistas.add(clave);
    const existente = existentes.get(clave);
    if (!existente) {
      nuevas.push(valores);
      continue;
    }
    const cambiadas = columnas.filter(
      (columna, i) => !mismoValor(existente.fila[columna], valores[i]),
    );
    if (cambiadas.length === 0) continue;
    await conexion.query(
      `UPDATE ${tabla} SET ${cambiadas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cambiadas.map((c) => valores[columnas.indexOf(c)]), existente.id],
    );
    actualizadas++;
  }
  await insertarLotes(conexion, tabla, columnas, nuevas);
  const sobrantes = [...existentes.entries()]
    .filter(([clave]) => !vistas.has(clave))
    .map(([, existente]) => existente);
  return { nuevas: nuevas.length, actualizadas, sobrantes };
}

async function leerExistentes(
  conexion: Conexion,
  sql: string,
  valores: unknown[],
  clave: (fila: Record<string, unknown>) => string,
): Promise<Map<string, Existente>> {
  const [filas] = await conexion.query<RowDataPacket[]>(sql, valores);
  return new Map(
    filas.map((fila) => [clave(fila), { id: Number(fila.id), fila }]),
  );
}

async function borrarIds(
  conexion: Conexion,
  sql: string,
  ids: readonly number[],
): Promise<void> {
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    await conexion.query(sql, [ids.slice(i, i + TAMANO_LOTE)]);
  }
}

const COLUMNAS_PROCESO = [
  'vigencia_id',
  'dependencia_id',
  'clave',
  'codigo',
  'nombre',
  'hoja',
  'tipo',
  'codigo_proyecto',
  'programa',
  'linea_plan_desarrollo',
  'dimension_plan_estrategico',
  'objetivo',
  'orden',
  'extras',
] as const;

const COLUMNAS_INDICADOR = [
  'vigencia_id',
  'proceso_id',
  'accion_id',
  'codigo',
  'orden',
  'nombre',
  'tipo_meta',
  'meta_1',
  'meta_2',
  'meta_3',
  'meta_4',
  'meta_5',
  'meta_6',
  'meta_total',
  'regla_meta_total',
  'divisor_meta_total',
  'regla_avance_total',
  'divisor_avance_total',
  'tope_100',
  'tope_por_bimestre',
  'productos',
  'rol_responsable',
  'responsable',
  'corresponsables',
  'extras',
] as const;

const COLUMNAS_TEXTO_REPORTE = [
  'avance',
  'logros',
  'observaciones',
  'riesgo_materializado',
  'numeral_riesgo',
  'descripcion_riesgo',
  'fuentes_verificacion',
] as const;

function valoresReporte(reporte: FilaReporte | null): Valor[] {
  return reporte
    ? [
        reporte.avance,
        reporte.logros,
        reporte.observaciones,
        reporte.riesgo_materializado,
        reporte.numeral_riesgo,
        reporte.descripcion_riesgo,
        reporte.fuentes_verificacion,
      ]
    : COLUMNAS_TEXTO_REPORTE.map(() => null);
}

export async function guardarFichas(
  bd: BaseDatosRepositorio,
  archivo: ArchivoFichasPai,
  opciones: OpcionesCargaFichas,
): Promise<ResultadoCargaFichas> {
  const filas = aFilasFichas(archivo);
  return bd.transaccion((conexion) => cargar(conexion, filas, opciones), {
    reintentos: 0,
  });
}

/** La carga dentro de la transacción de guardarFichas. */
async function cargar(
  conexion: Conexion,
  filas: FilasFichasPai,
  opciones: OpcionesCargaFichas,
): Promise<ResultadoCargaFichas> {
  const avisos: string[] = [];
  const anio = filas.vigencia.anio;

  // ── Vigencia ─────────────────────────────────────────────────────────────
  const [vigentes] = await conexion.query<
    (FilaId & { extras: string | null })[]
  >('SELECT id, extras FROM pai_vigencias WHERE anio = ? FOR UPDATE', [anio]);
  let vigenciaId: number;
  const vigenciaNueva = vigentes.length === 0;
  if (vigenciaNueva) {
    const [resultado] = await conexion.query<ResultadoEscritura>(
      'INSERT INTO pai_vigencias (anio, bimestre_abierto, extras) VALUES (?, ?, ?)',
      [anio, opciones.bimestreAbierto ?? null, filas.vigencia.extras],
    );
    vigenciaId = Number(resultado.insertId);
  } else {
    vigenciaId = Number(vigentes[0].id);
    await verificarDatosDelAplicativo(
      conexion,
      vigenciaId,
      anio,
      opciones.forzar,
    );
    await verificarRenumeracion(
      conexion,
      vigenciaId,
      filas,
      opciones.aceptarRenumeracion ?? false,
      avisos,
    );
    if (vigentes[0].extras !== filas.vigencia.extras) {
      await conexion.query('UPDATE pai_vigencias SET extras = ? WHERE id = ?', [
        filas.vigencia.extras,
        vigenciaId,
      ]);
    }
    if (opciones.bimestreAbierto !== undefined) {
      // Lo cambia la CLI, no un usuario del aplicativo: actualizado_por queda vacío.
      await conexion.query(
        'UPDATE pai_vigencias SET bimestre_abierto = ?, abierto_hasta = NULL, actualizado_por = NULL WHERE id = ?',
        [opciones.bimestreAbierto, vigenciaId],
      );
    }
  }

  // ── Dependencias ─────────────────────────────────────────────────────────
  const dependencias = await sincronizar(conexion, {
    tabla: 'pai_dependencias',
    columnas: ['vigencia_id', 'sigla', 'nombre', 'orden'],
    existentes: await leerExistentes(
      conexion,
      'SELECT id, vigencia_id, sigla, nombre, orden FROM pai_dependencias WHERE vigencia_id = ?',
      [vigenciaId],
      (f) => String(f.sigla),
    ),
    filas: filas.dependencias.map((d) => ({
      clave: d.sigla,
      valores: [vigenciaId, d.sigla, d.nombre, d.orden],
    })),
  });
  const idDependencia = await mapaIds(
    conexion,
    'SELECT id, sigla AS clave FROM pai_dependencias WHERE vigencia_id = ?',
    [vigenciaId],
  );

  // ── Procesos ─────────────────────────────────────────────────────────────
  const procesosExistentes = await leerExistentes(
    conexion,
    `SELECT id, ${COLUMNAS_PROCESO.join(', ')} FROM pai_procesos WHERE vigencia_id = ?`,
    [vigenciaId],
    (f) => String(f.clave),
  );
  await prepararProcesos(conexion, procesosExistentes, filas, avisos);
  const procesos = await sincronizar(conexion, {
    tabla: 'pai_procesos',
    columnas: COLUMNAS_PROCESO,
    existentes: procesosExistentes,
    filas: filas.procesos.map((p) => ({
      clave: p.clave,
      valores: [
        vigenciaId,
        idDependencia.get(p.dependencia) ?? null,
        p.clave,
        p.codigo,
        p.nombre,
        p.hoja,
        p.tipo,
        p.codigo_proyecto,
        p.programa,
        p.linea_plan_desarrollo,
        p.dimension_plan_estrategico,
        p.objetivo,
        p.orden,
        p.extras,
      ],
    })),
  });
  const idProceso = await mapaIds(
    conexion,
    'SELECT id, clave FROM pai_procesos WHERE vigencia_id = ?',
    [vigenciaId],
  );

  // ── Riesgos (por proceso y orden: conservan su id, que usan los enlaces
  // ?riesgo= del tablero y la exportación) ────────────────────────────────
  const riesgos = await sincronizar(conexion, {
    tabla: 'pai_riesgos',
    columnas: [
      'proceso_id',
      'orden',
      'numeral',
      'texto',
      'descripcion',
      'corrupcion',
      'bloque',
    ],
    existentes: await leerExistentes(
      conexion,
      'SELECT r.id, r.proceso_id, r.orden, r.numeral, r.texto, r.descripcion, r.corrupcion, r.bloque ' +
        'FROM pai_riesgos r JOIN pai_procesos p ON p.id = r.proceso_id WHERE p.vigencia_id = ?',
      [vigenciaId],
      (f) => `${Number(f.proceso_id)}#${Number(f.orden)}`,
    ),
    filas: filas.riesgos.map((r) => {
      const procesoId = idProceso.get(r.proceso) ?? null;
      return {
        clave: `${procesoId}#${r.orden}`,
        valores: [
          procesoId,
          r.orden,
          r.numeral,
          r.texto,
          r.descripcion,
          r.corrupcion,
          r.bloque,
        ],
      };
    }),
  });
  // Borrarlos quita también sus vínculos con las acciones (ON DELETE CASCADE).
  await borrarIds(
    conexion,
    'DELETE FROM pai_riesgos WHERE id IN (?)',
    riesgos.sobrantes.map((r) => r.id),
  );
  const idRiesgo = await mapaIds(
    conexion,
    'SELECT r.id, p.clave, r.orden FROM pai_riesgos r JOIN pai_procesos p ON p.id = r.proceso_id WHERE p.vigencia_id = ?',
    [vigenciaId],
    (f) => `${String(f.clave)}#${Number(f.orden)}`,
  );

  // ── Acciones ─────────────────────────────────────────────────────────────
  const acciones = await sincronizar(conexion, {
    tabla: 'pai_acciones',
    columnas: ['proceso_id', 'orden', 'descripcion'],
    existentes: await leerExistentes(
      conexion,
      'SELECT a.id, a.proceso_id, a.orden, a.descripcion FROM pai_acciones a JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?',
      [vigenciaId],
      (f) => `${Number(f.proceso_id)}#${Number(f.orden)}`,
    ),
    filas: filas.acciones.map((a) => {
      const procesoId = idProceso.get(a.proceso) ?? null;
      return {
        clave: `${procesoId}#${a.orden}`,
        valores: [procesoId, a.orden, a.descripcion],
      };
    }),
  });
  const idAccion = await mapaIds(
    conexion,
    'SELECT a.id, p.clave, a.orden FROM pai_acciones a JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?',
    [vigenciaId],
    (f) => `${String(f.clave)}#${Number(f.orden)}`,
  );
  await reemplazarAccionRiesgos(
    conexion,
    vigenciaId,
    filas.accionRiesgos.map((ar) => [
      idAccion.get(`${ar.proceso}#${ar.accion}`) ?? null,
      idRiesgo.get(`${ar.proceso}#${ar.riesgo}`) ?? null,
      ar.orden,
    ]),
  );

  // ── Indicadores ──────────────────────────────────────────────────────────
  const indicadores = await sincronizar(conexion, {
    tabla: 'pai_indicadores',
    columnas: COLUMNAS_INDICADOR,
    existentes: await leerExistentes(
      conexion,
      `SELECT id, ${COLUMNAS_INDICADOR.join(', ')} FROM pai_indicadores WHERE vigencia_id = ?`,
      [vigenciaId],
      (f) => String(f.codigo).toUpperCase(),
    ),
    filas: filas.indicadores.map((i) => ({
      clave: i.codigo.toUpperCase(),
      valores: [
        vigenciaId,
        idProceso.get(i.proceso) ?? null,
        idAccion.get(`${i.proceso}#${i.accion}`) ?? null,
        i.codigo,
        i.orden,
        i.nombre,
        i.tipo_meta,
        ...i.metas,
        i.meta_total,
        i.regla_meta_total,
        i.divisor_meta_total,
        i.regla_avance_total,
        i.divisor_avance_total,
        i.tope_100,
        i.tope_por_bimestre,
        i.productos,
        i.rol_responsable,
        i.responsable,
        i.corresponsables,
        i.extras,
      ],
    })),
  });

  // ── Lo que ya no está: indicadores, acciones, procesos, dependencias ────
  const reportesPerdidos: string[] = [];
  const idsIndicadoresBorrados = indicadores.sobrantes.map((s) => s.id);
  const codigosBorrados = indicadores.sobrantes.map((s) =>
    String(s.fila.codigo),
  );
  let evidenciasBorradas = 0;
  if (idsIndicadoresBorrados.length > 0) {
    const perdidos = await datosAplicativoDe(conexion, idsIndicadoresBorrados);
    const conDatos: string[] = [];
    const total: DatosAplicativoIndicador = {
      reportes: 0,
      evidencias: 0,
      asignaciones: 0,
      autorizaciones: 0,
    };
    for (const sobrante of indicadores.sobrantes) {
      const datos = perdidos.get(sobrante.id);
      if (!datos || !tieneDatos(datos)) continue;
      const codigo = String(sobrante.fila.codigo);
      if (datos.reportes > 0) reportesPerdidos.push(codigo);
      conDatos.push(`${codigo} (${describirDatos(datos)})`);
      total.reportes += datos.reportes;
      total.evidencias += datos.evidencias;
      total.asignaciones += datos.asignaciones;
      total.autorizaciones += datos.autorizaciones;
    }
    reportesPerdidos.sort();
    evidenciasBorradas = total.evidencias;
    await borrarIds(
      conexion,
      'DELETE FROM pai_autorizaciones WHERE indicador_id IN (?)',
      idsIndicadoresBorrados,
    );
    await borrarIds(
      conexion,
      'DELETE FROM pai_asignaciones WHERE indicador_id IN (?)',
      idsIndicadoresBorrados,
    );
    // Las evidencias se borran en cascada con su reporte (sus archivos quedan para el recolector).
    await borrarIds(
      conexion,
      'DELETE FROM pai_reportes WHERE indicador_id IN (?)',
      idsIndicadoresBorrados,
    );
    await borrarIds(
      conexion,
      'DELETE FROM pai_indicadores WHERE id IN (?)',
      idsIndicadoresBorrados,
    );
    avisos.push(
      `Se ${idsIndicadoresBorrados.length === 1 ? 'borró' : 'borraron'} ${cantidad(idsIndicadoresBorrados.length, 'indicador que ya no está', 'indicadores que ya no están')} en el archivo: ` +
        lista(codigosBorrados),
    );
    if (conDatos.length > 0) {
      avisos.push(
        `Datos del aplicativo que se perdieron con esos indicadores: ${describirDatos(total)} (${lista(conDatos)}).`,
      );
    }
  }
  await borrarIds(
    conexion,
    'DELETE FROM pai_acciones WHERE id IN (?)',
    acciones.sobrantes.map((s) => s.id),
  );
  const idsProcesosBorrados = procesos.sobrantes.map((s) => s.id);
  if (idsProcesosBorrados.length > 0) {
    const asignacionesProceso = await contarPorId(
      conexion,
      'SELECT proceso_id AS id, COUNT(*) AS n FROM pai_asignaciones WHERE proceso_id IN (?) GROUP BY proceso_id',
      idsProcesosBorrados,
    );
    const autorizacionesProceso = await contarPorId(
      conexion,
      'SELECT proceso_id AS id, COUNT(*) AS n FROM pai_autorizaciones WHERE proceso_id IN (?) GROUP BY proceso_id',
      idsProcesosBorrados,
    );
    const asignacionesPerdidas = sumar(asignacionesProceso);
    const autorizacionesPerdidas = sumar(autorizacionesProceso);
    if (asignacionesPerdidas + autorizacionesPerdidas > 0) {
      avisos.push(
        `Datos que se perdieron con los procesos que ya no están: ${cantidad(asignacionesPerdidas, 'asignación de proceso', 'asignaciones de proceso')} y ${cantidad(autorizacionesPerdidas, 'autorización de proceso', 'autorizaciones de proceso')}.`,
      );
    }
    await borrarIds(
      conexion,
      'DELETE FROM pai_autorizaciones WHERE proceso_id IN (?)',
      idsProcesosBorrados,
    );
    await borrarIds(
      conexion,
      'DELETE FROM pai_asignaciones WHERE proceso_id IN (?)',
      idsProcesosBorrados,
    );
    await borrarIds(
      conexion,
      'DELETE FROM pai_procesos WHERE id IN (?)',
      idsProcesosBorrados,
    );
    avisos.push(
      `Se ${idsProcesosBorrados.length === 1 ? 'borró' : 'borraron'} ${cantidad(idsProcesosBorrados.length, 'proceso que ya no está', 'procesos que ya no están')} en el archivo (con sus asignaciones y autorizaciones): ` +
        lista(procesos.sobrantes.map((s) => String(s.fila.clave))),
    );
  }
  await borrarIds(
    conexion,
    'DELETE FROM pai_dependencias WHERE id IN (?)',
    dependencias.sobrantes.map((s) => s.id),
  );

  // ── Reportes importados ──────────────────────────────────────────────────
  const idIndicador = await mapaIds(
    conexion,
    'SELECT id, codigo FROM pai_indicadores WHERE vigencia_id = ?',
    [vigenciaId],
    (f) => String(f.codigo).toUpperCase(),
  );
  const [existentes] = await conexion.query<RowDataPacket[]>(
    `SELECT r.id, r.indicador_id, r.bimestre, r.origen, ${COLUMNAS_TEXTO_REPORTE.map((c) => `r.${c}`).join(', ')}, ` +
      '(SELECT COUNT(*) FROM pai_evidencias e WHERE e.reporte_id = r.id) AS evidencias ' +
      'FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ?',
    [vigenciaId],
  );
  const reporteExistente = new Map(
    existentes.map((fila) => [
      `${Number(fila.indicador_id)}#${Number(fila.bimestre)}`,
      fila,
    ]),
  );
  const nuevos: Valor[][] = [];
  const vistos = new Set<string>();
  /** "SAF-TH-03 (Bimestre 4)" de los reportes del archivo que tapa uno del aplicativo. */
  const tapados: string[] = [];
  let aplicativosVacios = 0;
  const sinTextos = COLUMNAS_TEXTO_REPORTE.map((c) => `${c} IS NULL`).join(
    ' AND ',
  );
  for (const reporte of filas.reportes) {
    const indicadorId = idIndicador.get(reporte.codigo.toUpperCase());
    if (indicadorId === undefined) continue;
    const clave = `${indicadorId}#${reporte.bimestre}`;
    vistos.add(clave);
    const existente = reporteExistente.get(clave);
    const valores = valoresReporte(reporte);
    const nombre = `${reporte.codigo} (Bimestre ${reporte.bimestre})`;
    if (!existente) {
      nuevos.push([indicadorId, reporte.bimestre, ...valores, 'importado']);
      continue;
    }
    if (existente.origen === 'aplicativo') {
      const vacio = COLUMNAS_TEXTO_REPORTE.every(
        (columna) =>
          existente[columna] === null || existente[columna] === undefined,
      );
      if (!vacio) {
        tapados.push(nombre);
        continue;
      }
      // El archivo tampoco trae nada para ese bimestre: no hay qué cargar.
      if (valores.every((v) => v === null)) continue;
      // Reporte del aplicativo vacío (creado solo para guardar evidencias):
      // recibe los valores del JSON y conserva sus evidencias. La condición
      // repite "sigue vacío": si alguien lo llenó mientras tanto, gana él.
      const [resultado] = await conexion.query<ResultadoEscritura>(
        `UPDATE pai_reportes SET ${COLUMNAS_TEXTO_REPORTE.map((c) => `${c} = ?`).join(', ')}, origen = 'importado', actualizado_por = NULL ` +
          `WHERE id = ? AND origen = 'aplicativo' AND ${sinTextos}`,
        [...valores, Number(existente.id)],
      );
      if (Number(resultado.affectedRows) === 0) tapados.push(nombre);
      else aplicativosVacios++;
      continue;
    }
    const cambiadas = COLUMNAS_TEXTO_REPORTE.filter(
      (columna, i) => !mismoValor(existente[columna], valores[i]),
    );
    if (cambiadas.length > 0) {
      // Solo si sigue siendo importado: si un responsable lo guardó mientras
      // corría la carga (pasó a 'aplicativo'), se conserva lo suyo.
      const [resultado] = await conexion.query<ResultadoEscritura>(
        `UPDATE pai_reportes SET ${cambiadas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND origen = 'importado'`,
        [
          ...cambiadas.map((c) => valores[COLUMNAS_TEXTO_REPORTE.indexOf(c)]),
          Number(existente.id),
        ],
      );
      if (Number(resultado.affectedRows) === 0) tapados.push(nombre);
    }
  }
  try {
    await insertarLotes(
      conexion,
      'pai_reportes',
      ['indicador_id', 'bimestre', ...COLUMNAS_TEXTO_REPORTE, 'origen'],
      nuevos,
    );
  } catch (error) {
    if (esDuplicado(error)) {
      throw new ErrorCargaFichas(
        'Mientras corría la carga alguien guardó un reporte o subió una evidencia en un bimestre que el archivo trae. ' +
          'No se cargó nada: cierre el bimestre (o espere a que terminen de reportar) y vuelva a ejecutar la carga.',
      );
    }
    throw error;
  }
  // Importados que el JSON ya no trae: se borran (o se vacían si tienen evidencias).
  const sobrantes = existentes.filter(
    (fila) =>
      fila.origen === 'importado' &&
      !vistos.has(`${Number(fila.indicador_id)}#${Number(fila.bimestre)}`),
  );
  const sinEvidencias = sobrantes.filter((f) => Number(f.evidencias) === 0);
  const conEvidencias = sobrantes.filter((f) => Number(f.evidencias) > 0);
  await borrarIds(
    conexion,
    'DELETE FROM pai_reportes WHERE id IN (?)',
    sinEvidencias.map((f) => Number(f.id)),
  );
  for (const fila of conEvidencias) {
    await conexion.query(
      `UPDATE pai_reportes SET ${COLUMNAS_TEXTO_REPORTE.map((c) => `${c} = NULL`).join(', ')} WHERE id = ? AND origen = 'importado'`,
      [Number(fila.id)],
    );
  }
  if (conEvidencias.length > 0) {
    avisos.push(
      `${cantidad(conEvidencias.length, 'reporte importado', 'reportes importados')} que el archivo ya no trae ${conEvidencias.length === 1 ? 'tiene' : 'tienen'} evidencias: se ${conEvidencias.length === 1 ? 'vació' : 'vaciaron'} sin borrar sus evidencias.`,
    );
  }
  if (tapados.length > 0) {
    avisos.push(
      `${cantidad(tapados.length, 'reporte del archivo no se cargó', 'reportes del archivo no se cargaron')} porque ese bimestre ya tiene un reporte del aplicativo con datos (se conserva el del aplicativo): ${lista(tapados)}.`,
    );
  }
  if (aplicativosVacios > 0) {
    avisos.push(
      `${cantidad(aplicativosVacios, 'reporte del aplicativo sin datos (solo con evidencias) recibió', 'reportes del aplicativo sin datos (solo con evidencias) recibieron')} los valores del archivo y ${aplicativosVacios === 1 ? 'quedó' : 'quedaron'} como importado${aplicativosVacios === 1 ? '' : 's'}, con sus evidencias.`,
    );
  }
  const reportesConservados = await contar(
    conexion,
    "SELECT COUNT(*) AS n FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ? AND r.origen = 'aplicativo'",
    [vigenciaId],
  );
  const reportesImportados = await contar(
    conexion,
    "SELECT COUNT(*) AS n FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ? AND r.origen = 'importado'",
    [vigenciaId],
  );

  const resultado: ResultadoCargaFichas = {
    vigencia: anio,
    vigenciaNueva,
    dependencias: filas.dependencias.length,
    procesos: filas.procesos.length,
    acciones: filas.acciones.length,
    indicadores: filas.indicadores.length,
    indicadoresNuevos: indicadores.nuevas,
    indicadoresActualizados: indicadores.actualizadas,
    indicadoresBorrados: idsIndicadoresBorrados.length,
    reportesImportados,
    reportesConservados,
    reportesPerdidos,
    evidenciasBorradas,
    avisos,
  };
  // En el registro quedan los avisos completos y lo que se borró (antes
  // solo salían por la consola de quien ejecutó la CLI).
  await registrarEnPai(conexion, {
    accion: 'cargar_fichas',
    detalle: {
      ...resultado,
      indicadoresBorradosCodigos: codigosBorrados,
      procesosBorrados: procesos.sobrantes.map((s) => String(s.fila.clave)),
      reportesTapados: tapados,
      forzar: opciones.forzar,
      aceptarRenumeracion: opciones.aceptarRenumeracion ?? false,
      bimestreAbierto: opciones.bimestreAbierto,
    },
  });
  return resultado;
}

/**
 * Códigos de indicador que ya existen y cambian de nombre: si alguno tiene
 * datos del aplicativo, la carga se niega (ErrorCargaFichas) salvo con
 * `aceptar`, y entonces queda un aviso con la lista. El código es el
 * consecutivo de la hoja (nota 8): un nombre distinto casi siempre significa
 * que los códigos se corrieron y esos datos quedarían en otro indicador.
 */
async function verificarRenumeracion(
  conexion: Conexion,
  vigenciaId: number,
  filas: FilasFichasPai,
  aceptar: boolean,
  avisos: string[],
): Promise<void> {
  const [actuales] = await conexion.query<
    (RowDataPacket & { id: number; codigo: string; nombre: string })[]
  >('SELECT id, codigo, nombre FROM pai_indicadores WHERE vigencia_id = ?', [
    vigenciaId,
  ]);
  const porCodigo = new Map(
    actuales.map((fila) => [String(fila.codigo).toUpperCase(), fila]),
  );
  const cambios: {
    id: number;
    codigo: string;
    antes: string;
    despues: string;
  }[] = [];
  for (const indicador of filas.indicadores) {
    const actual = porCodigo.get(indicador.codigo.toUpperCase());
    if (!actual) continue;
    if (
      claveNormalizada(String(actual.nombre)) ===
      claveNormalizada(indicador.nombre)
    ) {
      continue;
    }
    cambios.push({
      id: Number(actual.id),
      codigo: indicador.codigo,
      antes: String(actual.nombre),
      despues: indicador.nombre,
    });
  }
  if (cambios.length === 0) return;
  const datos = await datosAplicativoDe(
    conexion,
    cambios.map((c) => c.id),
  );
  const afectados = cambios
    .filter((c) => tieneDatos(datos.get(c.id)))
    .map(
      (c) =>
        `${c.codigo}: «${c.antes.slice(0, 120)}» → «${c.despues.slice(0, 120)}» (${describirDatos(datos.get(c.id) as DatosAplicativoIndicador)})`,
    );
  if (afectados.length === 0) return;
  if (!aceptar) {
    throw new ErrorCargaFichas(
      `${cantidad(afectados.length, 'indicador con datos del aplicativo cambia', 'indicadores con datos del aplicativo cambian')} de nombre con el mismo código ` +
        '(probablemente los códigos se corrieron porque se agregó o quitó una fila en la hoja): ' +
        `${lista(afectados)}. No se cargó nada: esos datos quedarían en otro indicador. ` +
        'Revise el archivo; si los nombres solo se corrigieron, vuelva a cargar con --aceptar-renumeracion.',
    );
  }
  avisos.push(
    `Con --aceptar-renumeracion, ${cantidad(afectados.length, 'indicador cambió', 'indicadores cambiaron')} de nombre y conserva${afectados.length === 1 ? '' : 'n'} los datos del aplicativo de su código: ${lista(afectados)}.`,
  );
}

/**
 * Antes de sincronizar los procesos:
 * - una clave nueva cuyo código ya tiene un proceso existente que el archivo
 *   no trae (p. ej., se renombró la hoja) es un renombre: la fila conserva
 *   su id (asignaciones, autorizaciones, indicadores) y se le cambia la
 *   clave;
 * - los códigos que cambian de dueño (intercambios) o de procesos que se
 *   van se liberan con un valor temporal, para que las escrituras no choquen
 *   con el UNIQUE (vigencia, código).
 * `existentes` (por clave) queda al día.
 */
async function prepararProcesos(
  conexion: Conexion,
  existentes: Map<string, Existente>,
  filas: FilasFichasPai,
  avisos: string[],
): Promise<void> {
  const clavesArchivo = new Set(filas.procesos.map((p) => p.clave));
  const porCodigo = new Map(
    [...existentes.values()].map((e) => [
      String(e.fila.codigo).toUpperCase(),
      e,
    ]),
  );
  const renombrados: string[] = [];
  for (const proceso of filas.procesos) {
    if (existentes.has(proceso.clave)) continue;
    const mismoCodigo = porCodigo.get(proceso.codigo.toUpperCase());
    if (!mismoCodigo) continue;
    const claveVieja = String(mismoCodigo.fila.clave);
    // Si la clave vieja sigue en el archivo no es un renombre (se liberan
    // los códigos abajo y cada clave conserva su fila).
    if (clavesArchivo.has(claveVieja)) continue;
    await conexion.query('UPDATE pai_procesos SET clave = ? WHERE id = ?', [
      proceso.clave,
      mismoCodigo.id,
    ]);
    existentes.delete(claveVieja);
    mismoCodigo.fila.clave = proceso.clave;
    existentes.set(proceso.clave, mismoCodigo);
    renombrados.push(`${claveVieja} → ${proceso.clave} (${proceso.codigo})`);
  }
  if (renombrados.length > 0) {
    avisos.push(
      `${cantidad(renombrados.length, 'proceso cambió', 'procesos cambiaron')} de clave con el mismo código y ${renombrados.length === 1 ? 'conserva' : 'conservan'} sus asignaciones y autorizaciones: ${lista(renombrados)}.`,
    );
  }
  const codigoNuevo = new Map(filas.procesos.map((p) => [p.clave, p.codigo]));
  for (const [clave, existente] of existentes) {
    const nuevo = codigoNuevo.get(clave);
    if (
      nuevo !== undefined &&
      nuevo.toUpperCase() === String(existente.fila.codigo).toUpperCase()
    ) {
      continue;
    }
    const temporal = `~${existente.id}`;
    await conexion.query('UPDATE pai_procesos SET codigo = ? WHERE id = ?', [
      temporal,
      existente.id,
    ]);
    existente.fila.codigo = temporal;
  }
}

/**
 * Vínculos acción-riesgo de la vigencia: se reemplazan solo si cambiaron
 * (no tienen id propio; las acciones y los riesgos conservan los suyos).
 */
async function reemplazarAccionRiesgos(
  conexion: Conexion,
  vigenciaId: number,
  nuevos: readonly (readonly Valor[])[],
): Promise<void> {
  const [actuales] = await conexion.query<RowDataPacket[]>(
    'SELECT ar.accion_id, ar.riesgo_id, ar.orden FROM pai_accion_riesgos ar JOIN pai_acciones a ON a.id = ar.accion_id ' +
      'JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?',
    [vigenciaId],
  );
  if (
    firma(actuales.map((f) => [f.accion_id, f.riesgo_id, f.orden])) ===
    firma(nuevos)
  ) {
    return;
  }
  await conexion.query(
    'DELETE FROM pai_accion_riesgos WHERE accion_id IN (SELECT a.id FROM pai_acciones a JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ?)',
    [vigenciaId],
  );
  await insertarLotes(
    conexion,
    'pai_accion_riesgos',
    ['accion_id', 'riesgo_id', 'orden'],
    nuevos,
  );
}

/** clave -> id (por defecto la columna `clave` del SELECT). */
async function mapaIds(
  conexion: Conexion,
  sql: string,
  valores: unknown[],
  clave: (fila: Record<string, unknown>) => string = (f) => String(f.clave),
): Promise<Map<string, number>> {
  const [filas] = await conexion.query<RowDataPacket[]>(sql, valores);
  return new Map(filas.map((fila) => [clave(fila), Number(fila.id)]));
}

/** Se niega a cargar si la vigencia tiene datos del aplicativo (salvo `forzar`). */
async function verificarDatosDelAplicativo(
  conexion: Conexion,
  vigenciaId: number,
  anio: number,
  forzar: boolean,
): Promise<void> {
  const reportes = await contar(
    conexion,
    "SELECT COUNT(*) AS n FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ? AND r.origen = 'aplicativo'",
    [vigenciaId],
  );
  const evidencias = await contar(
    conexion,
    'SELECT COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ?',
    [vigenciaId],
  );
  const asignaciones = await contar(
    conexion,
    'SELECT COUNT(*) AS n FROM pai_asignaciones a LEFT JOIN pai_procesos p ON p.id = a.proceso_id ' +
      'LEFT JOIN pai_indicadores i ON i.id = a.indicador_id WHERE p.vigencia_id = ? OR i.vigencia_id = ?',
    [vigenciaId, vigenciaId],
  );
  const autorizaciones = await contar(
    conexion,
    'SELECT COUNT(*) AS n FROM pai_autorizaciones a LEFT JOIN pai_procesos p ON p.id = a.proceso_id ' +
      'LEFT JOIN pai_indicadores i ON i.id = a.indicador_id WHERE p.vigencia_id = ? OR i.vigencia_id = ?',
    [vigenciaId, vigenciaId],
  );
  if (forzar || reportes + evidencias + asignaciones + autorizaciones === 0)
    return;
  const partes = [
    reportes
      ? cantidad(reportes, 'reporte del aplicativo', 'reportes del aplicativo')
      : '',
    evidencias ? cantidad(evidencias, 'evidencia', 'evidencias') : '',
    asignaciones ? cantidad(asignaciones, 'asignación', 'asignaciones') : '',
    autorizaciones
      ? cantidad(autorizaciones, 'autorización', 'autorizaciones')
      : '',
  ].filter(Boolean);
  throw new ErrorCargaFichas(
    `La vigencia ${anio} ya tiene datos del aplicativo (${partes.join(', ')}). ` +
      'No se cargó nada. Para cargar de todos modos use --forzar: se conservan los reportes, evidencias, ' +
      'asignaciones y autorizaciones de los indicadores y procesos que siguen en el archivo, y se avisa de lo que se pierde.',
  );
}
