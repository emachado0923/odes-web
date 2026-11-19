import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import type { NumeroBimestre } from '../api-pai.js';
import { demasiadosIntentos, noDisponible, solicitudInvalida } from '../errores-pai.js';
import {
  type AlmacenArchivos,
  AlmacenArchivosBd,
  aReferencia,
  borrarFichasHuerfanas,
  COLUMNAS_ARCHIVO,
  type FilaArchivo,
  type ReferenciaArchivo,
  type Resumen,
  resumenBuffer,
  type TablasAlmacen,
} from '../../repositorio/archivos/almacen-archivos.js';
import {
  ClienteStorage,
  ErrorStorage,
  traducirFallo,
  traerObjeto,
} from '../../repositorio/archivos/almacen-supabase.js';
import {
  armarSubida,
  esRutaPartes,
  guardarParte,
  leerCuerpoBinario,
  numeroDeParte,
  rutaPartesNueva,
  TAMANO_PARTE,
} from '../../repositorio/archivos/subidas-por-partes.js';
import { extensionDeMime } from '../../repositorio/archivos/tipos-archivo.js';
import {
  type BaseDatosRepositorio,
  type Conexion,
  ErrorReintentar,
  TAMANO_TROZO,
} from '../../repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import type { ConfiguracionPai } from '../configuracion-pai.js';

/**
 * Almacenamiento PRIVADO de las evidencias del PAI, sobre el almacén propio
 * del PAI (ALMACEN_PAI: pai_almacen_archivos y pai_almacen_archivo_trozos,
 * aparte del del repositorio; una ficha por contenido, dedup por sha256):
 *
 * - Con Supabase Storage (configuración del repositorio): el contenido va al
 *   bucket PRIVADO del PAI (ConfiguracionPai.bucketEvidencias, nunca el
 *   público del repositorio), un objeto por evidencia en
 *   evidencias/<uuid>.<ext> (pai_evidencias.ruta_privada). La ficha de
 *   pai_almacen_archivos se reutiliza si ya existe o se crea sin trozos
 *   (trozos = 0: el contenido está en el bucket). Las
 *   descargas son URL firmadas de ConfiguracionPai.segundosUrlFirmada
 *   segundos que el servicio genera solo después de comprobar los permisos.
 *   Subida directa desde el navegador: URL firmada de subida al mismo bucket
 *   privado (subidas/<uuid>); el servidor trae el objeto, valida el tipo real
 *   y el tamaño, lo guarda como evidencia y borra el temporal. Cada subida
 *   pendiente queda en pai_subidas, ligada a quien la pidió, al indicador y
 *   al bimestre: a lo sumo MAX_SUBIDAS_PENDIENTES por usuario (429), nadie
 *   usa la de otro, y cada petición de subida purga primero las vencidas
 *   (objeto y fila), sin temporizadores. Antes de subir o firmar se comprueba
 *   (una vez por instancia) que el bucket sea privado; si es público, 503 y
 *   un error claro en el registro del servidor.
 * - Sin Supabase: trozos en la base (pai_almacen_archivo_trozos,
 *   AlmacenArchivosBd con ALMACEN_PAI), que el servicio envía con streaming
 *   después de comprobar los permisos (ruta_privada NULL). Una evidencia de
 *   más de una parte (TAMANO_PARTE) se sube por partes: la fila de pai_subidas
 *   lleva la ruta partes/<uuid> y el tamaño total, y las partes van en
 *   pai_subida_partes hasta que el servidor arma el archivo (ver
 *   repositorio/archivos/subidas-por-partes.ts). El dueño, el cupo y el
 *   vencimiento son los mismos de las subidas directas.
 *
 * Nada del repositorio toca este almacén ni este bucket. Borrar una evidencia
 * libera su ficha dentro de la transacción y nada más (sin trabajo después de
 * responder); las fichas sin evidencia que queden (pai:cargar-fichas --forzar)
 * y los objetos privados sin evidencia (un borrado que falló, una subida que
 * no terminó) los quitan recolectarFichasHuerfanas y recolectarHuerfanos
 * (npm run pai:recolectar-evidencias).
 */

