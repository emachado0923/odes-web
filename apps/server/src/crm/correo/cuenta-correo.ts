/**
 * Cuenta de correo del CRM guardada por el líder (crm_correo_cuenta, una sola
 * fila con id = 1, migración 011). Sirve cuando el servidor no tiene las
 * variables CRM_CORREO_*: si las tiene, mandan ellas, esta cuenta no se usa y
 * guardar o borrar responde 409.
 *
 * La contraseña de aplicación se guarda cifrada (cifrado-cuenta.ts) y nunca
 * se devuelve ni va al log. Si no se puede descifrar (cambió el secreto del
 * servidor), la cuenta queda como «sin contraseña» hasta que el líder la
 * escriba otra vez.
 *
 * ServicioCorreoCrm lee la cuenta con `guardada()`: antes de cada envío la
 * relee (es una fila; así se nota un cambio hecho en otra instancia de Cloud
 * Run) y, para decir si el correo está configurado, se fía de lo leído en los
 * últimos 30 s (CACHE_CUENTA_MS).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  type CuentaCorreoCrm,
  HOST_SMTP_GOOGLE,
  type ResultadoPruebaCorreoCrm,
} from '../api-crm.js';
import { BaseDatosRepositorio, ErrorReintentar } from '../../repositorio/bd/base-datos.js';
import type { Conexion, ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import { sinControl, textoLinea } from '../../repositorio/dominio/normalizacion.js';
import { conflicto, solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import { cifrarClave, descifrarClave, LLAVE_CUENTA_CORREO_CRM, type LlaveCuentaCorreoCrm } from './cifrado-cuenta.js';
import {
  CONFIGURACION_CORREO_CRM,
  type ConfiguracionCorreoCrm,
  CORREO_REMITENTE_LOCAL,
  HOST_GMAIL,
  hostPorDominio,
  NOMBRE_REMITENTE_CRM,
} from './configuracion-correo.js';
import { describirErrorCorreo } from './transporte.js';

// ── Mensajes y límites ──────────────────────────────────────────────────────

export const MENSAJE_MANDAN_VARIABLES =
  'La cuenta está definida en las variables del servidor (CRM_CORREO_*); cámbiela allá.';
export const MENSAJE_SIN_LLAVE =
  'El servidor no tiene con qué cifrar la contraseña: configure CRM_CORREO_LLAVE en el servidor ' +
  '(o una contraseña para la cuenta de la base de datos) y vuelva a intentarlo.';
export const MENSAJE_HOST_FALTA = `Escriba el servidor SMTP; para Google Workspace es ${HOST_SMTP_GOOGLE}.`;
export const MENSAJE_CLAVE_FALTA = 'Escriba la contraseña de aplicación de la cuenta.';
export const MENSAJE_CLAVE_OTRA_CUENTA =
  'Cambió la cuenta o el servidor de correo: escriba otra vez la contraseña de aplicación.';
export const MENSAJE_AUTH_GMAIL =
  'Gmail rechazó la cuenta o la contraseña de aplicación: revise que sea la de 16 letras y que la ' +
  'verificación en dos pasos esté activa.';
export const MENSAJE_PRUEBA_SIN_CUENTA =
  'No hay cuenta de correo configurada: guarde la cuenta con su contraseña de aplicación y vuelva a probar.';
export const MENSAJE_PARA_FALTA =
  'Escriba a qué correo enviar la prueba (el equipo no tiene un líder activo con correo).';

const MENSAJE_USUARIO = 'Escriba la dirección completa de la cuenta (por ejemplo, planeacion@gmail.com).';
const MENSAJE_HOST_FORMATO = `Escriba solo el nombre del servidor, sin protocolo ni puerto (por ejemplo, ${HOST_SMTP_GOOGLE}).`;
const MENSAJE_PUERTO = 'El puerto debe ser un número entero entre 1 y 65535.';
const MENSAJE_PARA = 'Escriba un correo válido (por ejemplo, nombre@sapiencia.gov.co).';

/** Caracteres de la contraseña (sin espacios). */
export const MAX_CLAVE = 200;
/** Bytes UTF-8 de la contraseña: con el iv y el tag, cifrada cabe en los 512 de clave_cifrada. */
const MAX_BYTES_CLAVE = 350;
export const MAX_NOMBRE_REMITENTE = 100;
const MAX_ACTUALIZADO_POR = 120;

