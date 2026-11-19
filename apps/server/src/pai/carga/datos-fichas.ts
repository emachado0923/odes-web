import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  esCodigoIndicador,
  REGLAS_TOTAL,
  type ReglaTotal,
  type RiesgoMaterializado,
  TIPOS_META,
  TIPOS_PROCESO,
  type TipoMeta,
  type TipoProceso,
} from '../api-pai.js';

/**
 * Lectura del JSON de las fichas (lo genera datos/pai/2026/extraer_pai.py) y
 * su transformación, pura, en filas de las tablas pai_* (aFilasFichas) y de
 * vuelta (deFilasFichas), con la prueba de ida y vuelta en
 * datos-fichas.spec.ts: lo que queda en la base reproduce el JSON exacto.
 * JSON.parse, sin vm.
 *
 * Qué va en columnas y qué en `extras` (texto JSON):
 * - vigencia.extras: todo el nivel superior salvo vigencia, dependencias y
 *   procesos (formato, notas, conflictos, avisos…).
 * - proceso: columnas de la ficha; linea_plan_desarrollo guarda la línea
 *   NORMALIZADA (extras.linea_pdd_normalizada, la que filtra el tablero) y
 *   el texto original queda en extras; el catálogo de riesgos va a
 *   pai_riesgos y extras.codigo_proyecto a la columna codigo_proyecto.
 * - indicador: metas, reglas y topes en columnas; regla_tipo_meta, las
 *   partes de `calculo` que no son columnas (fórmulas de Excel, motivos de
 *   normalización, bimestres tecleados) y, por bimestre, la celda % de Excel
 *   y la fuente alterna del seguimiento, en extras.
 * - seguimiento[b] -> una fila de pai_reportes (origen 'importado') por cada
 *   bimestre que trae el JSON, aunque venga vacía (así vuelve igual).
 */

export type ClaveBimestreJson = '1' | '2' | '3' | '4' | '5' | '6';

export const CLAVES_BIMESTRE_JSON: readonly ClaveBimestreJson[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
];

export type MetasJson = Record<ClaveBimestreJson | 'total', number>;

export interface TotalCalculoJson {
  /** Texto de la fórmula de Excel (referencia). */
  formula: string | null;
  regla: ReglaTotal;
  divisor: number | null;
  regla_excel?: string;
  normalizado?: string;
}

export interface PorcentajeCalculoJson {
  regla: 'con_tope_100' | 'sin_tope' | 'mixto';
  /** null en los mixtos. */
  tope_100: boolean | null;
  bimestres_tecleados: unknown[];
  tope_por_bimestre?: Record<ClaveBimestreJson | 'total', boolean>;
  tope_inferido_en?: string[];
}

export interface CalculoJson {
  meta_total: TotalCalculoJson;
  avance_total: TotalCalculoJson;
  porcentaje: PorcentajeCalculoJson;
}

/** Un bimestre reportado (solo los reportados tienen entrada). */
export interface SeguimientoJson {
  avance: number | null;
  /** Celda % de Excel (fracción); la app recalcula, no confía en ella. */
  porcentaje: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgo_materializado: RiesgoMaterializado | null;
  numeral_riesgo: string | null;
  descripcion_riesgo: string | null;
  fuentes_verificacion: string | null;
  /** Solo si el dato vino de otro archivo. */
  fuente?: unknown;
}

export interface IndicadorJson {
  /** Posición dentro de la acción. */
  orden: number;
  codigo: string;
  nombre: string;
  tipo_meta: TipoMeta;
  regla_tipo_meta: string;
  metas: MetasJson;
  calculo: CalculoJson;
  productos: string | null;
  rol_responsable: string | null;
  responsable: string | null;
  corresponsables: string | null;
  /** consecutivo, fila, excel { avance_total, porcentaje_total }, revisar, notas_planeacion… */
  extras: Record<string, unknown>;
  seguimiento: Partial<Record<ClaveBimestreJson, SeguimientoJson>>;
}

export interface AccionJson {
  orden: number;
  descripcion: string;
  /** Textos de los riesgos del catálogo del proceso (RiesgoJson.texto), en orden. */
  riesgos: string[];
  indicadores: IndicadorJson[];
}

