import { readFile } from 'node:fs/promises';

/**
 * Datos del tablero "Beneficiarios de los fondos de Sapiencia (2026)"
 * (/tableros/fondos-2026).
 *
 * Solo cifras agregadas: las arma datos/tableros/fondos-2026/etl_fondos.py
 * desde el Power BI de seguimiento de los fondos (fondos.json) y los textos
 * van en definiciones.json. Este módulo pasa del objeto a las filas de las
 * tablas sivu_tablero_fondos_2026_* (para cargarlas) y de las filas de vuelta
 * al objeto (para la API). Sin base ni Nest: lo usan el servicio, el comando
 * de carga y las pruebas.
 *
 * Un «beneficio» es una persona en una convocatoria de un programa. Las filas
 * se refieren a las dimensiones por posición:
 * - estados: [programa, convocatoria, periodo, estado, beneficios]
 * - giros: [programa, periodo, monto, matricula, sostenimiento, conGiro]
 *   (matricula y sostenimiento son null fuera de Línea Pregrado)
 * - cohortes: [programa, convocatoria, estado, beneficios] (estado en el último periodo)
 * - sexo, comunas, ies: [programa, periodo, categoría, beneficios activos]
 * - destinos: [convocatoria, pais, beneficios] (Enlaza Mundos)
 */

export const ID_TABLERO_FONDOS = 'fondos-2026';
export const TITULO_TABLERO_FONDOS = 'Beneficiarios de los fondos de Sapiencia (2026)';

export interface ProgramaFondos {
  clave: string;
  nombre: string;
  corto: string;
  linea: string;
}

export interface MetaFondos {
  titulo: string;
  corte: string;
  periodoActual: string;
  fuente: string;
  generado: string;
  beneficios: number;
  filasOrigen: number;
  excluidos: string;
}

/** Clasificaciones que van en sivu_tablero_fondos_2026_categorias, en este orden. */
export const CLASIFICACIONES_FONDOS = ['convocatoria', 'periodo', 'estado', 'sexo', 'comuna', 'ies', 'pais'] as const;
type Clasificacion = (typeof CLASIFICACIONES_FONDOS)[number];

export interface DimensionesFondos extends Record<Clasificacion, string[]> {
  programa: ProgramaFondos[];
}

export type FilaEstado = [number, number, number, number, number];
export type FilaGiro = [number, number, number, number | null, number | null, number];
export type FilaCohorte = [number, number, number, number];
export type FilaActivos = [number, number, number, number];
export type FilaDestino = [number, number, number];

export interface ConjuntoFondos {
  meta: MetaFondos;
  dim: DimensionesFondos;
  estados: FilaEstado[];
  giros: FilaGiro[];
  cohortes: FilaCohorte[];
  sexo: FilaActivos[];
  comunas: FilaActivos[];
  ies: FilaActivos[];
  destinos: FilaDestino[];
}

/** Lo que entrega GET /api/sivu/tableros/fondos-2026. */
export interface DatosTableroFondos {
  fondos: ConjuntoFondos;
  /** Textos de la ventana de bienvenida, las definiciones y las descargas (definiciones.json). */
  definiciones: unknown;
}

/** Tipo de cada desagregación de los activos en sivu_tablero_fondos_2026_activos. */
const TIPOS_ACTIVOS = [
  ['sexo', 'sexo'],
  ['comunas', 'comuna'],
  ['ies', 'ies'],
] as const;

/** Filas de cada tabla, en el orden de sus columnas (ver la migración 007). */
export interface FilasFondos {
  tablero: { id: string; titulo: string; definiciones: string };
  meta: [string, string, string, string, number, number, string];
  /** [indice, clave, nombre, corto, linea] */
  programas: Array<[number, string, string, string, string]>;
  /** [dimension, indice, nombre] */
  categorias: Array<[string, number, string]>;
  estados: FilaEstado[];
  giros: FilaGiro[];
  cohortes: FilaCohorte[];
  /** [tipo, programa, periodo, categoria, beneficios] */
  activos: Array<[string, number, number, number, number]>;
  destinos: FilaDestino[];
}

export class ErrorDatosFondos extends Error {}

function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorDatosFondos(mensaje);
}

const esEntero = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;