/** Cuánto se confía en la cuenta leída para decir si el correo está configurado (resumen y encolar). */
export const CACHE_CUENTA_MS = 30_000;
/** Correos de prueba por hora, por instancia. */
export const TOPE_PRUEBAS_POR_HORA = 10;

/** El correo de prueba: corto, sin datos de nadie. */
export const CORREO_PRUEBA = Object.freeze({
  asunto: 'Prueba del correo del CRM',
  texto:
    'Este es un correo de prueba del CRM de la Oficina de Planeación de Sapiencia. ' +
    'Si le llegó, los avisos de tareas ya pueden salir.\n',
  html:
    '<!doctype html><html lang="es"><body><p>Este es un correo de prueba del CRM de la Oficina de ' +
    'Planeación de Sapiencia. Si le llegó, los avisos de tareas ya pueden salir.</p></body></html>',
});

// ── Validación ──────────────────────────────────────────────────────────────

/** Dirección de una sola cuenta: sin espacios, comas ni corchetes angulares (como CRM_CORREO_USUARIO). */
const CORREO = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
/** Nombre de host (como CRM_CORREO_HOST), ya en minúsculas. */
const NOMBRE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** Largo en caracteres (puntos de código), como lo cuenta un VARCHAR. */
function largo(texto: string): number {
  return [...texto].length;
}

function esCorreo(valor: string): boolean {
  return largo(valor) <= 254 && sinControl(valor) === valor && CORREO.test(valor);
}

const esquemaGuardar = z.object({
  usuario: z
    .string({ error: MENSAJE_USUARIO })
    .transform((valor) => valor.normalize('NFC').trim())
    .refine(esCorreo, MENSAJE_USUARIO),
  // Google muestra la contraseña como «abcd efgh ijkl mnop»: se le quitan todos los espacios.
  clave: z
    .string({ error: 'La contraseña debe ser texto.' })
    .nullable()
    .transform((valor) => (valor ?? '').replace(/\s+/g, ''))
    .superRefine((valor, ctx) => {
      if (largo(valor) > MAX_CLAVE || Buffer.byteLength(valor, 'utf8') > MAX_BYTES_CLAVE) {
        ctx.addIssue({ code: 'custom', message: `La contraseña: máximo ${MAX_CLAVE} caracteres.` });
      } else if (sinControl(valor) !== valor) {
        ctx.addIssue({ code: 'custom', message: 'La contraseña tiene caracteres no válidos.' });
      }
    }),
  host: z
    .string({ error: MENSAJE_HOST_FORMATO })
    .nullable()
    .transform((valor) => (valor ?? '').trim().toLowerCase())
    .refine((valor) => valor === '' || NOMBRE_HOST.test(valor), MENSAJE_HOST_FORMATO),
  puerto: z.number({ error: MENSAJE_PUERTO }).int(MENSAJE_PUERTO).min(1, MENSAJE_PUERTO).max(65535, MENSAJE_PUERTO).nullable(),
  seguro: z.boolean({ error: 'Indique si la conexión usa TLS desde el inicio (verdadero o falso).' }).nullable(),
  // Una línea: tabuladores y saltos pasan a espacio antes de quitar los caracteres de control.
  nombre: z
    .string({ error: 'El nombre del remitente debe ser texto.' })
    .nullable()
    .transform((valor) => textoLinea((valor ?? '').replace(/\s+/g, ' ')))
    .refine(
      (valor) => largo(valor) <= MAX_NOMBRE_REMITENTE,
      `El nombre del remitente: máximo ${MAX_NOMBRE_REMITENTE} caracteres.`,
    ),
});