export interface RiesgoJson {
  numeral: number | null;
  texto: string;
  descripcion: string | null;
  /** Riesgo de corrupción "(RC)". */
  rc: boolean;
  bloque: number | null;
}

export interface ProcesoJson {
  clave: string;
  codigo: string;
  /** Sigla de la dependencia. */
  dependencia: string;
  nombre: string;
  hoja: string | null;
  tipo: TipoProceso;
  linea_plan_desarrollo: string | null;
  dimension_plan_estrategico: string | null;
  objetivo: string | null;
  programa: string | null;
  /** riesgos (catálogo), codigo_proyecto, linea_pdd_normalizada, bimestres_reportados… */
  extras: Record<string, unknown> & {
    riesgos: RiesgoJson[];
    codigo_proyecto?: string | null;
    linea_pdd_normalizada?: string | null;
  };
  fuente: unknown;
  acciones: AccionJson[];
}

export interface ArchivoFichasPai {
  vigencia: number;
  formato: string;
  generado_desde: unknown[];
  notas: string[];
  dependencias: { sigla: string; nombre: string }[];
  procesos: ProcesoJson[];
  resumen: unknown;
  conflictos: unknown[];
  no_mapeados: unknown[];
  hojas_no_usadas: unknown[];
  avisos_extractor: string[];
}

// ── Lectura ────────────────────────────────────────────────────────────────

/** Error de forma o de contenido del archivo de fichas (con la lista de problemas). */
export class ErrorDatosFichas extends Error {
  constructor(readonly problemas: string[]) {
    super(
      problemas.length === 1
        ? problemas[0]
        : `${problemas.length} problemas en el archivo de fichas:\n- ${problemas.slice(0, 30).join('\n- ')}`,
    );
    this.name = 'ErrorDatosFichas';
  }
}

const textoONulo = z.union([z.string(), z.null()]);
const numeroNoNegativo = z.number().finite().nonnegative();
const metasJson = z.object({
  1: numeroNoNegativo,
  2: numeroNoNegativo,
  3: numeroNoNegativo,
  4: numeroNoNegativo,
  5: numeroNoNegativo,
  6: numeroNoNegativo,
  total: numeroNoNegativo,
});
const totalJson = z.looseObject({
  formula: textoONulo,
  regla: z.enum(REGLAS_TOTAL),
  divisor: z.union([z.number().int().positive(), z.null()]),
});
const seguimientoJson = z.looseObject({
  avance: z.union([numeroNoNegativo, z.null()]),
  porcentaje: z.union([z.number().finite(), z.null()]),
  logros: textoONulo,
  observaciones: textoONulo,
  riesgo_materializado: z.union([z.enum(['SI', 'NO']), z.null()]),
  numeral_riesgo: textoONulo,
  descripcion_riesgo: textoONulo,
  fuentes_verificacion: textoONulo,
});
const indicadorJson = z.looseObject({
  orden: z.number().int().positive(),
  codigo: z.string(),
  nombre: z.string().min(1),
  tipo_meta: z.enum(TIPOS_META),
  regla_tipo_meta: z.string(),
  metas: metasJson,
  calculo: z.looseObject({
    meta_total: totalJson,
    avance_total: totalJson,
    porcentaje: z.looseObject({
      regla: z.enum(['con_tope_100', 'sin_tope', 'mixto']),
      tope_100: z.union([z.boolean(), z.null()]),
      bimestres_tecleados: z.array(z.unknown()),
      tope_por_bimestre: z
        .object({
          1: z.boolean(),
          2: z.boolean(),
          3: z.boolean(),
          4: z.boolean(),
          5: z.boolean(),
          6: z.boolean(),
          total: z.boolean(),
        })
        .optional(),
    }),
  }),
  productos: textoONulo,
  rol_responsable: textoONulo,
  responsable: textoONulo,
  corresponsables: textoONulo,
  extras: z.record(z.string(), z.unknown()),
  seguimiento: z.partialRecord(
    z.enum(['1', '2', '3', '4', '5', '6']),
    seguimientoJson,
  ),
});
const riesgoJson = z.object({
  numeral: z.union([z.number().int().nonnegative(), z.null()]),
  texto: z.string().min(1),
  descripcion: textoONulo,
  rc: z.boolean(),
  bloque: z.union([z.number().int().nonnegative(), z.null()]),
});
const esquemaArchivo = z.looseObject({
  vigencia: z.number().int().min(2000).max(2100),
  formato: z.string(),
  generado_desde: z.array(z.unknown()),
  notas: z.array(z.string()),
  dependencias: z
    .array(z.object({ sigla: z.string().min(1), nombre: z.string().min(1) }))
    .min(1),
  procesos: z
    .array(
      z.looseObject({
        clave: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        codigo: z.string().min(1),
        dependencia: z.string().min(1),
        nombre: z.string().min(1),
        hoja: textoONulo,
        tipo: z.enum(TIPOS_PROCESO),
        linea_plan_desarrollo: textoONulo,
        dimension_plan_estrategico: textoONulo,
        objetivo: textoONulo,
        programa: textoONulo,
        extras: z.looseObject({
          riesgos: z.array(riesgoJson),
          codigo_proyecto: textoONulo.optional(),
          linea_pdd_normalizada: textoONulo.optional(),
        }),
        acciones: z.array(
          z.looseObject({
            orden: z.number().int().positive(),
            descripcion: z.string().min(1),
            riesgos: z.array(z.string()),
            indicadores: z.array(indicadorJson).min(1),
          }),
        ),
      }),
    )
    .min(1),
  resumen: z.unknown(),
  conflictos: z.array(z.unknown()),
  no_mapeados: z.array(z.unknown()),
  hojas_no_usadas: z.array(z.unknown()),
  avisos_extractor: z.array(z.string()),
});

