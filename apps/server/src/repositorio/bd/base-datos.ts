import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import mysql, {
  type Pool,
  type PoolOptions,
  type RowDataPacket,
} from 'mysql2/promise';
import { type CustomTypesConfig, Pool as PoolPg, type PoolConfig, types as tiposPg } from 'pg';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
  type OpcionesMysql,
  type OpcionesPostgres,
  type OpcionesSupabase,
} from '../configuracion-repositorio.js';
import { ErrorRepositorioHttp, noDisponible, ocupado } from '../errores-repositorio.js';
import {
  type Conexion,
  ConexionPostgres,
  consultarPostgres,
  type Dialecto,
  envolverMysql,
  type ResultadoEscritura,
} from './conexion.js';
import {
  describirError,
  esColaLlena,
  esErrorDeConexion,
  esReintentable,
  esTablaInexistente,
} from './errores-bd.js';

export type { Conexion, Dialecto, ResultadoEscritura } from './conexion.js';

/**
 * Versión de db/repositorio/esquema.sql (más migraciones) que necesita este
 * código: 2 = tableros (002), 3 = PAI (003-pai.sql), 4 = nombres de tabla con
 * el prefijo de su módulo (004-nombres-por-modulo.sql), 5 = subidas por partes
 * (005-subidas-por-partes.sql), 6 = descripción de los productos
 * (006-descripcion.sql), 7 = tablero de los fondos de Sapiencia
 * (007-tablero-fondos.sql), 8 = cuentas y sesiones de los tableros privados
 * (008-acceso-tableros.sql), 9 = ventanilla de consulta de los fondos
 * (009-consulta-fondos.sql).
 */
export const VERSION_ESQUEMA_REQUERIDA = 9;

/** Tamaño de cada trozo de archivo en los almacenes (repositorio_ y pai_almacen_archivo_trozos; 1 MiB). */
export const TAMANO_TROZO = 1024 * 1024;

/**
 * Modo SQL fijo en cada conexión: el mismo comportamiento estricto en Cloud
 * SQL (8.0.18) y en la base local de pruebas, sin depender de la
 * configuración de la instancia.
 */
export const MODO_SQL =
  'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

export type EstadoBaseDatos =
  | 'sin_configurar'
  | 'conectando'
  | 'disponible'
  | 'sin_esquema'
  | 'no_disponible';

/** Esperas entre reintentos de conexión (s): 1, 2, 5, 10, 30 y luego cada 60. */
const ESPERAS_REINTENTO_S = [1, 2, 5, 10, 30, 60] as const;

/** Con la cola del pool llena: Retry-After corto y un aviso como mucho cada minuto. */
const REINTENTO_COLA_LLENA_S = 2;
const AVISO_COLA_LLENA_MS = 60_000;

/**
 * Inactividad tras la que pg cierra una conexión del pool (idleTimeoutMillis).
 * En una instancia que se congela, pasado ese plazo el pool se renueva.
 */
const INACTIVIDAD_POOL_MS = 10_000;

/** Opciones de mysql2 a partir de la configuración (también las usan las CLI). */
export function crearOpcionesPool(
  m: OpcionesMysql,
  extra: Partial<PoolOptions> = {},
): PoolOptions {
  let ssl: PoolOptions['ssl'];
  if (m.ssl) {
    ssl = {
      ...(m.ssl.ca ? { ca: m.ssl.ca } : {}),
      ...(m.ssl.cert && m.ssl.key ? { cert: m.ssl.cert, key: m.ssl.key } : {}),
      // requerido: cifra sin verificar el certificado (no recomendado).
      // verificar-ca: verifica la cadena contra la CA, no el nombre del host
      // (el certificado de Cloud SQL no incluye la IP pública).
      rejectUnauthorized: m.ssl.modo !== 'requerido',
      verifyIdentity: m.ssl.modo === 'verificar-identidad',
    };
  }
  return {
    host: m.host,
    port: m.puerto,
    user: m.usuario,
    password: m.contrasena,
    database: m.baseDatos,
    ssl,
    connectionLimit: m.conexiones,
    // maxIdle = connectionLimit: sin el temporizador de mysql2 que cierra las
    // conexiones ociosas cada segundo (no es unref y mantendría vivo un
    // proceso que debe terminar). Las que cierra el servidor (wait_timeout)
    // salen solas del pool.
    maxIdle: m.conexiones,
    queueLimit: 200,
    waitForConnections: true,
    connectTimeout: m.timeoutConexionMs,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    charset: 'UTF8MB4_0900_AI_CI',
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    multipleStatements: false,
    ...extra,
  };
}