/** Almacén de archivos del PAI: las fichas de las evidencias. */
export const ALMACEN_PAI: TablasAlmacen = {
  archivos: 'pai_almacen_archivos',
  trozos: 'pai_almacen_archivo_trozos',
  unicoSha256: 'uq_pai_almacen_archivos_sha256',
  usos: [{ tabla: 'pai_evidencias', columna: 'archivo_id' }],
};

/** Carpeta de los objetos de las evidencias en el bucket privado. */
export const PREFIJO_EVIDENCIAS = 'evidencias';
/** Carpeta de las subidas directas (temporales) en el bucket privado. */
export const PREFIJO_SUBIDAS = 'subidas';
/** Las evidencias no se guardan en ninguna caché (ni el navegador ni intermediarios). */
export const CACHE_EVIDENCIA = 'private, no-store';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATRON_RUTA_PRIVADA = new RegExp(
  `^${PREFIJO_EVIDENCIAS}/${UUID}\\.[a-z0-9]{1,5}$`,
);
const PATRON_SUBIDA = new RegExp(`^${PREFIJO_SUBIDAS}/${UUID}$`);

/** Ruta nueva (imposible de adivinar) del objeto de una evidencia. */
export function rutaPrivadaNueva(mime: string): string {
  return `${PREFIJO_EVIDENCIAS}/${randomUUID()}.${extensionDeMime(mime)}`;
}

export function esRutaPrivada(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && PATRON_RUTA_PRIVADA.test(ruta);
}

/** Subida directa al bucket privado: subidas/<uuid>. */
export function esSubidaEvidencia(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && PATRON_SUBIDA.test(ruta);
}

/** Archivo de una evidencia ya validado (tipo real y tamaño), en disco. */
export interface ArchivoEvidenciaValidado {
  ruta: string;
  /** Tipo MIME detectado por firma (uno de TIPOS_EVIDENCIA). */
  mime: string;
  resumen: Resumen;
}

export interface EvidenciaGuardada {
  archivo: ReferenciaArchivo;
  /** Ruta del objeto en el bucket privado; null si el contenido está en la base. */
  rutaPrivada: string | null;
}

/** Márgenes de recolectarHuerfanos (milisegundos). */
export interface OpcionesRecoleccionEvidencias {
  ahora?: Date;
  /** Antigüedad mínima de un objeto de evidencias/ sin fila para borrarlo (1 hora). */
  margenEvidenciasMs?: number;
  /**
   * Antigüedad mínima de un objeto de subidas/ SIN fila en pai_subidas para
   * borrarlo (VIGENCIA_SUBIDA_MS). Las subidas con fila se purgan al vencer.
   */
  margenSubidasMs?: number;
}

/** Quién puede usar una subida directa: el usuario, el indicador y el bimestre. */
export interface DuenoSubida {
  usuarioId: number;
  indicadorId: number;
  bimestre: NumeroBimestre;
}

/** Subidas directas sin terminar que puede tener un usuario a la vez. */
export const MAX_SUBIDAS_PENDIENTES = 5;
/**
 * Vida de una subida pendiente: la URL firmada de subida de Supabase vale
 * unas 2 horas; después de eso (con margen) nadie puede subir a esa ruta y
 * la fila y el objeto se purgan.
 */
export const VIGENCIA_SUBIDA_MS = 2 * 3_600_000 + 10 * 60_000;
/** Subidas vencidas que purga cada petición de subida (el resto, la siguiente). */
const PURGA_POR_PETICION = 20;

/** Petición con cuerpo binario (una parte de una subida por partes). */
export type CuerpoBinario = Parameters<typeof leerCuerpoBinario>[0];