/**
 * Comprueba la forma del JSON (tipos y campos obligatorios) y lo devuelve
 * tal cual (sin quitar ni cambiar nada: la carga y la ida y vuelta usan el
 * objeto original).
 */
export function validarFormaFichas(datos: unknown): ArchivoFichasPai {
  const resultado = esquemaArchivo.safeParse(datos);
  if (!resultado.success) {
    throw new ErrorDatosFichas(
      resultado.error.issues
        .slice(0, 30)
        .map(
          (problema) =>
            `${problema.path.join('.') || '(raíz)'}: ${problema.message}`,
        ),
    );
  }
  return datos as ArchivoFichasPai;
}

/** Lee y valida (forma mínima) el JSON de las fichas. */
export async function leerArchivoFichas(
  ruta: string,
): Promise<ArchivoFichasPai> {
  const texto = await readFile(ruta, 'utf8');
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (error) {
    throw new ErrorDatosFichas([
      `El archivo no es JSON válido: ${(error as Error).message}`,
    ]);
  }
  return validarFormaFichas(datos);
}

// ── Filas ──────────────────────────────────────────────────────────────────

export interface FilaDependencia {
  sigla: string;
  nombre: string;
  orden: number;
}

export interface FilaProceso {
  clave: string;
  codigo: string;
  /** Sigla de la dependencia. */
  dependencia: string;
  nombre: string;
  hoja: string | null;
  tipo: TipoProceso;
  codigo_proyecto: string | null;
  programa: string | null;
  /** La línea normalizada (extras.linea_pdd_normalizada). */
  linea_plan_desarrollo: string | null;
  dimension_plan_estrategico: string | null;
  objetivo: string | null;
  orden: number;
  extras: string;
}

export interface FilaRiesgo {
  /** Clave del proceso. */
  proceso: string;
  orden: number;
  numeral: number | null;
  texto: string;
  descripcion: string | null;
  corrupcion: 0 | 1;
  bloque: number | null;
}

export interface FilaAccion {
  proceso: string;
  orden: number;
  descripcion: string;
}

export interface FilaAccionRiesgo {
  proceso: string;
  /** Orden de la acción en el proceso. */
  accion: number;
  /** Orden del riesgo en el catálogo del proceso. */
  riesgo: number;
  orden: number;
}

