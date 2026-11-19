import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type { CredencialesAdmin, SesionAdmin } from '../api-repositorio.js';
import { BaseDatosRepositorio } from '../bd/base-datos.js';
import type { Conexion } from '../bd/conexion.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../configuracion-repositorio.js';
import {
  hashContrasena,
  necesitaRehash,
  obtenerHashFicticio,
  verificarContrasena,
} from '../dominio/contrasenas.js';
import { validarCredenciales } from '../dominio/validacion.js';
import { ErrorRepositorioHttp, noAutenticado } from '../errores-repositorio.js';
import { claveLimiteIp } from '../../seguridad/clave-ip.js';
import { registrarCambio } from './cambios.js';

/**
 * Inicio de sesión de la administración, sesiones en el servidor y límite de
 * intentos.
 *
 * - Contraseñas con scrypt (sal por usuario), comparación en tiempo constante
 *   y el mismo trabajo cuando el usuario no existe: el error es siempre
 *   "Usuario o contraseña incorrectos".
 * - Límite: MAX_FALLOS_USUARIO fallos de un usuario (desde su último acceso
 *   correcto) o MAX_FALLOS_IP fallos desde una IP en VENTANA_MS bloquean
 *   durante VENTANA_MS desde el último fallo (429 + Retry-After), aunque
 *   después se escriba la contraseña correcta. Una IPv6 cuenta por su /64
 *   (claveLimiteIp).
 * - El límite resiste peticiones simultáneas: cada intento se reserva en
 *   repositorio_intentos_acceso (exito = INTENTO_EN_CURSO) ANTES de verificar la
 *   contraseña, y el conteo incluye los intentos en curso. De N peticiones a
 *   la vez, como mucho MAX_FALLOS_USUARIO llegan a scrypt (la última en
 *   contar ve las filas de todas las anteriores). Un intento rechazado por el
 *   bloqueo borra su reserva (no alarga el bloqueo).
 * - Usuario y clave de IP se guardan en columnas ASCII: un usuario con tildes
 *   (que no puede existir, ver PATRON_USUARIO) se cuenta por su sha256 y
 *   recibe el mismo 401.
 * - Sesión: token aleatorio de 256 bits en la cookie (en la base solo su
 *   sha256), token CSRF aparte, vencimiento por inactividad y absoluto, y un
 *   token nuevo en cada inicio de sesión (el anterior se borra).
 */

export const MAX_FALLOS_USUARIO = 5;
export const MAX_FALLOS_IP = 20;
export const VENTANA_MS = 15 * 60_000;
/** Cada cuánto se actualiza ultimo_uso (evita una escritura por petición). */
const ACTUALIZAR_USO_MS = 60_000;
/** Purga de intentos y sesiones vencidas. */
const RETENCION_INTENTOS_MS = 24 * 3_600_000;

export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.';

/**
 * Valores de repositorio_intentos_acceso.exito: 0 fallo, 1 acceso correcto y 2 intento
 * en curso (reservado, contraseña todavía sin verificar). Para el bloqueo
 * cuenta todo lo que no es un acceso correcto.
 */
export const INTENTO_FALLIDO = 0;
export const INTENTO_CORRECTO = 1;
export const INTENTO_EN_CURSO = 2;

export interface SesionValida {
  id: number;
  usuarioId: number;
  usuario: string;
  nombre: string | null;
  csrf: string;
  expira: Date;
}

export interface ContextoAcceso {
  ip: string;
  agente: string | null;
  /** Token de la cookie actual, si había: se invalida (rotación). */
  tokenAnterior?: string;
}

export interface InicioSesion {
  sesion: SesionAdmin;
  token: string;
  /** Duración máxima de la cookie (ms). */
  duracionMs: number;
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

/**
 * Texto para una columna CHARACTER SET ascii de `maximo` caracteres: tal cual
 * si es ASCII imprimible y cabe; si no, "#" + su sha256 (MySQL rechazaría el
 * texto con un error y el inicio de sesión respondería 500).
 */
export function claveAscii(texto: string, maximo: number): string {
  return texto.length <= maximo && /^[\x20-\x7e]*$/.test(texto)
    ? texto
    : `#${sha256(texto).slice(0, maximo - 1)}`;
}

/** Comparación en tiempo constante de dos textos. */
export function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const PATRON_TOKEN = /^[A-Za-z0-9_-]{43}$/;

interface FilaSesion extends RowDataPacket {
  id: number;
  csrf: string;
  creada_en: Date;
  ultimo_uso: Date;
  expira_en: Date;
  usuario_id: number;
  usuario: string;
  nombre: string | null;
  activo: number;
}

interface FilaAdmin extends RowDataPacket {
  id: number;
  usuario: string;
  nombre: string | null;
  hash_contrasena: string;
  activo: number;
}

interface FilaConteo extends RowDataPacket {
  fallos: number;
  ultimo: Date | string | null;
}

/** Tablas de un inicio de sesión: usuarios, sesiones e intentos de acceso. */
export interface TablasSesiones {
  usuarios: string;
  sesiones: string;
  intentos: string;
}

/** Las de la administración del repositorio. */
export const TABLAS_SESIONES_REPOSITORIO: TablasSesiones = {
  usuarios: 'repositorio_administradores',
  sesiones: 'repositorio_sesiones',
  intentos: 'repositorio_intentos_acceso',
};

/**
 * Inicio de sesión, sesiones y límite de intentos. Sirve a la administración
 * del repositorio y, con otras tablas (una subclase que cambia `tablas`), a
 * otros accesos con la misma seguridad, como los tableros privados de SIVU.
 */
@Injectable()
export class ServicioSesiones {
  private readonly registro = new Logger('Repositorio');
  /** Tablas que usa este servicio (las subclases ponen las suyas). */
  protected readonly tablas: TablasSesiones = TABLAS_SESIONES_REPOSITORIO;

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly config: ConfiguracionRepositorio,
  ) {}

