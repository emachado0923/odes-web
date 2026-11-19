import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as ReadableStreamWeb } from 'node:stream/web';
import { Logger } from '@nestjs/common';
import type { ResultSetHeader } from 'mysql2/promise';
import {
  type BaseDatosRepositorio,
  type Conexion,
  ErrorReintentar,
  TAMANO_TROZO,
} from '../bd/base-datos.js';
import { esDuplicado } from '../bd/errores-bd.js';
import type { OpcionesSupabase } from '../configuracion-repositorio.js';
import { noDisponible } from '../errores-repositorio.js';
import {
  ALMACEN_REPOSITORIO,
  type AlmacenArchivos,
  AlmacenArchivosBd,
  type ArchivoGuardado,
  aReferencia,
  borrarFichasHuerfanas,
  COLUMNAS_ARCHIVO,
  type FilaArchivo,
  idsHuerfanos,
  type OrigenArchivo,
  type ReferenciaArchivo,
  type Resumen,
  resumenBuffer,
} from './almacen-archivos.js';
import { extensionDeMime } from './tipos-archivo.js';

/**
 * Archivos del repositorio en Supabase Storage (ver almacen-archivos.ts).
 *
 * - Cada ficha de repositorio_almacen_archivos tiene su objeto en el bucket
 *   público: archivos/<id>-<sha256>.<extensión>. El id lo hace único (una ficha
 *   borrada y vuelta a crear no comparte objeto) y el sha256, imposible de
 *   adivinar: un documento despublicado no queda expuesto aunque el bucket
 *   sea público (Storage no lista objetos sin permiso).
 * - Las fichas guardadas antes en la base (trozos > 0) se siguen leyendo de
 *   la base: se puede pasar a Storage sin migrar los archivos viejos.
 * - Las descargas no pasan por el servidor: las rutas /ver, /descargar,
 *   /portada y /miniatura redirigen a la URL pública (urlPublica).
 * - La administración sube los archivos grandes directo al bucket con una
 *   URL firmada (crearSubida); el servidor los trae para validarlos
 *   (traerSubida) y luego los guarda como cualquier otro.
 * - El servidor usa la clave secreta del proyecto, que nunca llega al
 *   navegador.
 * - Las evidencias del PAI NO van a este bucket ni a este almacén: tienen
 *   el suyo (pai_almacen_archivos) y su contenido va al bucket privado del
 *   PAI (PAI_SUPABASE_BUCKET, ver pai/evidencias/almacen-evidencias.ts), con
 *   otro ClienteStorage y descargas por URL firmada de corta duración
 *   (firmarDescarga). ClienteStorage y traerObjeto sirven a los dos.
 */

/** Ruta del objeto de una ficha en el bucket. */
export function rutaObjeto(archivo: Pick<ReferenciaArchivo, 'id' | 'sha256' | 'mime'>): string {
  return `archivos/${archivo.id}-${archivo.sha256}.${extensionDeMime(archivo.mime)}`;
}

/** true = el contenido está en Storage (las fichas en trozos siguen en la base). */
export function estaEnStorage(archivo: Pick<ReferenciaArchivo, 'trozos' | 'bytes'>): boolean {
  return archivo.trozos === 0 && archivo.bytes > 0;
}

/** Rutas por petición DELETE de Storage. */
export const BORRADO_POR_LOTE = 500;

/** Subidas directas: subidas/<uuid>. */
const PATRON_SUBIDA = /^subidas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function esRutaSubida(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && PATRON_SUBIDA.test(ruta);
}

export class ErrorStorage extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = 'ErrorStorage';
  }
}

function codificarRuta(ruta: string): string {
  return ruta.split('/').map(encodeURIComponent).join('/');
}