/**
 * Prepara cada conexión nueva del pool: UTC y modo SQL estricto. Con
 * `desreferenciar`, su socket no mantiene vivo el proceso (en el servidor lo
 * mantiene el HTTP; así, si el arranque falla, el proceso termina igual).
 */
export function prepararPool(
  pool: Pool,
  registro?: LoggerService,
  { desreferenciar = false }: { desreferenciar?: boolean } = {},
): void {
  // El evento entrega la conexión del núcleo de mysql2 (API con callback),
  // aunque los tipos de mysql2/promise digan otra cosa.
  pool.on('connection', (conexion: unknown) => {
    const nucleo = conexion as {
      query(sql: string, listo: (error: unknown) => void): unknown;
      stream?: { unref?: () => void };
    };
    if (desreferenciar) nucleo.stream?.unref?.();
    nucleo.query(
      `SET time_zone = '+00:00', sql_mode = '${MODO_SQL}'`,
      (error: unknown) => {
        if (error) {
          registro?.warn?.(
            `No se pudo preparar una conexión MySQL: ${describirError(error)}`,
          );
        }
      },
    );
  });
}

/**
 * Tipos de Postgres que pg entrega como texto y el código usa como números,
 * igual que mysql2: BIGINT (ids, bytes, versión, COUNT) y NUMERIC (SUM).
 */
export const TIPOS_POSTGRES: CustomTypesConfig = {
  getTypeParser: ((oid: number, formato?: string) => {
    if (oid === tiposPg.builtins.INT8 || oid === tiposPg.builtins.NUMERIC) {
      return (valor: string) => Number(valor);
    }
    return tiposPg.getTypeParser(oid, formato as 'text');
  }) as CustomTypesConfig['getTypeParser'],
};

/** Opciones de pg a partir de la configuración (también las usan las CLI y las pruebas). */
export function crearOpcionesPoolPostgres(
  p: OpcionesPostgres,
  extra: Partial<PoolConfig> = {},
): PoolConfig {
  let ssl: PoolConfig['ssl'] = false;
  if (p.ssl) {
    ssl = {
      ...(p.ssl.ca ? { ca: p.ssl.ca } : {}),
      ...(p.ssl.cert && p.ssl.key ? { cert: p.ssl.cert, key: p.ssl.key } : {}),
      // requerido: cifra sin verificar el certificado (el pooler de Supabase
      // sin su CA). verificar-ca: la cadena, no el nombre del host.
      rejectUnauthorized: p.ssl.modo !== 'requerido',
      ...(p.ssl.modo === 'verificar-identidad' ? {} : { checkServerIdentity: () => undefined }),
    };
  }
  return {
    connectionString: p.url,
    ssl,
    max: p.conexiones,
    connectionTimeoutMillis: p.timeoutConexionMs,
    idleTimeoutMillis: INACTIVIDAD_POOL_MS,
    keepAlive: true,
    application_name: 'sapiencia-web-repositorio',
    types: TIPOS_POSTGRES,
    ...extra,
  };
}

/** MAX(version) de sistema_esquema_version; 0 si la tabla todavía no existe. */
async function leerVersion(
  consulta: () => Promise<ReadonlyArray<Record<string, unknown>>>,
): Promise<number> {
  try {
    const filas = await consulta();
    return Number(filas[0]?.version ?? 0);
  } catch (error) {
    if (!esTablaInexistente(error)) throw error;
    return 0;
  }
}