function revisarFilas(
  nombre: string,
  filas: unknown,
  limites: ReadonlyArray<number | null>,
  nulos: ReadonlyArray<number> = [],
): void {
  exigir(Array.isArray(filas), `Falta ${nombre}.`);
  for (const [i, fila] of (filas as unknown[]).entries()) {
    exigir(Array.isArray(fila) && fila.length === limites.length, `${nombre}[${i}] debe tener ${limites.length} valores.`);
    for (const [j, valor] of fila.entries()) {
      if (valor === null && nulos.includes(j)) continue;
      exigir(esEntero(valor), `${nombre}[${i}][${j}] debe ser un número entero.`);
      const tope = limites[j];
      exigir(tope === null || tope === undefined || valor < tope, `${nombre}[${i}][${j}] se sale de su dimensión.`);
    }
  }
}

/**
 * Revisa que el objeto tenga la forma que espera el tablero: dimensiones
 * completas y cada posición dentro de su lista. Un archivo dañado no llega a
 * la base.
 */
export function validarFondos(datos: unknown): ConjuntoFondos {
  const conjunto = datos as ConjuntoFondos;
  exigir(conjunto && typeof conjunto === 'object', 'El archivo no trae el objeto de los fondos.');
  const { meta, dim } = conjunto;
  exigir(meta && typeof meta === 'object', 'Falta meta.');
  for (const campo of ['titulo', 'corte', 'periodoActual', 'fuente', 'generado', 'excluidos'] as const) {
    exigir(typeof meta[campo] === 'string' && meta[campo] !== '', `meta.${campo} debe ser un texto.`);
  }
  exigir(esEntero(meta.beneficios) && esEntero(meta.filasOrigen), 'meta.beneficios y meta.filasOrigen deben ser números.');
  exigir(dim && typeof dim === 'object', 'Falta dim.');
  exigir(Array.isArray(dim.programa) && dim.programa.length > 0, 'Falta dim.programa.');
  for (const [i, p] of dim.programa.entries()) {
    for (const campo of ['clave', 'nombre', 'corto', 'linea'] as const) {
      exigir(typeof p?.[campo] === 'string' && p[campo] !== '', `dim.programa[${i}].${campo} debe ser un texto.`);
    }
  }
  for (const nombre of CLASIFICACIONES_FONDOS) {
    const lista = dim[nombre] as unknown;
    exigir(Array.isArray(lista) && lista.length > 0, `Falta dim.${nombre}.`);
    exigir(lista.every((x) => typeof x === 'string' && x !== ''), `dim.${nombre} debe ser una lista de textos.`);
  }
  exigir(dim.periodo.includes(meta.periodoActual), 'meta.periodoActual no está en dim.periodo.');
  const n = (nombre: Clasificacion | 'programa') => dim[nombre].length;
  revisarFilas('estados', conjunto.estados, [n('programa'), n('convocatoria'), n('periodo'), n('estado'), null]);
  revisarFilas('giros', conjunto.giros, [n('programa'), n('periodo'), null, null, null, null], [3, 4]);
  revisarFilas('cohortes', conjunto.cohortes, [n('programa'), n('convocatoria'), n('estado'), null]);
  revisarFilas('sexo', conjunto.sexo, [n('programa'), n('periodo'), n('sexo'), null]);
  revisarFilas('comunas', conjunto.comunas, [n('programa'), n('periodo'), n('comuna'), null]);
  revisarFilas('ies', conjunto.ies, [n('programa'), n('periodo'), n('ies'), null]);
  revisarFilas('destinos', conjunto.destinos, [n('convocatoria'), n('pais'), null]);
  return conjunto;
}

/** Del objeto del tablero a las filas de las tablas. */
export function aFilasFondos(conjunto: ConjuntoFondos, definiciones: unknown): FilasFondos {
  const { meta, dim } = validarFondos(conjunto);
  return {
    tablero: { id: ID_TABLERO_FONDOS, titulo: meta.titulo, definiciones: JSON.stringify(definiciones ?? {}) },
    meta: [meta.corte, meta.periodoActual, meta.fuente, meta.generado, meta.beneficios, meta.filasOrigen, meta.excluidos],
    programas: dim.programa.map((p, i) => [i, p.clave, p.nombre, p.corto, p.linea]),
    categorias: CLASIFICACIONES_FONDOS.flatMap((nombre) => dim[nombre].map((texto, i): [string, number, string] => [nombre, i, texto])),
    estados: conjunto.estados,
    giros: conjunto.giros,
    cohortes: conjunto.cohortes,
    activos: TIPOS_ACTIVOS.flatMap(([campo, tipo]) =>
      conjunto[campo].map(([programa, periodo, categoria, beneficios]): [string, number, number, number, number] => [
        tipo,
        programa,
        periodo,
        categoria,
        beneficios,
      ]),
    ),
    destinos: conjunto.destinos,
  };
}