async function errorDe(respuesta: Response, accion: string): Promise<ErrorStorage> {
  let detalle = '';
  try {
    const texto = await respuesta.text();
    try {
      const datos = JSON.parse(texto) as { message?: unknown; error?: unknown };
      detalle = String(datos.message ?? datos.error ?? texto);
    } catch {
      detalle = texto;
    }
  } catch {
    // sin cuerpo
  }
  return new ErrorStorage(
    `Supabase Storage no pudo ${accion} (${respuesta.status}${detalle ? `: ${detalle.slice(0, 200)}` : ''}).`,
    respuesta.status,
  );
}

/** Cliente mínimo de la API REST de Supabase Storage (solo servidor: usa la clave secreta). */
export class ClienteStorage {
  constructor(
    private readonly opciones: OpcionesSupabase,
    private readonly pedir: typeof fetch = (entrada, init) => fetch(entrada, init),
  ) {}

  get bucket(): string {
    return this.opciones.bucket;
  }

  /**
   * Las claves nuevas (sb_secret_...) van solo en apikey: el gateway de
   * Supabase arma la autorización a partir de ella, y un Authorization con
   * una clave que no es JWT se rechaza. Las claves antiguas (JWT
   * service_role, eyJ...) van también en Authorization.
   */
  private cabeceras(extra: Record<string, string> = {}): Record<string, string> {
    const clave = this.opciones.clave;
    return {
      apikey: clave,
      ...(clave.startsWith('eyJ') ? { Authorization: `Bearer ${clave}` } : {}),
      ...extra,
    };
  }

  private url(ruta: string): string {
    return `${this.opciones.url}/storage/v1${ruta}`;
  }

  private objeto(ruta: string): string {
    return `/object/${encodeURIComponent(this.opciones.bucket)}/${codificarRuta(ruta)}`;
  }

  /** URL pública (bucket público). Con `descarga`, Storage la envía como adjunto con ese nombre. */
  urlPublica(ruta: string, descarga?: string): string {
    const base = this.url(
      `/object/public/${encodeURIComponent(this.opciones.bucket)}/${codificarRuta(ruta)}`,
    );
    return descarga ? `${base}?download=${encodeURIComponent(descarga)}` : base;
  }

  /**
   * Sube (o reemplaza) un objeto. Por defecto con upsert y caché de un año: los
   * objetos del repositorio no cambian nunca (su ruta lleva el id y el
   * sha256). Las evidencias del PAI se suben sin upsert y sin caché.
   */
  async subir(
    ruta: string,
    datos: Buffer,
    tipo: string,
    { upsert = true, cacheControl = 'max-age=31536000' }: { upsert?: boolean; cacheControl?: string } = {},
  ): Promise<void> {
    const respuesta = await this.pedir(this.url(this.objeto(ruta)), {
      method: 'POST',
      headers: this.cabeceras({
        'Content-Type': tipo,
        'x-upsert': upsert ? 'true' : 'false',
        'cache-control': cacheControl,
      }),
      // (Buffer es un Uint8Array; los tipos de fetch piden ArrayBuffer puro.)
      body: datos as unknown as Uint8Array<ArrayBuffer>,
    });
    if (!respuesta.ok) throw await errorDe(respuesta, `subir ${ruta}`);
    await respuesta.body?.cancel();
  }

  /** GET del objeto (con `rango`, 206). Devuelve la respuesta para leerla como flujo. */
  async descargar(ruta: string, rango?: { inicio: number; fin: number }): Promise<Response> {
    const respuesta = await this.pedir(this.url(this.objeto(ruta)), {
      headers: this.cabeceras(rango ? { Range: `bytes=${rango.inicio}-${rango.fin}` } : {}),
    });
    if (respuesta.status !== 200 && respuesta.status !== 206) {
      throw await errorDe(respuesta, `leer ${ruta}`);
    }
    return respuesta;
  }

