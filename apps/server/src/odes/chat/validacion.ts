import type { Request } from 'express';
import { z } from 'zod';
import { errorChat } from './errores-chat.js';
import { type ErrorChat, LIMITES_CHAT, type MensajeChat, PATRON_MARCA_CITA } from './protocolo.js';

/**
 * Validación de POST /api/odes/chat ANTES de abrir el flujo SSE. Los errores
 * se responden como JSON ErrorChat con status 400 (forma inválida) o 413
 * (demasiado grande).
 */

export type ResultadoValidacion =
  | { readonly ok: true; readonly mensajes: MensajeChat[] }
  | { readonly ok: false; readonly status: 400 | 413; readonly error: ErrorChat };

const esquemaSolicitud = z.object({
  mensajes: z.array(
    z.object({
      rol: z.enum(['usuario', 'asistente']),
      texto: z.string(),
    }),
  ),
});

function invalida(mensaje: string): ResultadoValidacion {
  return { ok: false, status: 400, error: errorChat('solicitud_invalida', mensaje) };
}

function demasiadoGrande(mensaje: string): ResultadoValidacion {
  return { ok: false, status: 413, error: errorChat('solicitud_invalida', mensaje) };
}

/** Quita caracteres de control (salvo tabulador y saltos de línea). */
function sinControl(texto: string): string {
  let resultado = '';
  for (const caracter of texto) {
    const codigo = caracter.charCodeAt(0);
    const control = (codigo < 0x20 && codigo !== 0x09 && codigo !== 0x0a && codigo !== 0x0d) || codigo === 0x7f;
    if (!control) resultado += caracter;
  }
  return resultado;
}

function limpiar(texto: string): string {
  return sinControl(texto).replace(/\r\n?/g, '\n').trim();
}

/** Mensajes de usuario y del asistente que caben en maxMensajes, alternados y terminando en una pregunta. */
const PREGUNTAS_MAXIMAS = Math.ceil(LIMITES_CHAT.maxMensajes / 2);
const RESPUESTAS_MAXIMAS = Math.floor((LIMITES_CHAT.maxMensajes - 1) / 2);

/**
 * Tope de la conversación ya normalizada: lo que cabe en una alternada dentro
 * de los límites (10 preguntas de 2000 y 9 respuestas de 12 000 = 128 000
 * caracteres). Se mide DESPUÉS de unir los mensajes seguidos del mismo rol:
 * antes, 18 respuestas seguidas se convertían en un solo turno de 216 000.
 */
export const MAX_CARACTERES_CONVERSACION =
  PREGUNTAS_MAXIMAS * LIMITES_CHAT.maxCaracteresUsuario +
  RESPUESTAS_MAXIMAS * LIMITES_CHAT.maxCaracteresAsistente;

/**
 * Un turno de usuario ya unido admite dos preguntas (la tolerancia de una
 * pregunta cuya respuesta quedó vacía); uno del asistente, una respuesta
 * (el cliente nunca envía dos seguidas).
 */
export const MAX_CARACTERES_TURNO_USUARIO = 2 * LIMITES_CHAT.maxCaracteresUsuario;
export const MAX_CARACTERES_TURNO_ASISTENTE = LIMITES_CHAT.maxCaracteresAsistente;

/**
 * Valida y normaliza la conversación:
 * - forma y límites de LIMITES_CHAT (cantidad 400/413, longitudes 413);
 * - quita las marcas de cita ⟦n⟧ que el cliente pudo dejar en las respuestas;
 * - descarta respuestas vacías (p. ej. una pregunta que falló), une mensajes
 *   seguidos del mismo rol y descarta respuestas al inicio, para que los
 *   roles alternen empezando por el usuario;
 * - después de unir, cada turno y el total respetan los topes de arriba
 *   (413): unir no puede servir para enviar más de lo que permiten los
 *   límites por mensaje;
 * - el último mensaje debe ser del usuario y no estar vacío.
 */
