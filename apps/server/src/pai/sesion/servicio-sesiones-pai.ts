import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type { AccionRegistroPai, RolPai, SesionPai } from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  demasiadosIntentos,
  noAutenticado,
  solicitudInvalida,
} from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type {
  Conexion,
  ResultadoEscritura,
} from '../../repositorio/bd/conexion.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../../repositorio/configuracion-repositorio.js';
import {
  hashContrasena,
  necesitaRehash,
  obtenerHashFicticio,
  verificarContrasena,
} from '../../repositorio/dominio/contrasenas.js';
import {
  claveAscii,
  INTENTO_CORRECTO,
  INTENTO_EN_CURSO,
  INTENTO_FALLIDO,
  MAX_FALLOS_IP,
  MAX_FALLOS_USUARIO,
  MENSAJE_CREDENCIALES,
  VENTANA_MS,
} from '../../repositorio/servicios/sesiones.js';
import { claveLimiteIp } from '../../seguridad/clave-ip.js';
import {
  validarCambioContrasenaPai,
  validarCredencialesPai,
} from './validacion-sesion.js';

/**
 * Inicio de sesión del PAI, sesiones en el servidor (pai_sesiones) y límite
 * de intentos (pai_intentos_acceso), con el mismo endurecimiento que
 * repositorio/servicios/sesiones.ts y reutilizando por import (sin copiar
 * criptografía) dominio/contrasenas.ts, seguridad/clave-ip.ts,
 * claveAscii y las constantes del límite de servicios/sesiones.ts:
 *
 * - Reserva del intento (exito = INTENTO_EN_CURSO) ANTES de contar, para que
 *   una ráfaga de peticiones simultáneas no se salte el límite; 5 fallos por
 *   usuario (desde su último acceso correcto) o 20 por IP (una IPv6 cuenta
 *   por su /64) en 15 minutos bloquean: 429 + Retry-After. Un intento
 *   rechazado por el bloqueo borra su reserva.
 * - Hash ficticio para usuarios inexistentes (mismo tiempo) y 401 genérico
 *   "Usuario o contraseña incorrectos." también para una cuenta inactiva.
 * - Token de 256 bits en la cookie (en la base, solo su sha256), CSRF aparte,
 *   rotación (la sesión de la cookie anterior se borra), vencimiento por
 *   inactividad y absoluto (REPOSITORIO_SESION_INACTIVIDAD_MINUTOS y
 *   REPOSITORIO_SESION_MAXIMA_HORAS).
 * - Cambiar la contraseña exige la actual; un error cuenta como intento
 *   fallido con una clave propia (claveCambioContrasena: 5 fallos en 15
 *   minutos, y los de la IP) y NO con la del inicio de sesión: quien solo
 *   conoce el nombre de usuario y bloquea el ingreso no impide que la sesión
 *   abierta cambie su contraseña. El cambio quita la marca de contraseña
 *   temporal y cierra las demás sesiones del usuario.
 * - Restablecer la contraseña (el administrador o la CLI) levanta el bloqueo
 *   del inicio de sesión de ese usuario (reiniciarIntentosUsuario).
 * - Registro (pai_registro): 'iniciar_sesion' (correcto, fallido o bloqueo
 *   de la cuenta) y 'cambiar_contrasena', nunca con contraseñas ni hashes.
 */

/** Cada cuánto se actualiza ultimo_uso (evita una escritura por petición). */
const ACTUALIZAR_USO_MS = 60_000;
/** Intentos de acceso que se conservan (purga tras cada inicio de sesión). */
const RETENCION_INTENTOS_MS = 24 * 3_600_000;
/** Token de la cookie: 32 bytes en base64url. */
export const PATRON_TOKEN_PAI = /^[A-Za-z0-9_-]{43}$/;

export const MENSAJE_SESION_VENCIDA =
  'La sesión no existe o venció. Inicie sesión de nuevo.';
export const MENSAJE_CONTRASENA_ACTUAL = 'La contraseña actual no es correcta.';