/** { "campo": "primer mensaje" }. */
function camposDeErrorZod(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const ruta = problema.path.map(String).join('.');
    if (!(ruta in campos)) campos[ruta] = problema.message;
  }
  return campos;
}

/** Los datos de PUT /lider/correo/cuenta, completos (con los valores por defecto). */
export interface DatosCuentaCorreoValidos {
  usuario: string;
  /** Sin espacios; null = conservar la guardada. */
  clave: string | null;
  host: string;
  puerto: number;
  seguro: boolean;
  nombre: string;
}

/** Valida GuardarCuentaCorreoCrm (400 con `campos`) y completa host, puerto, seguro y nombre. */
export function validarCuentaCorreo(cuerpo: unknown): DatosCuentaCorreoValidos {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe los datos de la cuenta como un objeto JSON.');
  }
  const c = cuerpo as Record<string, unknown>;
  // Lo que no vino (o vino en null) cuenta como vacío: así cada campo pasa por su esquema.
  const resultado = esquemaGuardar.safeParse({
    usuario: c.usuario,
    clave: c.clave ?? null,
    host: c.host ?? null,
    puerto: c.puerto ?? null,
    seguro: c.seguro ?? null,
    nombre: c.nombre ?? null,
  });
  if (!resultado.success) {
    throw solicitudInvalida('Revise los datos de la cuenta de correo.', camposDeErrorZod(resultado.error));
  }
  const datos = resultado.data;
  const host = datos.host || hostPorDominio(datos.usuario);
  if (!host) throw solicitudInvalida(MENSAJE_HOST_FALTA, { host: MENSAJE_HOST_FALTA });
  const puerto = datos.puerto ?? (host === HOST_GMAIL ? 465 : 587);
  return {
    usuario: datos.usuario,
    clave: datos.clave || null,
    host,
    puerto,
    seguro: datos.seguro ?? puerto === 465,
    nombre: datos.nombre || NOMBRE_REMITENTE_CRM,
  };
}

/** Valida PruebaCorreoCrm: `para` es opcional (null = al líder). */
export function validarPruebaCorreo(cuerpo: unknown): { para: string | null } {
  if (cuerpo === undefined || cuerpo === null) return { para: null };
  if (typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe { para } como un objeto JSON.');
  }
  const para = (cuerpo as { para?: unknown }).para;
  if (para === undefined || para === null || (typeof para === 'string' && para.trim() === '')) return { para: null };
  const valor = typeof para === 'string' ? para.normalize('NFC').trim() : '';
  if (!esCorreo(valor)) throw solicitudInvalida('Revise el correo de la prueba.', { para: MENSAJE_PARA });
  return { para: valor };
}

// ── Cuenta guardada ─────────────────────────────────────────────────────────

export interface CuentaGuardadaCrm {
  usuario: string;
  /** La contraseña en claro, o null si no se pudo descifrar (cambió el secreto del servidor). */
  clave: string | null;
  host: string;
  puerto: number;
  seguro: boolean;
  nombre: string;
  actualizadoEn: Date;
  actualizadoPor: string | null;
}

interface FilaCuenta extends RowDataPacket {
  usuario: string;
  clave_cifrada: string;
  host: string;
  puerto: number | string;
  seguro: number | string | boolean;
  nombre: string;
  actualizado_en: Date | string;
  actualizado_por: string | null;
}

interface FilaClave extends RowDataPacket {
  clave_cifrada: string;
  usuario: string;
  host: string;
}

/**
 * ¿La edición es de la misma cuenta en el mismo servidor que la fila
 * guardada? Solo así se puede conservar la clave sin volver a escribirla: si
 * no, quien tenga la sesión del líder (sin conocer la clave) podría apuntar
 * el servidor a uno suyo y la prueba le entregaría la clave en el AUTH.
 */