export function validarSolicitud(cuerpo: unknown): ResultadoValidacion {
  const resultado = esquemaSolicitud.safeParse(cuerpo);
  if (!resultado.success) {
    return invalida(
      'La solicitud no tiene el formato esperado: { mensajes: [{ rol, texto }] }.',
    );
  }
  const { mensajes } = resultado.data;
  if (mensajes.length === 0) return invalida('La conversación está vacía.');
  if (mensajes.length > LIMITES_CHAT.maxMensajes) {
    return demasiadoGrande(
      `La conversación es demasiado larga (máximo ${LIMITES_CHAT.maxMensajes} mensajes). Empieza una conversación nueva.`,
    );
  }
  for (const mensaje of mensajes) {
    if (mensaje.rol === 'usuario' && mensaje.texto.length > LIMITES_CHAT.maxCaracteresUsuario) {
      return demasiadoGrande(
        `La pregunta es demasiado larga (máximo ${LIMITES_CHAT.maxCaracteresUsuario} caracteres). Acórtala e intenta de nuevo.`,
      );
    }
    if (mensaje.rol === 'asistente' && mensaje.texto.length > LIMITES_CHAT.maxCaracteresAsistente) {
      return demasiadoGrande(
        `Una respuesta anterior es demasiado larga (máximo ${LIMITES_CHAT.maxCaracteresAsistente} caracteres).`,
      );
    }
  }

  const normalizados: MensajeChat[] = [];
  /** Caracteres de cada turno normalizado sin contar los separadores de la unión. */
  const largos: number[] = [];
  for (const mensaje of mensajes) {
    const texto = limpiar(
      mensaje.rol === 'asistente' ? mensaje.texto.replace(PATRON_MARCA_CITA, '') : mensaje.texto,
    );
    if (!texto) continue;
    const anterior = normalizados.at(-1);
    if (anterior?.rol === mensaje.rol) {
      normalizados[normalizados.length - 1] = { rol: mensaje.rol, texto: `${anterior.texto}\n\n${texto}` };
      largos[largos.length - 1] = (largos.at(-1) ?? 0) + texto.length;
    } else if (anterior || mensaje.rol === 'usuario') {
      normalizados.push({ rol: mensaje.rol, texto });
      largos.push(texto.length);
    }
  }
  const ultimo = mensajes.at(-1);
  if (ultimo?.rol !== 'usuario' || !limpiar(ultimo.texto) || normalizados.at(-1)?.rol !== 'usuario') {
    return invalida('El último mensaje debe ser una pregunta no vacía.');
  }
  const conversacionLarga = demasiadoGrande(
    'La conversación es demasiado larga. Empieza una conversación nueva.',
  );
  let total = 0;
  for (const [posicion, mensaje] of normalizados.entries()) {
    const largo = largos[posicion] ?? 0;
    total += largo;
    if (mensaje.rol === 'asistente' && largo > MAX_CARACTERES_TURNO_ASISTENTE) {
      return demasiadoGrande(
        `Una respuesta anterior es demasiado larga (máximo ${LIMITES_CHAT.maxCaracteresAsistente} caracteres).`,
      );
    }
    if (mensaje.rol === 'usuario' && largo > MAX_CARACTERES_TURNO_USUARIO) return conversacionLarga;
  }
  if (total > MAX_CARACTERES_CONVERSACION) return conversacionLarga;
  return { ok: true, mensajes: normalizados };
}

const PUERTOS_POR_DEFECTO: Readonly<Record<string, string>> = { 'http:': '80', 'https:': '443' };

/**
 * Protección contra peticiones de otros sitios (CSRF), con el mismo criterio
 * que `app.enableCsrfProtection()` de Nest 12 (Fetch Metadata con respaldo
 * Origin/Host): un formulario o un script de otro dominio no puede hacer que
 * los navegadores de los visitantes gasten el cupo del asistente.
 */
export function origenPermitido(req: Request): boolean {
  const sitio = req.get('sec-fetch-site');
  if (sitio) return sitio === 'same-origin' || sitio === 'none';
  const origen = req.get('origin');
  if (!origen) return true; // cliente que no es navegador (curl, pruebas)
  const host = req.get('host')?.toLowerCase();
  if (!host) return false;
  try {
    const url = new URL(origen);
    if (url.host === host) return true;
    const puerto = PUERTOS_POR_DEFECTO[url.protocol];
    return !url.port && puerto !== undefined && `${url.hostname}:${puerto}` === host;
  } catch {
    return false;
  }
}

/**
 * Solo JSON: el parser urlencoded de Nest convertiría un formulario HTML de
 * otro sitio en un cuerpo válido, y los formularios no pasan por CORS.
 */
export function esJson(req: Request): boolean {
  return Boolean(req.is('application/json'));
}