/** Lo que se lee de la base para armar el objeto (los números pueden llegar como texto: bigint de Postgres). */
export interface FilasLeidasFondos {
  titulo: string;
  meta: Record<string, unknown>;
  programas: Array<Record<string, unknown>>;
  categorias: Array<Record<string, unknown>>;
  estados: Array<Record<string, unknown>>;
  giros: Array<Record<string, unknown>>;
  cohortes: Array<Record<string, unknown>>;
  activos: Array<Record<string, unknown>>;
  destinos: Array<Record<string, unknown>>;
}

const num = (valor: unknown): number => Number(valor);
const numONulo = (valor: unknown): number | null => (valor === null || valor === undefined ? null : Number(valor));
const porLlave = <T extends unknown[]>(a: T, b: T): number => {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return x - y;
  }
  return 0;
};

/** De las filas de la base al objeto que usa el tablero (el mismo de fondos.json, con las filas ordenadas). */
export function armarFondos(leidas: FilasLeidasFondos): ConjuntoFondos {
  const m = leidas.meta;
  const dim = { programa: [] } as unknown as DimensionesFondos;
  for (const nombre of CLASIFICACIONES_FONDOS) dim[nombre] = [];
  for (const p of leidas.programas) {
    dim.programa[num(p.indice)] = { clave: String(p.clave), nombre: String(p.nombre), corto: String(p.corto), linea: String(p.linea) };
  }
  for (const c of leidas.categorias) {
    const nombre = String(c.dimension) as Clasificacion;
    if (dim[nombre]) dim[nombre][num(c.indice)] = String(c.nombre);
  }
  const activos = (tipo: string): FilaActivos[] =>
    leidas.activos
      .filter((a) => a.tipo === tipo)
      .map((a): FilaActivos => [num(a.programa), num(a.periodo), num(a.categoria), num(a.beneficios)])
      .toSorted(porLlave);
  return {
    meta: {
      titulo: leidas.titulo,
      corte: String(m.corte),
      periodoActual: String(m.periodo_actual),
      fuente: String(m.fuente),
      generado: String(m.generado),
      beneficios: num(m.beneficios),
      filasOrigen: num(m.filas_origen),
      excluidos: String(m.excluidos),
    },
    dim,
    estados: leidas.estados
      .map((e): FilaEstado => [num(e.programa), num(e.convocatoria), num(e.periodo), num(e.estado), num(e.beneficios)])
      .toSorted(porLlave),
    giros: leidas.giros
      .map((g): FilaGiro => [num(g.programa), num(g.periodo), num(g.monto), numONulo(g.matricula), numONulo(g.sostenimiento), num(g.con_giro)])
      .toSorted((a, b) => a[0] - b[0] || a[1] - b[1]),
    cohortes: leidas.cohortes
      .map((c): FilaCohorte => [num(c.programa), num(c.convocatoria), num(c.estado), num(c.beneficios)])
      .toSorted(porLlave),
    sexo: activos('sexo'),
    comunas: activos('comuna'),
    ies: activos('ies'),
    destinos: leidas.destinos.map((d): FilaDestino => [num(d.convocatoria), num(d.pais), num(d.beneficios)]).toSorted(porLlave),
  };
}

/** Lee fondos.json y definiciones.json (los de datos/tableros/fondos-2026). */
export async function leerArchivosFondos(
  rutaFondos: string,
  rutaDefiniciones: string,
): Promise<{ fondos: ConjuntoFondos; definiciones: unknown }> {
  const fondos = validarFondos(JSON.parse(await readFile(rutaFondos, 'utf8')));
  const definiciones: unknown = JSON.parse(await readFile(rutaDefiniciones, 'utf8'));
  exigir(definiciones && typeof definiciones === 'object', 'definiciones.json debe ser un objeto.');
  return { fondos, definiciones };
}