export interface AlmacenEvidenciasPai {
  /** ¿Las subidas van directo al bucket privado (RespuestaSubidaPai.directa)? */
  readonly directa: boolean;
  /** ¿Las evidencias de más de una parte se suben por partes a la base (sin Supabase)? */
  readonly porPartes: boolean;
  /** Fichas y trozos en la base: para enviar las evidencias con ruta_privada NULL. */
  readonly enBase: AlmacenArchivos;
  /**
   * FUERA de la transacción: sube el contenido al bucket privado y devuelve
   * su ruta (null sin Supabase: el contenido irá en la base, en guardarFicha).
   */
  subirContenido(archivo: ArchivoEvidenciaValidado): Promise<string | null>;
  /**
   * DENTRO de la transacción: la ficha de pai_almacen_archivos (la reutiliza
   * si el contenido ya existe; sin Supabase, guarda también los trozos).
   */
  guardarFicha(
    conexion: Conexion,
    archivo: ArchivoEvidenciaValidado,
  ): Promise<ReferenciaArchivo>;
  /**
   * DENTRO de la transacción, después de borrar la fila de pai_evidencias:
   * borra la ficha (y sus trozos) si ya no la usa ninguna evidencia.
   */
  liberarFicha(conexion: Conexion, archivoId: number): Promise<void>;
  /** Fichas de pai_almacen_archivos que ninguna evidencia usa (CLI y mantenimiento). */
  recolectarFichasHuerfanas(): Promise<{ archivos: number }>;
  /** DESPUÉS de la transacción: borra objetos del bucket privado (nunca lanza; avisa). */
  borrarContenido(rutas: ReadonlyArray<string | null>): Promise<void>;
  /** URL firmada de corta duración para descargar con el nombre original; null sin Supabase. */
  urlDescarga(rutaPrivada: string, nombre: string): Promise<string | null>;
  /**
   * Lugar en el bucket privado para una subida directa de `dueno` (solo con
   * `directa`): purga las vencidas, comprueba el cupo del usuario (429 si
   * tiene MAX_SUBIDAS_PENDIENTES), la anota en pai_subidas y la firma.
   */
  crearSubida(
    dueno: DuenoSubida,
    ahora?: Date,
  ): Promise<{ ruta: string; url: string }>;
  /**
   * Empieza una subida por partes de `bytes` bytes (solo con `porPartes`):
   * purga las vencidas, comprueba el cupo del usuario (429) y la anota en
   * pai_subidas. Devuelve su ruta (partes/<uuid>).
   */
  crearSubidaPorPartes(dueno: DuenoSubida, bytes: number, ahora?: Date): Promise<string>;
  /**
   * Guarda la parte `numero` (texto de la URL) de la subida por partes `ruta`
   * del usuario, leyendo el cuerpo binario de `req`. ErrorSubidaPartes si la
   * parte no corresponde; 400 si la subida no es suya o venció.
   */
  guardarParte(ruta: string, usuarioId: number, numero: string, req: CuerpoBinario): Promise<void>;
  /** ¿`ruta` es una subida pendiente (directa o por partes) de ese usuario, indicador y bimestre? */
  esSubidaDe(ruta: string, dueno: DuenoSubida): Promise<boolean>;
  /**
   * Trae una subida directa (del bucket) o arma una por partes (desde la
   * base) en `destino` (disco), con tope `maxBytes` (ErrorStorage 413 o
   * ErrorSubidaPartes).
   */
  traerSubida(ruta: string, destino: string, maxBytes: number): Promise<number>;
  /** Borra una subida: el objeto o las partes, y su fila (nunca lanza; avisa). */
  borrarSubida(ruta: string): Promise<void>;
  /** Objetos del bucket privado sin evidencia y subidas directas viejas (CLI y mantenimiento). */
  recolectarHuerfanos(
    opciones?: OpcionesRecoleccionEvidencias,
  ): Promise<{ objetos: number; subidas: number }>;
}

const UNA_HORA_MS = 3_600_000;

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Anota una subida pendiente de `dueno` en pai_subidas (directa o por partes),
 * con el cupo de MAX_SUBIDAS_PENDIENTES por usuario (429).
 */