  /**
   * Deja un evento de sesión (inicio, cierre, bloqueo) en el registro de
   * cambios del repositorio. Otro acceso puede llevarlo a otro lado.
   */
  protected async registrar(conexion: Conexion, entrada: Parameters<typeof registrarCambio>[1]): Promise<void> {
    await registrarCambio(conexion, entrada);
  }

  get cookieSegura(): boolean {
    return this.config.cookieSegura;
  }

  get duracionMaximaMs(): number {
    return this.config.sesionMaximaMs;
  }

  async iniciar(
    cuerpo: unknown,
    contexto: ContextoAcceso,
  ): Promise<InicioSesion> {
    const credenciales: CredencialesAdmin = validarCredenciales(cuerpo);
    await this.bd.listo();
    const ahora = new Date();
    const usuario = claveAscii(credenciales.usuario, 64);
    const ip = claveAscii(claveLimiteIp(contexto.ip), 45);

    // Reserva del intento antes de contar: así el conteo de las peticiones
    // simultáneas incluye esta (ver el comentario del principio).
    const reserva = await this.bd.ejecutar(
      `INSERT INTO ${this.tablas.intentos} (usuario, ip, exito, creado_en) VALUES (?, ?, ?, ?)`,
      [usuario, ip, INTENTO_EN_CURSO, ahora],
    );
    const intentoId = reserva.insertId;
    let resuelto = false;
    try {
      await this.verificarBloqueo(usuario, ip, ahora, intentoId);

      const [admin] = await this.bd.filas<FilaAdmin>(
        `SELECT id, usuario, nombre, hash_contrasena, activo FROM ${this.tablas.usuarios} WHERE usuario = ?`,
        [usuario],
      );
      const hash = admin?.hash_contrasena ?? (await obtenerHashFicticio());
      const correcta = await verificarContrasena(credenciales.contrasena, hash);

      if (!admin || !correcta || Number(admin.activo) !== 1) {
        await this.registrarFallo(intentoId, usuario, admin ?? null, contexto.ip, ahora);
        resuelto = true;
        throw noAutenticado(MENSAJE_CREDENCIALES);
      }

      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const expiraEn = new Date(ahora.getTime() + this.config.sesionMaximaMs);
      const nuevoHash = necesitaRehash(admin.hash_contrasena)
        ? await hashContrasena(credenciales.contrasena)
        : null;
      await this.bd.transaccion(async (conexion) => {
        await conexion.query(`UPDATE ${this.tablas.intentos} SET exito = ? WHERE id = ?`, [
          INTENTO_CORRECTO,
          intentoId,
        ]);
        if (contexto.tokenAnterior && PATRON_TOKEN.test(contexto.tokenAnterior)) {
          await conexion.query(`DELETE FROM ${this.tablas.sesiones} WHERE token_hash = ?`, [
            sha256(contexto.tokenAnterior),
          ]);
        }
        await conexion.query(
          `INSERT INTO ${this.tablas.sesiones} (token_hash, csrf, usuario_id, creada_en, ultimo_uso, expira_en, ip, agente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sha256(token),
            csrf,
            admin.id,
            ahora,
            ahora,
            expiraEn,
            claveAscii(contexto.ip, 45),
            contexto.agente?.slice(0, 255) ?? null,
          ],
        );
        await conexion.query(
          `UPDATE ${this.tablas.usuarios} SET ultimo_acceso = ?${nuevoHash ? ', hash_contrasena = ?' : ''} WHERE id = ?`,
          nuevoHash ? [ahora, nuevoHash, admin.id] : [ahora, admin.id],
        );
        await this.registrar(conexion, {
          usuario: admin.usuario,
          accion: 'sesion',
          detalle: 'Inicio de sesión',
        });
      });
      resuelto = true;
      void this.purgar(ahora);

      return {
        token,
        duracionMs: this.config.sesionMaximaMs,
        sesion: {
          usuario: admin.usuario,
          nombre: admin.nombre,
          csrf,
          expira: this.vencimiento(ahora, expiraEn).toISOString(),
        },
      };
    } finally {
      // Bloqueado (429) o error inesperado: la reserva no cuenta como fallo.
      if (!resuelto) {
        await this.bd
          .ejecutar(`DELETE FROM ${this.tablas.intentos} WHERE id = ?`, [intentoId])
          .catch(() => undefined);
      }
    }
  }

  /** Sesión de la cookie, o null si no existe, venció o el usuario está inactivo. */
  async validar(token: string | undefined): Promise<SesionValida | null> {
    if (!token || !PATRON_TOKEN.test(token)) {
      // Sin cookie: si la base no está disponible, 503 y no 401 (el
      // navegador no debe creer que se cerró la sesión).
      await this.bd.listo();
      return null;
    }
    const [fila] = await this.bd.filas<FilaSesion>(
      `SELECT s.id, s.csrf, s.creada_en, s.ultimo_uso, s.expira_en,
              a.id AS usuario_id, a.usuario, a.nombre, a.activo
         FROM ${this.tablas.sesiones} s JOIN ${this.tablas.usuarios} a ON a.id = s.usuario_id
        WHERE s.token_hash = ?`,
      [sha256(token)],
    );
    if (!fila) return null;
    const ahora = new Date();
    const inactiva =
      ahora.getTime() - fila.ultimo_uso.getTime() > this.config.sesionInactividadMs;
    if (Number(fila.activo) !== 1 || inactiva || ahora >= fila.expira_en) {
      await this.bd.ejecutar(`DELETE FROM ${this.tablas.sesiones} WHERE id = ?`, [fila.id]);
      return null;
    }
    let ultimoUso = fila.ultimo_uso;
    if (ahora.getTime() - ultimoUso.getTime() > ACTUALIZAR_USO_MS) {
      ultimoUso = ahora;
      await this.bd.ejecutar(`UPDATE ${this.tablas.sesiones} SET ultimo_uso = ? WHERE id = ?`, [
        ahora,
        fila.id,
      ]);
    }
    return {
      id: Number(fila.id),
      usuarioId: Number(fila.usuario_id),
      usuario: fila.usuario,
      nombre: fila.nombre,
      csrf: fila.csrf,
      expira: this.vencimiento(ultimoUso, fila.expira_en),
    };
  }

  aSesionAdmin(sesion: SesionValida): SesionAdmin {
    return {
      usuario: sesion.usuario,
      nombre: sesion.nombre,
      csrf: sesion.csrf,
      expira: sesion.expira.toISOString(),
    };
  }

  /** Cierra la sesión (borra la fila) y lo registra. */
  async cerrar(sesion: SesionValida): Promise<void> {
    await this.bd.transaccion(async (conexion) => {
      await conexion.query(`DELETE FROM ${this.tablas.sesiones} WHERE id = ?`, [sesion.id]);
      await this.registrar(conexion, {
        usuario: sesion.usuario,
        accion: 'sesion',
        detalle: 'Cierre de sesión',
      });
    });
  }

  /** Lo que ocurra primero: inactividad o duración máxima. */
  private vencimiento(ultimoUso: Date, expiraEn: Date): Date {
    const porInactividad = ultimoUso.getTime() + this.config.sesionInactividadMs;
    return new Date(Math.min(porInactividad, expiraEn.getTime()));
  }

  /**
   * Lanza 429 si el usuario o la IP superan su límite. Los conteos incluyen
   * el intento `propio` (ya reservado) y los que siguen en curso: se bloquea
   * cuando hay más de MAX intentos no correctos, es decir, si ya había MAX
   * antes de este. La espera se calcula desde el último intento anterior.
   */
  private async verificarBloqueo(
    usuario: string,
    ip: string,
    ahora: Date,
    propio: number,
  ): Promise<void> {
    const desde = new Date(ahora.getTime() - VENTANA_MS);
    const [porUsuario] = await this.bd.filas<FilaConteo>(
      `SELECT COUNT(*) AS fallos, MAX(CASE WHEN id <> ? THEN creado_en END) AS ultimo
         FROM ${this.tablas.intentos}
        WHERE usuario = ? AND exito <> ? AND creado_en > ?
          AND creado_en > COALESCE(
            (SELECT MAX(i.creado_en) FROM ${this.tablas.intentos} i WHERE i.usuario = ? AND i.exito = ?),
            '1970-01-01')`,
      [propio, usuario, INTENTO_CORRECTO, desde, usuario, INTENTO_CORRECTO],
    );
    const [porIp] = await this.bd.filas<FilaConteo>(
      `SELECT COUNT(*) AS fallos, MAX(CASE WHEN id <> ? THEN creado_en END) AS ultimo
         FROM ${this.tablas.intentos}
        WHERE ip = ? AND exito <> ? AND creado_en > ?`,
      [propio, ip, INTENTO_CORRECTO, desde],
    );
    for (const [conteo, maximo] of [
      [porUsuario, MAX_FALLOS_USUARIO],
      [porIp, MAX_FALLOS_IP],
    ] as const) {
      if (!conteo || Number(conteo.fallos) <= maximo || !conteo.ultimo) continue;
      const hasta = new Date(conteo.ultimo).getTime() + VENTANA_MS;
      if (hasta > ahora.getTime()) {
        const minutos = Math.ceil((hasta - ahora.getTime()) / 60_000);
        throw new ErrorRepositorioHttp(
          429,
          'demasiados_intentos',
          `Demasiados intentos fallidos. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e intente de nuevo.`,
          { reintentarEn: Math.ceil((hasta - ahora.getTime()) / 1000) },
        );
      }
    }
  }

  /**
   * Marca el intento como fallido. Si el usuario existe, lo deja en el
   * registro de cambios y, si este fallo es exactamente el que completa
   * MAX_FALLOS_USUARIO, anota el bloqueo una sola vez: los fallos de un mismo
   * administrador se serializan con un bloqueo de su fila, así que dos fallos
   * simultáneos no pueden contar el mismo número.
   */
  private async registrarFallo(
    intentoId: number,
    usuario: string,
    admin: FilaAdmin | null,
    ip: string,
    ahora: Date,
  ): Promise<void> {
    if (!admin) {
      // En el registro de cambios solo se nombra al usuario si existe (lo
      // escrito en "usuario" podría ser una contraseña pegada por error).
      await this.bd.ejecutar(`UPDATE ${this.tablas.intentos} SET exito = ? WHERE id = ?`, [
        INTENTO_FALLIDO,
        intentoId,
      ]);
      return;
    }
    const bloqueado = await this.bd.transaccion(async (conexion) => {
      await conexion.query(`SELECT id FROM ${this.tablas.usuarios} WHERE id = ? FOR UPDATE`, [admin.id]);
      await conexion.query(`UPDATE ${this.tablas.intentos} SET exito = ? WHERE id = ?`, [
        INTENTO_FALLIDO,
        intentoId,
      ]);
      await this.registrar(conexion, {
        usuario: admin.usuario,
        accion: 'sesion',
        detalle: 'Inicio de sesión fallido (contraseña incorrecta o usuario inactivo)',
      });
      // Lectura consistente tomada ya con el bloqueo: ve los fallos que otras
      // peticiones terminaron antes (los intentos en curso no cuentan aquí).
      const [filas] = await conexion.query<FilaConteo[]>(
        `SELECT COUNT(*) AS fallos FROM ${this.tablas.intentos}
          WHERE usuario = ? AND exito = ? AND creado_en > ?
            AND creado_en > COALESCE(
              (SELECT MAX(i.creado_en) FROM ${this.tablas.intentos} i WHERE i.usuario = ? AND i.exito = ?),
              '1970-01-01')`,
        [usuario, INTENTO_FALLIDO, new Date(ahora.getTime() - VENTANA_MS), usuario, INTENTO_CORRECTO],
      );
      if (Number(filas[0]?.fallos ?? 0) !== MAX_FALLOS_USUARIO) return false;
      await this.registrar(conexion, {
        usuario: admin.usuario,
        accion: 'sesion',
        detalle: `Cuenta bloqueada ${VENTANA_MS / 60_000} minutos por ${MAX_FALLOS_USUARIO} intentos fallidos`,
      });
      return true;
    });
    if (bloqueado) {
      this.registro.warn(
        `Usuario ${admin.usuario} bloqueado temporalmente por intentos fallidos (última IP ${ip}).`,
      );
    }
  }

  private async purgar(ahora: Date): Promise<void> {
    try {
      await this.bd.ejecutar(`DELETE FROM ${this.tablas.intentos} WHERE creado_en < ?`, [
        new Date(ahora.getTime() - RETENCION_INTENTOS_MS),
      ]);
      await this.bd.ejecutar(
        `DELETE FROM ${this.tablas.sesiones} WHERE expira_en < ? OR ultimo_uso < ?`,
        [ahora, new Date(ahora.getTime() - this.config.sesionInactividadMs)],
      );
    } catch {
      // La purga es de mantenimiento: si falla, se intenta en el próximo inicio.
    }
  }
}