export interface FilaIndicador {
  codigo: string;
  proceso: string;
  /** Orden de la acción en el proceso. */
  accion: number;
  orden: number;
  nombre: string;
  tipo_meta: TipoMeta;
  metas: [number, number, number, number, number, number];
  meta_total: number;
  regla_meta_total: ReglaTotal;
  divisor_meta_total: number | null;
  regla_avance_total: ReglaTotal;
  divisor_avance_total: number | null;
  tope_100: 0 | 1 | null;
  tope_por_bimestre: string | null;
  productos: string | null;
  rol_responsable: string | null;
  responsable: string | null;
  corresponsables: string | null;
  extras: string;
}

export interface FilaReporte {
  /** Código del indicador. */
  codigo: string;
  bimestre: 1 | 2 | 3 | 4 | 5 | 6;
  avance: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgo_materializado: RiesgoMaterializado | null;
  numeral_riesgo: string | null;
  descripcion_riesgo: string | null;
  fuentes_verificacion: string | null;
}

export interface FilasFichasPai {
  vigencia: { anio: number; extras: string };
  dependencias: FilaDependencia[];
  procesos: FilaProceso[];
  riesgos: FilaRiesgo[];
  acciones: FilaAccion[];
  accionRiesgos: FilaAccionRiesgo[];
  indicadores: FilaIndicador[];
  reportes: FilaReporte[];
}

/** Largos máximos de las columnas (migración 003). */
const LARGOS = {
  sigla: 20,
  nombreDependencia: 200,
  clave: 60,
  codigoProceso: 20,
  nombreProceso: 300,
  hoja: 100,
  codigoProyecto: 20,
  programa: 400,
  linea: 400,
  dimension: 400,
  codigoIndicador: 20,
  nombreIndicador: 600,
  numeralRiesgo: 200,
} as const;

/** Lo que va en pai_procesos.extras. */
interface ExtrasProcesoBd {
  /** Texto original de la línea (la columna guarda la normalizada). */
  linea_plan_desarrollo: string | null;
  /** extras del JSON sin riesgos, codigo_proyecto ni linea_pdd_normalizada. */
  extras: Record<string, unknown>;
  /** Presencia de las claves que pasaron a columnas (para volver igual). */
  claves: { codigo_proyecto: boolean; linea_pdd_normalizada: boolean };
  fuente: unknown;
}

/** Lo que va en pai_indicadores.extras. */
interface ExtrasIndicadorBd {
  extras: Record<string, unknown>;
  regla_tipo_meta: string;
  /** calculo del JSON sin las partes que son columnas. */
  calculo: {
    meta_total: Omit<TotalCalculoJson, 'regla' | 'divisor'>;
    avance_total: Omit<TotalCalculoJson, 'regla' | 'divisor'>;
    porcentaje: Omit<PorcentajeCalculoJson, 'tope_100' | 'tope_por_bimestre'>;
  };
  /** Por bimestre importado: la celda % de Excel y, si la hay, la fuente alterna. */
  seguimiento: Partial<
    Record<ClaveBimestreJson, { porcentaje: number | null; fuente?: unknown }>
  >;
}

function sin<T extends object, K extends keyof T>(
  objeto: T,
  claves: readonly K[],
): Omit<T, K> {
  const copia = { ...objeto };
  for (const clave of claves) delete copia[clave];
  return copia;
}

function largoExcedido(
  problemas: string[],
  donde: string,
  valor: string | null | undefined,
  maximo: number,
): void {
  if (valor && [...valor].length > maximo) {
    problemas.push(
      `${donde}: máximo ${maximo} caracteres (tiene ${[...valor].length}).`,
    );
  }
}

/**
 * JSON -> filas. Valida la coherencia (claves y códigos únicos, riesgos de
 * las acciones en el catálogo, divisores, largos de columna) y lanza
 * ErrorDatosFichas con todos los problemas encontrados.
 */
