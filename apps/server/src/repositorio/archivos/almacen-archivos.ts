import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  type BaseDatosRepositorio,
  type Conexion,
  ErrorReintentar,
} from '../bd/base-datos.js';
import { esDuplicado } from '../bd/errores-bd.js';

/**
 * Almacén de archivos: una tabla de fichas (sha256, tipo, tamaño) y otra con
 * el contenido en trozos. Cada módulo tiene el suyo y nunca comparten fichas
 * (TablasAlmacen):
 *
 * - el repositorio (documentos, portadas y miniaturas):
 *   repositorio_almacen_archivos y repositorio_almacen_archivo_trozos
 *   (ALMACEN_REPOSITORIO);
 * - el PAI (evidencias): pai_almacen_archivos y pai_almacen_archivo_trozos
 *   (ALMACEN_PAI en pai/evidencias/almacen-evidencias.ts).
 *
 * El contenido de un archivo del repositorio va, según la configuración:
 *
 * - AlmacenArchivosBd (este archivo): DENTRO de la base, en binario, partido
 *   en trozos de ~1 MB. Lo usa la instalación con MySQL de la entidad (y
 *   Postgres sin Storage).
 * - AlmacenArchivosSupabase (almacen-supabase.ts): en un bucket público de
 *   Supabase Storage. Las descargas van directo al bucket (redirección) y
 *   la administración sube los archivos grandes directo a Supabase.
 *
 * En los dos, un mismo contenido (sha256) se guarda una sola vez por almacén
 * y lo pueden compartir varios documentos; cuando nadie lo usa, se borra
 * (recolectar). Las evidencias del PAI usan AlmacenArchivosBd sobre su propio
 * almacén o, con Supabase, el bucket PRIVADO del PAI.
 */

/** Las tablas de un almacén y quién usa sus fichas. */
export interface TablasAlmacen {
  /** Tabla de las fichas. */
  readonly archivos: string;
  /** Tabla del contenido en trozos (se borra en cascada con la ficha). */
  readonly trozos: string;
  /** Restricción única del sha256 (para reconocer dos guardados simultáneos). */
  readonly unicoSha256: string;
  /** Columnas que usan las fichas: una ficha sin ningún uso es huérfana. */
  readonly usos: ReadonlyArray<{ readonly tabla: string; readonly columna: string }>;
}

/** Almacén del repositorio: archivos, portadas y miniaturas de los documentos. */
export const ALMACEN_REPOSITORIO: TablasAlmacen = {
  archivos: 'repositorio_almacen_archivos',
  trozos: 'repositorio_almacen_archivo_trozos',
  unicoSha256: 'uq_archivos_sha256',
  usos: [
    { tabla: 'repositorio_documentos', columna: 'archivo_id' },
    { tabla: 'repositorio_documentos', columna: 'portada_id' },
    { tabla: 'repositorio_documentos', columna: 'miniatura_id' },
  ],
};

/** Archivos de un almacén: en la base (AlmacenArchivosBd) o en Supabase Storage. */
export interface AlmacenArchivos {
  /**
   * Guarda el archivo dentro de la transacción `conexion` (o reutiliza uno
   * idéntico). Si otro proceso guarda el mismo contenido a la vez, la
   * transacción se reintenta entera (ErrorReintentar).
   */
  guardar(
    conexion: Conexion,
    origen: OrigenArchivo,
    meta: { mime: string; ancho?: number | null; alto?: number | null },
    resumenPrevio?: Resumen,
  ): Promise<ArchivoGuardado>;
  buscarPorSha256(sha256: string): Promise<ReferenciaArchivo | null>;
  /** Flujo con los bytes [inicio, fin] (inclusive) del archivo. */
  flujo(archivo: ReferenciaArchivo, inicio?: number, fin?: number): Readable;
  /** Como flujo, pero un fallo al abrir sale aquí y no a mitad del envío. */
  abrirFlujo(archivo: ReferenciaArchivo, inicio?: number, fin?: number): Promise<Readable>;
  /** El archivo completo en memoria (solo para imágenes pequeñas). */
  leerCompleto(archivo: ReferenciaArchivo): Promise<Buffer>;
  /** Borra, en la transacción, los archivos de `ids` que ya nadie usa. */
  recolectar(conexion: Conexion, ids: ReadonlyArray<number | null | undefined>): Promise<number>;
  /** Recolecta TODOS los archivos huérfanos (CLI de importación y mantenimiento). */
  recolectarHuerfanos(): Promise<{ archivos: number }>;
  /**
   * Solo Supabase Storage: URL pública del archivo, a la que redirigen las
   * descargas (con `descarga`, el nombre del archivo descargado).
   */
  urlPublica?(archivo: ReferenciaArchivo, opciones?: { descarga?: string }): string | null;
}