export interface ContextoAccesoPai {
  ip: string;
  agente: string | null;
  /** Token de la cookie actual, si había: se invalida (rotación). */
  tokenAnterior?: string;
}

export interface InicioSesionPai {
  sesion: SesionPai;
  /** Valor de la cookie pai_sesion. */
  token: string;
  /** Duración máxima de la cookie (ms). */
  duracionMs: number;
}

export function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

/**
 * Clave de pai_intentos_acceso para los fallos de PUT /sesion/contrasena de
 * un usuario: distinta de la del inicio de sesión (el nombre de usuario).
 */
export function claveCambioContrasena(usuarioId: number): string {
  return `cambio:${usuarioId}`;
}

/** IP de la fila que anota un restablecimiento (no es una petición real). */
export const IP_RESTABLECIMIENTO = 'restablecimiento';

/**
 * Levanta el bloqueo del inicio de sesión de `usuario` (dentro de la
 * transacción que le restablece la contraseña): una fila INTENTO_CORRECTO
 * reinicia el conteo "desde el último acceso correcto" de verificarBloqueo,
 * así la contraseña temporal nueva funciona de inmediato. El límite por IP
 * no cambia.
 */
export async function reiniciarIntentosUsuario(
  conexion: Pick<Conexion, 'query'>,
  usuario: string,
  ahora = new Date(),
): Promise<void> {
  await conexion.query(
    'INSERT INTO pai_intentos_acceso (usuario, ip, exito, creado_en) VALUES (?, ?, ?, ?)',
    [claveAscii(usuario, 64), IP_RESTABLECIMIENTO, INTENTO_CORRECTO, ahora],
  );
}

interface FilaSesion extends RowDataPacket {
  id: number;
  csrf: string;
  ultimo_uso: Date;
  expira_en: Date;
  usuario_id: number;
  usuario: string;
  nombre: string;
  rol: RolPai;
  debe_cambiar_contrasena: number;
  activo: number;
}

interface FilaUsuarioAcceso extends RowDataPacket {
  id: number;
  usuario: string;
  nombre: string;
  rol: RolPai;
  hash_contrasena: string;
  debe_cambiar_contrasena: number;
  activo: number;
}

interface FilaConteo extends RowDataPacket {
  fallos: number;
  ultimo: Date | string | null;
}

/** Por qué falló una verificación de contraseña (solo para el registro). */
type MotivoFallo = 'contrasena' | 'inactivo';