export function aFilasFichas(archivo: ArchivoFichasPai): FilasFichasPai {
  const problemas: string[] = [];
  const {
    vigencia,
    dependencias: depsJson,
    procesos: procesosJson,
    ...restoArchivo
  } = archivo;

  const siglas = new Set<string>();
  const dependencias = depsJson.map((d, i) => {
    if (siglas.has(d.sigla))
      problemas.push(`Dependencia repetida: ${d.sigla}.`);
    siglas.add(d.sigla);
    largoExcedido(
      problemas,
      `Dependencia ${d.sigla}: sigla`,
      d.sigla,
      LARGOS.sigla,
    );
    largoExcedido(
      problemas,
      `Dependencia ${d.sigla}: nombre`,
      d.nombre,
      LARGOS.nombreDependencia,
    );
    return { sigla: d.sigla, nombre: d.nombre, orden: i + 1 };
  });

  const procesos: FilaProceso[] = [];
  const riesgos: FilaRiesgo[] = [];
  const acciones: FilaAccion[] = [];
  const accionRiesgos: FilaAccionRiesgo[] = [];
  const indicadores: FilaIndicador[] = [];
  const reportes: FilaReporte[] = [];
  const claves = new Set<string>();
  const codigosProceso = new Set<string>();
  const codigos = new Set<string>();

  procesosJson.forEach((p, indiceProceso) => {
    const donde = `Proceso ${p.clave}`;
    if (claves.has(p.clave)) problemas.push(`${donde}: clave repetida.`);
    claves.add(p.clave);
    if (codigosProceso.has(p.codigo.toUpperCase())) {
      problemas.push(`${donde}: código ${p.codigo} repetido.`);
    }
    codigosProceso.add(p.codigo.toUpperCase());
    if (!siglas.has(p.dependencia)) {
      problemas.push(
        `${donde}: la dependencia ${p.dependencia} no está en "dependencias".`,
      );
    }
    largoExcedido(problemas, `${donde}: clave`, p.clave, LARGOS.clave);
    largoExcedido(
      problemas,
      `${donde}: código`,
      p.codigo,
      LARGOS.codigoProceso,
    );
    largoExcedido(
      problemas,
      `${donde}: nombre`,
      p.nombre,
      LARGOS.nombreProceso,
    );
    largoExcedido(problemas, `${donde}: hoja`, p.hoja, LARGOS.hoja);
    largoExcedido(problemas, `${donde}: programa`, p.programa, LARGOS.programa);
    largoExcedido(
      problemas,
      `${donde}: dimensión`,
      p.dimension_plan_estrategico,
      LARGOS.dimension,
    );
    const {
      riesgos: catalogo,
      codigo_proyecto,
      linea_pdd_normalizada,
    } = p.extras;
    largoExcedido(
      problemas,
      `${donde}: código del proyecto`,
      codigo_proyecto,
      LARGOS.codigoProyecto,
    );
    largoExcedido(
      problemas,
      `${donde}: línea`,
      linea_pdd_normalizada,
      LARGOS.linea,
    );
    const extrasProceso: ExtrasProcesoBd = {
      linea_plan_desarrollo: p.linea_plan_desarrollo,
      extras: sin(p.extras, [
        'riesgos',
        'codigo_proyecto',
        'linea_pdd_normalizada',
      ]),
      claves: {
        codigo_proyecto: 'codigo_proyecto' in p.extras,
        linea_pdd_normalizada: 'linea_pdd_normalizada' in p.extras,
      },
      fuente: p.fuente,
    };
    procesos.push({
      clave: p.clave,
      codigo: p.codigo,
      dependencia: p.dependencia,
      nombre: p.nombre,
      hoja: p.hoja,
      tipo: p.tipo,
      codigo_proyecto: codigo_proyecto ?? null,
      programa: p.programa,
      linea_plan_desarrollo: linea_pdd_normalizada ?? null,
      dimension_plan_estrategico: p.dimension_plan_estrategico,
      objetivo: p.objetivo,
      orden: indiceProceso + 1,
      extras: JSON.stringify(extrasProceso),
    });

    const ordenRiesgo = new Map<string, number>();
    catalogo.forEach((r, i) => {
      if (ordenRiesgo.has(r.texto)) {
        problemas.push(
          `${donde}: riesgo repetido en el catálogo: "${r.texto.slice(0, 60)}".`,
        );
      }
      ordenRiesgo.set(r.texto, i + 1);
      riesgos.push({
        proceso: p.clave,
        orden: i + 1,
        numeral: r.numeral,
        texto: r.texto,
        descripcion: r.descripcion,
        corrupcion: r.rc ? 1 : 0,
        bloque: r.bloque,
      });
    });

    const ordenesAccion = new Set<number>();
    for (const a of p.acciones) {
      const dondeAccion = `${donde}, acción ${a.orden}`;
      if (ordenesAccion.has(a.orden))
        problemas.push(`${dondeAccion}: orden repetido.`);
      ordenesAccion.add(a.orden);
      acciones.push({
        proceso: p.clave,
        orden: a.orden,
        descripcion: a.descripcion,
      });
      const riesgosAccion = new Set<number>();
      a.riesgos.forEach((texto, i) => {
        const riesgo = ordenRiesgo.get(texto);
        if (riesgo === undefined) {
          problemas.push(
            `${dondeAccion}: el riesgo "${texto.slice(0, 60)}" no está en el catálogo del proceso.`,
          );
          return;
        }
        if (riesgosAccion.has(riesgo)) {
          problemas.push(`${dondeAccion}: riesgo repetido.`);
          return;
        }
        riesgosAccion.add(riesgo);
        accionRiesgos.push({
          proceso: p.clave,
          accion: a.orden,
          riesgo,
          orden: i + 1,
        });
      });

      for (const ind of a.indicadores) {
        const dondeIndicador = `Indicador ${ind.codigo}`;
        if (
          !esCodigoIndicador(ind.codigo) ||
          ind.codigo !== ind.codigo.toUpperCase()
        ) {
          problemas.push(
            `${dondeIndicador}: el código no tiene la forma esperada (p. ej. SAF-TH-02).`,
          );
        }
        if (codigos.has(ind.codigo))
          problemas.push(`${dondeIndicador}: código repetido.`);
        codigos.add(ind.codigo);
        largoExcedido(
          problemas,
          `${dondeIndicador}: código`,
          ind.codigo,
          LARGOS.codigoIndicador,
        );
        largoExcedido(
          problemas,
          `${dondeIndicador}: nombre`,
          ind.nombre,
          LARGOS.nombreIndicador,
        );
        const { meta_total, avance_total, porcentaje } = ind.calculo;
        for (const [nombre, total] of [
          ['meta', meta_total],
          ['avance', avance_total],
        ] as const) {
          if (total.regla === 'suma_dividida' && !total.divisor) {
            problemas.push(
              `${dondeIndicador}: la regla suma_dividida del total de ${nombre} no tiene divisor.`,
            );
          }
        }
        if (porcentaje.tope_100 === null && !porcentaje.tope_por_bimestre) {
          problemas.push(
            `${dondeIndicador}: porcentaje mixto sin tope_por_bimestre.`,
          );
        }
        const seguimiento: ExtrasIndicadorBd['seguimiento'] = {};
        for (const clave of CLAVES_BIMESTRE_JSON) {
          const s = ind.seguimiento[clave];
          if (!s) continue;
          largoExcedido(
            problemas,
            `${dondeIndicador}, Bimestre ${clave}: numeral del riesgo`,
            s.numeral_riesgo,
            LARGOS.numeralRiesgo,
          );
          seguimiento[clave] =
            'fuente' in s
              ? { porcentaje: s.porcentaje, fuente: s.fuente }
              : { porcentaje: s.porcentaje };
          reportes.push({
            codigo: ind.codigo,
            bimestre: Number(clave) as FilaReporte['bimestre'],
            avance: s.avance,
            logros: s.logros,
            observaciones: s.observaciones,
            riesgo_materializado: s.riesgo_materializado,
            numeral_riesgo: s.numeral_riesgo,
            descripcion_riesgo: s.descripcion_riesgo,
            fuentes_verificacion: s.fuentes_verificacion,
          });
        }
        const extrasIndicador: ExtrasIndicadorBd = {
          extras: ind.extras,
          regla_tipo_meta: ind.regla_tipo_meta,
          calculo: {
            meta_total: sin(meta_total, ['regla', 'divisor']),
            avance_total: sin(avance_total, ['regla', 'divisor']),
            porcentaje: sin(porcentaje, ['tope_100', 'tope_por_bimestre']),
          },
          seguimiento,
        };
        indicadores.push({
          codigo: ind.codigo,
          proceso: p.clave,
          accion: a.orden,
          orden: ind.orden,
          nombre: ind.nombre,
          tipo_meta: ind.tipo_meta,
          metas: [
            ind.metas['1'],
            ind.metas['2'],
            ind.metas['3'],
            ind.metas['4'],
            ind.metas['5'],
            ind.metas['6'],
          ],
          meta_total: ind.metas.total,
          regla_meta_total: meta_total.regla,
          divisor_meta_total: meta_total.divisor,
          regla_avance_total: avance_total.regla,
          divisor_avance_total: avance_total.divisor,
          tope_100:
            porcentaje.tope_100 === null ? null : porcentaje.tope_100 ? 1 : 0,
          tope_por_bimestre: porcentaje.tope_por_bimestre
            ? JSON.stringify(porcentaje.tope_por_bimestre)
            : null,
          productos: ind.productos,
          rol_responsable: ind.rol_responsable,
          responsable: ind.responsable,
          corresponsables: ind.corresponsables,
          extras: JSON.stringify(extrasIndicador),
        });
      }
    }
  });

  if (problemas.length > 0) throw new ErrorDatosFichas(problemas);
  return {
    vigencia: { anio: vigencia, extras: JSON.stringify(restoArchivo) },
    dependencias,
    procesos,
    riesgos,
    acciones,
    accionRiesgos,
    indicadores,
    reportes,
  };
}