async function reservarSubida(
  bd: BaseDatosRepositorio,
  dueno: DuenoSubida,
  ruta: string,
  ahora: Date,
  bytes: number | null,
): Promise<void> {
  await bd.transaccion(async (conexion) => {
    // Serializa las subidas de un mismo usuario: el cupo no se pasa con
    // peticiones simultáneas.
    await conexion.query('SELECT id FROM pai_usuarios WHERE id = ? FOR UPDATE', [dueno.usuarioId]);
    const [conteo] = await conexion.query<(RowDataPacket & { n: number; primera: Date | string | null })[]>(
      'SELECT COUNT(*) AS n, MIN(creado_en) AS primera FROM pai_subidas WHERE usuario_id = ? AND creado_en > ?',
      [dueno.usuarioId, new Date(ahora.getTime() - VIGENCIA_SUBIDA_MS)],
    );
    if (Number(conteo[0]?.n ?? 0) >= MAX_SUBIDAS_PENDIENTES) {
      const primera = conteo[0]?.primera ? new Date(conteo[0].primera).getTime() : ahora.getTime();
      const segundos = Math.max(60, Math.ceil((primera + VIGENCIA_SUBIDA_MS - ahora.getTime()) / 1000));
      throw demasiadosIntentos(
        segundos,
        `Tiene ${MAX_SUBIDAS_PENDIENTES} subidas de evidencias sin terminar. Espere a que terminen (o unos minutos, si se interrumpieron) antes de subir otra.`,
      );
    }
    await conexion.query(
      'INSERT INTO pai_subidas (ruta, usuario_id, indicador_id, bimestre, bytes, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
      [ruta, dueno.usuarioId, dueno.indicadorId, dueno.bimestre, bytes, ahora],
    );
  });
}

/** ¿`ruta` es una subida pendiente de ese usuario, indicador y bimestre? */
async function esSubidaPendiente(bd: BaseDatosRepositorio, ruta: string, dueno: DuenoSubida): Promise<boolean> {
  const filas = await bd.filas<RowDataPacket>(
    'SELECT id FROM pai_subidas WHERE ruta = ? AND usuario_id = ? AND indicador_id = ? AND bimestre = ?',
    [ruta, dueno.usuarioId, dueno.indicadorId, dueno.bimestre],
  );
  return filas.length > 0;
}

/** Evidencias en la base (instalación con MySQL de la entidad, o Postgres sin Storage). */
class AlmacenEvidenciasBd implements AlmacenEvidenciasPai {
  readonly directa = false;
  readonly porPartes = true;
  readonly enBase: AlmacenArchivosBd;
  private readonly archivos: AlmacenArchivos;
  private readonly registro = new Logger('PAI');

  constructor(private readonly bd: BaseDatosRepositorio) {
    this.enBase = new AlmacenArchivosBd(bd, ALMACEN_PAI);
    this.archivos = this.enBase;
  }

  async crearSubidaPorPartes(dueno: DuenoSubida, bytes: number, ahora = new Date()): Promise<string> {
    await this.purgarVencidas(ahora);
    const ruta = rutaPartesNueva();
    await reservarSubida(this.bd, dueno, ruta, ahora, bytes);
    return ruta;
  }

  async guardarParte(ruta: string, usuarioId: number, numero: string, req: CuerpoBinario): Promise<void> {
    const subida = await this.subidaPorPartes(ruta, usuarioId);
    const n = numeroDeParte(numero, subida.bytes);
    const datos = await leerCuerpoBinario(req, TAMANO_PARTE);
    await guardarParte(this.bd, 'pai_subida_partes', subida.id, subida.bytes, n, datos);
  }

  async esSubidaDe(ruta: string, dueno: DuenoSubida): Promise<boolean> {
    return esRutaPartes(ruta) && esSubidaPendiente(this.bd, ruta, dueno);
  }

  async traerSubida(ruta: string, destino: string, maxBytes: number): Promise<number> {
    const filas = esRutaPartes(ruta)
      ? await this.bd.filas<RowDataPacket & { id: number; bytes: number | null }>(
          'SELECT id, bytes FROM pai_subidas WHERE ruta = ?',
          [ruta],
        )
      : [];
    const fila = filas[0];
    if (!fila || fila.bytes === null) {
      throw new ErrorStorage('La subida no existe o ya venció.', 404);
    }
    if (Number(fila.bytes) > maxBytes) throw new ErrorStorage('El archivo supera el tamaño máximo.', 413);
    return armarSubida(this.bd, 'pai_subida_partes', Number(fila.id), Number(fila.bytes), destino);
  }

