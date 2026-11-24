/**
 * Configuración del correo del CRM, leída de las variables de entorno al
 * arrancar (como configuracion-odes.ts). Sin cuenta, el modo es
 * 'desactivado' y el CRM funciona igual: los correos quedan «sin configurar»
 * en crm_correos y el líder los reintenta cuando haya cuenta.
 *
 *   CRM_CORREO_MODO        smtp | archivo | memoria | desactivado. Por defecto,
 *                          smtp si están CRM_CORREO_USUARIO y CRM_CORREO_CLAVE;
 *                          si no, desactivado.
 *   CRM_CORREO_USUARIO     la cuenta, que también es la dirección del remitente.
 *   CRM_CORREO_CLAVE       contraseña de aplicación; se le quitan los espacios
 *                          (Google la muestra como «abcd efgh ijkl mnop»).
 *   CRM_CORREO_HOST        por defecto según el dominio de la cuenta (Gmail u
 *                          Outlook/Microsoft 365); con otro dominio, obligatorio.
 *   CRM_CORREO_PUERTO      465 con smtp.gmail.com; si no, 587.
 *   CRM_CORREO_SEGURO      si | no: TLS desde el inicio. Por defecto, si con el
 *                          puerto 465; con no, STARTTLS es obligatorio.
 *   CRM_CORREO_NOMBRE      nombre visible del remitente ('Planeación Sapiencia').
 *   CRM_CORREO_DIRECTORIO  modo archivo: carpeta de los .eml (<tmp>/crm-correos).
 *   CRM_URL_SITIO          base http(s) de los enlaces de los correos (opcional).
 *
 * Un valor inválido detiene el arranque con ErrorDeConfiguracion. La clave
 * nunca aparece en los mensajes ni en el log (describirConfiguracionCorreoCrm).
 */
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';

export const CONFIGURACION_CORREO_CRM = Symbol('CONFIGURACION_CORREO_CRM');

export const MODOS_CORREO_CRM = ['smtp', 'archivo', 'memoria', 'desactivado'] as const;
export type ModoCorreoCrm = (typeof MODOS_CORREO_CRM)[number];

export interface ConfiguracionCorreoCrm {
  modo: ModoCorreoCrm;
  /** Solo en modo 'smtp'. */
  smtp: {
    host: string;
    puerto: number;
    /** true = TLS desde el inicio (465); false = STARTTLS (587). */
    seguro: boolean;
    usuario: string;
    clave: string;
  } | null;
  /** Remitente: nombre visible y dirección (en smtp, la de la cuenta). */
  remitente: { nombre: string; correo: string };
  /** Solo en modo 'archivo': carpeta donde se escriben los .eml. */
  directorio: string | null;
  /** CRM_URL_SITIO: base de los enlaces de los correos (sin barra final), o null. */
  urlSitio: string | null;
}

export const NOMBRE_REMITENTE_CRM = 'Planeación Sapiencia';
/** Remitente cuando no hay cuenta (modos archivo, memoria y desactivado sin CRM_CORREO_USUARIO). */
export const CORREO_REMITENTE_LOCAL = 'crm@localhost';
export const HOST_GMAIL = 'smtp.gmail.com';
export const HOST_MICROSOFT = 'smtp.office365.com';

/** Valor recortado, o undefined si la variable falta o está vacía. */
function leer(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const valor = env[nombre]?.trim();
  return valor ? valor : undefined;
}

/** Dirección de correo de una sola cuenta: sin espacios, comas ni corchetes angulares. */
const CORREO = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

function esCorreo(valor: string): boolean {
  return valor.length <= 254 && CORREO.test(valor);
}

