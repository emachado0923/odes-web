import type { PoolConnection } from 'mysql2/promise';
import type { ClientBase, QueryResult } from 'pg';

/**
 * Conexión a la base del repositorio, igual en MySQL y en Postgres.
 *
 * El código de los servicios se escribió para mysql2: `conexion.query(sql,
 * valores)` con marcadores `?` y el resultado como `[filas, campos]`, o como
 * `[{ insertId, affectedRows }]` en una escritura. Esta interfaz conserva
 * esa forma, así las mismas consultas sirven para los dos motores:
 *
 * - MySQL: la conexión de mysql2 tal cual (envolverMysql).
 * - Postgres: ConexionPostgres traduce cada sentencia (traducirAPostgres):
 *   `?` -> `$1, $2…`, listas (`IN (?)`, `VALUES ?`) expandidas como lo hace
 *   mysql2, `RETURNING id` en los INSERT de tablas con id autoincremental
 *   (para insertId) y alias camelCase entre comillas. Cada escritura dentro
 *   de una transacción va en un SAVEPOINT: en Postgres un error deja la
 *   transacción inservible, en MySQL solo falla esa sentencia.
 *
 * Las pocas sentencias que no existen en los dos dialectos (ON DUPLICATE KEY,
 * DELETE con JOIN, SUM de comparaciones...) se escriben en cada servicio
 * según `conexion.dialecto`.
 */

export type Dialecto = 'mysql' | 'postgres';

/** Resultado de una escritura, con los nombres de mysql2 (ResultSetHeader). */
export interface ResultadoEscritura {
  insertId: number;
  affectedRows: number;
}

export interface Conexion {
  readonly dialecto: Dialecto;
  query<T = any>(sql: string, valores?: readonly unknown[]): Promise<[T, unknown]>;
  /** En MySQL usa el protocolo binario (BLOB sin pasar a texto); en Postgres es igual a query. */
  execute<T = any>(sql: string, valores?: readonly unknown[]): Promise<[T, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export function envolverMysql(conexion: PoolConnection): Conexion {
  return {
    dialecto: 'mysql',
    query: (sql, valores) => conexion.query(sql, valores as any[]) as Promise<[any, unknown]>,
    execute: (sql, valores) =>
      conexion.execute(sql, valores as any[]) as Promise<[any, unknown]>,
    beginTransaction: () => conexion.beginTransaction(),
    commit: () => conexion.commit(),
    rollback: () => conexion.rollback(),
    release: () => conexion.release(),
  };
}

/** Tablas con `id` autoincremental: sus INSERT devuelven el id (insertId). */
export const TABLAS_CON_ID = new Set([
  'repositorio_categorias',
  'repositorio_almacen_archivos',
  'repositorio_palabras_clave',
  'repositorio_administradores',
  'repositorio_sesiones',
  'repositorio_intentos_acceso',
  'repositorio_cambios',
  'repositorio_subidas',
  // PAI (migración 003). pai_accion_riesgos no tiene id.
  'pai_usuarios',
  'pai_sesiones',
  'pai_intentos_acceso',
  'pai_vigencias',
  'pai_dependencias',
  'pai_procesos',
  'pai_riesgos',
  'pai_acciones',
  'pai_indicadores',
  'pai_reportes',
  'pai_almacen_archivos',
  'pai_evidencias',
  'pai_subidas',
  'pai_asignaciones',
  'pai_autorizaciones',
  'pai_registro',
]);

export interface SentenciaPostgres {
  texto: string;
  valores: unknown[];
  /** true = devuelve filas (SELECT/WITH/VALUES/SHOW). */
  lectura: boolean;
}

/** Valor de un parámetro en Postgres: los booleanos como 1/0 (columnas smallint, como TINYINT(1)). */
function valorPostgres(valor: unknown): unknown {
  if (valor === undefined) return null;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  return valor;
}

const PALABRA = /[A-Za-z_][A-Za-z0-9_$]*/y;

/**
 * Traduce una sentencia escrita para mysql2 a Postgres (ver el comentario del
 * módulo). Respeta textos ('...'), identificadores ("..." y `...`) y
 * comentarios. Lanza un error con las construcciones solo de MySQL que no
 * tienen traducción automática.
 */
export function traducirAPostgres(sql: string, valores: readonly unknown[] = []): SentenciaPostgres {
  if (/\bON\s+DUPLICATE\s+KEY\b|\bINSERT\s+IGNORE\b|\bLAST_INSERT_ID\s*\(/i.test(sql)) {
    throw new Error(
      'Sentencia solo de MySQL (ON DUPLICATE KEY, INSERT IGNORE o LAST_INSERT_ID): escriba su versión para Postgres.',
    );
  }
  let salida = '';
  const parametros: unknown[] = [];
  let indiceValor = 0;
  let palabraAnterior = '';
  const n = sql.length;
  let i = 0;

  const agregarParametro = (valor: unknown): string => {
    parametros.push(valorPostgres(valor));
    return `$${parametros.length}`;
  };

  while (i < n) {
    const c = sql.charAt(i);
    const siguiente = sql.charAt(i + 1);
    // Textos '...' (con '' dentro) y E'...' no se tocan.
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql.charAt(j) === "'" && sql.charAt(j + 1) === "'") {
          j += 2;
          continue;
        }
        if (sql.charAt(j) === '\\' && sql.charAt(j + 1) === "'") {
          j += 2;
          continue;
        }
        if (sql.charAt(j) === "'") break;
        j++;
      }
      salida += sql.slice(i, j + 1);
      i = j + 1;
      palabraAnterior = '';
      continue;
    }
    // Identificadores "..." se copian; `...` (MySQL) pasan a "...".
    if (c === '"' || c === '`') {
      const fin = sql.indexOf(c, i + 1);
      const cierre = fin === -1 ? n : fin;
      salida += `"${sql.slice(i + 1, cierre)}"`;
      i = cierre + 1;
      palabraAnterior = '';
      continue;
    }
    if (c === '-' && siguiente === '-') {
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? n : fin;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? n : fin + 2;
      salida += ' ';
      continue;
    }
    if (c === '?') {
      if (indiceValor >= valores.length) {
        throw new Error(`La sentencia tiene más marcadores ? que valores (${valores.length}).`);
      }
      const valor = valores[indiceValor++];
      if (Array.isArray(valor)) {
        if (valor.length === 0) {
          salida += 'NULL';
        } else if (valor.every((fila) => Array.isArray(fila))) {
          // VALUES ? con una lista de filas (inserción masiva de mysql2).
          salida += (valor as unknown[][])
            .map((fila) => `(${fila.map((v) => agregarParametro(v)).join(', ')})`)
            .join(', ');
        } else {
          // IN (?) con una lista de valores.
          salida += valor.map((v) => agregarParametro(v)).join(', ');
        }
      } else {
        salida += agregarParametro(valor);
      }
      i++;
      palabraAnterior = '';
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      PALABRA.lastIndex = i;
      const palabra = PALABRA.exec(sql)?.[0] ?? c;
      // Alias camelCase (AS paginaInicio): Postgres los pasaría a minúsculas.
      const esAlias = palabraAnterior.toUpperCase() === 'AS';
      salida += esAlias && /[a-z]/.test(palabra) && /[A-Z]/.test(palabra) ? `"${palabra}"` : palabra;
      palabraAnterior = palabra;
      i += palabra.length;
      continue;
    }
    if (!/\s/.test(c)) palabraAnterior = '';
    salida += c;
    i++;
  }
  if (indiceValor < valores.length) {
    throw new Error(
      `La sentencia tiene ${indiceValor} marcadores ? y recibió ${valores.length} valores.`,
    );
  }