/** extras JSON de la base: objeto o, si no es JSON, un objeto vacío. */
export function objetoJson<T = Record<string, unknown>>(
  texto: string | null | undefined,
): T | null {
  if (!texto) return null;
  try {
    const valor: unknown = JSON.parse(texto);
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as T)
      : null;
  } catch {
    return null;
  }
}

function porOrden<T extends { orden: number }>(a: T, b: T): number {
  return a.orden - b.orden;
}

/**
 * Filas -> JSON (la vuelta): reconstruye el archivo tal como era. Con las
 * filas leídas de la base comprueba que la carga no pierde ni cambia nada.
 */
export function deFilasFichas(filas: FilasFichasPai): ArchivoFichasPai {
  const resto = objetoJson<
    Omit<ArchivoFichasPai, 'vigencia' | 'dependencias' | 'procesos'>
  >(filas.vigencia.extras);
  const reportesPorCodigo = new Map<string, FilaReporte[]>();
  for (const reporte of filas.reportes) {
    const lista = reportesPorCodigo.get(reporte.codigo) ?? [];
    lista.push(reporte);
    reportesPorCodigo.set(reporte.codigo, lista);
  }
  const procesos = filas.procesos.toSorted(porOrden).map((p): ProcesoJson => {
    const extrasBd = objetoJson<ExtrasProcesoBd>(p.extras);
    const catalogo = filas.riesgos
      .filter((r) => r.proceso === p.clave)
      .toSorted(porOrden);
    const textoRiesgo = new Map(catalogo.map((r) => [r.orden, r.texto]));
    const extras: ProcesoJson['extras'] = {
      ...extrasBd?.extras,
      riesgos: catalogo.map((r) => ({
        numeral: r.numeral,
        texto: r.texto,
        descripcion: r.descripcion,
        rc: r.corrupcion === 1,
        bloque: r.bloque,
      })),
    };
    if (extrasBd?.claves.codigo_proyecto ?? true)
      extras.codigo_proyecto = p.codigo_proyecto;
    if (extrasBd?.claves.linea_pdd_normalizada ?? true) {
      extras.linea_pdd_normalizada = p.linea_plan_desarrollo;
    }
    const acciones = filas.acciones
      .filter((a) => a.proceso === p.clave)
      .toSorted(porOrden)
      .map((a): AccionJson => ({
        orden: a.orden,
        descripcion: a.descripcion,
        riesgos: filas.accionRiesgos
          .filter((ar) => ar.proceso === p.clave && ar.accion === a.orden)
          .toSorted(porOrden)
          .map((ar) => textoRiesgo.get(ar.riesgo) ?? ''),
        indicadores: filas.indicadores
          .filter((i) => i.proceso === p.clave && i.accion === a.orden)
          .toSorted(porOrden)
          .map((i) =>
            indicadorDeFila(i, reportesPorCodigo.get(i.codigo) ?? []),
          ),
      }));
    return {
      clave: p.clave,
      codigo: p.codigo,
      dependencia: p.dependencia,
      nombre: p.nombre,
      hoja: p.hoja,
      tipo: p.tipo,
      linea_plan_desarrollo: extrasBd
        ? extrasBd.linea_plan_desarrollo
        : p.linea_plan_desarrollo,
      dimension_plan_estrategico: p.dimension_plan_estrategico,
      objetivo: p.objetivo,
      programa: p.programa,
      extras,
      fuente: extrasBd?.fuente ?? null,
      acciones,
    };
  });
  return {
    vigencia: filas.vigencia.anio,
    ...(resto as Omit<
      ArchivoFichasPai,
      'vigencia' | 'dependencias' | 'procesos'
    >),
    dependencias: filas.dependencias
      .toSorted(porOrden)
      .map((d) => ({ sigla: d.sigla, nombre: d.nombre })),
    procesos,
  };
}