function leerModo(env: NodeJS.ProcessEnv, conCuenta: boolean): ModoCorreoCrm {
  const valor = leer(env, 'CRM_CORREO_MODO');
  if (valor === undefined) return conCuenta ? 'smtp' : 'desactivado';
  const modo = valor.toLowerCase();
  if (!(MODOS_CORREO_CRM as readonly string[]).includes(modo)) {
    throw new ErrorDeConfiguracion(
      `CRM_CORREO_MODO debe ser smtp, archivo, memoria o desactivado (recibido: "${valor}").`,
    );
  }
  return modo as ModoCorreoCrm;
}

function leerUsuario(env: NodeJS.ProcessEnv): string | undefined {
  const valor = leer(env, 'CRM_CORREO_USUARIO');
  if (valor === undefined) return undefined;
  if (!esCorreo(valor)) {
    throw new ErrorDeConfiguracion(
      `CRM_CORREO_USUARIO debe ser la dirección completa de la cuenta, como planeacion@gmail.com (recibido: "${valor}").`,
    );
  }
  return valor;
}

/** La contraseña de aplicación sin ningún espacio (tampoco los que se cuelan al copiarla). */
function leerClave(env: NodeJS.ProcessEnv): string | undefined {
  const valor = env.CRM_CORREO_CLAVE?.replace(/\s+/g, '');
  return valor ? valor : undefined;
}

/** Servidor SMTP que se deduce del dominio de la cuenta, o null. */
export function hostPorDominio(correo: string): string | null {
  const dominio = correo.slice(correo.lastIndexOf('@') + 1).toLowerCase();
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') return HOST_GMAIL;
  if (
    dominio === 'outlook.com' ||
    dominio === 'hotmail.com' ||
    dominio === 'live.com' ||
    dominio.endsWith('.onmicrosoft.com')
  ) {
    return HOST_MICROSOFT;
  }
  return null;
}

const NOMBRE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

function leerHost(env: NodeJS.ProcessEnv, usuario: string): string {
  const valor = leer(env, 'CRM_CORREO_HOST');
  if (valor === undefined) {
    const deducido = hostPorDominio(usuario);
    if (deducido) return deducido;
    throw new ErrorDeConfiguracion(
      `Falta CRM_CORREO_HOST: el servidor de correo solo se deduce para cuentas de Gmail ` +
        `(${HOST_GMAIL}) y de Outlook o Microsoft 365 (${HOST_MICROSOFT}), y la cuenta ` +
        `${usuario} es de otro dominio. Si es una cuenta de Google Workspace, use ` +
        `CRM_CORREO_HOST=${HOST_GMAIL}; si es de Microsoft 365, ${HOST_MICROSOFT}.`,
    );
  }
  if (!NOMBRE_HOST.test(valor)) {
    throw new ErrorDeConfiguracion(
      `CRM_CORREO_HOST debe ser solo el nombre del servidor, sin protocolo ni puerto ` +
        `(p. ej. ${HOST_GMAIL}; el puerto va en CRM_CORREO_PUERTO). Recibido: "${valor}".`,
    );
  }
  return valor.toLowerCase();
}

function leerPuerto(env: NodeJS.ProcessEnv, host: string): number {
  const valor = leer(env, 'CRM_CORREO_PUERTO');
  if (valor === undefined) return host === HOST_GMAIL ? 465 : 587;
  const puerto = Number(valor);
  if (!/^\d+$/.test(valor) || puerto < 1 || puerto > 65535) {
    throw new ErrorDeConfiguracion(
      `CRM_CORREO_PUERTO debe ser un entero entre 1 y 65535 (recibido: "${valor}").`,
    );
  }
  return puerto;
}

function leerSeguro(env: NodeJS.ProcessEnv, puerto: number): boolean {
  const valor = leer(env, 'CRM_CORREO_SEGURO');
  if (valor === undefined) return puerto === 465;
  const normal = valor.toLowerCase();
  if (['si', 'sí', 'true', '1'].includes(normal)) return true;
  if (['no', 'false', '0'].includes(normal)) return false;
  throw new ErrorDeConfiguracion(`CRM_CORREO_SEGURO debe ser si o no (recibido: "${valor}").`);
}