function mismaCuenta(fila: FilaClave, datos: DatosCuentaCorreoValidos): boolean {
  return (
    String(fila.usuario).toLowerCase() === datos.usuario.toLowerCase() &&
    String(fila.host).toLowerCase() === datos.host.toLowerCase()
  );
}

const SQL_LEER = `SELECT usuario, clave_cifrada, host, puerto, seguro, nombre, actualizado_en, actualizado_por
                    FROM crm_correo_cuenta WHERE id = 1`;

/** La configuración de envío (modo smtp) de una cuenta guardada con su contraseña. */
export function configuracionDeCuenta(
  cuenta: CuentaGuardadaCrm & { clave: string },
  base: ConfiguracionCorreoCrm,
): ConfiguracionCorreoCrm {
  return Object.freeze({
    modo: 'smtp',
    smtp: {
      host: cuenta.host,
      puerto: cuenta.puerto,
      seguro: cuenta.seguro,
      usuario: cuenta.usuario,
      clave: cuenta.clave,
    },
    remitente: { nombre: cuenta.nombre, correo: cuenta.usuario },
    directorio: null,
    urlSitio: base.urlSitio,
  });
}

/** Lo que ve el líder cuando mandan las variables CRM_CORREO_* (sin la clave). */
export function cuentaDeVariables(config: ConfiguracionCorreoCrm): CuentaCorreoCrm {
  const smtp = config.smtp;
  const remitente = config.remitente.correo === CORREO_REMITENTE_LOCAL ? null : config.remitente.correo;
  return {
    origen: 'variables',
    modo: config.modo,
    usuario: smtp?.usuario ?? remitente,
    host: smtp?.host ?? null,
    puerto: smtp?.puerto ?? null,
    seguro: smtp?.seguro ?? null,
    nombre: config.remitente.nombre,
    tieneClave: smtp !== null && smtp.clave.length > 0,
    editable: false,
    actualizadoEn: null,
  };
}

/** Lo que ve el líder sin variables: la cuenta de la base (sin la clave) o ninguna. */
export function cuentaDeBase(cuenta: CuentaGuardadaCrm | null): CuentaCorreoCrm {
  if (!cuenta) {
    return {
      origen: 'ninguna',
      modo: 'desactivado',
      usuario: null,
      host: null,
      puerto: null,
      seguro: null,
      nombre: NOMBRE_REMITENTE_CRM,
      tieneClave: false,
      editable: true,
      actualizadoEn: null,
    };
  }
  return {
    origen: 'base',
    modo: cuenta.clave === null ? 'desactivado' : 'smtp',
    usuario: cuenta.usuario,
    host: cuenta.host,
    puerto: cuenta.puerto,
    seguro: cuenta.seguro,
    nombre: cuenta.nombre,
    tieneClave: cuenta.clave !== null,
    editable: true,
    actualizadoEn: cuenta.actualizadoEn.toISOString(),
  };
}

/** Línea del log de arranque cuando no hay variables CRM_CORREO_* (nunca la clave). */
export function describirCuentaGuardada(cuenta: CuentaGuardadaCrm | null): string {
  if (!cuenta) {
    return (
      'correo del CRM: sin variables CRM_CORREO_* ni cuenta guardada en la base; los avisos quedan ' +
      '«sin configurar» hasta que el líder guarde la cuenta en /crm/lider/correos'
    );
  }
  if (cuenta.clave === null) {
    return (
      `correo del CRM: sin variables CRM_CORREO_*; la cuenta guardada en la base (${cuenta.usuario}) ` +
      'tiene una contraseña que no se puede descifrar (cambió CRM_CORREO_LLAVE o la contraseña de la base): ' +
      'el líder debe escribirla otra vez'
    );
  }
  const tls = cuenta.seguro ? 'TLS desde el inicio' : 'STARTTLS obligatorio';
  return (
    `correo del CRM: smtp ${cuenta.host}:${cuenta.puerto} como ${cuenta.usuario} (${tls}), ` +
    'con la cuenta guardada en la base por el líder'
  );
}