@Injectable()
export class ServicioSesionesPai {
  private readonly registro = new Logger('PAI');

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly config: ConfiguracionRepositorio,
  ) {}

  /** Cookie con Secure (REPOSITORIO_COOKIE_SEGURA o NODE_ENV=production). */
  get cookieSegura(): boolean {
    return this.config.cookieSegura;
  }

  /** Valida { usuario, contrasena } (zod), aplica el límite y crea la sesión. */
  async iniciar(
    cuerpo: unknown,
    contexto: ContextoAccesoPai,
  ): Promise<InicioSesionPai> {
    const credenciales = validarCredencialesPai(cuerpo);
    await this.bd.listo();
    const ahora = new Date();
    const usuario = claveAscii(credenciales.usuario, 64);
    const ip = claveAscii(claveLimiteIp(contexto.ip), 45);

    return this.conIntento(usuario, ip, ahora, async (intentoId) => {
      const [fila] = await this.bd.filas<FilaUsuarioAcceso>(
        `SELECT id, usuario, nombre, rol, hash_contrasena, debe_cambiar_contrasena, activo
           FROM pai_usuarios WHERE usuario = ?`,
        [usuario],
      );
      const hash = fila?.hash_contrasena ?? (await obtenerHashFicticio());
      const correcta = await verificarContrasena(credenciales.contrasena, hash);
      if (!fila || !correcta || Number(fila.activo) !== 1) {
        await this.registrarFallo(intentoId, usuario, fila ?? null, {
          accion: 'iniciar_sesion',
          motivo: correcta ? 'inactivo' : 'contrasena',
          ip: contexto.ip,
          ahora,
        });
        throw noAutenticado(MENSAJE_CREDENCIALES);
      }

      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const expiraEn = new Date(ahora.getTime() + this.config.sesionMaximaMs);
      const nuevoHash = necesitaRehash(fila.hash_contrasena)
        ? await hashContrasena(credenciales.contrasena)
        : null;
      const sesionId = await this.bd.transaccion(async (conexion) => {
        await conexion.query(
          'UPDATE pai_intentos_acceso SET exito = ? WHERE id = ?',
          [INTENTO_CORRECTO, intentoId],
        );
        if (
          contexto.tokenAnterior &&
          PATRON_TOKEN_PAI.test(contexto.tokenAnterior)
        ) {
          await conexion.query(
            'DELETE FROM pai_sesiones WHERE token_hash = ?',
            [sha256Hex(contexto.tokenAnterior)],
          );
        }
        const [insercion] = await conexion.query<ResultadoEscritura>(
          `INSERT INTO pai_sesiones (token_hash, csrf, usuario_id, creada_en, ultimo_uso, expira_en, ip, agente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sha256Hex(token),
            csrf,
            fila.id,
            ahora,
            ahora,
            expiraEn,
            claveAscii(contexto.ip, 45),
            contexto.agente?.slice(0, 255) ?? null,
          ],
        );
        await conexion.query(
          `UPDATE pai_usuarios SET ultimo_acceso = ?${nuevoHash ? ', hash_contrasena = ?' : ''} WHERE id = ?`,
          nuevoHash ? [ahora, nuevoHash, fila.id] : [ahora, fila.id],
        );
        await registrarEnPai(conexion, {
          accion: 'iniciar_sesion',
          usuarioId: Number(fila.id),
          usuario: fila.usuario,
          detalle: { resultado: 'correcto' },
          fecha: ahora,
        });
        return Number(insercion.insertId);
      });
      // Con await: nada de trabajo después de responder (Vercel congela la
      // función); son dos DELETE por índice, baratos.
      await this.purgar(ahora);

      return {
        token,
        duracionMs: this.config.sesionMaximaMs,
        sesion: this.aSesionPai({
          id: sesionId,
          usuarioId: Number(fila.id),
          usuario: fila.usuario,
          nombre: fila.nombre,
          rol: fila.rol,
          csrf,
          expira: this.vencimiento(ahora, expiraEn),
          debeCambiarContrasena: Number(fila.debe_cambiar_contrasena) === 1,
        }),
      };
    });
  }

  /** Sesión del token de la cookie, o null si no existe, venció o el usuario está inactivo. */
  async validar(token: string | undefined): Promise<SesionValidaPai | null> {
    if (!token || !PATRON_TOKEN_PAI.test(token)) {
      // Sin cookie: si la base no está disponible, 503 y no 401 (el
      // navegador no debe creer que se cerró la sesión).
      await this.bd.listo();
      return null;
    }
    const [fila] = await this.bd.filas<FilaSesion>(
      `SELECT s.id, s.csrf, s.ultimo_uso, s.expira_en,
              u.id AS usuario_id, u.usuario, u.nombre, u.rol,
              u.debe_cambiar_contrasena, u.activo
         FROM pai_sesiones s JOIN pai_usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = ?`,
      [sha256Hex(token)],
    );
    if (!fila) return null;
    const ahora = new Date();
    const ultimoUsoGuardado = new Date(fila.ultimo_uso);
    const expiraEn = new Date(fila.expira_en);
    const inactiva =
      ahora.getTime() - ultimoUsoGuardado.getTime() >
      this.config.sesionInactividadMs;
    if (Number(fila.activo) !== 1 || inactiva || ahora >= expiraEn) {
      await this.bd.ejecutar('DELETE FROM pai_sesiones WHERE id = ?', [
        fila.id,
      ]);
      return null;
    }
    let ultimoUso = ultimoUsoGuardado;
    if (ahora.getTime() - ultimoUso.getTime() > ACTUALIZAR_USO_MS) {
      ultimoUso = ahora;
      await this.bd.ejecutar(
        'UPDATE pai_sesiones SET ultimo_uso = ? WHERE id = ?',
        [ahora, fila.id],
      );
    }
    return {
      id: Number(fila.id),
      usuarioId: Number(fila.usuario_id),
      usuario: fila.usuario,
      nombre: fila.nombre,
      rol: fila.rol,
      csrf: fila.csrf,
      expira: this.vencimiento(ultimoUso, expiraEn),
      debeCambiarContrasena: Number(fila.debe_cambiar_contrasena) === 1,
    };
  }

  /** Cierra la sesión (borra la fila). */
  async cerrar(sesion: SesionValidaPai): Promise<void> {
    await this.bd.ejecutar('DELETE FROM pai_sesiones WHERE id = ?', [
      sesion.id,
    ]);
  }

  /**
   * PUT /sesion/contrasena: exige la actual (un error cuenta como intento
   * fallido con la clave claveCambioContrasena, no con la del inicio de
   * sesión, y responde 400 con campos.actual), valida la nueva
   * (problemaContrasena), quita debe_cambiar_contrasena y cierra las demás
   * sesiones del usuario. Devuelve la sesión actualizada.
   */
  async cambiarContrasena(
    sesion: SesionValidaPai,
    cuerpo: unknown,
    contexto: Pick<ContextoAccesoPai, 'ip'> = { ip: 'desconocida' },
  ): Promise<SesionPai> {
    const datos = validarCambioContrasenaPai(cuerpo);
    await this.bd.listo();
    const ahora = new Date();
    // Clave propia: los fallos del inicio de sesión (de cualquiera que sepa
    // el nombre de usuario) no bloquean a la sesión ya autenticada.
    const usuario = claveCambioContrasena(sesion.usuarioId);
    const ip = claveAscii(claveLimiteIp(contexto.ip), 45);

    return this.conIntento(usuario, ip, ahora, async (intentoId) => {
      const [fila] = await this.bd.filas<FilaUsuarioAcceso>(
        `SELECT id, usuario, nombre, rol, hash_contrasena, debe_cambiar_contrasena, activo
           FROM pai_usuarios WHERE id = ?`,
        [sesion.usuarioId],
      );
      if (!fila || Number(fila.activo) !== 1) {
        // La cuenta se desactivó o se borró mientras tanto (la reserva del
        // intento se borra en conIntento).
        throw noAutenticado(MENSAJE_SESION_VENCIDA);
      }
      if (!(await verificarContrasena(datos.actual, fila.hash_contrasena))) {
        await this.registrarFallo(intentoId, usuario, fila, {
          accion: 'cambiar_contrasena',
          motivo: 'contrasena',
          ip: contexto.ip,
          ahora,
        });
        throw solicitudInvalida(MENSAJE_CONTRASENA_ACTUAL, {
          actual: MENSAJE_CONTRASENA_ACTUAL,
        });
      }
      const hash = await hashContrasena(datos.nueva);
      const temporal = Number(fila.debe_cambiar_contrasena) === 1;
      await this.bd.transaccion(async (conexion) => {
        await conexion.query(
          'UPDATE pai_intentos_acceso SET exito = ? WHERE id = ?',
          [INTENTO_CORRECTO, intentoId],
        );
        await conexion.query(
          'UPDATE pai_usuarios SET hash_contrasena = ?, debe_cambiar_contrasena = 0 WHERE id = ?',
          [hash, fila.id],
        );
        await conexion.query(
          'DELETE FROM pai_sesiones WHERE usuario_id = ? AND id <> ?',
          [fila.id, sesion.id],
        );
        await registrarEnPai(conexion, {
          accion: 'cambiar_contrasena',
          usuarioId: Number(fila.id),
          usuario: fila.usuario,
          detalle: { resultado: 'correcto', temporal },
          fecha: ahora,
        });
      });
      return this.aSesionPai({
        ...sesion,
        nombre: fila.nombre,
        rol: fila.rol,
        debeCambiarContrasena: false,
      });
    });
  }

  /** Borra todas las sesiones de un usuario (al desactivarlo o darle contraseña temporal). */
  async cerrarSesionesDeUsuario(
    conexion: Pick<Conexion, 'query'> | null,
    usuarioId: number,
  ): Promise<void> {
    const sql = 'DELETE FROM pai_sesiones WHERE usuario_id = ?';
    if (conexion) await conexion.query(sql, [usuarioId]);
    else await this.bd.ejecutar(sql, [usuarioId]);
  }

  aSesionPai(sesion: SesionValidaPai): SesionPai {
    return {
      id: sesion.usuarioId,
      usuario: sesion.usuario,
      nombre: sesion.nombre,
      rol: sesion.rol,
      csrf: sesion.csrf,
      expira: sesion.expira.toISOString(),
      debeCambiarContrasena: sesion.debeCambiarContrasena,
    };
  }

  /** Lo que ocurra primero: inactividad o duración máxima. */
  private vencimiento(ultimoUso: Date, expiraEn: Date): Date {
    const porInactividad =
      ultimoUso.getTime() + this.config.sesionInactividadMs;
    return new Date(Math.min(porInactividad, expiraEn.getTime()));
  }

  /**
   * Reserva un intento de `usuario` desde `ip`, comprueba el bloqueo y
   * ejecuta `accion`. Si la acción no llega a resolver el intento (bloqueo,
   * error inesperado), la reserva se borra: no cuenta como fallo. La acción
   * marca el intento como correcto (dentro de su transacción) o llama a
   * registrarFallo antes de lanzar su error.
   */
  private async conIntento<T>(
    usuario: string,
    ip: string,
    ahora: Date,
    accion: (intentoId: number) => Promise<T>,
  ): Promise<T> {
    const reserva = await this.bd.ejecutar(
      'INSERT INTO pai_intentos_acceso (usuario, ip, exito, creado_en) VALUES (?, ?, ?, ?)',
      [usuario, ip, INTENTO_EN_CURSO, ahora],
    );
    const intentoId = Number(reserva.insertId);
    try {
      await this.verificarBloqueo(usuario, ip, ahora, intentoId);
      return await accion(intentoId);
    } finally {
      // Si el intento sigue "en curso" (bloqueo o error inesperado), se borra.
      await this.bd
        .ejecutar(
          'DELETE FROM pai_intentos_acceso WHERE id = ? AND exito = ?',
          [intentoId, INTENTO_EN_CURSO],
        )
        .catch(() => undefined);
    }
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
         FROM pai_intentos_acceso
        WHERE usuario = ? AND exito <> ? AND creado_en > ?
          AND creado_en > COALESCE(
            (SELECT MAX(i.creado_en) FROM pai_intentos_acceso i WHERE i.usuario = ? AND i.exito = ?),
            '1970-01-01')`,
      [propio, usuario, INTENTO_CORRECTO, desde, usuario, INTENTO_CORRECTO],
    );
    const [porIp] = await this.bd.filas<FilaConteo>(
      `SELECT COUNT(*) AS fallos, MAX(CASE WHEN id <> ? THEN creado_en END) AS ultimo
         FROM pai_intentos_acceso
        WHERE ip = ? AND exito <> ? AND creado_en > ?`,
      [propio, ip, INTENTO_CORRECTO, desde],
    );
    for (const [conteo, maximo] of [
      [porUsuario, MAX_FALLOS_USUARIO],
      [porIp, MAX_FALLOS_IP],
    ] as const) {
      if (!conteo || Number(conteo.fallos) <= maximo || !conteo.ultimo)
        continue;
      const hasta = new Date(conteo.ultimo).getTime() + VENTANA_MS;
      if (hasta > ahora.getTime()) {
        const minutos = Math.ceil((hasta - ahora.getTime()) / 60_000);
        throw demasiadosIntentos(
          Math.ceil((hasta - ahora.getTime()) / 1000),
          `Demasiados intentos fallidos. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e intente de nuevo.`,
        );
      }
    }
  }

  /**
   * Marca el intento como fallido. Si el usuario existe, lo deja en el
   * registro del PAI y, si este fallo es exactamente el que completa
   * MAX_FALLOS_USUARIO, anota el bloqueo una sola vez: los fallos de un mismo
   * usuario se serializan con un bloqueo de su fila, así que dos fallos
   * simultáneos no pueden contar el mismo número.
   */
  private async registrarFallo(
    intentoId: number,
    usuario: string,
    fila: FilaUsuarioAcceso | null,
    datos: {
      accion: AccionRegistroPai;
      motivo: MotivoFallo;
      ip: string;
      ahora: Date;
    },
  ): Promise<void> {
    if (!fila) {
      // En el registro solo se nombra al usuario si existe (lo escrito en
      // "usuario" podría ser una contraseña pegada por error).
      await this.bd.ejecutar(
        'UPDATE pai_intentos_acceso SET exito = ? WHERE id = ?',
        [INTENTO_FALLIDO, intentoId],
      );
      return;
    }
    const bloqueado = await this.bd.transaccion(async (conexion) => {
      await conexion.query(
        'SELECT id FROM pai_usuarios WHERE id = ? FOR UPDATE',
        [fila.id],
      );
      await conexion.query(
        'UPDATE pai_intentos_acceso SET exito = ? WHERE id = ?',
        [INTENTO_FALLIDO, intentoId],
      );
      await registrarEnPai(conexion, {
        accion: datos.accion,
        usuarioId: Number(fila.id),
        usuario: fila.usuario,
        detalle: { resultado: 'fallido', motivo: datos.motivo },
        fecha: datos.ahora,
      });
      // Lectura consistente tomada ya con el bloqueo: ve los fallos que otras
      // peticiones terminaron antes (los intentos en curso no cuentan aquí).
      const [filas] = await conexion.query<FilaConteo[]>(
        `SELECT COUNT(*) AS fallos FROM pai_intentos_acceso
          WHERE usuario = ? AND exito = ? AND creado_en > ?
            AND creado_en > COALESCE(
              (SELECT MAX(i.creado_en) FROM pai_intentos_acceso i WHERE i.usuario = ? AND i.exito = ?),
              '1970-01-01')`,
        [
          usuario,
          INTENTO_FALLIDO,
          new Date(datos.ahora.getTime() - VENTANA_MS),
          usuario,
          INTENTO_CORRECTO,
        ],
      );
      if (Number(filas[0]?.fallos ?? 0) !== MAX_FALLOS_USUARIO) return false;
      await registrarEnPai(conexion, {
        accion: datos.accion,
        usuarioId: Number(fila.id),
        usuario: fila.usuario,
        detalle: {
          resultado: 'bloqueado',
          minutos: VENTANA_MS / 60_000,
          fallos: MAX_FALLOS_USUARIO,
        },
        fecha: datos.ahora,
      });
      return true;
    });
    if (bloqueado) {
      this.registro.warn(
        `Usuario ${fila.usuario} del PAI bloqueado temporalmente por intentos fallidos (última IP ${datos.ip}).`,
      );
    }
  }

  private async purgar(ahora: Date): Promise<void> {
    try {
      await this.bd.ejecutar(
        'DELETE FROM pai_intentos_acceso WHERE creado_en < ?',
        [new Date(ahora.getTime() - RETENCION_INTENTOS_MS)],
      );
      await this.bd.ejecutar(
        'DELETE FROM pai_sesiones WHERE expira_en < ? OR ultimo_uso < ?',
        [ahora, new Date(ahora.getTime() - this.config.sesionInactividadMs)],
      );
    } catch {
      // La purga es de mantenimiento: si falla, se intenta en el próximo inicio.
    }
  }
}