export interface ReferenciaArchivo {
  id: number;
  sha256: string;
  mime: string;
  bytes: number;
  trozos: number;
  tamanoTrozo: number;
  creadoEn: Date;
}

export interface ArchivoGuardado extends ReferenciaArchivo {
  /** false = ya existía un archivo idéntico y se reutilizó. */
  nuevo: boolean;
}

export type OrigenArchivo = { ruta: string } | { datos: Buffer };

export interface Resumen {
  sha256: string;
  bytes: number;
}

/** sha256 (hex) y tamaño de un archivo en disco, leyéndolo como flujo. */
export async function resumenArchivo(ruta: string): Promise<Resumen> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const parte of createReadStream(ruta, {
    highWaterMark: 1024 * 1024,
  })) {
    const buffer = parte as Buffer;
    hash.update(buffer);
    bytes += buffer.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

export function resumenBuffer(datos: Buffer): Resumen {
  return {
    sha256: createHash('sha256').update(datos).digest('hex'),
    bytes: datos.length,
  };
}

export interface FilaArchivo extends RowDataPacket {
  id: number;
  sha256: string;
  mime: string;
  bytes: number;
  trozos: number;
  tamano_trozo: number;
  creado_en: Date;
}

export function aReferencia(fila: FilaArchivo): ReferenciaArchivo {
  return {
    id: Number(fila.id),
    sha256: fila.sha256,
    mime: fila.mime,
    bytes: Number(fila.bytes),
    trozos: Number(fila.trozos),
    tamanoTrozo: Number(fila.tamano_trozo),
    creadoEn: fila.creado_en,
  };
}

/** Lee trozos de tamaño fijo de un archivo o Buffer (el último puede ser menor). */
async function* trozosDe(
  origen: OrigenArchivo,
  tamano: number,
): AsyncGenerator<Buffer> {
  if ('datos' in origen) {
    for (let i = 0; i < origen.datos.length; i += tamano) {
      yield origen.datos.subarray(i, i + tamano);
    }
    return;
  }
  const manejador = await open(origen.ruta, 'r');
  try {
    let posicion = 0;
    for (;;) {
      const buffer = Buffer.allocUnsafe(tamano);
      let leidos = 0;
      while (leidos < tamano) {
        const { bytesRead } = await manejador.read(
          buffer,
          leidos,
          tamano - leidos,
          posicion + leidos,
        );
        if (bytesRead === 0) break;
        leidos += bytesRead;
      }
      if (leidos === 0) return;
      posicion += leidos;
      yield leidos === tamano ? buffer : buffer.subarray(0, leidos);
      if (leidos < tamano) return;
    }
  } finally {
    await manejador.close();
  }
}

export const COLUMNAS_ARCHIVO =
  'id, sha256, mime, bytes, trozos, tamano_trozo, creado_en';

/** Los usos de la ficha, agrupados por tabla: `SELECT 1 FROM t WHERE c1 = ? OR c2 = ?`. */
function consultasDeUso(tablas: TablasAlmacen): Array<{ sql: string; columnas: number }> {
  const porTabla = new Map<string, string[]>();
  for (const { tabla, columna } of tablas.usos) {
    porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), columna]);
  }
  return [...porTabla].map(([tabla, columnas]) => ({
    sql: `SELECT 1 FROM ${tabla} WHERE ${columnas.map((c) => `${c} = ?`).join(' OR ')} LIMIT 1 FOR SHARE`,
    columnas: columnas.length,
  }));
}

/**
 * Fichas de `ids` que ya nadie usa (según `tablas.usos`), bloqueadas y
 * borradas del almacén dentro de la transacción (en la base, sus trozos se
 * van en cascada). Lo usan los dos almacenes del repositorio y el del PAI.
 */
