import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

/**
 * Datos del tablero "Matrícula en educación superior en Medellín (2025)".
 *
 * El tablero (apps/web/src/sites/tableros/matricula) usa el mismo objeto que
 * traía el tablero estático en datos/matricula.js: { meta, dim, filas }, con
 * las dimensiones como listas y las filas como tuplas que se refieren a ellas
 * por posición. Este módulo pasa de ese objeto a las filas de las tablas
 * sivu_tablero_matricula_2025_* y sivu_tableros (para cargarlas) y de las
 * filas de vuelta al objeto (para la API). Sin base ni Nest: lo usan el
 * servicio, el comando de carga y las pruebas.
 */

export const ID_TABLERO_MATRICULA = 'matricula-2025';
export const TITULO_TABLERO_MATRICULA = 'Matrícula en educación superior en Medellín (2025)';

export interface IesMatricula {
  nombre: string;
  corto: string;
  sector: string;
  caracter: string;
  acreditada: boolean;
  codigos: string[];
}

export interface ProgramaMatricula {
  nombre: string;
  codigo: string;
  ies: number;
  nivelForm: number;
  modalidad: number;
  nbc: number;
  /** Posición en cineDetallado. */
  cine: number;
  acreditado: boolean;
}

export interface DimensionesMatricula {
  ies: IesMatricula[];
  programa: ProgramaMatricula[];
  nivelAcad: string[];
  nivelForm: Array<{ nombre: string; acad: number }>;
  modalidad: string[];
  area: string[];
  nbc: Array<{ nombre: string; area: number }>;
  cineAmplio: string[];
  cineEspecifico: Array<{ nombre: string; amplio: number }>;
  cineDetallado: Array<{ nombre: string; especifico: number }>;
  sexo: string[];
  periodo: string[];
}

export interface ResumenPeriodo {
  matriculados: number;
  ies: number;
  programas: number;
}

export interface MetaMatricula {
  municipio: string;
  anio: number;
  periodos: string[];
  referencia: string;
  registros: number;
  fuente: string;
  generado: string;
  resumen: Record<string, ResumenPeriodo>;
}

/** [programa, sexo, periodo, matriculados]: las tres primeras son posiciones en dim. */
export type FilaMatricula = [number, number, number, number];

export interface ConjuntoMatricula {
  meta: MetaMatricula;
  dim: DimensionesMatricula;
  filas: FilaMatricula[];
}

/** Lo que entrega GET /api/sivu/tableros/matricula-2025. */
export interface DatosTableroMatricula {
  matricula: ConjuntoMatricula;
  /** Textos de la ventana de bienvenida y de las descargas (definiciones.js). */
  definiciones: unknown;
}

/**
 * Clasificaciones que van en sivu_tablero_matricula_2025_categorias, en el
 * orden del objeto, con la clave de su padre (null: es una lista de textos).
 */
export const CLASIFICACIONES = [
  ['nivelAcad', null],
  ['nivelForm', 'acad'],
  ['modalidad', null],
  ['area', null],
  ['nbc', 'area'],
  ['cineAmplio', null],
  ['cineEspecifico', 'amplio'],
  ['cineDetallado', 'especifico'],
  ['sexo', null],
  ['periodo', null],
] as const satisfies ReadonlyArray<readonly [keyof DimensionesMatricula, string | null]>;

type Clasificacion = (typeof CLASIFICACIONES)[number][0];

/** Filas de cada tabla, en el orden de sus columnas (ver la migración 002). */
export interface FilasTablas {
  tablero: { id: string; titulo: string; definiciones: string };
  meta: { municipio: string; anio: number; referencia: string; fuente: string; generado: string };
  /** [dimension, indice, nombre, padre] */
  categorias: Array<[string, number, string, number | null]>;
  /** [indice, nombre, corto, sector, caracter, acreditada, codigos] */
  ies: Array<[number, string, string, string, string, number, string]>;
  /** [indice, codigo, nombre, ies, nivel_formacion, modalidad, nbc, cine, acreditado] */
  programas: Array<[number, string, string, number, number, number, number, number, number]>;
  /** [n, programa, sexo, periodo, matriculados] */
  filas: Array<[number, number, number, number, number]>;
}

export class ErrorDatosTablero extends Error {}

function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorDatosTablero(mensaje);
}

const esEntero = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;

/**
 * Revisa que el objeto tenga la forma que espera el tablero: dimensiones
 * completas y cada posición dentro de su lista. Un archivo dañado no llega a
 * la base.
 */