/**
 * Pool del repositorio (MySQL o Postgres) con estado de disponibilidad.
 *
 * - Sin configurar: no abre nada, avisa una vez y toda la API responde 503.
 * - Configurada pero inalcanzable (o sin el esquema aplicado): responde 503
 *   de inmediato (sin esperar el timeout en cada petición) y reintenta en
 *   segundo plano con espera creciente. Nunca tumba el proceso.
 * - Cuando vuelve la conexión, avisa una vez y sigue sin reiniciar.
 * - En una instancia que se congela entre peticiones (Vercel) no hay nada en
 *   segundo plano: la verificación y los reintentos ocurren dentro de la
 *   petición que necesita la base, que los espera (ver listoEnPeticion).
 */
@Injectable()
export class BaseDatosRepositorio implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private poolPg: PoolPg | null = null;
  private estadoActual: EstadoBaseDatos = 'sin_configurar';
  private verificacion: Promise<void> | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private fallosSeguidos = 0;
  private proximoIntento = 0;
  private cerrada = false;
  private iniciada = false;
  private desreferenciar = false;
  private tamanoTrozoActual = TAMANO_TROZO;
  private versionServidor = '';
  private ultimoAvisoColaLlena = 0;
  private rechazosColaLlena = 0;
  /** Última vez que se tomó o devolvió una conexión de Postgres (ver renovarPoolInactivo). */
  private ultimaActividad = 0;
  /** Registro (las pruebas y las CLI pueden reemplazarlo). */
  registro: LoggerService = new Logger('Repositorio');

  constructor(
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly config: ConfiguracionRepositorio,
  ) {}

  onModuleInit(): void {
    // Dentro de Nest (servidor y pruebas) los sockets no retienen el proceso.
    // Las CLI llaman a iniciar() directamente y sí los mantienen.
    this.desreferenciar = true;
    this.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    await this.cerrar();
  }

  get estado(): EstadoBaseDatos {
    return this.estadoActual;
  }

  get configurada(): boolean {
    return this.config.mysql !== null || this.config.postgres !== null;
  }

  /** Motor de la base configurada (MySQL si no hay ninguna). */
  get dialecto(): Dialecto {
    return this.config.postgres ? 'postgres' : 'mysql';
  }

  /** Supabase Storage para los archivos, o null (archivos dentro de la base). */
  get almacenamiento(): OpcionesSupabase | null {
    return this.config.supabase;
  }

  private get nombreMotor(): string {
    return this.dialecto === 'postgres' ? 'Postgres' : 'MySQL';
  }

  private get destino(): string {
    const datos = this.config.postgres ?? this.config.mysql;
    return datos ? `${datos.baseDatos} en ${datos.host}:${datos.puerto}` : '';
  }

  /** Bytes por trozo al guardar archivos (1 MiB salvo max_allowed_packet muy bajo). */
  get tamanoTrozo(): number {
    return this.tamanoTrozoActual;
  }

  get servidor(): string {
    return this.versionServidor;
  }

  /** Crea el pool y empieza a verificar la conexión (no bloquea el arranque). */
  iniciar(): void {
    if (this.iniciada) return;
    this.iniciada = true;
    const m = this.config.mysql;
    const p = this.config.postgres;
    if (p) {
      this.poolPg = this.crearPoolPostgres(p);
    } else if (m) {
      this.pool = mysql.createPool(crearOpcionesPool(m));
      prepararPool(this.pool, this.registro, { desreferenciar: this.desreferenciar });
    } else {
      this.estadoActual = 'sin_configurar';
      this.registro.warn(
        'Repositorio de Productos sin base de datos: defina REPOSITORIO_MYSQL_HOST/USER/PASSWORD/DATABASE ' +
          '(o REPOSITORIO_MYSQL_URL), o REPOSITORIO_POSTGRES_URL, en apps/server/.env. ' +
          'Mientras tanto /api/repositorio/* responde 503.',
      );
      return;
    }
    this.estadoActual = 'conectando';
    // En una instancia que se congela, lo que siga en segundo plano al
    // responder se detiene a medias: verifica la primera petición (listo).
    if (!this.config.instanciaCongelable) void this.verificar();
  }

  private crearPoolPostgres(p: OpcionesPostgres): PoolPg {
    const poolPg = new PoolPg(
      crearOpcionesPoolPostgres(p, { allowExitOnIdle: this.desreferenciar }),
    );
    // Un cliente inactivo que pierde la conexión emite 'error' en el pool:
    // sin este manejador, Node terminaría el proceso. En una instancia que se
    // congela eso pasa sin que la base esté caída (la conexión se cortó
    // mientras tanto): lo dirá la próxima consulta, con una conexión nueva.
    poolPg.on('error', (error) => {
      if (!this.config.instanciaCongelable) this.marcarCaida(error);
    });
    const registrarActividad = (): void => {
      this.ultimaActividad = Date.now();
    };
    poolPg.on('acquire', registrarActividad);
    poolPg.on('release', registrarActividad);
    return poolPg;
  }

  async cerrar(): Promise<void> {
    this.cerrada = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    const pool = this.pool;
    const poolPg = this.poolPg;
    this.pool = null;
    this.poolPg = null;
    if (pool) await pool.end().catch(() => undefined);
    if (poolPg) await poolPg.end().catch(() => undefined);
  }

  /**
   * Lanza 503 si la base no se puede usar ahora. Mientras se hace la primera
   * verificación (arranque), la espera; después responde de inmediato.
   */
  async listo(): Promise<void> {
    if (this.config.instanciaCongelable) return this.listoEnPeticion();
    if (this.estadoActual === 'disponible') return;
    if (this.estadoActual === 'conectando' && this.verificacion) {
      await this.verificacion;
      // La verificación pudo cambiar el estado mientras se esperaba.
      if ((this.estadoActual as EstadoBaseDatos) === 'disponible') return;
    }
    if (this.estadoActual === 'sin_configurar' || this.cerrada) {
      throw noDisponible();
    }
    // Si el reintento programado ya venció (p. ej. temporizador perdido),
    // se lanza uno nuevo en segundo plano.
    if (!this.verificacion && !this.temporizador) void this.verificar();
    throw noDisponible(this.segundosHastaReintento());
  }

  /**
   * listo() en una instancia que se congela entre peticiones (Vercel). Lo que
   * queda en segundo plano al responder (la verificación del arranque, los
   * reintentos) se detiene a medias y, al despertar, sus plazos ya vencieron:
   * la conexión fallaba por timeout sin que la base estuviera caída. Aquí la
   * verificación corre dentro de la petición, que la espera; tras un fallo,
   * las que lleguen antes del siguiente intento reciben 503 de inmediato.
   */
  private async listoEnPeticion(): Promise<void> {
    this.renovarPoolInactivo();
    if (this.estadoActual === 'disponible') return;
    if (this.estadoActual === 'sin_configurar' || this.cerrada) {
      throw noDisponible();
    }
    const verificacion =
      this.verificacion ?? (Date.now() >= this.proximoIntento ? this.verificar() : null);
    if (verificacion) {
      await verificacion;
      if ((this.estadoActual as EstadoBaseDatos) === 'disponible') return;
    }
    throw noDisponible(this.segundosHastaReintento());
  }

  /**
   * En una instancia que se congela tampoco corre el temporizador con que pg
   * cierra las conexiones inactivas: al despertar, el pool entregaría
   * conexiones que la red o el pooler ya cortaron. Si nadie lo usa desde hace
   * más de ese plazo, se cambia por uno nuevo (el viejo termina lo que tenga
   * en curso y se cierra). Solo Postgres: en Vercel la base es la de Supabase.
   */
  private renovarPoolInactivo(): void {
    const viejo = this.poolPg;
    const p = this.config.postgres;
    if (!viejo || !p || this.cerrada || viejo.idleCount === 0) return;
    if (Date.now() - this.ultimaActividad <= INACTIVIDAD_POOL_MS) return;
    this.poolPg = this.crearPoolPostgres(p);
    void viejo.end().catch(() => undefined);
  }

  private segundosHastaReintento(): number {
    return Math.max(1, Math.ceil((this.proximoIntento - Date.now()) / 1000));
  }

  /** Consulta de lectura. */
  async filas<T extends RowDataPacket>(
    sql: string,
    valores: unknown[] = [],
  ): Promise<T[]> {
    await this.listo();
    try {
      if (this.poolPg) {
        const [filas] = await consultarPostgres(this.poolPg, sql, valores);
        return filas as T[];
      }
      const [filas] = await this.poolActivo().query<T[]>(sql, valores);
      return filas;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Sentencia de escritura fuera de una transacción. */
  async ejecutar(sql: string, valores: unknown[] = []): Promise<ResultadoEscritura> {
    await this.listo();
    try {
      if (this.poolPg) {
        const [resultado] = await consultarPostgres(this.poolPg, sql, valores);
        return resultado as ResultadoEscritura;
      }
      const [resultado] = await this.poolActivo().query<mysql.ResultSetHeader>(
        sql,
        valores,
      );
      return resultado;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Sentencia preparada (en MySQL, protocolo binario: BLOB sin convertir a texto). */
  async preparada<T extends RowDataPacket>(
    sql: string,
    valores: unknown[],
  ): Promise<T[]> {
    await this.listo();
    try {
      if (this.poolPg) {
        const [filas] = await consultarPostgres(this.poolPg, sql, valores);
        return filas as T[];
      }
      const [filas] = await this.poolActivo().execute<T[]>(
        sql,
        valores as never[],
      );
      return filas;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Una conexión del pool, con la misma forma en los dos motores. */
  private async obtenerConexion(): Promise<Conexion> {
    try {
      if (this.poolPg) {
        const cliente = await this.poolPg.connect();
        return new ConexionPostgres(cliente, (error) => cliente.release(error));
      }
      return envolverMysql(await this.poolActivo().getConnection());
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Varias lecturas sobre una misma conexión (p. ej. una foto consistente). */
  async conConexion<T>(accion: (conexion: Conexion) => Promise<T>): Promise<T> {
    await this.listo();
    const conexion = await this.obtenerConexion();
    try {
      return await accion(conexion);
    } catch (error) {
      throw this.traducir(error);
    } finally {
      conexion.release();
    }
  }

  /**
   * Ejecuta `accion` en una transacción. Se reintenta entera (hasta
   * `reintentos` veces) ante un interbloqueo o un error marcado con
   * ErrorReintentar; cualquier otro error hace ROLLBACK y se propaga.
   */
  async transaccion<T>(
    accion: (conexion: Conexion) => Promise<T>,
    { reintentos = 2 }: { reintentos?: number } = {},
  ): Promise<T> {
    for (let intento = 0; ; intento++) {
      await this.listo();
      const conexion = await this.obtenerConexion();
      try {
        await conexion.beginTransaction();
        const resultado = await accion(conexion);
        await conexion.commit();
        return resultado;
      } catch (error) {
        await conexion.rollback().catch(() => undefined);
        if (
          intento < reintentos &&
          (error instanceof ErrorReintentar || esReintentable(error))
        ) {
          continue;
        }
        throw this.traducir(
          error instanceof ErrorReintentar ? error.causa : error,
        );
      } finally {
        conexion.release();
      }
    }
  }

  /**
   * Convierte un error de la base en uno de la API: los de conexión marcan la
   * base como caída y se responden 503; una tabla inexistente indica que
   * falta el esquema; la cola del pool llena es carga momentánea (503 con
   * Retry-After corto, sin marcar la base como caída: eso dejaría todo el
   * repositorio en 503). El resto se propaga tal cual (500 en el filtro).
   */
  traducir(error: unknown): unknown {
    if (error instanceof ErrorRepositorioHttp) return error;
    if (esColaLlena(error)) {
      this.avisarColaLlena();
      return ocupado(REINTENTO_COLA_LLENA_S);
    }
    if (esErrorDeConexion(error)) {
      this.marcarCaida(error);
      return noDisponible(5);
    }
    if (esTablaInexistente(error)) {
      this.cambiarEstado(
        'sin_esquema',
        `falta una tabla (${describirError(error)})`,
      );
      this.programarReintento();
      return noDisponible(30);
    }
    return error;
  }

  /** Una consulta falló por la conexión: 503 y reintento en segundo plano. */
  marcarCaida(error: unknown): void {
    if (this.cerrada || (!this.pool && !this.poolPg)) return;
    if (this.estadoActual === 'disponible') {
      this.fallosSeguidos = 0;
      this.cambiarEstado('no_disponible', describirError(error));
      this.programarReintento();
    }
  }

  /** Un aviso (sin traza) como mucho cada minuto, con los rechazos acumulados. */
  private avisarColaLlena(): void {
    this.rechazosColaLlena++;
    const ahora = Date.now();
    if (ahora - this.ultimoAvisoColaLlena < AVISO_COLA_LLENA_MS) return;
    this.ultimoAvisoColaLlena = ahora;
    this.registro.warn(
      `Pool de ${this.nombreMotor} saturado: ${this.rechazosColaLlena} consultas rechazadas con 503 (cola llena). ` +
        `Si se repite, suba REPOSITORIO_${this.dialecto === 'postgres' ? 'POSTGRES' : 'MYSQL'}_CONEXIONES.`,
    );
    this.rechazosColaLlena = 0;
  }

  private poolActivo(): Pool {
    if (!this.pool) throw noDisponible();
    return this.pool;
  }

  /** Versión del servidor y del esquema (y, en MySQL, max_allowed_packet). */
  private async leerEstadoServidor(): Promise<{
    servidor: string;
    maxPaquete: number;
    version: number;
  }> {
    const sqlVersion = 'SELECT MAX(version) AS version FROM sistema_esquema_version';
    // Una base con los nombres anteriores a la versión 4 (esquema_version) no
    // tiene sistema_esquema_version: se informa su versión para pedir la migración.
    const sqlVersionAnterior = 'SELECT MAX(version) AS version FROM esquema_version';
    if (this.poolPg) {
      const poolPg = this.poolPg;
      const { rows } = await poolPg.query<{ servidor: string }>('SELECT version() AS servidor');
      // "PostgreSQL 17.4 on aarch64-unknown-linux-gnu, ..." -> "17.4"
      const servidor = /PostgreSQL\s+(\S+)/.exec(rows[0]?.servidor ?? '')?.[1] ?? '';
      const version =
        (await leerVersion(async () => (await poolPg.query(sqlVersion)).rows)) ||
        (await leerVersion(async () => (await poolPg.query(sqlVersionAnterior)).rows));
      return { servidor, maxPaquete: 0, version };
    }
    const pool = this.poolActivo();
    const [datos] = await pool.query<RowDataPacket[]>(
      'SELECT VERSION() AS servidor, @@max_allowed_packet AS max_paquete',
    );
    const version =
      (await leerVersion(async () => (await pool.query<RowDataPacket[]>(sqlVersion))[0])) ||
      (await leerVersion(async () => (await pool.query<RowDataPacket[]>(sqlVersionAnterior))[0]));
    return {
      servidor: String(datos[0]?.servidor ?? ''),
      maxPaquete: Number(datos[0]?.max_paquete ?? 0),
      version,
    };
  }

  private verificar(): Promise<void> {
    if (this.verificacion) return this.verificacion;
    if ((!this.pool && !this.poolPg) || this.cerrada) return Promise.resolve();
    this.verificacion = (async () => {
      try {
        const { servidor, maxPaquete, version } = await this.leerEstadoServidor();
        this.versionServidor = servidor;
        this.tamanoTrozoActual = calcularTamanoTrozo(maxPaquete);
        if (version < VERSION_ESQUEMA_REQUERIDA) {
          this.fallosSeguidos = 4; // reintenta cada 30 s hasta que se migre
          this.cambiarEstado(
            'sin_esquema',
            version === 0
              ? 'la base no tiene las tablas'
              : `la base tiene el esquema versión ${version} y se necesita la ${VERSION_ESQUEMA_REQUERIDA}` +
                (version < 4 ? ' (los nombres de tabla cambiaron en la 4: ejecute repositorio:migrar)' : ''),
          );
          this.programarReintento();
          return;
        }
        this.fallosSeguidos = 0;
        this.cambiarEstado('disponible', '');
      } catch (error) {
        this.cambiarEstado('no_disponible', describirError(error));
        this.programarReintento();
      } finally {
        this.verificacion = null;
      }
    })();
    return this.verificacion;
  }

  private programarReintento(): void {
    if (this.cerrada || this.temporizador) return;
    const espera =
      ESPERAS_REINTENTO_S[
        Math.min(this.fallosSeguidos, ESPERAS_REINTENTO_S.length - 1)
      ] * 1000;
    this.fallosSeguidos++;
    this.proximoIntento = Date.now() + espera;
    // En una instancia que se congela reintenta la primera petición que
    // llegue después (listoEnPeticion).
    if (this.config.instanciaCongelable) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.verificar();
    }, espera);
    // El reintento no mantiene vivo el proceso (pruebas, cierre ordenado).
    this.temporizador.unref();
  }

  private cambiarEstado(nuevo: EstadoBaseDatos, motivo: string): void {
    const anterior = this.estadoActual;
    this.estadoActual = nuevo;
    if (anterior === nuevo) return;
    const destino = this.destino;
    const esquema =
      this.dialecto === 'postgres' ? 'db/repositorio/postgres/esquema.sql' : 'db/repositorio/esquema.sql';
    if (nuevo === 'disponible') {
      this.registro.log(
        `${anterior === 'conectando' ? 'Conectado' : 'Conexión restablecida'} a ${this.nombreMotor} ${this.versionServidor} (${destino}).`,
      );
    } else if (nuevo === 'sin_esquema') {
      this.registro.warn(
        `La base ${destino} no está lista: ${motivo}. Aplique ${esquema} con una cuenta ` +
          'administradora (npm run repositorio:migrar). Mientras tanto /api/repositorio/* responde 503.',
      );
    } else if (nuevo === 'no_disponible') {
      const cuando = this.config.instanciaCongelable ? 'con una próxima petición' : 'en segundo plano';
      this.registro.warn(
        `No se pudo usar ${this.nombreMotor} (${destino}): ${motivo}. Se reintentará ${cuando}; ` +
          'mientras tanto /api/repositorio/* responde 503.',
      );
    }
  }
}

/** Error que pide repetir la transacción completa (p. ej. archivo duplicado en paralelo). */
export class ErrorReintentar extends Error {
  constructor(readonly causa: unknown) {
    super('Reintentar la transacción');
    this.name = 'ErrorReintentar';
  }
}

/**
 * Cada trozo viaja en un paquete: con max_allowed_packet de 64 MB (lo normal
 * en MySQL 8) se usa 1 MiB; si la instancia lo tiene muy bajo, la mitad del
 * paquete menos un margen. (En Postgres no hay ese límite: 1 MiB.)
 */
export function calcularTamanoTrozo(maxPaquete: number): number {
  if (!Number.isFinite(maxPaquete) || maxPaquete <= 0) return TAMANO_TROZO;
  const tope = Math.floor(maxPaquete / 2) - 64 * 1024;
  return Math.max(64 * 1024, Math.min(TAMANO_TROZO, tope));
}