export async function borrarFichasHuerfanas(
  conexion: Conexion,
  tablas: TablasAlmacen,
  ids: ReadonlyArray<number | null | undefined>,
): Promise<ReferenciaArchivo[]> {
  const borradas: ReferenciaArchivo[] = [];
  const usos = consultasDeUso(tablas);
  const unicos = [...new Set(ids.filter((id): id is number => !!id))];
  fichas: for (const id of unicos) {
    // Bloqueo exclusivo primero: espera a que termine quien lo esté
    // reutilizando (FOR SHARE en guardar) y luego mira las referencias con
    // una lectura con bloqueo, que ve lo último confirmado.
    const [archivo] = await conexion.query<FilaArchivo[]>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${tablas.archivos} WHERE id = ? FOR UPDATE`,
      [id],
    );
    if (!archivo[0]) continue;
    for (const uso of usos) {
      const [filas] = await conexion.query<RowDataPacket[]>(uso.sql, Array<number>(uso.columnas).fill(id));
      if (filas[0]) continue fichas;
    }
    await conexion.query(`DELETE FROM ${tablas.archivos} WHERE id = ?`, [id]);
    borradas.push(aReferencia(archivo[0]));
  }
  return borradas;
}

/** Ids de las fichas del almacén que nadie usa. */
export async function idsHuerfanos(bd: BaseDatosRepositorio, tablas: TablasAlmacen): Promise<number[]> {
  const filas = await bd.filas<RowDataPacket & { id: number }>(
    `SELECT a.id FROM ${tablas.archivos} a
      WHERE ${tablas.usos
        .map(({ tabla, columna }) => `NOT EXISTS (SELECT 1 FROM ${tabla} u WHERE u.${columna} = a.id)`)
        .join('\n        AND ')}`,
  );
  return filas.map(({ id }) => Number(id));
}

/** Archivos dentro de la base, en trozos de ~1 MB (la tabla `tablas.trozos`). */
export class AlmacenArchivosBd implements AlmacenArchivos {
  constructor(
    private readonly bd: BaseDatosRepositorio,
    readonly tablas: TablasAlmacen = ALMACEN_REPOSITORIO,
  ) {}

  /**
   * Guarda el archivo dentro de la transacción `conexion` (o reutiliza uno
   * idéntico): desde un archivo en disco (o un Buffer pequeño), trozo a
   * trozo, sin cargarlo entero en memoria.
   */
  async guardar(
    conexion: Conexion,
    origen: OrigenArchivo,
    meta: { mime: string; ancho?: number | null; alto?: number | null },
    resumenPrevio?: Resumen,
  ): Promise<ArchivoGuardado> {
    const resumen =
      resumenPrevio ??
      ('datos' in origen
        ? resumenBuffer(origen.datos)
        : await resumenArchivo(origen.ruta));
    // FOR SHARE: impide que otra transacción lo borre por huérfano antes de
    // que este documento lo referencie.
    const [existentes] = await conexion.query<FilaArchivo[]>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${this.tablas.archivos} WHERE sha256 = ? FOR SHARE`,
      [resumen.sha256],
    );
    if (existentes[0]) return { ...aReferencia(existentes[0]), nuevo: false };

    const tamanoTrozo = this.bd.tamanoTrozo;
    const trozos = Math.ceil(resumen.bytes / tamanoTrozo);
    const creadoEn = new Date();
    let id: number;
    try {
      const [resultado] = await conexion.query<ResultSetHeader>(
        `INSERT INTO ${this.tablas.archivos} (sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resumen.sha256,
          meta.mime,
          resumen.bytes,
          trozos,
          tamanoTrozo,
          meta.ancho ?? null,
          meta.alto ?? null,
          creadoEn,
        ],
      );
      id = resultado.insertId;
    } catch (error) {
      if (esDuplicado(error, this.tablas.unicoSha256)) {
        throw new ErrorReintentar(error);
      }
      throw error;
    }

    const hash = createHash('sha256');
    let n = 0;
    let bytes = 0;
    for await (const trozo of trozosDe(origen, tamanoTrozo)) {
      hash.update(trozo);
      bytes += trozo.length;
      await conexion.execute(
        `INSERT INTO ${this.tablas.trozos} (archivo_id, n, datos) VALUES (?, ?, ?)`,
        [id, n, trozo],
      );
      n++;
    }
    if (hash.digest('hex') !== resumen.sha256 || bytes !== resumen.bytes) {
      throw new Error('El archivo cambió mientras se guardaba en la base.');
    }
    return {
      id,
      sha256: resumen.sha256,
      mime: meta.mime,
      bytes: resumen.bytes,
      trozos,
      tamanoTrozo,
      creadoEn,
      nuevo: true,
    };
  }

  async buscarPorSha256(sha256: string): Promise<ReferenciaArchivo | null> {
    const filas = await this.bd.filas<FilaArchivo>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${this.tablas.archivos} WHERE sha256 = ?`,
      [sha256],
    );
    return filas[0] ? aReferencia(filas[0]) : null;
  }

  /**
   * Flujo con los bytes [inicio, fin] (inclusive) del archivo. Pide a la base
   * solo los trozos necesarios, de a uno y a medida que el cliente consume.
   */
  flujo(
    archivo: Pick<ReferenciaArchivo, 'id' | 'bytes' | 'tamanoTrozo'>,
    inicio = 0,
    fin = archivo.bytes - 1,
  ): Readable {
    const bd = this.bd;
    const consulta = `SELECT datos FROM ${this.tablas.trozos} WHERE archivo_id = ? AND n = ?`;
    async function* generar(): AsyncGenerator<Buffer> {
      if (archivo.bytes === 0 || fin < inicio) return;
      const primero = Math.floor(inicio / archivo.tamanoTrozo);
      const ultimo = Math.floor(fin / archivo.tamanoTrozo);
      for (let n = primero; n <= ultimo; n++) {
        const filas = await bd.preparada<RowDataPacket & { datos: Buffer }>(
          consulta,
          [archivo.id, n],
        );
        const datos = filas[0]?.datos;
        if (!datos) {
          throw new Error(`Falta el trozo ${n} del archivo ${archivo.id}.`);
        }
        const base = n * archivo.tamanoTrozo;
        const desde = Math.max(0, inicio - base);
        const hasta = Math.min(datos.length, fin - base + 1);
        yield datos.subarray(desde, hasta);
      }
    }
    // Un trozo en el búfer mientras se pide el siguiente: memoria acotada
    // (~2 MB por descarga) y sin esperar a la base entre trozo y trozo.
    return Readable.from(generar(), {
      objectMode: false,
      highWaterMark: archivo.tamanoTrozo,
    });
  }

  /**
   * Como `flujo`, pero pide el primer trozo antes de devolverlo: si la base
   * falla, el error sale aquí (y la respuesta puede ser un 503 en JSON) y no
   * a mitad de un envío ya empezado.
   */
  async abrirFlujo(
    archivo: Pick<ReferenciaArchivo, 'id' | 'bytes' | 'tamanoTrozo'>,
    inicio = 0,
    fin = archivo.bytes - 1,
  ): Promise<Readable> {
    const iterador = this.flujo(archivo, inicio, fin)[Symbol.asyncIterator]();
    const primero = (await iterador.next()) as IteratorResult<Buffer>;
    async function* resto(): AsyncGenerator<Buffer> {
      try {
        if (primero.done) return;
        yield primero.value;
        for (;;) {
          const siguiente = (await iterador.next()) as IteratorResult<Buffer>;
          if (siguiente.done) return;
          yield siguiente.value;
        }
      } finally {
        await iterador.return?.();
      }
    }
    return Readable.from(resto(), {
      objectMode: false,
      highWaterMark: archivo.tamanoTrozo,
    });
  }

  /** Lee el archivo completo en memoria (solo para imágenes pequeñas). */
  async leerCompleto(archivo: ReferenciaArchivo): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const parte of this.flujo(archivo)) partes.push(parte as Buffer);
    return Buffer.concat(partes);
  }

  /**
   * Borra, dentro de la transacción, los archivos de `ids` que ya nadie usa
   * (sus trozos se van en cascada). Devuelve cuántos borró.
   */
  async recolectar(
    conexion: Conexion,
    ids: ReadonlyArray<number | null | undefined>,
  ): Promise<number> {
    return (await borrarFichasHuerfanas(conexion, this.tablas, ids)).length;
  }

  /** Recolecta TODOS los archivos huérfanos (CLI de importación y mantenimiento). */
  async recolectarHuerfanos(): Promise<{ archivos: number }> {
    let archivos = 0;
    for (const id of await idsHuerfanos(this.bd, this.tablas)) {
      archivos += await this.bd.transaccion((conexion) => this.recolectar(conexion, [id]));
    }
    return { archivos };
  }
}