  async borrarSubida(ruta: string): Promise<void> {
    if (!esRutaPartes(ruta)) return;
    // Las partes se van en cascada.
    await this.bd.ejecutar('DELETE FROM pai_subidas WHERE ruta = ?', [ruta]).catch((error: unknown) => {
      this.registro.warn(`No se pudo borrar la subida por partes ${ruta}: ${mensajeDe(error)}`);
    });
  }

  /** La subida por partes `ruta` de ese usuario, vigente, o 400. */
  private async subidaPorPartes(ruta: string, usuarioId: number): Promise<{ id: number; bytes: number }> {
    const filas = esRutaPartes(ruta)
      ? await this.bd.filas<RowDataPacket & { id: number; bytes: number | null; creado_en: Date }>(
          'SELECT id, bytes, creado_en FROM pai_subidas WHERE ruta = ? AND usuario_id = ?',
          [ruta, usuarioId],
        )
      : [];
    const fila = filas[0];
    if (!fila || fila.bytes === null || Date.now() - new Date(fila.creado_en).getTime() > VIGENCIA_SUBIDA_MS) {
      throw solicitudInvalida('La subida no es válida o ya venció: vuelva a subir el archivo.', {
        archivo: 'Vuelva a seleccionar el archivo.',
      });
    }
    return { id: Number(fila.id), bytes: Number(fila.bytes) };
  }

  /** Subidas por partes vencidas: se borran con sus partes. Devuelve cuántas. */
  private async purgarVencidas(ahora: Date): Promise<number> {
    const resultado = await this.bd.ejecutar('DELETE FROM pai_subidas WHERE creado_en <= ?', [
      new Date(ahora.getTime() - VIGENCIA_SUBIDA_MS),
    ]);
    return Number(resultado.affectedRows ?? 0);
  }

  subirContenido(): Promise<string | null> {
    return Promise.resolve(null);
  }

  guardarFicha(
    conexion: Conexion,
    archivo: ArchivoEvidenciaValidado,
  ): Promise<ReferenciaArchivo> {
    return this.enBase.guardar(
      conexion,
      { ruta: archivo.ruta },
      { mime: archivo.mime },
      archivo.resumen,
    );
  }

  async liberarFicha(conexion: Conexion, archivoId: number): Promise<void> {
    await this.archivos.recolectar(conexion, [archivoId]);
  }

  recolectarFichasHuerfanas(): Promise<{ archivos: number }> {
    return this.archivos.recolectarHuerfanos();
  }

  borrarContenido(): Promise<void> {
    return Promise.resolve();
  }

  urlDescarga(): Promise<string | null> {
    return Promise.resolve(null);
  }

  crearSubida(): Promise<{ ruta: string; url: string }> {
    return Promise.reject(
      new Error('Sin Supabase Storage las evidencias se suben por multipart o por partes.'),
    );
  }

  /** Sin bucket: solo las subidas por partes vencidas (filas y partes). */
  async recolectarHuerfanos({ ahora = new Date() }: OpcionesRecoleccionEvidencias = {}): Promise<{
    objetos: number;
    subidas: number;
  }> {
    return { objetos: 0, subidas: await this.purgarVencidas(ahora) };
  }
}

/** Evidencias en el bucket privado del PAI en Supabase Storage. */
class AlmacenEvidenciasSupabase implements AlmacenEvidenciasPai {
  readonly directa = true;
  readonly porPartes = false;
  readonly enBase: AlmacenArchivosBd;
  private readonly registro = new Logger('PAI');
  /** Ya se comprobó que el bucket es privado (solo se guarda el resultado bueno). */
  private bucketPrivado = false;

  constructor(
    private readonly bd: BaseDatosRepositorio,
    /** Cliente del bucket PRIVADO del PAI. */
    readonly storage: ClienteStorage,
    private readonly segundosUrlFirmada: number,
  ) {
    this.enBase = new AlmacenArchivosBd(bd, ALMACEN_PAI);
  }