function indicadorDeFila(
  fila: FilaIndicador,
  reportes: readonly FilaReporte[],
): IndicadorJson {
  const extrasBd = objetoJson<ExtrasIndicadorBd>(fila.extras);
  const calculoBd = extrasBd?.calculo;
  const tope = objetoJson<Record<ClaveBimestreJson | 'total', boolean>>(
    fila.tope_por_bimestre,
  );
  const porcentaje: PorcentajeCalculoJson = {
    ...(calculoBd?.porcentaje ?? {
      regla:
        fila.tope_100 === null
          ? 'mixto'
          : fila.tope_100
            ? 'con_tope_100'
            : 'sin_tope',
      bimestres_tecleados: [],
    }),
    tope_100: fila.tope_100 === null ? null : fila.tope_100 === 1,
  };
  if (tope) porcentaje.tope_por_bimestre = tope;
  const seguimiento: IndicadorJson['seguimiento'] = {};
  for (const reporte of reportes.toSorted((a, b) => a.bimestre - b.bimestre)) {
    const clave = String(reporte.bimestre) as ClaveBimestreJson;
    const excel = extrasBd?.seguimiento[clave];
    const entrada: SeguimientoJson = {
      avance: reporte.avance,
      porcentaje: excel?.porcentaje ?? null,
      logros: reporte.logros,
      observaciones: reporte.observaciones,
      riesgo_materializado: reporte.riesgo_materializado,
      numeral_riesgo: reporte.numeral_riesgo,
      descripcion_riesgo: reporte.descripcion_riesgo,
      fuentes_verificacion: reporte.fuentes_verificacion,
    };
    if (excel && 'fuente' in excel) entrada.fuente = excel.fuente;
    seguimiento[clave] = entrada;
  }
  return {
    orden: fila.orden,
    codigo: fila.codigo,
    nombre: fila.nombre,
    tipo_meta: fila.tipo_meta,
    regla_tipo_meta: extrasBd?.regla_tipo_meta ?? '',
    metas: {
      1: fila.metas[0],
      2: fila.metas[1],
      3: fila.metas[2],
      4: fila.metas[3],
      5: fila.metas[4],
      6: fila.metas[5],
      total: fila.meta_total,
    },
    calculo: {
      meta_total: {
        ...(calculoBd?.meta_total ?? { formula: null }),
        regla: fila.regla_meta_total,
        divisor: fila.divisor_meta_total,
      },
      avance_total: {
        ...(calculoBd?.avance_total ?? { formula: null }),
        regla: fila.regla_avance_total,
        divisor: fila.divisor_avance_total,
      },
      porcentaje,
    },
    productos: fila.productos,
    rol_responsable: fila.rol_responsable,
    responsable: fila.responsable,
    corresponsables: fila.corresponsables,
    extras: extrasBd?.extras ?? {},
    seguimiento,
  };
}
