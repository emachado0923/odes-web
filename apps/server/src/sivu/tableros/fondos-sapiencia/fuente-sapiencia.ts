import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { ErrorRepositorioHttp } from '../../../repositorio/errores-repositorio.js';
import { type Fila, type FichaFondos, fichasSapiencia } from './fichas-sapiencia.js';

/**
 * Conexión de SOLO LECTURA a la base de Sapiencia de donde sale la ventanilla de los fondos
 * (`analitica_fondos` en el servidor bdconvocatoriasfondos), para probar EN LOCAL la consulta en vivo
 * en lugar de las fichas cargadas desde el Power BI.
 *
 * Se activa con FONDOS_CONSULTA_ORIGEN=sapiencia y estas variables (apps/server/.env, nunca en el
 * repositorio):
 *   SAPIENCIA_LECTURA_USER, SAPIENCIA_LECTURA_PASSWORD   usuario odesweb (SELECT y SHOW VIEW)
 *   SAPIENCIA_LECTURA_FONDOS_HOST, SAPIENCIA_LECTURA_PORT servidor (solo responde con la VPN de Sapiencia)
 *   SAPIENCIA_LECTURA_SSL                                 requerido (cifra sin verificar el certificado),
 *                                                         verificar o desactivado
 *   SAPIENCIA_LECTURA_FONDOS_DATABASE                     opcional; por defecto analitica_fondos
 *
 * Además del usuario de solo lectura, cada conexión abre su sesión en READ ONLY.
 */
@Injectable()
export class FuenteFondosSapiencia implements OnModuleDestroy {
  private readonly bitacora = new Logger('FondosSapiencia');
  private pool: Pool | null = null;

  /** true si la ventanilla debe consultar en vivo la base de Sapiencia. */
  get activa(): boolean {
    return (process.env.FONDOS_CONSULTA_ORIGEN ?? '').trim().toLowerCase() === 'sapiencia';
  }

  private abrir(): Pool {
    if (this.pool) return this.pool;
    const e = process.env;
    const faltan = ['SAPIENCIA_LECTURA_USER', 'SAPIENCIA_LECTURA_PASSWORD', 'SAPIENCIA_LECTURA_FONDOS_HOST'].filter((k) => !e[k]?.trim());
    if (faltan.length > 0) {
      throw new ErrorRepositorioHttp(503, 'no_disponible', `Falta configurar la conexión a la base de Sapiencia (${faltan.join(', ')}).`);
    }
    const modoSsl = (e.SAPIENCIA_LECTURA_SSL ?? 'requerido').trim().toLowerCase();
    this.pool = mysql.createPool({
      host: e.SAPIENCIA_LECTURA_FONDOS_HOST,
      port: Number(e.SAPIENCIA_LECTURA_PORT ?? 3306),
      user: e.SAPIENCIA_LECTURA_USER,
      password: e.SAPIENCIA_LECTURA_PASSWORD,
      database: e.SAPIENCIA_LECTURA_FONDOS_DATABASE?.trim() || 'analitica_fondos',
      ssl: modoSsl === 'desactivado' ? undefined : { rejectUnauthorized: modoSsl !== 'requerido' },
      charset: 'utf8mb4',
      // Las fechas llegan como texto: «2025-08-14», sin correrse por la zona horaria.
      dateStrings: true,
      supportBigNumbers: true,
      connectionLimit: 4,
      connectTimeout: 10_000,
      // El servidor mata las conexiones dormidas cada minuto (evento barrer_dormidos): no guardarlas mucho.
      maxIdle: 1,
      idleTimeout: 20_000,
    });
    this.pool.on('connection', (conexion) => {
      conexion.query('SET SESSION TRANSACTION READ ONLY');
    });
    return this.pool;
  }

  private async consultar(sql: string, valores: unknown[], intento = 1): Promise<Fila[]> {
    try {
      const [filas] = await this.abrir().query<RowDataPacket[]>(sql, valores);
      return filas as Fila[];
    } catch (error) {
      const codigo = (error as { code?: string }).code ?? '';
      // Una conexión que el servidor cerró mientras dormía: se reintenta una vez con otra.
      if (intento === 1 && ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE'].includes(codigo)) return this.consultar(sql, valores, 2);
      if (['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(codigo)) {
        throw new ErrorRepositorioHttp(503, 'no_disponible', 'No se pudo llegar a la base de Sapiencia. Revise que la VPN esté conectada.');
      }
      if (codigo === 'ER_ACCESS_DENIED_ERROR' || codigo === 'ER_DBACCESS_DENIED_ERROR') {
        throw new ErrorRepositorioHttp(503, 'no_disponible', 'La base de Sapiencia rechazó el usuario de lectura configurado.');
      }
      this.bitacora.error(`Consulta a analitica_fondos fallida: ${codigo || (error as Error).message}`);
      throw new ErrorRepositorioHttp(503, 'no_disponible', 'La base de Sapiencia no respondió la consulta. Intente de nuevo.');
    }
  }

  /** Fichas de un documento (normalizado), en vivo. */
  fichas(documento: string): Promise<FichaFondos[]> {
    return fichasSapiencia((sql, valores) => this.consultar(sql, valores), documento);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
    this.pool = null;
  }
}