  const inicio = /^[\s(]*([A-Za-z]+)/.exec(salida)?.[1]?.toUpperCase() ?? '';
  const lectura = ['SELECT', 'WITH', 'VALUES', 'SHOW', 'TABLE'].includes(inicio);
  let texto = salida.trim().replace(/;+\s*$/, '');
  if (inicio === 'INSERT' && !/\bRETURNING\b/i.test(texto)) {
    const tabla = /^\s*INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(texto)?.[1];
    if (tabla && TABLAS_CON_ID.has(tabla.toLowerCase())) texto += ' RETURNING id';
  }
  return { texto, valores: parametros, lectura };
}

/** Resultado de Postgres con la forma de mysql2. */
function aFormaMysql(sentencia: SentenciaPostgres, resultado: QueryResult): [any, unknown] {
  if (sentencia.lectura) return [resultado.rows, resultado.fields];
  const id = (resultado.rows?.[0] as { id?: unknown } | undefined)?.id;
  const escritura: ResultadoEscritura = {
    insertId: id === undefined || id === null ? 0 : Number(id),
    affectedRows: resultado.rowCount ?? 0,
  };
  return [escritura, undefined];
}

/** Ejecuta una sentencia escrita para mysql2 sobre un cliente de Postgres (sin transacción). */
export async function consultarPostgres(
  cliente: Pick<ClientBase, 'query'>,
  sql: string,
  valores: readonly unknown[] = [],
): Promise<[any, unknown]> {
  const sentencia = traducirAPostgres(sql, valores);
  const resultado = await cliente.query(sentencia.texto, sentencia.valores);
  return aFormaMysql(sentencia, resultado);
}

/**
 * Cliente de Postgres con la forma de una conexión de mysql2. `liberar` lo
 * devuelve al pool (o cierra el cliente suelto de las CLI).
 */
export class ConexionPostgres implements Conexion {
  readonly dialecto = 'postgres' as const;
  private enTransaccion = false;

  constructor(
    private readonly cliente: Pick<ClientBase, 'query'>,
    private readonly liberar: (error?: Error) => void = () => undefined,
  ) {}

  async query<T = any>(sql: string, valores: readonly unknown[] = []): Promise<[T, unknown]> {
    const sentencia = traducirAPostgres(sql, valores);
    if (!this.enTransaccion || sentencia.lectura) {
      const resultado = await this.cliente.query(sentencia.texto, sentencia.valores);
      return aFormaMysql(sentencia, resultado) as [T, unknown];
    }
    // Como en MySQL, un error deshace solo esta sentencia: la transacción
    // sigue usable (por ejemplo, después de un duplicado que se maneja).
    await this.cliente.query('SAVEPOINT repositorio_sentencia');
    try {
      const resultado = await this.cliente.query(sentencia.texto, sentencia.valores);
      await this.cliente.query('RELEASE SAVEPOINT repositorio_sentencia');
      return aFormaMysql(sentencia, resultado) as [T, unknown];
    } catch (error) {
      await this.cliente
        .query('ROLLBACK TO SAVEPOINT repositorio_sentencia')
        .catch(() => undefined);
      throw error;
    }
  }

  execute<T = any>(sql: string, valores: readonly unknown[] = []): Promise<[T, unknown]> {
    return this.query<T>(sql, valores);
  }

  async beginTransaction(): Promise<void> {
    await this.cliente.query('BEGIN');
    this.enTransaccion = true;
  }

  async commit(): Promise<void> {
    try {
      await this.cliente.query('COMMIT');
    } finally {
      this.enTransaccion = false;
    }
  }

  async rollback(): Promise<void> {
    try {
      await this.cliente.query('ROLLBACK');
    } finally {
      this.enTransaccion = false;
    }
  }

  release(): void {
    this.liberar();
  }
}