  /**
   * El diseño exige un bucket privado: si alguien lo creó como público (o
   * PAI_SUPABASE_BUCKET apunta a uno público), las evidencias quedarían
   * descargables sin pasar por los permisos. Se pregunta a Storage en el
   * primer uso, dentro de la petición, y se recuerda solo si es privado
   * (corregido el bucket, la siguiente petición vuelve a funcionar).
   */
  private async exigirBucketPrivado(): Promise<void> {
    if (this.bucketPrivado) return;
    let publico: boolean;
    try {
      ({ publico } = await this.storage.leerBucket());
    } catch (error) {
      if (error instanceof ErrorStorage && error.estado < 500) {
        this.registro.error(
          `No se pudo leer el bucket ${this.storage.bucket} de las evidencias del PAI (${error.message}). ` +
            '¿Existe? Créelo como bucket PRIVADO (README, sección PAI, paso a paso de Supabase).',
        );
        throw noDisponible(60);
      }
      throw traducirFallo(error);
    }
    if (publico) {
      this.registro.error(
        `El bucket ${this.storage.bucket} de las evidencias del PAI es PÚBLICO: no se suben ni se firman evidencias hasta ` +
          `que sea privado (Supabase > Storage > ${this.storage.bucket} > Edit bucket > desmarcar "Public bucket", o ` +
          `update storage.buckets set public = false where id = '${this.storage.bucket}';).`,
      );
      throw noDisponible(60);
    }
    this.bucketPrivado = true;
  }

  async subirContenido(archivo: ArchivoEvidenciaValidado): Promise<string> {
    // Hasta 25 MB: se sube de una vez, comprobando que son los bytes validados.
    const datos = await readFile(archivo.ruta);
    const resumen = resumenBuffer(datos);
    if (
      resumen.sha256 !== archivo.resumen.sha256 ||
      resumen.bytes !== archivo.resumen.bytes
    ) {
      throw new Error(
        'El archivo de la evidencia cambió mientras se guardaba.',
      );
    }
    await this.exigirBucketPrivado();
    const ruta = rutaPrivadaNueva(archivo.mime);
    try {
      await this.storage.subir(ruta, datos, archivo.mime, {
        upsert: false,
        cacheControl: CACHE_EVIDENCIA,
      });
    } catch (error) {
      throw traducirFallo(error);
    }
    return ruta;
  }

  /**
   * Ficha sin trozos: trozos = 0 (el contenido está en ruta_privada).
   * FOR SHARE: nadie la borra por huérfana antes de que la evidencia la
   * referencie (ver borrarFichasHuerfanas).
   */
  async guardarFicha(
    conexion: Conexion,
    archivo: ArchivoEvidenciaValidado,
  ): Promise<ReferenciaArchivo> {
    const [existentes] = await conexion.query<FilaArchivo[]>(
      `SELECT ${COLUMNAS_ARCHIVO} FROM ${ALMACEN_PAI.archivos} WHERE sha256 = ? FOR SHARE`,
      [archivo.resumen.sha256],
    );
    if (existentes[0]) return aReferencia(existentes[0]);
    const creadoEn = new Date();
    try {
      const [resultado] = await conexion.query<ResultadoEscritura>(
        `INSERT INTO ${ALMACEN_PAI.archivos} (sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en)
         VALUES (?, ?, ?, 0, ?, NULL, NULL, ?)`,
        [
          archivo.resumen.sha256,
          archivo.mime,
          archivo.resumen.bytes,
          TAMANO_TROZO,
          creadoEn,
        ],
      );
      return {
        id: Number(resultado.insertId),
        sha256: archivo.resumen.sha256,
        mime: archivo.mime,
        bytes: archivo.resumen.bytes,
        trozos: 0,
        tamanoTrozo: TAMANO_TROZO,
        creadoEn,
      };
    } catch (error) {
      // Otro proceso guardó el mismo contenido a la vez: se repite la transacción.
      if (esDuplicado(error, ALMACEN_PAI.unicoSha256))
        throw new ErrorReintentar(error);
      throw error;
    }
  }