  /**
   * Borra objetos, en lotes de BORRADO_POR_LOTE rutas por petición (Storage
   * no acepta un DELETE masivo de cualquier tamaño: una recolección con
   * mucho atraso fallaría siempre si fuera de una vez).
   */
  async borrar(rutas: readonly string[]): Promise<void> {
    for (let i = 0; i < rutas.length; i += BORRADO_POR_LOTE) {
      const respuesta = await this.pedir(
        this.url(`/object/${encodeURIComponent(this.opciones.bucket)}`),
        {
          method: 'DELETE',
          headers: this.cabeceras({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prefixes: rutas.slice(i, i + BORRADO_POR_LOTE) }),
        },
      );
      if (!respuesta.ok) throw await errorDe(respuesta, 'borrar archivos');
      await respuesta.body?.cancel();
    }
  }

  /** Datos del bucket (con la clave de servicio): ¿es público? */
  async leerBucket(): Promise<{ publico: boolean }> {
    const respuesta = await this.pedir(
      this.url(`/bucket/${encodeURIComponent(this.opciones.bucket)}`),
      { headers: this.cabeceras() },
    );
    if (!respuesta.ok) throw await errorDe(respuesta, `leer el bucket ${this.opciones.bucket}`);
    const { public: publico } = (await respuesta.json()) as { public?: unknown };
    return { publico: publico === true };
  }

  /** URL firmada para subir un objeto con PUT desde el navegador (vale unas 2 horas). */
  async firmarSubida(ruta: string): Promise<string> {
    const respuesta = await this.pedir(
      this.url(`/object/upload/sign/${encodeURIComponent(this.opciones.bucket)}/${codificarRuta(ruta)}`),
      { method: 'POST', headers: this.cabeceras({ 'Content-Type': 'application/json' }), body: '{}' },
    );
    if (!respuesta.ok) throw await errorDe(respuesta, 'preparar la subida');
    const { url } = (await respuesta.json()) as { url?: unknown };
    if (typeof url !== 'string' || !url.startsWith('/')) {
      throw new ErrorStorage('Supabase Storage no devolvió la URL firmada.', 502);
    }
    return this.url(url);
  }

