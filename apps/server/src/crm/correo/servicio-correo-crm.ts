/**
 * Bandeja de correos del CRM (crm_correos) y su envío con nodemailer.
 * Flujo: el llamador hace `encolar` DENTRO de su transacción (la fila queda
 * 'pendiente', o 'sin_configurar' si no hay cuenta) y, después del commit,
 * `enviar` en la misma petición (Cloud Run no da CPU después de responder).
 * `enviar` nunca lanza: devuelve el estado y deja el error en la fila.
 *
 * Dos envíos del mismo correo a la vez (doble clic en «reintentar», dos
 * instancias) no salen dos veces: antes de enviar, `enviar` «reclama» la fila
 * con un UPDATE condicional sobre ultimo_intento_en; un intento que quedó a
 * medias (la instancia se apagó) se puede reclamar pasados 60 s.
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type { CorreoCrm, EstadoAvisoCrm, EstadoCorreo, TipoCorreoCrm } from '../api-crm.js';
import { ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import { aIso } from '../compartido/fechas.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion, ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { conflicto, noEncontrado } from '../../repositorio/errores-repositorio.js';
import {
  CONFIGURACION_CORREO_CRM,
  type ConfiguracionCorreoCrm,
  describirConfiguracionCorreoCrm,
} from './configuracion-correo.js';
import {
  conTiempoLimite,
  type CorreoSalienteCrm,
  crearTransporteCrm,
  describirErrorCorreo,
  TIEMPOS_CORREO_CRM,
  type TransporteCrm,
} from './transporte.js';

export interface MensajeCrm {
  tipo: TipoCorreoCrm;
  tareaId: number | null;
  para: string;
  /** Reply-To (p. ej. el correo del responsable en el aviso al líder), o null. */
  responderA: string | null;
  asunto: string;
  texto: string;
  html: string;
  /** Ids de crm_tarea_archivos que van adjuntos (ya filtrados por tamaño por el llamador). */
  adjuntos: number[];
}

/** Lo que guarda el modo 'memoria' (pruebas). */
export interface MensajeEnviadoCrm {
  correoId: number;
  para: string;
  responderA: string | null;
  asunto: string;
  texto: string;
  html: string;
  adjuntos: { nombre: string; mime: string; bytes: number }[];
}

/** Un intento con ultimo_intento_en más reciente que esto se considera en curso. */
export const INTENTO_EN_CURSO_MS = 60_000;

export const MENSAJE_ENVIADO = 'El correo se envió.';
export const MENSAJE_SIN_CONFIGURAR = 'El correo quedó pendiente: el correo del CRM no está configurado.';

/** Dirección de una sola cuenta (sin comas ni corchetes: nada que nodemailer parta en varias). */
const DIRECCION = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

function esDireccion(valor: string | null): valor is string {
  return valor !== null && valor.length <= 254 && DIRECCION.test(valor);
}

/** Una línea sin saltos ni caracteres de control (para columnas cortas y cabeceras). */
function enUnaLinea(texto: string, maximo: number): string {
  const limpio = Array.from(texto, (c) => ((c.codePointAt(0) ?? 0) < 0x20 || c === '\u007f' ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(limpio).slice(0, maximo).join('');
}

/** Ids de crm_tarea_archivos de la columna `adjuntos` (JSON); lo que no sea un id válido se ignora. */
export function idsAdjuntos(valor: unknown): number[] {
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  const ids = lista.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)];
}

interface FilaCorreo extends RowDataPacket {
  id: number;
  tarea_id: number | null;
  tarea_titulo: string | null;
  tipo: string;
  para: string;
  responder_a: string | null;
  asunto: string;
  adjuntos: unknown;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  creado_en: Date | string;
  enviado_en: Date | string | null;
}

interface FilaCuerpo extends FilaCorreo {
  cuerpo_texto: string;
  cuerpo_html: string;
}

interface FilaAdjunto extends RowDataPacket {
  id: number;
  nombre: string;
  archivo_id: number;
  mime: string;
}

const COLUMNAS_LISTA = `c.id, c.tarea_id, t.titulo AS tarea_titulo, c.tipo, c.para, c.responder_a, c.asunto,
       c.adjuntos, c.estado, c.intentos, c.ultimo_error, c.creado_en, c.enviado_en`;
