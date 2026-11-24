/**
 * Transporte de los correos del CRM con nodemailer, según el modo de
 * ConfiguracionCorreoCrm:
 *
 * - smtp: la cuenta configurada (Gmail, Microsoft 365…), TLS desde el inicio
 *   (465) o STARTTLS obligatorio (587), con tiempos cortos: Cloud Run solo da
 *   CPU durante la petición que envía.
 * - archivo: arma el mensaje MIME completo y lo escribe como .eml en la
 *   carpeta configurada (pruebas locales sin cuenta).
 * - memoria: arma el mensaje MIME (así se valida igual que en smtp) y se lo
 *   entrega al servicio, que lo guarda en un arreglo (pruebas).
 * - desactivado: sin transporte.
 *
 * Los mensajes nunca leen archivos ni URL (disableFileAccess y
 * disableUrlAccess): los adjuntos van siempre como Buffer.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTransport, type SendMailOptions } from 'nodemailer';
import type { ConfiguracionCorreoCrm } from './configuracion-correo.js';

/** Un correo listo para salir, con los adjuntos ya leídos. */
export interface CorreoSalienteCrm {
  correoId: number;
  para: string;
  responderA: string | null;
  asunto: string;
  texto: string;
  html: string;
  adjuntos: Array<{ nombre: string; mime: string; contenido: Buffer }>;
}

export interface TransporteCrm {
  /** Envía el correo; devuelve el Message-ID, si lo hay. Lanza si no sale. */
  enviar(correo: CorreoSalienteCrm): Promise<{ idMensaje: string | null }>;
}

/** Tiempos del envío SMTP (ms). El total corta la espera aunque nodemailer siga intentando. */
export const TIEMPOS_CORREO_CRM = {
  conexion: 10_000,
  saludo: 10_000,
  socket: 20_000,
  total: 25_000,
} as const;

/** Error del tope total de espera (código propio, como los de nodemailer). */
export class ErrorTiempoCorreo extends Error {
  readonly code = 'ETIEMPO';
  constructor(ms: number) {
    super(`El servidor de correo no respondió en ${Math.round(ms / 1000)} s.`);
    this.name = 'ErrorTiempoCorreo';
  }
}