  async liberarFicha(conexion: Conexion, archivoId: number): Promise<void> {
    // Solo la ficha (y sus trozos, si los tenía), dentro de la transacción:
    // el objeto privado lo borra borrarContenido después. Nada más queda para
    // después de responder (Vercel congela la función).
    await borrarFichasHuerfanas(conexion, ALMACEN_PAI, [archivoId]);
  }

  recolectarFichasHuerfanas(): Promise<{ archivos: number }> {
    return this.enBase.recolectarHuerfanos();
  }

  async borrarContenido(rutas: ReadonlyArray<string | null>): Promise<void> {
    const validas = rutas.filter(esRutaPrivada);
    if (validas.length === 0) return;
    await this.storage.borrar(validas).catch((error: unknown) => {
      this.registro.warn(
        `No se pudieron borrar ${validas.length} evidencias del bucket privado: ${mensajeDe(error)}. ` +
          'Las quitará la recolección de huérfanos del PAI.',
      );
    });
  }

  async urlDescarga(rutaPrivada: string, nombre: string): Promise<string> {
    await this.exigirBucketPrivado();
    try {
      return await this.storage.firmarDescarga(
        rutaPrivada,
        this.segundosUrlFirmada,
        nombre,
      );
    } catch (error) {
      throw traducirFallo(error);
    }
  }

  async crearSubida(
    dueno: DuenoSubida,
    ahora = new Date(),
  ): Promise<{ ruta: string; url: string }> {
    await this.exigirBucketPrivado();
    await this.purgarSubidasVencidas(ahora, PURGA_POR_PETICION);
    const ruta = `${PREFIJO_SUBIDAS}/${randomUUID()}`;
    await reservarSubida(this.bd, dueno, ruta, ahora, null);
    try {
      return { ruta, url: await this.storage.firmarSubida(ruta) };
    } catch (error) {
      await this.bd
        .ejecutar('DELETE FROM pai_subidas WHERE ruta = ?', [ruta])
        .catch(() => undefined);
      throw traducirFallo(error);
    }
  }

  crearSubidaPorPartes(): Promise<string> {
    return Promise.reject(new Error('Con Supabase Storage las evidencias se suben directo al bucket privado.'));
  }

  guardarParte(): Promise<void> {
    return Promise.reject(new Error('Con Supabase Storage las evidencias se suben directo al bucket privado.'));
  }

  async esSubidaDe(ruta: string, dueno: DuenoSubida): Promise<boolean> {
    return esSubidaEvidencia(ruta) && esSubidaPendiente(this.bd, ruta, dueno);
  }

  /**
   * Subidas pendientes vencidas (sus URL firmadas ya no sirven): borra los
   * objetos y luego las filas (si Storage falla, las filas quedan para la
   * próxima vez). Devuelve cuántas purgó. Nunca lanza.
   */
  private async purgarSubidasVencidas(
    ahora: Date,
    maximo: number,
  ): Promise<number> {
    try {
      const vencidas = await this.bd.filas<
        RowDataPacket & { id: number; ruta: string }
      >(
        `SELECT id, ruta FROM pai_subidas WHERE creado_en <= ? ORDER BY id LIMIT ${maximo}`,
        [new Date(ahora.getTime() - VIGENCIA_SUBIDA_MS)],
      );
      if (vencidas.length === 0) return 0;
      await this.storage.borrar(
        vencidas.map((fila) => fila.ruta).filter(esSubidaEvidencia),
      );
      await this.bd.ejecutar('DELETE FROM pai_subidas WHERE id IN (?)', [
        vencidas.map((fila) => Number(fila.id)),
      ]);
      return vencidas.length;
    } catch (error) {
      this.registro.warn(
        `No se pudieron purgar las subidas de evidencias vencidas: ${mensajeDe(error)}. Se intentará en la próxima subida.`,
      );
      return 0;
    }
  }

  traerSubida(
    ruta: string,
    destino: string,
    maxBytes: number,
  ): Promise<number> {
    return traerObjeto(this.storage, ruta, destino, maxBytes);
  }