@Injectable()
export class ServicioCuentaCorreoCrm {
  private readonly registro = new Logger('CRM');
  private cache: { cuenta: CuentaGuardadaCrm | null; leidaEn: number } | null = null;
  /**
   * Sube con cada escritura (antes y después): una lectura que empezó antes no
   * pisa en la caché lo que se acaba de guardar o borrar.
   */
  private generacion = 0;
  /** actualizado_en (ms) de la última cuenta ilegible avisada en el log: un aviso por versión. */
  private ilegibleAvisada: number | null = null;

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_CORREO_CRM) private readonly config: ConfiguracionCorreoCrm,
    @Inject(LLAVE_CUENTA_CORREO_CRM) private readonly llave: LlaveCuentaCorreoCrm,
  ) {}

  /** Las variables CRM_CORREO_* configuran el correo: la cuenta de la base no se usa ni se edita. */
  get mandanVariables(): boolean {
    return this.config.modo !== 'desactivado';
  }

  /**
   * La cuenta de la base (con la clave descifrada, o null si no se pudo), o
   * null si no hay. Con `maxEdadMs` usa lo leído hace menos de eso; con
   * `conexion` lee por ella (dentro de la transacción del llamador).
   */
  async guardada({ maxEdadMs = 0, conexion }: { maxEdadMs?: number; conexion?: Conexion } = {}): Promise<
    CuentaGuardadaCrm | null
  > {
    const ahora = Date.now();
    if (this.cache && maxEdadMs > 0 && ahora - this.cache.leidaEn < maxEdadMs) return this.cache.cuenta;
    const generacion = this.generacion;
    const filas = conexion ? (await conexion.query<FilaCuenta[]>(SQL_LEER))[0] : await this.bd.filas<FilaCuenta>(SQL_LEER);
    const cuenta = filas[0] ? this.aCuenta(filas[0]) : null;
    if (generacion === this.generacion) this.cache = { cuenta, leidaEn: ahora };
    return cuenta;
  }

  private aCuenta(fila: FilaCuenta): CuentaGuardadaCrm {
    const actualizadoEn = fila.actualizado_en instanceof Date ? fila.actualizado_en : new Date(fila.actualizado_en);
    const clave = descifrarClave(String(fila.clave_cifrada), this.llave.llave);
    if (clave === null && this.ilegibleAvisada !== actualizadoEn.getTime()) {
      this.ilegibleAvisada = actualizadoEn.getTime();
      this.registro.warn(
        'La contraseña de la cuenta de correo guardada en la base no se pudo descifrar (cambió CRM_CORREO_LLAVE ' +
          'o la contraseña de la base): queda como sin contraseña hasta que el líder la escriba otra vez.',
      );
    }
    return {
      usuario: String(fila.usuario),
      clave,
      host: String(fila.host).toLowerCase(),
      puerto: Number(fila.puerto),
      seguro: Number(fila.seguro) === 1,
      nombre: String(fila.nombre),
      actualizadoEn,
      actualizadoPor: fila.actualizado_por ?? null,
    };
  }

  /** GET /lider/correo/cuenta (lee la fila otra vez: puede haberla cambiado otra instancia). */
  async obtener(): Promise<CuentaCorreoCrm> {
    if (this.mandanVariables) return cuentaDeVariables(this.config);
    return cuentaDeBase(await this.guardada());
  }

  /**
   * PUT /lider/correo/cuenta: valida, cifra y guarda la cuenta (409 si mandan
   * las variables o si el servidor no tiene secreto para la llave). Sin clave,
   * conserva la guardada (400 en `campos.clave` si no hay una legible, o si
   * cambian la cuenta o el servidor: ver mismaCuenta).
   */
  async guardar(cuerpo: unknown, actualizadoPor: string | null): Promise<CuentaCorreoCrm> {
    if (this.mandanVariables) throw conflicto(MENSAJE_MANDAN_VARIABLES);
    const llave = this.llave.llave;
    if (!llave) throw conflicto(MENSAJE_SIN_LLAVE);
    const datos = validarCuentaCorreo(cuerpo);
    const quien = actualizadoPor === null ? null : Array.from(textoLinea(actualizadoPor)).slice(0, MAX_ACTUALIZADO_POR).join('') || null;
    const ahora = new Date();

    this.generacion++;
    let cuenta: CuentaGuardadaCrm;
    try {
      cuenta = await this.bd.transaccion(async (conexion) => {
        const [filas] = await conexion.query<FilaClave[]>(
          'SELECT clave_cifrada, usuario, host FROM crm_correo_cuenta WHERE id = 1 FOR UPDATE',
        );
        const fila = filas[0];
        const anterior = fila ? String(fila.clave_cifrada) : null;
        let clave: string;
        let claveCifrada: string;
        if (datos.clave !== null) {
          clave = datos.clave;
          claveCifrada = cifrarClave(clave, llave);
        } else {
          const legible = anterior === null ? null : descifrarClave(anterior, llave);
          if (!fila || anterior === null || legible === null) {
            throw solicitudInvalida(MENSAJE_CLAVE_FALTA, { clave: MENSAJE_CLAVE_FALTA });
          }
          if (!mismaCuenta(fila, datos)) {
            throw solicitudInvalida(MENSAJE_CLAVE_OTRA_CUENTA, { clave: MENSAJE_CLAVE_OTRA_CUENTA });
          }
          clave = legible;
          claveCifrada = anterior;
        }
        const valores = [datos.usuario, claveCifrada, datos.host, datos.puerto, datos.seguro ? 1 : 0, datos.nombre, ahora, quien];
        if (anterior === null) {
          try {
            await conexion.query<ResultadoEscritura>(
              `INSERT INTO crm_correo_cuenta
                 (id, usuario, clave_cifrada, host, puerto, seguro, nombre, actualizado_en, actualizado_por)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
              valores,
            );
          } catch (error) {
            // Otra petición la creó a la vez: se repite la transacción, que entonces actualiza.
            if (esDuplicado(error)) throw new ErrorReintentar(error);
            throw error;
          }
        } else {
          await conexion.query<ResultadoEscritura>(
            `UPDATE crm_correo_cuenta
                SET usuario = ?, clave_cifrada = ?, host = ?, puerto = ?, seguro = ?, nombre = ?,
                    actualizado_en = ?, actualizado_por = ?
              WHERE id = 1`,
            valores,
          );
        }
        return {
          usuario: datos.usuario,
          clave,
          host: datos.host,
          puerto: datos.puerto,
          seguro: datos.seguro,
          nombre: datos.nombre,
          actualizadoEn: ahora,
          actualizadoPor: quien,
        };
      });
    } finally {
      this.generacion++;
    }
    this.cache = { cuenta, leidaEn: Date.now() };
    this.registro.log(
      `Cuenta de correo del CRM guardada por ${quien ?? 'el líder'}: ${cuenta.usuario} en ${cuenta.host}:${cuenta.puerto}` +
        `${datos.clave === null ? ' (conserva la contraseña anterior)' : ' (contraseña nueva)'}.`,
    );
    return cuentaDeBase(cuenta);
  }

  /** DELETE /lider/correo/cuenta: borra la cuenta guardada (409 si mandan las variables). */
  async borrar(actualizadoPor: string | null): Promise<CuentaCorreoCrm> {
    if (this.mandanVariables) throw conflicto(MENSAJE_MANDAN_VARIABLES);
    this.generacion++;
    let borradas: number;
    try {
      borradas = (await this.bd.ejecutar('DELETE FROM crm_correo_cuenta WHERE id = 1')).affectedRows;
    } finally {
      this.generacion++;
    }
    this.cache = { cuenta: null, leidaEn: Date.now() };
    if (borradas > 0) this.registro.log(`Cuenta de correo del CRM borrada por ${actualizadoPor ?? 'el líder'}.`);
    return cuentaDeBase(null);
  }
}

// ── Prueba ──────────────────────────────────────────────────────────────────

/** Resultado de un envío directo (la prueba), sin pasar por crm_correos. */
export type ResultadoEnvioDirecto =
  | { estado: 'enviado'; smtp: ConfiguracionCorreoCrm['smtp'] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; error: unknown; smtp: ConfiguracionCorreoCrm['smtp'] };

/** Códigos de «no se llegó al servidor» (de nodemailer, de Node y el tope propio ETIEMPO). */
const CODIGOS_CONEXION = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'ETIEMPO',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** El motivo por defecto de describirErrorCorreo (código sin traducción). */
const MOTIVO_GENERICO = 'no se pudo enviar el correo';

/** Un fallo del envío de la prueba en palabras claras, sin la clave ni la respuesta del servidor. */
export function mensajeErrorPrueba(error: unknown, smtp: ConfiguracionCorreoCrm['smtp']): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; responseCode?: unknown };
  const codigo = typeof e.code === 'string' ? e.code : '';
  const respuesta = typeof e.responseCode === 'number' ? e.responseCode : null;
  if (codigo === 'EAUTH' || respuesta === 534 || respuesta === 535) {
    return !smtp || smtp.host === HOST_GMAIL
      ? MENSAJE_AUTH_GMAIL
      : `El servidor de correo (${smtp.host}) rechazó la cuenta o la contraseña: revise que sea la contraseña de aplicación de la cuenta.`;
  }
  if (CODIGOS_CONEXION.has(codigo)) {
    return smtp ? `No se pudo conectar con ${smtp.host}:${smtp.puerto}.` : 'No se pudo conectar con el servidor de correo.';
  }
  const descrito = describirErrorCorreo(error, smtp);
  return descrito.motivo === MOTIVO_GENERICO
    ? `No se pudo enviar el correo de prueba (código ${descrito.codigo}).`
    : `No se pudo enviar el correo de prueba: ${descrito.motivo} (código ${descrito.codigo}).`;
}

/** ResultadoPruebaCorreoCrm de un envío directo. */
export function resultadoPrueba(resultado: ResultadoEnvioDirecto, para: string): ResultadoPruebaCorreoCrm {
  switch (resultado.estado) {
    case 'enviado':
      return { enviado: true, para, mensaje: `Se envió un correo de prueba a ${para}.` };
    case 'sin_configurar':
      return { enviado: false, para, mensaje: MENSAJE_PRUEBA_SIN_CUENTA };
    case 'error':
      return { enviado: false, para, mensaje: mensajeErrorPrueba(resultado.error, resultado.smtp) };
  }
}

/** Tope de envíos en una ventana de tiempo, en memoria (por instancia). */
export class TopeEnMemoria {
  private readonly marcas: number[] = [];

  constructor(
    readonly maximo: number,
    readonly ventanaMs: number,
  ) {}

  /** Toma un cupo y devuelve 0; sin cupo, devuelve los segundos que faltan para que se libere uno. */
  tomar(ahora: number = Date.now()): number {
    let primera = this.marcas[0];
    while (primera !== undefined && primera <= ahora - this.ventanaMs) {
      this.marcas.shift();
      primera = this.marcas[0];
    }
    if (primera !== undefined && this.marcas.length >= this.maximo) {
      return Math.max(1, Math.ceil((primera + this.ventanaMs - ahora) / 1000));
    }
    this.marcas.push(ahora);
    return 0;
  }

  /** Devuelve el último cupo tomado (el intento no llegó a enviar nada). */
  devolver(): void {
    this.marcas.pop();
  }
}