export function validarConjunto(datos: unknown): ConjuntoMatricula {
  const conjunto = datos as ConjuntoMatricula;
  exigir(conjunto && typeof conjunto === 'object', 'El archivo no trae el objeto de matrícula.');
  const { meta, dim, filas } = conjunto;
  exigir(meta && typeof meta === 'object', 'Falta meta.');
  for (const campo of ['municipio', 'referencia', 'fuente', 'generado'] as const) {
    exigir(typeof meta[campo] === 'string' && meta[campo] !== '', `meta.${campo} debe ser un texto.`);
  }
  exigir(esEntero(meta.anio), 'meta.anio debe ser un número.');
  exigir(dim && typeof dim === 'object', 'Falta dim.');
  for (const [nombre, padre] of CLASIFICACIONES) {
    const lista = dim[nombre] as unknown[];
    exigir(Array.isArray(lista) && lista.length > 0, `Falta dim.${nombre}.`);
    for (const [i, item] of lista.entries()) {
      if (padre === null) {
        exigir(typeof item === 'string', `dim.${nombre}[${i}] debe ser un texto.`);
      } else {
        const objeto = item as Record<string, unknown>;
        exigir(typeof objeto?.nombre === 'string', `dim.${nombre}[${i}].nombre debe ser un texto.`);
        exigir(esEntero(objeto[padre]), `dim.${nombre}[${i}].${padre} debe ser una posición.`);
      }
    }
  }
  const padres: Record<string, Clasificacion> = { acad: 'nivelAcad', area: 'area', amplio: 'cineAmplio', especifico: 'cineEspecifico' };
  for (const [nombre, padre] of CLASIFICACIONES) {
    if (padre === null) continue;
    const total = dim[padres[padre]!].length;
    for (const [i, item] of (dim[nombre] as unknown as Array<Record<string, number>>).entries()) {
      exigir(item[padre]! < total, `dim.${nombre}[${i}].${padre} se sale de dim.${padres[padre]}.`);
    }
  }
  exigir(Array.isArray(dim.ies) && dim.ies.length > 0, 'Falta dim.ies.');
  for (const [i, ies] of dim.ies.entries()) {
    for (const campo of ['nombre', 'corto', 'sector', 'caracter'] as const) {
      exigir(typeof ies?.[campo] === 'string', `dim.ies[${i}].${campo} debe ser un texto.`);
    }
    exigir(typeof ies.acreditada === 'boolean', `dim.ies[${i}].acreditada debe ser sí o no.`);
    exigir(
      Array.isArray(ies.codigos) && ies.codigos.every((c) => typeof c === 'string' && !c.includes(',')),
      `dim.ies[${i}].codigos debe ser una lista de códigos.`,
    );
  }
  exigir(Array.isArray(dim.programa) && dim.programa.length > 0, 'Falta dim.programa.');
  const limites = {
    ies: dim.ies.length,
    nivelForm: dim.nivelForm.length,
    modalidad: dim.modalidad.length,
    nbc: dim.nbc.length,
    cine: dim.cineDetallado.length,
  } as const;
  for (const [i, programa] of dim.programa.entries()) {
    exigir(typeof programa?.nombre === 'string' && typeof programa.codigo === 'string', `dim.programa[${i}] sin nombre o código.`);
    exigir(typeof programa.acreditado === 'boolean', `dim.programa[${i}].acreditado debe ser sí o no.`);
    for (const [campo, total] of Object.entries(limites)) {
      const valor = programa[campo as keyof typeof limites];
      exigir(esEntero(valor) && valor < total, `dim.programa[${i}].${campo} se sale de su lista.`);
    }
  }
  exigir(Array.isArray(filas) && filas.length > 0, 'Faltan las filas.');
  for (const [i, fila] of filas.entries()) {
    exigir(Array.isArray(fila) && fila.length === 4 && fila.every(esEntero), `filas[${i}] debe tener 4 números.`);
    exigir(fila[0] < dim.programa.length && fila[1] < dim.sexo.length && fila[2] < dim.periodo.length, `filas[${i}] se sale de las dimensiones.`);
  }
  return conjunto;
}

/** Del objeto del tablero a las filas de las tablas. */
export function aFilasTablas(
  conjunto: ConjuntoMatricula,
  definiciones: unknown,
  { id = ID_TABLERO_MATRICULA, titulo = TITULO_TABLERO_MATRICULA } = {},
): FilasTablas {
  const { meta, dim, filas } = validarConjunto(conjunto);
  const categorias: FilasTablas['categorias'] = [];
  for (const [nombre, padre] of CLASIFICACIONES) {
    (dim[nombre] as Array<string | Record<string, string | number>>).forEach((item, indice) => {
      if (padre === null) categorias.push([nombre, indice, item as string, null]);
      else {
        const objeto = item as Record<string, string | number>;
        categorias.push([nombre, indice, objeto.nombre as string, objeto[padre] as number]);
      }
    });
  }
  return {
    tablero: { id, titulo, definiciones: JSON.stringify(definiciones ?? {}) },
    meta: { municipio: meta.municipio, anio: meta.anio, referencia: meta.referencia, fuente: meta.fuente, generado: meta.generado },
    categorias,
    ies: dim.ies.map((i, indice) => [indice, i.nombre, i.corto, i.sector, i.caracter, i.acreditada ? 1 : 0, i.codigos.join(',')]),
    programas: dim.programa.map((p, indice) => [
      indice,
      p.codigo,
      p.nombre,
      p.ies,
      p.nivelForm,
      p.modalidad,
      p.nbc,
      p.cine,
      p.acreditado ? 1 : 0,
    ]),
    filas: filas.map((f, n) => [n, f[0], f[1], f[2], f[3]]),
  };
}