/** La promesa, o ErrorTiempoCorreo si tarda más de `ms`. */
export async function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new ErrorTiempoCorreo(ms)), ms);
    temporizador.unref();
  });
  try {
    // Si vence el tope, Promise.race deja atendido el rechazo tardío de `promesa`.
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Nombre del .eml en modo archivo: AAAAMMDD-HHmmss (UTC) y el id del correo. */
export function nombreEml(correoId: number, fecha: Date = new Date()): string {
  const sello = fecha.toISOString().replace(/\.\d+Z$/, '').replace(/-|:/g, '').replace('T', '-');
  return `${sello}-${correoId}.eml`;
}

function opcionesMensaje(config: ConfiguracionCorreoCrm, correo: CorreoSalienteCrm): SendMailOptions {
  return {
    from: { name: config.remitente.nombre, address: config.remitente.correo },
    to: correo.para,
    ...(correo.responderA ? { replyTo: correo.responderA } : {}),
    subject: correo.asunto,
    text: correo.texto,
    html: correo.html,
    attachments: correo.adjuntos.map((a) => ({
      filename: a.nombre,
      content: a.contenido,
      contentType: a.mime,
    })),
    // Aviso automático (RFC 3834): las respuestas automáticas (vacaciones) no contestan.
    headers: { 'Auto-Submitted': 'auto-generated' },
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

/** Lo común a todos los transportes: ni archivos ni URL, y un solo destinatario por mensaje. */
const SEGURIDAD = { disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1 } as const;

/**
 * El transporte del modo configurado (null si está desactivado). Se crea una
 * vez: en smtp no abre ninguna conexión hasta el primer envío.
 * `alArmarEnMemoria` recibe cada correo del modo memoria.
 */
export function crearTransporteCrm(
  config: ConfiguracionCorreoCrm,
  alArmarEnMemoria: (correo: CorreoSalienteCrm) => void = () => undefined,
): TransporteCrm | null {
  switch (config.modo) {
    case 'desactivado':
      return null;
    case 'smtp': {
      const smtp = config.smtp;
      if (!smtp) throw new Error('El correo del CRM está en modo smtp sin cuenta.');
      const transporte = createTransport({
        host: smtp.host,
        port: smtp.puerto,
        secure: smtp.seguro,
        // Sin TLS desde el inicio, STARTTLS es obligatorio: la clave nunca va en claro.
        requireTLS: !smtp.seguro,
        auth: { user: smtp.usuario, pass: smtp.clave },
        connectionTimeout: TIEMPOS_CORREO_CRM.conexion,
        greetingTimeout: TIEMPOS_CORREO_CRM.saludo,
        socketTimeout: TIEMPOS_CORREO_CRM.socket,
        dnsTimeout: TIEMPOS_CORREO_CRM.conexion,
        tls: { minVersion: 'TLSv1.2' },
        ...SEGURIDAD,
      });
      return {
        async enviar(correo) {
          const info = await transporte.sendMail(opcionesMensaje(config, correo));
          return { idMensaje: info.messageId || null };
        },
      };
    }
    case 'archivo':
    case 'memoria': {
      const transporte = createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'windows',
        ...SEGURIDAD,
      });
      const directorio =
        config.modo === 'archivo' ? (config.directorio ?? join(tmpdir(), 'crm-correos')) : null;
      return {
        async enviar(correo) {
          const info = await transporte.sendMail(opcionesMensaje(config, correo));
          if (directorio) {
            if (!Buffer.isBuffer(info.message)) throw new Error('nodemailer no entregó el mensaje armado.');
            await mkdir(directorio, { recursive: true });
            await writeFile(join(directorio, nombreEml(correo.correoId)), info.message);
          } else {
            alArmarEnMemoria(correo);
          }
          return { idMensaje: info.messageId || null };
        },
      };
    }
  }
}

/** Motivo de cada código de error (de nodemailer, de Node o propio), en minúscula para «El correo quedó pendiente: …». */
const MOTIVOS: Readonly<Record<string, string>> = {
  EAUTH: 'el servidor de correo rechazó el usuario o la contraseña de aplicación',
  ENOAUTH: 'falta el usuario o la contraseña de la cuenta de correo',
  ETIEMPO: 'el servidor de correo no respondió a tiempo',
  ETIMEDOUT: 'el servidor de correo no respondió a tiempo',
  ECONNECTION: 'se cortó la conexión con el servidor de correo',
  ECONNRESET: 'se cortó la conexión con el servidor de correo',
  ESOCKET: 'no se pudo conectar con el servidor de correo',
  ECONNREFUSED: 'el servidor de correo no aceptó la conexión',
  EDNS: 'no se encontró el servidor de correo',
  ENOTFOUND: 'no se encontró el servidor de correo',
  EAI_AGAIN: 'no se encontró el servidor de correo',
  ETLS: 'falló la conexión segura (TLS) con el servidor de correo',
  EREQUIRETLS: 'el servidor de correo no ofrece conexión segura (STARTTLS)',
  EENVELOPE: 'el servidor de correo rechazó el remitente o el destinatario',
  EMAXRECIPIENTS: 'la dirección del destinatario no es válida',
  EMESSAGE: 'el servidor de correo rechazó el mensaje',
  EPROTOCOL: 'el servidor de correo respondió algo inesperado',
  ESTREAM: 'no se pudo armar el mensaje',
  EDESTINO: 'la dirección del destinatario no es válida',
  EADJUNTO: 'no se pudo leer un archivo adjunto',
};

export interface ErrorCorreoDescrito {
  /** Código corto para el log (EAUTH, ETIEMPO…), sin datos personales. */
  codigo: string;
  /** Motivo en español, en minúscula y sin punto final. */
  motivo: string;
  /** Para crm_correos.ultimo_error: el motivo y lo que dijo el servidor, sin la clave; máximo 1000. */
  detalle: string;
}

/** Texto de una línea: sin caracteres de control, espacios simples. */
function enUnaLinea(texto: string): string {
  return Array.from(texto, (c) => ((c.codePointAt(0) ?? 0) < 0x20 || c === '\u007f' ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function cortar(texto: string, maximo: number): string {
  const caracteres = Array.from(texto);
  return caracteres.length <= maximo ? texto : `${caracteres.slice(0, maximo - 1).join('')}…`;
}

/** Quita de un texto la clave y sus formas en base64 (AUTH PLAIN y AUTH LOGIN). */
export function sinSecretos(texto: string, smtp: ConfiguracionCorreoCrm['smtp']): string {
  if (!smtp?.clave) return texto;
  const secretos = [
    smtp.clave,
    Buffer.from(smtp.clave, 'utf8').toString('base64'),
    Buffer.from(`\u0000${smtp.usuario}\u0000${smtp.clave}`, 'utf8').toString('base64'),
    Buffer.from(`${smtp.usuario}\u0000${smtp.clave}`, 'utf8').toString('base64'),
  ];
  let limpio = texto;
  for (const secreto of secretos) {
    if (secreto.length >= 4) limpio = limpio.split(secreto).join('[oculto]');
  }
  return limpio;
}

/**
 * Describe un fallo del envío para la fila (ultimo_error), para la persona
 * (motivo) y para el log (código). Nunca incluye la clave ni el cuerpo del
 * correo: de nodemailer solo se toma la respuesta del servidor SMTP.
 */
export function describirErrorCorreo(error: unknown, smtp: ConfiguracionCorreoCrm['smtp']): ErrorCorreoDescrito {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
    message?: unknown;
  };
  const codigo = typeof e.code === 'string' && /^[A-Z][A-Z0-9_]{1,30}$/.test(e.code) ? e.code : 'DESCONOCIDO';
  const motivo = MOTIVOS[codigo] ?? 'no se pudo enviar el correo';
  const servidor =
    typeof e.response === 'string' && e.response.trim()
      ? e.response
      : codigo === 'DESCONOCIDO' && typeof e.message === 'string'
        ? e.message
        : '';
  const codigoSmtp = typeof e.responseCode === 'number' ? ` ${e.responseCode}` : '';
  // La clave se quita antes de cortar: un recorte no debe dejar media clave a la vista.
  const respuesta = servidor ? `: ${cortar(enUnaLinea(sinSecretos(servidor, smtp)), 600)}` : '';
  const detalle = `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)} (${codigo}${codigoSmtp}${respuesta}).`;
  return { codigo, motivo, detalle: cortar(enUnaLinea(sinSecretos(detalle, smtp)), 1000) };
}