/** Nombre visible: una línea, sin caracteres de control. */
function leerNombre(env: NodeJS.ProcessEnv): string {
  const valor = textoLinea((env.CRM_CORREO_NOMBRE ?? '').replace(/[\t\r\n]+/g, ' '));
  return valor ? Array.from(valor).slice(0, 100).join('') : NOMBRE_REMITENTE_CRM;
}

function leerUrlSitio(env: NodeJS.ProcessEnv): string | null {
  const valor = leer(env, 'CRM_URL_SITIO');
  if (valor === undefined) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErrorDeConfiguracion(
      `CRM_URL_SITIO debe ser una URL completa, como https://sitio.gov.co (recibido: "${valor}").`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ErrorDeConfiguracion('CRM_URL_SITIO debe empezar por http:// o https://.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ErrorDeConfiguracion(
      'CRM_URL_SITIO no puede llevar usuario, contraseña, consulta (?) ni fragmento (#): solo el sitio y, si acaso, una ruta.',
    );
  }
  return url.href.replace(/\/+$/, '');
}

/** Lee y valida la configuración del correo del CRM. Lanza ErrorDeConfiguracion. */
export function cargarConfiguracionCorreoCrm(env: NodeJS.ProcessEnv): ConfiguracionCorreoCrm {
  const usuario = leerUsuario(env);
  const clave = leerClave(env);
  const modo = leerModo(env, usuario !== undefined && clave !== undefined);

  let smtp: ConfiguracionCorreoCrm['smtp'] = null;
  if (modo === 'smtp') {
    if (usuario === undefined || clave === undefined) {
      throw new ErrorDeConfiguracion(
        'El correo del CRM en modo smtp necesita CRM_CORREO_USUARIO (la cuenta) y ' +
          'CRM_CORREO_CLAVE (su contraseña de aplicación).',
      );
    }
    const host = leerHost(env, usuario);
    const puerto = leerPuerto(env, host);
    smtp = { host, puerto, seguro: leerSeguro(env, puerto), usuario, clave };
  }

  return Object.freeze({
    modo,
    smtp,
    remitente: { nombre: leerNombre(env), correo: usuario ?? CORREO_REMITENTE_LOCAL },
    directorio:
      modo === 'archivo'
        ? resolve(leer(env, 'CRM_CORREO_DIRECTORIO') ?? join(tmpdir(), 'crm-correos'))
        : null,
    urlSitio: leerUrlSitio(env),
  });
}

/**
 * Una línea para el log de arranque, sin la clave:
 * «correo del CRM: smtp smtp.gmail.com:465 como x@gmail.com (TLS desde el inicio)».
 */
export function describirConfiguracionCorreoCrm(config: ConfiguracionCorreoCrm): string {
  const enlaces = config.urlSitio
    ? `enlaces a ${config.urlSitio}`
    : 'enlaces con el origen de cada petición';
  switch (config.modo) {
    case 'smtp': {
      const smtp = config.smtp;
      if (!smtp) return 'correo del CRM: smtp sin cuenta';
      const tls = smtp.seguro ? 'TLS desde el inicio' : 'STARTTLS obligatorio';
      return `correo del CRM: smtp ${smtp.host}:${smtp.puerto} como ${smtp.usuario} (${tls}); ${enlaces}`;
    }
    case 'archivo':
      return `correo del CRM: archivo (los .eml quedan en ${config.directorio ?? '?'}; no sale nada); ${enlaces}`;
    case 'memoria':
      return `correo del CRM: memoria (solo pruebas; no sale nada); ${enlaces}`;
    case 'desactivado':
      return (
        'correo del CRM: desactivado (configure CRM_CORREO_USUARIO y CRM_CORREO_CLAVE); ' +
        'los avisos quedan «sin configurar»'
      );
  }
}