/** Filas tal como salen de la base (MySQL o Postgres): los números pueden venir como texto. */
export interface FilasLeidas {
  meta: { municipio: string; anio: number | string; referencia: string; fuente: string; generado: string };
  categorias: Array<{ dimension: string; indice: number | string; nombre: string; padre: number | string | null }>;
  ies: Array<{ indice: number | string; nombre: string; corto: string; sector: string; caracter: string; acreditada: number | string | boolean; codigos: string }>;
  programas: Array<{
    indice: number | string;
    codigo: string;
    nombre: string;
    ies: number | string;
    nivel_formacion: number | string;
    modalidad: number | string;
    nbc: number | string;
    cine: number | string;
    acreditado: number | string | boolean;
  }>;
  filas: Array<{ programa: number | string; sexo: number | string; periodo: number | string; matriculados: number | string }>;
}

const verdadero = (valor: number | string | boolean): boolean => valor === true || Number(valor) === 1;

/**
 * De las filas de la base al objeto del tablero. Cada consulta viene ordenada
 * (por dimensión e indice, por indice y por n). meta.periodos, registros y
 * resumen se calculan con las filas, como los calculaba el ETL.
 */
export function armarConjunto(leidas: FilasLeidas): ConjuntoMatricula {
  const listas: Record<string, Array<string | Record<string, string | number>>> = {};
  for (const [nombre] of CLASIFICACIONES) listas[nombre] = [];
  const padreDe = Object.fromEntries(CLASIFICACIONES) as Record<string, string | null>;
  for (const c of leidas.categorias) {
    const padre = padreDe[c.dimension];
    if (padre === undefined) continue;
    listas[c.dimension]!.push(padre === null ? c.nombre : { nombre: c.nombre, [padre]: Number(c.padre) });
  }
  const dim = {
    ies: leidas.ies.map((i) => ({
      nombre: i.nombre,
      corto: i.corto,
      sector: i.sector,
      caracter: i.caracter,
      acreditada: verdadero(i.acreditada),
      codigos: i.codigos === '' ? [] : i.codigos.split(','),
    })),
    programa: leidas.programas.map((p) => ({
      nombre: p.nombre,
      codigo: p.codigo,
      ies: Number(p.ies),
      nivelForm: Number(p.nivel_formacion),
      modalidad: Number(p.modalidad),
      nbc: Number(p.nbc),
      cine: Number(p.cine),
      acreditado: verdadero(p.acreditado),
    })),
    ...listas,
  } as unknown as DimensionesMatricula;
  const filas = leidas.filas.map(
    (f) => [Number(f.programa), Number(f.sexo), Number(f.periodo), Number(f.matriculados)] as FilaMatricula,
  );
  const resumen: Record<string, ResumenPeriodo> = {};
  dim.periodo.forEach((periodo, p) => {
    const ies = new Set<number>();
    const programas = new Set<number>();
    let matriculados = 0;
    for (const [programa, , periodoFila, valor] of filas) {
      if (periodoFila !== p) continue;
      matriculados += valor;
      programas.add(programa);
      ies.add(dim.programa[programa]!.ies);
    }
    resumen[periodo] = { matriculados, ies: ies.size, programas: programas.size };
  });
  return {
    meta: {
      municipio: leidas.meta.municipio,
      anio: Number(leidas.meta.anio),
      periodos: [...dim.periodo],
      referencia: leidas.meta.referencia,
      registros: filas.length,
      fuente: leidas.meta.fuente,
      generado: leidas.meta.generado,
      resumen,
    },
    dim,
    filas,
  };
}

/**
 * Lee datos/matricula.js y datos/definiciones.js del tablero estático. Son
 * scripts que llenan window.ODES; se ejecutan en un contexto aislado (sin
 * require, process ni red), que solo tiene un window vacío.
 */
export async function leerArchivosTablero(
  rutaMatricula: string,
  rutaDefiniciones?: string,
): Promise<{ matricula: ConjuntoMatricula; definiciones: unknown }> {
  const contexto: { window: { ODES?: { matricula?: unknown; definiciones?: unknown } } } = { window: {} };
  for (const ruta of [rutaMatricula, rutaDefiniciones]) {
    if (!ruta) continue;
    runInNewContext(await readFile(ruta, 'utf8'), contexto, { filename: ruta, timeout: 5000 });
  }
  // JSON de ida y vuelta: los objetos del contexto aislado tienen otros prototipos.
  const odes = JSON.parse(JSON.stringify(contexto.window.ODES ?? {})) as { matricula?: unknown; definiciones?: unknown };
  return { matricula: validarConjunto(odes.matricula), definiciones: odes.definiciones ?? {} };
}