const DESDE_LISTA = 'FROM crm_correos c LEFT JOIN crm_tareas t ON t.id = c.tarea_id';

function aCorreoCrm(fila: FilaCorreo): CorreoCrm {
  return {
    id: Number(fila.id),
    tareaId: fila.tarea_id === null ? null : Number(fila.tarea_id),
    tareaTitulo: fila.tarea_titulo ?? null,
    tipo: fila.tipo as TipoCorreoCrm,
    para: fila.para,
    asunto: fila.asunto,
    estado: fila.estado as EstadoCorreo,
    intentos: Number(fila.intentos),
    error: fila.ultimo_error ?? null,
    adjuntos: idsAdjuntos(fila.adjuntos).length,
    creadoEn: aIso(fila.creado_en) ?? '',
    enviadoEn: aIso(fila.enviado_en),
  };
}

function codigoDe(error: unknown): string {
  const codigo = (error as { code?: unknown } | null)?.code;
  if (typeof codigo === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(codigo)) return codigo;
  return error instanceof Error ? error.name : 'desconocido';
}

@Injectable()
export class ServicioCorreoCrm implements OnModuleInit {
  private readonly registro = new Logger('CRM');
  private readonly enMemoria: MensajeEnviadoCrm[] = [];
  private readonly transporte: TransporteCrm | null;

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_CORREO_CRM) private readonly config: ConfiguracionCorreoCrm,
    @Inject(ServicioArchivosCrm) private readonly archivos: ServicioArchivosCrm,
  ) {
    this.transporte = crearTransporteCrm(config, (correo) => {
      this.enMemoria.push({
        correoId: correo.correoId,
        para: correo.para,
        responderA: correo.responderA,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        adjuntos: correo.adjuntos.map((a) => ({ nombre: a.nombre, mime: a.mime, bytes: a.contenido.length })),
      });
    });
  }

  /** Una línea en el log al arrancar: modo, servidor y cuenta (nunca la clave). */
  onModuleInit(): void {
    this.registro.log(describirConfiguracionCorreoCrm(this.config));
  }

  /** Hay cuenta de correo (modo 'smtp', 'archivo' o 'memoria'). */
  get configurado(): boolean {
    return this.config.modo !== 'desactivado';
  }

  /** CRM_URL_SITIO, o null (el llamador usa entonces el origen de la petición). */
  get urlSitio(): string | null {
    return this.config.urlSitio;
  }

  /** Inserta el correo en crm_correos dentro de la transacción del llamador. Devuelve su id. */
  async encolar(conexion: Conexion, mensaje: MensajeCrm): Promise<number> {
    const adjuntos = JSON.stringify(idsAdjuntos(mensaje.adjuntos));
    if (adjuntos.length > 1000) throw new Error('Demasiados adjuntos para un correo del CRM.');
    const responderA = mensaje.responderA === null ? '' : enUnaLinea(mensaje.responderA, 254);
    const [resultado] = await conexion.query<ResultadoEscritura>(
      `INSERT INTO crm_correos
         (tarea_id, tipo, para, responder_a, asunto, cuerpo_texto, cuerpo_html, adjuntos, estado, intentos, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        mensaje.tareaId,
        mensaje.tipo,
        enUnaLinea(mensaje.para, 254),
        responderA || null,
        enUnaLinea(mensaje.asunto, 255),
        mensaje.texto,
        mensaje.html,
        adjuntos,
        this.configurado ? 'pendiente' : 'sin_configurar',
        new Date(),
      ],
    );
    return Number(resultado.insertId);
  }

  /**
   * Intenta enviar ya el correo `correoId` (con tiempo límite) y actualiza su
   * fila (enviado / error / sin_configurar, intentos, último error). Nunca
   * lanza. El `mensaje` del resultado es genérico («El correo se envió.»,
   * «El correo quedó pendiente: …»); el llamador puede reemplazarlo.
   */
  async enviar(correoId: number): Promise<EstadoAvisoCrm> {
    try {
      return await this.intentar(correoId);
    } catch (error) {
      // Solo llega aquí un fallo de la base antes de enviar: la fila sigue como estaba.
      this.registro.error(`Correo ${correoId}: no se pudo procesar (${codigoDe(error)}).`);
      return {
        correoId,
        estado: 'pendiente',
        mensaje: 'El correo quedó pendiente: no se pudo consultar la base de datos.',
      };
    }
  }

  private async intentar(correoId: number): Promise<EstadoAvisoCrm> {
    const fila = await this.leerFila(correoId);
    if (!fila) return { correoId, estado: 'error', mensaje: 'El correo no existe.' };
    if (fila.estado === 'enviado') return { correoId, estado: 'enviado', mensaje: MENSAJE_ENVIADO };

    if (!this.transporte) {
      await this.bd.ejecutar(
        `UPDATE crm_correos SET estado = 'sin_configurar' WHERE id = ? AND estado <> 'enviado'`,
        [correoId],
      );
      return { correoId, estado: 'sin_configurar', mensaje: MENSAJE_SIN_CONFIGURAR };
    }

    // Reclamar la fila: nadie más la está enviando (o su intento quedó a medias hace más de 60 s).
    const ahora = new Date();
    const reclamo = await this.bd.ejecutar(
      `UPDATE crm_correos SET estado = 'pendiente', ultimo_intento_en = ?
        WHERE id = ? AND estado <> 'enviado'
          AND (estado <> 'pendiente' OR ultimo_intento_en IS NULL OR ultimo_intento_en < ?)`,
      [ahora, correoId, new Date(ahora.getTime() - INTENTO_EN_CURSO_MS)],
    );
    if (reclamo.affectedRows < 1) {
      const actual = await this.leerFila(correoId);
      if (!actual) return { correoId, estado: 'error', mensaje: 'El correo no existe.' };
      if (actual.estado === 'enviado') return { correoId, estado: 'enviado', mensaje: MENSAJE_ENVIADO };
      const estado = actual.estado as EstadoCorreo;
      return {
        correoId,
        estado,
        mensaje:
          estado === 'pendiente'
            ? 'El correo quedó pendiente: otra solicitud lo está enviando en este momento.'
            : 'El correo quedó pendiente: no salió en el intento de otra solicitud.',
      };
    }

    let idMensaje: string | null;
    try {
      const correo = await this.armar(fila);
      ({ idMensaje } = await conTiempoLimite(this.transporte.enviar(correo), TIEMPOS_CORREO_CRM.total));
    } catch (error) {
      const descrito = describirErrorCorreo(error, this.config.smtp);
      this.registro.warn(`Correo ${correoId} (${fila.tipo}): no salió [${descrito.codigo}].`);
      await this.bd.ejecutar(
        `UPDATE crm_correos SET estado = 'error', intentos = intentos + 1, ultimo_error = ? WHERE id = ?`,
        [descrito.detalle, correoId],
      );
      return { correoId, estado: 'error', mensaje: `El correo quedó pendiente: ${descrito.motivo}.` };
    }

    try {
      await this.bd.ejecutar(
        `UPDATE crm_correos
            SET estado = 'enviado', enviado_en = ?, id_mensaje = ?, intentos = intentos + 1, ultimo_error = NULL
          WHERE id = ?`,
        [new Date(), idMensaje === null ? null : enUnaLinea(idMensaje, 255), correoId],
      );
    } catch (error) {
      // Ya salió: no se informa como error (reintentarlo lo mandaría dos veces).
      this.registro.error(`Correo ${correoId}: salió, pero no se pudo marcar como enviado (${codigoDe(error)}).`);
    }
    this.registro.log(`Correo ${correoId} (${fila.tipo}): enviado.`);
    return { correoId, estado: 'enviado', mensaje: MENSAJE_ENVIADO };
  }

  /** El correo listo para el transporte: valida las direcciones y lee los adjuntos. */
  private async armar(fila: FilaCuerpo): Promise<CorreoSalienteCrm> {
    if (!esDireccion(fila.para)) {
      throw Object.assign(new Error('La dirección del destinatario no es válida.'), { code: 'EDESTINO' });
    }
    return {
      correoId: Number(fila.id),
      para: fila.para,
      responderA: esDireccion(fila.responder_a) ? fila.responder_a : null,
      asunto: enUnaLinea(fila.asunto, 255),
      texto: fila.cuerpo_texto,
      html: fila.cuerpo_html,
      adjuntos: await this.leerAdjuntos(idsAdjuntos(fila.adjuntos)),
    };
  }

  /** Nombre, tipo y contenido de los adjuntos, en el orden de `ids`; los que ya no existen se omiten. */
  private async leerAdjuntos(ids: number[]): Promise<CorreoSalienteCrm['adjuntos']> {
    if (ids.length === 0) return [];
    const filas = await this.bd.filas<FilaAdjunto>(
      `SELECT ta.id, ta.nombre, ta.archivo_id, a.mime
         FROM crm_tarea_archivos ta
         JOIN crm_almacen_archivos a ON a.id = ta.archivo_id
        WHERE ta.id IN (?)`,
      [ids],
    );
    const porId = new Map(filas.map((f) => [Number(f.id), f]));
    const adjuntos: CorreoSalienteCrm['adjuntos'] = [];
    for (const id of ids) {
      const fila = porId.get(id);
      if (!fila) continue; // lo quitaron después de encolar el correo
      let contenido: Buffer;
      try {
        contenido = await this.archivos.leerCompleto(Number(fila.archivo_id));
      } catch (error) {
        throw Object.assign(new Error(`No se pudo leer el adjunto ${id}.`, { cause: error }), { code: 'EADJUNTO' });
      }
      adjuntos.push({ nombre: fila.nombre, mime: fila.mime, contenido });
    }
    return adjuntos;
  }

  private async leerFila(correoId: number): Promise<FilaCuerpo | null> {
    if (!Number.isSafeInteger(correoId) || correoId <= 0) return null;
    const filas = await this.bd.filas<FilaCuerpo>(
      `SELECT ${COLUMNAS_LISTA}, c.cuerpo_texto, c.cuerpo_html ${DESDE_LISTA} WHERE c.id = ?`,
      [correoId],
    );
    return filas[0] ?? null;
  }

  /** Reintenta un correo que no salió (404 si no existe; 409 si ya se envió). Devuelve la fila actualizada. */
  async reintentar(correoId: number): Promise<CorreoCrm> {
    const fila = await this.leerFila(correoId);
    if (!fila) throw noEncontrado('El correo no existe.');
    if (fila.estado === 'enviado') throw conflicto('Ese correo ya se envió.');
    await this.enviar(correoId);
    const actualizada = await this.leerFila(correoId);
    if (!actualizada) throw noEncontrado('El correo no existe.');
    return aCorreoCrm(actualizada);
  }

  /** Los más recientes primero (límite por defecto 200). */
  async listar(filtro: { estado?: EstadoCorreo; tareaId?: number; limite?: number } = {}): Promise<CorreoCrm[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (filtro.estado !== undefined) {
      condiciones.push('c.estado = ?');
      valores.push(filtro.estado);
    }
    if (filtro.tareaId !== undefined) {
      condiciones.push('c.tarea_id = ?');
      valores.push(filtro.tareaId);
    }
    const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 200) || 200, 1), 1000);
    const filas = await this.bd.filas<FilaCorreo>(
      `SELECT ${COLUMNAS_LISTA} ${DESDE_LISTA}
        ${condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''}
        ORDER BY c.id DESC
        LIMIT ${limite}`,
      valores,
    );
    return filas.map(aCorreoCrm);
  }

  /** Cuántos correos están pendientes (pendiente o sin_configurar) y cuántos fallaron. */
  async contar(): Promise<{ pendientes: number; errores: number }> {
    const filas = await this.bd.filas<RowDataPacket & { pendientes: number | null; errores: number | null }>(
      `SELECT COUNT(CASE WHEN estado IN ('pendiente', 'sin_configurar') THEN 1 END) AS pendientes,
              COUNT(CASE WHEN estado = 'error' THEN 1 END) AS errores
         FROM crm_correos`,
    );
    return { pendientes: Number(filas[0]?.pendientes ?? 0), errores: Number(filas[0]?.errores ?? 0) };
  }

  /** Solo modo 'memoria' (pruebas): los correos "enviados", en orden. */
  enviadosEnMemoria(): readonly MensajeEnviadoCrm[] {
    return this.enMemoria;
  }
}