  /**
   * URL firmada para LEER un objeto (bucket privado) durante `segundos`. Con
   * `descarga`, Storage lo entrega como adjunto con ese nombre (?download=).
   * Quien la tiene puede leer el objeto hasta que venza: generarla solo
   * después de comprobar los permisos.
   */
  async firmarDescarga(ruta: string, segundos: number, descarga?: string): Promise<string> {
    const respuesta = await this.pedir(
      this.url(`/object/sign/${encodeURIComponent(this.opciones.bucket)}/${codificarRuta(ruta)}`),
      {
        method: 'POST',
        headers: this.cabeceras({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: segundos }),
      },
    );
    if (!respuesta.ok) throw await errorDe(respuesta, `firmar la descarga de ${ruta}`);
    const { signedURL } = (await respuesta.json()) as { signedURL?: unknown };
    if (typeof signedURL !== 'string' || !signedURL.startsWith('/')) {
      throw new ErrorStorage('Supabase Storage no devolvió la URL firmada de descarga.', 502);
    }
    const url = this.url(signedURL);
    if (descarga === undefined) return url;
    return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(descarga)}`;
  }

  /** Nombres de los objetos bajo `prefijo` (carpeta), de a 1000. */
  async listar(prefijo: string): Promise<string[]> {
    return (await this.listarObjetos(prefijo)).map(({ ruta }) => ruta);
  }

  /** Objetos bajo `prefijo` (carpeta) con su fecha de creación (null si Storage no la da). */
  async listarObjetos(prefijo: string): Promise<Array<{ ruta: string; creadoEn: Date | null }>> {
    const objetos: Array<{ ruta: string; creadoEn: Date | null }> = [];
    for (let desde = 0; ; desde += 1000) {
      const respuesta = await this.pedir(
        this.url(`/object/list/${encodeURIComponent(this.opciones.bucket)}`),
        {
          method: 'POST',
          headers: this.cabeceras({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: desde }),
        },
      );
      if (!respuesta.ok) throw await errorDe(respuesta, `listar ${prefijo}`);
      const lote = (await respuesta.json()) as Array<{ name?: unknown; id?: unknown; created_at?: unknown }>;
      // Las "carpetas" vienen sin id.
      for (const { name, id, created_at: creado } of lote) {
        if (typeof name !== 'string' || !id) continue;
        const fecha = typeof creado === 'string' ? new Date(creado) : null;
        objetos.push({
          ruta: `${prefijo}/${name}`,
          creadoEn: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
        });
      }
      if (lote.length < 1000) return objetos;
    }
  }
}

/** Un error de red o un 5xx de Storage es "no disponible" (503 con reintento), no un 500. */
export function traducirFallo(error: unknown): unknown {
  if (error instanceof ErrorStorage) {
    return error.estado >= 500 || error.estado === 429 ? noDisponible(10) : error;
  }
  if (error instanceof TypeError) return noDisponible(10); // fetch: sin red, DNS, TLS
  return error;
}

export class AlmacenArchivosSupabase implements AlmacenArchivos {
  readonly storage: ClienteStorage;
  private readonly enBase: AlmacenArchivosBd;
  /**
   * Objetos públicos por id de ficha: se borran del bucket cuando la
   * transacción ya terminó y solo si la ficha ya no existe (si la
   * transacción se deshizo, la ficha sigue y el objeto se queda).
   */
  private readonly porBorrar = new Map<number, string>();
  private temporizador: NodeJS.Timeout | null = null;
  private readonly registro = new Logger('Repositorio');

  constructor(
    private readonly bd: BaseDatosRepositorio,
    opciones: OpcionesSupabase,
    storage?: ClienteStorage,
  ) {
    this.storage = storage ?? new ClienteStorage(opciones);
    this.enBase = new AlmacenArchivosBd(bd);
  }

  async guardar(
    conexion: Conexion,
    origen: OrigenArchivo,
    meta: { mime: string; ancho?: number | null; alto?: number | null },
    resumenPrevio?: Resumen,
  ): Promise<ArchivoGuardado> {
    // Los archivos llegan de una subida ya validada (hasta 80 MB): se suben
    // de una vez, con su sha256 calculado sobre los mismos bytes.
    const datos = 'datos' in origen ? origen.datos : await readFile(origen.ruta);
    const resumen = resumenBuffer(datos);
    if (resumenPrevio && (resumenPrevio.sha256 !== resumen.sha256 || resumenPrevio.bytes !== resumen.bytes)) {
      throw new Error('El archivo cambió mientras se guardaba.');
    }
    // FOR SHARE: impide que otra transacción la borre por huérfana antes de
    // que este documento la referencie.
    const [existentes] = await conexion.query<FilaArchivo[]>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${ALMACEN_REPOSITORIO.archivos} WHERE sha256 = ? FOR SHARE`,
      [resumen.sha256],
    );
    if (existentes[0]) return { ...aReferencia(existentes[0]), nuevo: false };

    const creadoEn = new Date();
    let id: number;
    try {
      const [resultado] = await conexion.query<ResultSetHeader>(
        `INSERT INTO ${ALMACEN_REPOSITORIO.archivos} (sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          resumen.sha256,
          meta.mime,
          resumen.bytes,
          TAMANO_TROZO,
          meta.ancho ?? null,
          meta.alto ?? null,
          creadoEn,
        ],
      );
      id = resultado.insertId;
    } catch (error) {
      if (esDuplicado(error, ALMACEN_REPOSITORIO.unicoSha256)) throw new ErrorReintentar(error);
      throw error;
    }
    const referencia: ReferenciaArchivo = {
      id,
      sha256: resumen.sha256,
      mime: meta.mime,
      bytes: resumen.bytes,
      trozos: 0,
      tamanoTrozo: TAMANO_TROZO,
      creadoEn,
    };
    // Dentro de la transacción: si después algo falla, queda un objeto sin
    // ficha, que recolectarHuerfanos borra.
    try {
      await this.storage.subir(rutaObjeto(referencia), datos, meta.mime);
    } catch (error) {
      throw traducirFallo(error);
    }
    return { ...referencia, nuevo: true };
  }

  buscarPorSha256(sha256: string): Promise<ReferenciaArchivo | null> {
    return this.enBase.buscarPorSha256(sha256);
  }

  urlPublica(archivo: ReferenciaArchivo, opciones: { descarga?: string } = {}): string | null {
    return estaEnStorage(archivo) ? this.storage.urlPublica(rutaObjeto(archivo), opciones.descarga) : null;
  }

  async abrirFlujo(
    archivo: ReferenciaArchivo,
    inicio = 0,
    fin = archivo.bytes - 1,
  ): Promise<Readable> {
    if (!estaEnStorage(archivo)) return this.enBase.abrirFlujo(archivo, inicio, fin);
    if (fin < inicio) return Readable.from([]);
    const completo = inicio === 0 && fin === archivo.bytes - 1;
    let respuesta: Response;
    try {
      respuesta = await this.storage.descargar(
        rutaObjeto(archivo),
        completo ? undefined : { inicio, fin },
      );
    } catch (error) {
      throw traducirFallo(error);
    }
    if (!respuesta.body) return Readable.from([]);
    const flujo = Readable.fromWeb(respuesta.body as unknown as ReadableStreamWeb<Uint8Array>);
    if (completo || respuesta.status === 206) return flujo;
    // Storage ignoró el rango (200): se recorta aquí.
    return Readable.from(recortar(flujo, inicio, fin));
  }

  flujo(archivo: ReferenciaArchivo, inicio = 0, fin = archivo.bytes - 1): Readable {
    if (!estaEnStorage(archivo)) return this.enBase.flujo(archivo, inicio, fin);
    const abrir = () => this.abrirFlujo(archivo, inicio, fin);
    return Readable.from(
      (async function* () {
        for await (const parte of await abrir()) yield parte as Buffer;
      })(),
    );
  }

  async leerCompleto(archivo: ReferenciaArchivo): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const parte of await this.abrirFlujo(archivo)) partes.push(Buffer.from(parte as Uint8Array));
    return Buffer.concat(partes);
  }

  /** Borra las fichas huérfanas de `ids` y agenda el borrado de su objeto público. */
  async recolectar(
    conexion: Conexion,
    ids: ReadonlyArray<number | null | undefined>,
  ): Promise<number> {
    const borradas = await borrarFichasHuerfanas(conexion, ALMACEN_REPOSITORIO, ids);
    for (const ficha of borradas) {
      if (estaEnStorage(ficha)) this.porBorrar.set(ficha.id, rutaObjeto(ficha));
    }
    if (this.porBorrar.size > 0) this.programarBorrado();
    return borradas.length;
  }

  /**
   * Borra ya (sin esperar al temporizador) los objetos públicos agendados por
   * recolectar: para las CLI, que terminan antes de que el temporizador
   * corra, y para quien necesite que el borrado haya terminado.
   */
  vaciarPendientes(): Promise<void> {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    return this.borrarPendientes();
  }

  /**
   * Fichas huérfanas (como en la base) y, además, objetos del bucket que no
   * tienen ficha (subidas a medias, borrados que no alcanzaron a terminar).
   */
  async recolectarHuerfanos(): Promise<{ archivos: number }> {
    let archivos = 0;
    for (const id of await idsHuerfanos(this.bd, ALMACEN_REPOSITORIO)) {
      archivos += await this.bd.transaccion((conexion) => this.recolectar(conexion, [id]));
    }
    await this.vaciarPendientes();
    const fichas = new Set(
      (await this.bd.filas<FilaArchivo>(`SELECT ${COLUMNAS_ARCHIVO} FROM ${ALMACEN_REPOSITORIO.archivos}`)).map(
        (fila) => rutaObjeto(aReferencia(fila)),
      ),
    );
    try {
      const sobrantes = (await this.storage.listar('archivos')).filter((ruta) => !fichas.has(ruta));
      await this.storage.borrar(sobrantes);
    } catch (error) {
      throw traducirFallo(error);
    }
    return { archivos };
  }

  /** Lugar en el bucket para una subida directa desde la administración. */
  async crearSubida(): Promise<{ ruta: string; url: string }> {
    const ruta = `subidas/${randomUUID()}`;
    try {
      return { ruta, url: await this.storage.firmarSubida(ruta) };
    } catch (error) {
      throw traducirFallo(error);
    }
  }

  /** Trae una subida directa a `destino` (disco) para validarla; devuelve sus bytes. */
  traerSubida(ruta: string, destino: string, maxBytes: number): Promise<number> {
    return traerObjeto(this.storage, ruta, destino, maxBytes);
  }

  async borrarSubida(ruta: string): Promise<void> {
    await this.storage.borrar([ruta]).catch((error: unknown) => {
      this.registro.warn(
        `No se pudo borrar la subida temporal ${ruta}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Los objetos de las fichas borradas se quitan del bucket un momento
   * después, cuando la transacción ya terminó: si se deshizo, la ficha sigue
   * existiendo y su objeto se queda.
   */
  private programarBorrado(): void {
    if (this.temporizador) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.borrarPendientes();
    }, 2000);
    this.temporizador.unref();
  }

  private async borrarPendientes(): Promise<void> {
    const pendientes = [...this.porBorrar];
    this.porBorrar.clear();
    const confirmadas: string[] = [];
    for (const [id, ruta] of pendientes) {
      try {
        const filas = await this.bd.filas(`SELECT 1 AS hay FROM ${ALMACEN_REPOSITORIO.archivos} WHERE id = ?`, [id]);
        if (filas.length === 0) confirmadas.push(ruta);
      } catch (error) {
        // Sin base o sin Storage ahora: queda para recolectarHuerfanos.
        this.registro.warn(
          `No se pudo revisar el objeto ${ruta} del bucket: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }
    await this.storage.borrar(confirmadas).catch((error: unknown) => {
      this.registro.warn(
        `No se pudieron borrar ${confirmadas.length} archivos del bucket: ${
          error instanceof Error ? error.message : String(error)
        }. Los quitará npm run repositorio:importar (recolección de huérfanos).`,
      );
    });
  }
}

/**
 * Trae un objeto del bucket de `storage` a `destino` (disco), cortando si
 * pasa de `maxBytes` (ErrorStorage 413, sin dejar el archivo a medias), y
 * devuelve sus bytes. Lo usan las subidas directas del repositorio y del PAI.
 */
export async function traerObjeto(
  storage: ClienteStorage,
  ruta: string,
  destino: string,
  maxBytes: number,
): Promise<number> {
  let respuesta: Response;
  try {
    respuesta = await storage.descargar(ruta);
  } catch (error) {
    throw traducirFallo(error);
  }
  if (!respuesta.body) return 0;
  let bytes = 0;
  const flujo = Readable.fromWeb(respuesta.body as unknown as ReadableStreamWeb<Uint8Array>);
  flujo.on('data', (parte: Buffer) => {
    bytes += parte.length;
    if (bytes > maxBytes) flujo.destroy(new ErrorStorage('El archivo supera el tamaño máximo.', 413));
  });
  try {
    await pipeline(flujo, createWriteStream(destino));
  } catch (error) {
    await rm(destino, { force: true });
    throw error;
  }
  return bytes;
}

/** Los bytes [inicio, fin] de un flujo que trae el archivo completo. */
async function* recortar(flujo: Readable, inicio: number, fin: number): AsyncGenerator<Buffer> {
  let posicion = 0;
  for await (const parte of flujo) {
    const buffer = Buffer.from(parte as Uint8Array);
    const desde = Math.max(0, inicio - posicion);
    const hasta = Math.min(buffer.length, fin - posicion + 1);
    if (hasta > desde) yield buffer.subarray(desde, hasta);
    posicion += buffer.length;
    if (posicion > fin) {
      flujo.destroy();
      return;
    }
  }
}