  async borrarSubida(ruta: string): Promise<void> {
    if (!esSubidaEvidencia(ruta)) return;
    try {
      await this.storage.borrar([ruta]);
      // Sin objeto, la fila sobra (si el borrado falló, queda y la purga
      // lo reintenta cuando venza).
      await this.bd.ejecutar('DELETE FROM pai_subidas WHERE ruta = ?', [ruta]);
    } catch (error) {
      this.registro.warn(
        `No se pudo borrar la subida temporal ${ruta}: ${mensajeDe(error)}`,
      );
    }
  }

  async recolectarHuerfanos({
    ahora = new Date(),
    margenEvidenciasMs = UNA_HORA_MS,
    margenSubidasMs = VIGENCIA_SUBIDA_MS,
  }: OpcionesRecoleccionEvidencias = {}): Promise<{
    objetos: number;
    subidas: number;
  }> {
    const viejo = (creadoEn: Date | null, margen: number): boolean =>
      creadoEn !== null && ahora.getTime() - creadoEn.getTime() >= margen;
    try {
      // Las subidas pendientes vencidas, todas (objeto y fila).
      let purgadas = 0;
      for (;;) {
        const lote = await this.purgarSubidasVencidas(ahora, 500);
        purgadas += lote;
        if (lote < 500) break;
      }
      // Primero el bucket y después la base: una evidencia (o una subida)
      // que se crea mientras tanto ya está en la base, y su objeto es más
      // nuevo que el margen.
      const objetos = await this.storage.listarObjetos(PREFIJO_EVIDENCIAS);
      const subidas = await this.storage.listarObjetos(PREFIJO_SUBIDAS);
      const usadas = new Set(
        (
          await this.bd.filas<RowDataPacket & { ruta_privada: string }>(
            'SELECT ruta_privada FROM pai_evidencias WHERE ruta_privada IS NOT NULL',
          )
        ).map((fila) => fila.ruta_privada),
      );
      const pendientes = new Set(
        (
          await this.bd.filas<RowDataPacket & { ruta: string }>(
            'SELECT ruta FROM pai_subidas',
          )
        ).map((fila) => fila.ruta),
      );
      const sobrantes = objetos
        .filter(
          ({ ruta, creadoEn }) =>
            !usadas.has(ruta) && viejo(creadoEn, margenEvidenciasMs),
        )
        .map(({ ruta }) => ruta);
      const viejas = subidas
        .filter(
          ({ ruta, creadoEn }) =>
            !pendientes.has(ruta) && viejo(creadoEn, margenSubidasMs),
        )
        .map(({ ruta }) => ruta);
      // ClienteStorage.borrar parte el borrado en lotes.
      await this.storage.borrar([...sobrantes, ...viejas]);
      return { objetos: sobrantes.length, subidas: viejas.length + purgadas };
    } catch (error) {
      throw traducirFallo(error);
    }
  }
}

/**
 * El almacén de evidencias que corresponde a la configuración: bucket privado
 * del PAI si el repositorio tiene Supabase Storage, o trozos en la base.
 * `storage` (pruebas): cliente del bucket privado ya hecho.
 */
export function crearAlmacenEvidencias(
  bd: BaseDatosRepositorio,
  config: ConfiguracionPai,
  storage?: ClienteStorage,
): AlmacenEvidenciasPai {
  const supabase = bd.almacenamiento;
  if (!supabase) return new AlmacenEvidenciasBd(bd);
  if (config.bucketEvidencias === supabase.bucket) {
    // Las evidencias quedarían en el bucket público del repositorio.
    throw new ErrorDeConfiguracion(
      'PAI_SUPABASE_BUCKET debe ser un bucket privado distinto del bucket público del repositorio (REPOSITORIO_SUPABASE_BUCKET).',
    );
  }
  return new AlmacenEvidenciasSupabase(
    bd,
    storage ??
      new ClienteStorage({ ...supabase, bucket: config.bucketEvidencias }),
    config.segundosUrlFirmada,
  );
}
