/// <reference types="multer" />
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import {
  type ArchivoCrm,
  type EstadoAvisoCrm,
  type EstadoCorreo,
  type EstadoTarea,
  LIMITES_CRM,
  type ResultadoDevolverCrm,
  type ResultadoTerminarCrm,
  type ResumenLiderCrm,
  type TableroPersonaCrm,
  type TareaCrm,
  type TareaDetalleCrm,
  type TipoArchivoCrm,
  type TipoEventoCrm,
} from '../api-crm.js';
import { type ArchivoRecibidoCrm, ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import { aFechaTexto, aIso, haceDias, hoyBogota } from '../compartido/fechas.js';
import { correoTareaAsignada, correoTareaDevuelta, correoTareaTerminada } from '../correo/plantillas.js';
import { ServicioCorreoCrm } from '../correo/servicio-correo-crm.js';
import { ServicioPersonasCrm } from '../personas/servicio-personas-crm.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion, ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import {
  AVISO_SIN_LIDER,
  type ArchivoParaCorreo,
  enlaceEquipo,
  enlaceLider,
  escogerAdjuntos,
  mensajeAviso,
  mensajeAvisoTerminada,
  origenSitio,
  type PeticionConOrigen,
} from './avisos-tareas.js';
import {
  aArchivo,
  aBooleano,
  aDetalle,
  aEstadoTarea,
  aEvento,
  aTarea,
  type FilaArchivoCrm,
  type FilaEventoCrm,
  type FilaTareaCrm,
  type FilaTareaDetalleCrm,
  ordenarTablero,
  sumarConteos,
  urlArchivosEquipo,
  urlArchivosLider,
} from './mapeo-tareas.js';
import {
  cambiosDeEdicion,
  cortar,
  describirEdicion,
  type EdicionTareaValida,
  FALTA_ENTREGABLE,
  type FiltroTareasLider,
  type FiltroTerminadas,
  LARGO_DETALLE_EVENTO,
  NO_EXISTE_ARCHIVO,
  NO_EXISTE_TAREA,
  type NuevaTareaValida,
  patronBusqueda,
  revisarTopeIp,
  TAREA_TERMINADA_EQUIPO,
  transicionEquipo,
  VENTANA_TOPE_MS,
} from './validacion-tareas.js';

/**
 * Reglas de las tareas del CRM (contrato en api-crm.ts):
 *
 * - Equipo (sin cuenta): cada ruta lleva :personaId y solo ve las tareas de
 *   esa persona, si está activa (si no, 404 «La tarea no existe.»). Mueve sus
 *   tareas entre pendiente y en_proceso, sube y quita entregables mientras no
 *   esté terminada y la termina (con al menos un entregable si el líder lo
 *   pidió). Cada cambio deja un evento con la IP (claveLimiteIp), y la misma
 *   tabla de eventos da el tope por IP: TOPE_CAMBIOS_POR_HORA cambios y
 *   TOPE_SUBIDAS_POR_HORA entregables por hora (429).
 * - Líder (GuardiaLiderCrm): crea, edita, reasigna, oculta (eliminada_en),
 *   adjunta archivos, avisa por correo y devuelve las terminadas.
 * - Una tarea con eliminada_en no existe para nadie.
 * - Correos: se encolan DENTRO de la transacción del cambio (ServicioCorreoCrm)
 *   y se envían después del commit, en la misma petición. Los archivos van
 *   adjuntos mientras quepan en LIMITES_CRM.maxBytesAdjuntosCorreo; el resto,
 *   como enlace al CRM (escogerAdjuntos).
 * - Las mutaciones bloquean la fila de la tarea (FOR UPDATE) y vuelven a
 *   comprobar el estado dentro de la transacción. actualizado_en se pone
 *   explícito en cada UPDATE (en Postgres no hay ON UPDATE).
 */

type Fila<T> = T & RowDataPacket;
type FechaBd = Date | string;

const MAX_ENTREGABLES = `La tarea ya tiene ${LIMITES_CRM.maxEntregables} documentos entregados: quite uno para subir otro.`;
const MAX_ADJUNTOS = `La tarea ya tiene ${LIMITES_CRM.maxAdjuntos} adjuntos: quite uno para subir otro.`;
const NO_REASIGNAR_TERMINADA = 'La tarea está terminada: devuélvala antes de cambiar el responsable.';
const SOLO_DEVOLVER_TERMINADA = 'Solo se puede devolver una tarea terminada.';
const RESPONSABLE_INACTIVO = 'Elija una persona activa del equipo.';
const CAMBIO_RESPONSABLE = 'La tarea cambió de responsable mientras se preparaba el aviso. Intente de nuevo.';
const SIN_RESPONSABLE = 'No se encontró a la persona responsable de la tarea.';

/** Máximo de eventos en el detalle (los más recientes). */
const MAX_EVENTOS_DETALLE = 500;

/** TareaCrm: la tarea, su responsable y los conteos de archivos. */
const CAMPOS_TAREA = `t.id, t.titulo, t.estado, t.responsable_id, t.fecha_limite, t.requiere_entregable,
       t.creado_en, t.actualizado_en, t.terminada_en,
       p.nombre AS responsable_nombre,
       p.foto_archivo_id AS responsable_foto_archivo_id,
       p.foto_version AS responsable_foto_version,
       (SELECT COUNT(*) FROM crm_tarea_archivos ca
         WHERE ca.tarea_id = t.id AND ca.tipo = 'adjunto') AS adjuntos,
       (SELECT COUNT(*) FROM crm_tarea_archivos ce
         WHERE ce.tarea_id = t.id AND ce.tipo = 'entregable') AS entregables`;

const CAMPOS_DETALLE = `${CAMPOS_TAREA}, t.descripcion, t.nota_cierre, t.avisada_en`;

const DESDE_TAREAS = 'FROM crm_tareas t JOIN crm_personas p ON p.id = t.responsable_id';

/** Rutas del equipo: la tarea es de la persona de la ruta, y la persona está activa. */
const DE_PERSONA_ACTIVA = 't.responsable_id = ? AND p.activo = 1';

const SQL_ARCHIVOS = `SELECT ta.id, ta.tipo, ta.nombre, a.mime, a.bytes, ta.creado_en
   FROM crm_tarea_archivos ta
   JOIN crm_almacen_archivos a ON a.id = ta.archivo_id
  WHERE ta.tarea_id = ?
  ORDER BY ta.creado_en, ta.id`;

const SQL_EVENTOS = `SELECT e.id, e.tipo, e.actor, p.nombre AS persona_nombre,
       e.de_estado, e.a_estado, e.detalle, e.creado_en
   FROM crm_tarea_eventos e
   LEFT JOIN crm_personas p ON p.id = e.persona_id
  WHERE e.tarea_id = ?
  ORDER BY e.creado_en DESC, e.id DESC
  LIMIT ${MAX_EVENTOS_DETALLE}`;

/** La fila de la tarea que se bloquea en las mutaciones (+ ' FOR UPDATE'). */
const SQL_BLOQUEO = `SELECT t.id, t.titulo, t.descripcion, t.estado, t.responsable_id,
       t.fecha_limite, t.requiere_entregable
   FROM crm_tareas t
  WHERE t.id = ? AND t.eliminada_en IS NULL`;

/** Igual, para el equipo (la subconsulta no bloquea la fila de la persona). */
const SQL_BLOQUEO_EQUIPO = `${SQL_BLOQUEO} AND t.responsable_id = ?
    AND EXISTS (SELECT 1 FROM crm_personas p WHERE p.id = t.responsable_id AND p.activo = 1)`;

/** Eventos del responsable desde una IP en la ventana del tope. */
const SQL_TOPE = `SELECT COUNT(*) AS cambios,
       MIN(creado_en) AS primer_cambio,
       SUM(CASE WHEN tipo = 'entregable' THEN 1 ELSE 0 END) AS subidas,
       MIN(CASE WHEN tipo = 'entregable' THEN creado_en ELSE NULL END) AS primera_subida
   FROM crm_tarea_eventos
  WHERE actor = 'responsable' AND ip = ? AND creado_en > ?`;

interface FilaBloqueo {
  id: number | string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  responsable_id: number | string;
  fecha_limite: FechaBd | null;
  requiere_entregable: number | string | boolean;
}

/** La tarea bloqueada dentro de una transacción. */
interface TareaBloqueada {
  id: number;
  titulo: string;
  descripcion: string;
  estado: EstadoTarea;
  responsableId: number;
  fechaLimite: string | null;
  requiereEntregable: boolean;
}

interface FilaTope {
  cambios: number | string | null;
  primer_cambio: FechaBd | null;
  subidas: number | string | null;
  primera_subida: FechaBd | null;
}

interface FilaArchivoAlmacen {
  archivo_id: number | string;
  nombre: string;
}

interface EventoNuevo {
  tareaId: number;
  tipo: TipoEventoCrm;
  actor: 'lider' | 'responsable';
  /** El responsable, o la persona líder (null si no hay). */
  personaId: number | null;
  deEstado?: EstadoTarea | null;
  aEstado?: EstadoTarea | null;
  detalle?: string | null;
  ip: string | null;
  creadoEn: Date;
}

function aFecha(valor: FechaBd | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function idInsertado(resultado: ResultadoEscritura, tabla: string): number {
  const id = Number(resultado.insertId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`La base no devolvió el id insertado en ${tabla} (en Postgres la tabla debe estar en TABLAS_CON_ID).`);
  }
  return id;
}

/** Bloquea la tarea (404 si no existe, está eliminada o, para el equipo, no es de esa persona activa). */
async function bloquear(conexion: Conexion, tareaId: number, personaId?: number): Promise<TareaBloqueada> {
  const equipo = personaId !== undefined;
  const [filas] = await conexion.query<Fila<FilaBloqueo>[]>(
    `${equipo ? SQL_BLOQUEO_EQUIPO : SQL_BLOQUEO} FOR UPDATE`,
    equipo ? [tareaId, personaId] : [tareaId],
  );
  const fila = filas[0];
  if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
  return {
    id: Number(fila.id),
    titulo: fila.titulo,
    descripcion: fila.descripcion ?? '',
    estado: aEstadoTarea(fila.estado),
    responsableId: Number(fila.responsable_id),
    fechaLimite: aFechaTexto(fila.fecha_limite),
    requiereEntregable: aBooleano(fila.requiere_entregable),
  };
}

async function registrarEvento(conexion: Conexion, evento: EventoNuevo): Promise<void> {
  await conexion.query(
    `INSERT INTO crm_tarea_eventos
       (tarea_id, tipo, actor, persona_id, de_estado, a_estado, detalle, ip, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      evento.tareaId,
      evento.tipo,
      evento.actor,
      evento.personaId,
      evento.deEstado ?? null,
      evento.aEstado ?? null,
      evento.detalle ? cortar(evento.detalle, LARGO_DETALLE_EVENTO) : null,
      evento.ip ? evento.ip.slice(0, 45) : null,
      evento.creadoEn,
    ],
  );
}

/** actualizado_en de la tarea (al subir o quitar un archivo). */
async function tocarTarea(conexion: Conexion, tareaId: number, ahora: Date): Promise<void> {
  await conexion.query('UPDATE crm_tareas SET actualizado_en = ? WHERE id = ?', [ahora, tareaId]);
}

async function contarArchivos(conexion: Conexion, tareaId: number, tipo: TipoArchivoCrm): Promise<number> {
  const [filas] = await conexion.query<Fila<{ n: number | string }>[]>(
    'SELECT COUNT(*) AS n FROM crm_tarea_archivos WHERE tarea_id = ? AND tipo = ?',
    [tareaId, tipo],
  );
  return Number(filas[0]?.n ?? 0);
}

/** Archivos de un tipo con su tamaño, en el orden en que se subieron. */
async function archivosParaCorreo(conexion: Conexion, tareaId: number, tipo: TipoArchivoCrm): Promise<ArchivoParaCorreo[]> {
  const [filas] = await conexion.query<Fila<{ id: number | string; nombre: string; bytes: number | string; creado_en: FechaBd }>[]>(
    `SELECT ta.id, ta.nombre, a.bytes, ta.creado_en
       FROM crm_tarea_archivos ta
       JOIN crm_almacen_archivos a ON a.id = ta.archivo_id
      WHERE ta.tarea_id = ? AND ta.tipo = ?
      ORDER BY ta.creado_en, ta.id`,
    [tareaId, tipo],
  );
  return filas.map((fila) => ({
    id: Number(fila.id),
    nombre: fila.nombre,
    bytes: Number(fila.bytes),
    creadoEn: aIso(fila.creado_en) ?? '',
  }));
}

async function insertarArchivo(
  conexion: Conexion,
  archivo: { tareaId: number; archivoId: number; tipo: TipoArchivoCrm; nombre: string; subidoPorId: number | null; creadoEn: Date },
): Promise<number> {
  const [resultado] = await conexion.query<ResultadoEscritura>(
    `INSERT INTO crm_tarea_archivos (tarea_id, archivo_id, tipo, nombre, subido_por_id, creado_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [archivo.tareaId, archivo.archivoId, archivo.tipo, archivo.nombre, archivo.subidoPorId, archivo.creadoEn],
  );
  return idInsertado(resultado, 'crm_tarea_archivos');
}

/** Nombre de una persona activa (400 con campos.responsableId si no existe o está inactiva). */
async function exigirResponsableActivo(conexion: Conexion, personaId: number): Promise<string> {
  const [filas] = await conexion.query<Fila<{ nombre: string }>[]>(
    'SELECT nombre FROM crm_personas WHERE id = ? AND activo = 1',
    [personaId],
  );
  const fila = filas[0];
  if (!fila) throw solicitudInvalida(RESPONSABLE_INACTIVO, { responsableId: RESPONSABLE_INACTIVO });
  return fila.nombre;
}

function archivoSubido(
  subido: { id: number; creadoEn: Date },
  tipo: TipoArchivoCrm,
  recibido: ArchivoRecibidoCrm,
  urlBase: string,
): ArchivoCrm {
  return {
    id: subido.id,
    tipo,
    nombre: recibido.nombre,
    mime: recibido.mime,
    bytes: recibido.bytes,
    subidoEn: subido.creadoEn.toISOString(),
    url: `${urlBase}/${subido.id}`,
  };
}

/** Nombre del líder para los correos cuando no hay persona líder activa. */
function nombreLiderSesion(nombre: string | null | undefined): string {
  return nombre?.trim() || 'Líder';
}

@Injectable()
export class ServicioTareasCrm {
  private readonly registro = new Logger('CRM');

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioPersonasCrm) private readonly personas: ServicioPersonasCrm,
    @Inject(ServicioArchivosCrm) private readonly archivos: ServicioArchivosCrm,
    @Inject(ServicioCorreoCrm) private readonly correo: ServicioCorreoCrm,
  ) {}

  /** Base de los enlaces de los correos: CRM_URL_SITIO o el origen de la petición. */
  origen(req: PeticionConOrigen): string {
    return origenSitio(this.correo.urlSitio, req);
  }

  // ── Equipo ────────────────────────────────────────────────────────────────

  /** GET /personas/:personaId/tareas */
  async tablero(personaId: number, terminadas: FiltroTerminadas): Promise<TableroPersonaCrm> {
    const persona = await this.personas.obtenerPublica(personaId);
    const valores: unknown[] = [personaId];
    let recientes = '';
    if (terminadas === 'recientes') {
      recientes = " AND (t.estado <> 'terminada' OR t.terminada_en >= ?)";
      valores.push(haceDias(LIMITES_CRM.diasTerminadasRecientes));
    }
    const filas = await this.bd.filas<Fila<FilaTareaCrm>>(
      `SELECT ${CAMPOS_TAREA} ${DESDE_TAREAS}
        WHERE t.responsable_id = ? AND t.eliminada_en IS NULL${recientes}`,
      valores,
    );
    const hoy = hoyBogota();
    return { persona, tareas: ordenarTablero(filas.map((fila) => aTarea(fila, hoy))) };
  }

  /** GET /personas/:personaId/tareas/:tareaId (sin correos). */
  async detalleEquipo(personaId: number, tareaId: number): Promise<TareaDetalleCrm> {
    const fila = await this.filaDetalle(tareaId, personaId);
    if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
    return this.armarDetalle(fila, urlArchivosEquipo(personaId, tareaId));
  }

  /** POST .../estado: pendiente ⇄ en_proceso; el mismo estado no cambia nada. */
  async cambiarEstado(
    personaId: number,
    tareaId: number,
    nuevo: 'pendiente' | 'en_proceso',
    ip: string,
  ): Promise<TareaDetalleCrm> {
    await this.verificarTopeIp(ip, false);
    await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId, personaId);
      const transicion = transicionEquipo(actual.estado, nuevo);
      if (transicion === 'terminada') throw conflicto(TAREA_TERMINADA_EQUIPO);
      if (transicion === 'igual') return;
      const ahora = new Date();
      if (nuevo === 'en_proceso') {
        await conexion.query(
          'UPDATE crm_tareas SET estado = ?, iniciada_en = COALESCE(iniciada_en, ?), actualizado_en = ? WHERE id = ?',
          [nuevo, ahora, ahora, tareaId],
        );
      } else {
        await conexion.query('UPDATE crm_tareas SET estado = ?, actualizado_en = ? WHERE id = ?', [nuevo, ahora, tareaId]);
      }
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'estado',
        actor: 'responsable',
        personaId,
        deEstado: actual.estado,
        aEstado: nuevo,
        ip,
        creadoEn: ahora,
      });
    });
    return this.detalleEquipo(personaId, tareaId);
  }

  /**
   * Antes de que multer reciba un entregable (GuardiaSubidaEntregableCrm):
   * tope por IP (429), la tarea es de la persona (404), no está terminada y
   * tiene cupo (409). La transacción lo vuelve a comprobar.
   */
  async verificarSubidaEntregable(personaId: number, tareaId: number, ip: string): Promise<void> {
    await this.verificarTopeIp(ip, true);
    const filas = await this.bd.filas<Fila<{ estado: string; entregables: number | string }>>(
      `SELECT t.estado,
              (SELECT COUNT(*) FROM crm_tarea_archivos ce
                WHERE ce.tarea_id = t.id AND ce.tipo = 'entregable') AS entregables
         ${DESDE_TAREAS}
        WHERE t.id = ? AND t.eliminada_en IS NULL AND ${DE_PERSONA_ACTIVA}`,
      [tareaId, personaId],
    );
    const fila = filas[0];
    if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
    if (fila.estado === 'terminada') throw conflicto(TAREA_TERMINADA_EQUIPO);
    if (Number(fila.entregables) >= LIMITES_CRM.maxEntregables) throw conflicto(MAX_ENTREGABLES);
  }

  /** POST .../entregables (multipart `archivo`) -> 201 ArchivoCrm. */
  async subirEntregable(
    personaId: number,
    tareaId: number,
    archivo: Express.Multer.File | undefined,
    ip: string,
  ): Promise<ArchivoCrm> {
    const recibido = await this.archivos.validar(archivo, 'documento');
    const subido = await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId, personaId);
      if (actual.estado === 'terminada') throw conflicto(TAREA_TERMINADA_EQUIPO);
      if ((await contarArchivos(conexion, tareaId, 'entregable')) >= LIMITES_CRM.maxEntregables) {
        throw conflicto(MAX_ENTREGABLES);
      }
      const archivoId = await this.archivos.guardar(conexion, recibido);
      const ahora = new Date();
      const id = await insertarArchivo(conexion, {
        tareaId,
        archivoId,
        tipo: 'entregable',
        nombre: recibido.nombre,
        subidoPorId: personaId,
        creadoEn: ahora,
      });
      await tocarTarea(conexion, tareaId, ahora);
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'entregable',
        actor: 'responsable',
        personaId,
        detalle: recibido.nombre,
        ip,
        creadoEn: ahora,
      });
      return { id, creadoEn: ahora };
    });
    return archivoSubido(subido, 'entregable', recibido, urlArchivosEquipo(personaId, tareaId));
  }

  /** DELETE .../entregables/:archivoId (solo si la tarea no está terminada). */
  async quitarEntregable(personaId: number, tareaId: number, archivoId: number, ip: string): Promise<void> {
    await this.verificarTopeIp(ip, false);
    await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId, personaId);
      if (actual.estado === 'terminada') throw conflicto(TAREA_TERMINADA_EQUIPO);
      await this.quitarArchivo(conexion, {
        tareaId,
        archivoId,
        tipo: 'entregable',
        actor: 'responsable',
        personaId,
        ip,
      });
    });
  }

  /**
   * POST .../terminar: en una transacción la marca terminada, deja el evento
   * y encola el correo al líder con los entregables; después del commit lo
   * envía. Sin líder activo no hay correo.
   */
  async terminar(
    personaId: number,
    tareaId: number,
    nota: string | null,
    ip: string,
    origen: string,
  ): Promise<ResultadoTerminarCrm> {
    await this.verificarTopeIp(ip, false);
    const [lider, responsable] = await Promise.all([this.personas.lider(), this.personas.contacto(personaId)]);
    const correoId = await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId, personaId);
      if (actual.estado === 'terminada') throw conflicto(TAREA_TERMINADA_EQUIPO);
      const entregables = await archivosParaCorreo(conexion, tareaId, 'entregable');
      if (actual.requiereEntregable && entregables.length === 0) {
        throw solicitudInvalida(FALTA_ENTREGABLE, { entregable: FALTA_ENTREGABLE });
      }
      const ahora = new Date();
      await conexion.query(
        "UPDATE crm_tareas SET estado = 'terminada', terminada_en = ?, nota_cierre = ?, actualizado_en = ? WHERE id = ?",
        [ahora, nota, ahora, tareaId],
      );
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'terminada',
        actor: 'responsable',
        personaId,
        deEstado: actual.estado,
        aEstado: 'terminada',
        ip,
        creadoEn: ahora,
      });
      if (!lider) return null;
      const seleccion = escogerAdjuntos(entregables);
      const correo = correoTareaTerminada({
        titulo: actual.titulo,
        descripcion: actual.descripcion,
        responsable: { nombre: responsable?.nombre ?? '' },
        lider: { nombre: lider.nombre },
        fechaLimite: actual.fechaLimite,
        nota,
        archivos: seleccion.archivos,
        enlace: enlaceLider(origen, tareaId),
      });
      return this.correo.encolar(conexion, {
        tipo: 'tarea_terminada',
        tareaId,
        para: lider.correo,
        responderA: responsable?.correo ?? null,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        adjuntos: seleccion.adjuntos,
      });
    });
    const aviso: EstadoAvisoCrm =
      correoId === null
        ? { ...AVISO_SIN_LIDER }
        : await this.enviarAviso(correoId, (estado) => mensajeAvisoTerminada(estado, lider?.nombre ?? ''));
    return { tarea: await this.detalleEquipo(personaId, tareaId), aviso };
  }

  /** GET .../archivos/:archivoId (adjunto o entregable de esa tarea), como descarga. */
  async descargarEquipo(
    personaId: number,
    tareaId: number,
    archivoId: number,
    req: Request,
    res: Response,
  ): Promise<void> {
    const filas = await this.bd.filas<Fila<FilaArchivoAlmacen>>(
      `SELECT ta.archivo_id, ta.nombre
         FROM crm_tarea_archivos ta
         JOIN crm_tareas t ON t.id = ta.tarea_id
         JOIN crm_personas p ON p.id = t.responsable_id
        WHERE ta.id = ? AND ta.tarea_id = ? AND t.eliminada_en IS NULL AND ${DE_PERSONA_ACTIVA}`,
      [archivoId, tareaId, personaId],
    );
    await this.enviarArchivo(req, res, filas[0]);
  }

  // ── Líder ─────────────────────────────────────────────────────────────────

  /** GET /lider/resumen */
  async resumen(): Promise<ResumenLiderCrm> {
    const [personas, correos, configurado] = await Promise.all([
      this.personas.listarPublicas(),
      this.correo.contar(),
      this.correo.estaConfigurado(),
    ]);
    return {
      personas,
      totales: sumarConteos(personas.map((persona) => persona.conteo)),
      correo: { configurado, pendientes: correos.pendientes, errores: correos.errores },
    };
  }

  /** GET /lider/tareas */
  async listarLider(filtro: FiltroTareasLider): Promise<TareaCrm[]> {
    const condiciones = ['t.eliminada_en IS NULL'];
    const valores: unknown[] = [];
    if (filtro.responsableId !== null) {
      condiciones.push('t.responsable_id = ?');
      valores.push(filtro.responsableId);
    }
    if (filtro.estado !== null) {
      condiciones.push('t.estado = ?');
      valores.push(filtro.estado);
    }
    if (filtro.q !== null) {
      const patron = patronBusqueda(filtro.q);
      condiciones.push('(LOWER(t.titulo) LIKE ? OR LOWER(t.descripcion) LIKE ?)');
      valores.push(patron, patron);
    }
    if (filtro.terminadas === 'recientes') {
      condiciones.push("(t.estado <> 'terminada' OR t.terminada_en >= ?)");
      valores.push(haceDias(LIMITES_CRM.diasTerminadasRecientes));
    }
    const filas = await this.bd.filas<Fila<FilaTareaCrm>>(
      `SELECT ${CAMPOS_TAREA} ${DESDE_TAREAS}
        WHERE ${condiciones.join(' AND ')}
        ORDER BY (t.fecha_limite IS NULL), t.fecha_limite, t.id DESC`,
      valores,
    );
    const hoy = hoyBogota();
    return filas.map((fila) => aTarea(fila, hoy));
  }

  /** POST /lider/tareas -> 201 (todavía sin aviso: la web sube los adjuntos y llama a /avisar). */
  async crear(datos: NuevaTareaValida, ip: string): Promise<TareaDetalleCrm> {
    const liderId = await this.idLider();
    const tareaId = await this.bd.transaccion(async (conexion) => {
      await exigirResponsableActivo(conexion, datos.responsableId);
      const ahora = new Date();
      const [resultado] = await conexion.query<ResultadoEscritura>(
        `INSERT INTO crm_tareas
           (titulo, descripcion, responsable_id, estado, fecha_limite, requiere_entregable, creado_en, actualizado_en)
         VALUES (?, ?, ?, 'pendiente', ?, ?, ?, ?)`,
        [
          datos.titulo,
          datos.descripcion,
          datos.responsableId,
          datos.fechaLimite,
          datos.requiereEntregable ? 1 : 0,
          ahora,
          ahora,
        ],
      );
      const id = idInsertado(resultado, 'crm_tareas');
      await registrarEvento(conexion, { tareaId: id, tipo: 'creada', actor: 'lider', personaId: liderId, ip, creadoEn: ahora });
      return id;
    });
    return this.detalleLider(tareaId);
  }

  /** GET /lider/tareas/:id (con correos). */
  async detalleLider(tareaId: number): Promise<TareaDetalleCrm> {
    const fila = await this.filaDetalle(tareaId);
    if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
    const [detalle, correos] = await Promise.all([
      this.armarDetalle(fila, urlArchivosLider(tareaId)),
      this.correo.listar({ tareaId }),
    ]);
    return { ...detalle, correos };
  }

  /**
   * PATCH /lider/tareas/:id: solo cambia (y deja evento de) lo que de verdad
   * cambia. Reasignar quita la marca de avisada (hay que volver a avisar) y no
   * se puede con una terminada.
   */
  async editar(tareaId: number, edicion: EdicionTareaValida, ip: string): Promise<TareaDetalleCrm> {
    const liderId = await this.idLider();
    await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId);
      const cambios = cambiosDeEdicion(actual, edicion);
      let nombreNuevo: string | null = null;
      if (cambios.nuevoResponsableId !== null) {
        if (actual.estado === 'terminada') throw conflicto(NO_REASIGNAR_TERMINADA);
        nombreNuevo = await exigirResponsableActivo(conexion, cambios.nuevoResponsableId);
      }
      if (cambios.editados.length === 0 && cambios.nuevoResponsableId === null) return;
      const ahora = new Date();
      const asignaciones: string[] = [];
      const valores: unknown[] = [];
      const { campos } = cambios;
      if (campos.titulo !== undefined) {
        asignaciones.push('titulo = ?');
        valores.push(campos.titulo);
      }
      if (campos.descripcion !== undefined) {
        asignaciones.push('descripcion = ?');
        valores.push(campos.descripcion);
      }
      if (campos.fechaLimite !== undefined) {
        asignaciones.push('fecha_limite = ?');
        valores.push(campos.fechaLimite);
      }
      if (campos.requiereEntregable !== undefined) {
        asignaciones.push('requiere_entregable = ?');
        valores.push(campos.requiereEntregable ? 1 : 0);
      }
      if (cambios.nuevoResponsableId !== null) {
        asignaciones.push('responsable_id = ?', 'avisada_en = NULL');
        valores.push(cambios.nuevoResponsableId);
      }
      asignaciones.push('actualizado_en = ?');
      valores.push(ahora, tareaId);
      await conexion.query(`UPDATE crm_tareas SET ${asignaciones.join(', ')} WHERE id = ?`, valores);
      if (cambios.nuevoResponsableId !== null) {
        await registrarEvento(conexion, {
          tareaId,
          tipo: 'reasignada',
          actor: 'lider',
          personaId: liderId,
          detalle: nombreNuevo,
          ip,
          creadoEn: ahora,
        });
      }
      if (cambios.editados.length > 0) {
        await registrarEvento(conexion, {
          tareaId,
          tipo: 'editada',
          actor: 'lider',
          personaId: liderId,
          detalle: describirEdicion(cambios.editados),
          ip,
          creadoEn: ahora,
        });
      }
    });
    return this.detalleLider(tareaId);
  }

  /** DELETE /lider/tareas/:id: la oculta (eliminada_en); sus archivos y eventos quedan en la base. */
  async eliminar(tareaId: number): Promise<void> {
    const ahora = new Date();
    const resultado = await this.bd.ejecutar(
      'UPDATE crm_tareas SET eliminada_en = ?, actualizado_en = ? WHERE id = ? AND eliminada_en IS NULL',
      [ahora, ahora, tareaId],
    );
    if (resultado.affectedRows === 0) throw noEncontrado(NO_EXISTE_TAREA);
  }

  /** Antes de que multer reciba un adjunto (GuardiaSubidaAdjuntoCrm): la tarea existe (404) y tiene cupo (409). */
  async verificarSubidaAdjunto(tareaId: number): Promise<void> {
    const filas = await this.bd.filas<Fila<{ adjuntos: number | string }>>(
      `SELECT (SELECT COUNT(*) FROM crm_tarea_archivos ca
                WHERE ca.tarea_id = t.id AND ca.tipo = 'adjunto') AS adjuntos
         FROM crm_tareas t
        WHERE t.id = ? AND t.eliminada_en IS NULL`,
      [tareaId],
    );
    const fila = filas[0];
    if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
    if (Number(fila.adjuntos) >= LIMITES_CRM.maxAdjuntos) throw conflicto(MAX_ADJUNTOS);
  }

  /** POST /lider/tareas/:id/adjuntos (multipart `archivo`) -> 201 ArchivoCrm. */
  async subirAdjunto(tareaId: number, archivo: Express.Multer.File | undefined, ip: string): Promise<ArchivoCrm> {
    const recibido = await this.archivos.validar(archivo, 'documento');
    const liderId = await this.idLider();
    const subido = await this.bd.transaccion(async (conexion) => {
      await bloquear(conexion, tareaId);
      if ((await contarArchivos(conexion, tareaId, 'adjunto')) >= LIMITES_CRM.maxAdjuntos) {
        throw conflicto(MAX_ADJUNTOS);
      }
      const archivoId = await this.archivos.guardar(conexion, recibido);
      const ahora = new Date();
      const id = await insertarArchivo(conexion, {
        tareaId,
        archivoId,
        tipo: 'adjunto',
        nombre: recibido.nombre,
        subidoPorId: null,
        creadoEn: ahora,
      });
      await tocarTarea(conexion, tareaId, ahora);
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'adjunto',
        actor: 'lider',
        personaId: liderId,
        detalle: recibido.nombre,
        ip,
        creadoEn: ahora,
      });
      return { id, creadoEn: ahora };
    });
    return archivoSubido(subido, 'adjunto', recibido, urlArchivosLider(tareaId));
  }

  /** DELETE /lider/tareas/:id/adjuntos/:archivoId */
  async quitarAdjunto(tareaId: number, archivoId: number, ip: string): Promise<void> {
    const liderId = await this.idLider();
    await this.bd.transaccion(async (conexion) => {
      await bloquear(conexion, tareaId);
      await this.quitarArchivo(conexion, {
        tareaId,
        archivoId,
        tipo: 'adjunto',
        actor: 'lider',
        personaId: liderId,
        ip,
      });
    });
  }

  /** GET /lider/tareas/:id/archivos/:archivoId */
  async descargarLider(tareaId: number, archivoId: number, req: Request, res: Response): Promise<void> {
    const filas = await this.bd.filas<Fila<FilaArchivoAlmacen>>(
      `SELECT ta.archivo_id, ta.nombre
         FROM crm_tarea_archivos ta
         JOIN crm_tareas t ON t.id = ta.tarea_id
        WHERE ta.id = ? AND ta.tarea_id = ? AND t.eliminada_en IS NULL`,
      [archivoId, tareaId],
    );
    await this.enviarArchivo(req, res, filas[0]);
  }

  /**
   * POST /lider/tareas/:id/avisar: correo de asignación al responsable con
   * los adjuntos (repetirlo manda otro). Se encola con la marca avisada_en y
   * el evento; se envía después del commit.
   */
  async avisar(tareaId: number, origen: string, ip: string, nombreSesion: string | null): Promise<EstadoAvisoCrm> {
    const responsableId = await this.responsableDe(tareaId);
    const [responsable, lider] = await Promise.all([this.personas.contacto(responsableId), this.personas.lider()]);
    if (!responsable) throw conflicto(SIN_RESPONSABLE);
    const correoId = await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId);
      if (actual.responsableId !== responsable.id) throw conflicto(CAMBIO_RESPONSABLE);
      const seleccion = escogerAdjuntos(await archivosParaCorreo(conexion, tareaId, 'adjunto'));
      const correo = correoTareaAsignada({
        titulo: actual.titulo,
        descripcion: actual.descripcion,
        responsable: { nombre: responsable.nombre },
        lider: { nombre: lider?.nombre ?? nombreLiderSesion(nombreSesion) },
        fechaLimite: actual.fechaLimite,
        archivos: seleccion.archivos,
        enlace: enlaceEquipo(origen, responsable.id, tareaId),
      });
      const id = await this.correo.encolar(conexion, {
        tipo: 'tarea_asignada',
        tareaId,
        para: responsable.correo,
        responderA: lider?.correo ?? null,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        adjuntos: seleccion.adjuntos,
      });
      const ahora = new Date();
      await conexion.query('UPDATE crm_tareas SET avisada_en = ?, actualizado_en = ? WHERE id = ?', [ahora, ahora, tareaId]);
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'aviso',
        actor: 'lider',
        personaId: lider?.id ?? null,
        detalle: responsable.nombre,
        ip,
        creadoEn: ahora,
      });
      return id;
    });
    return this.enviarAviso(correoId, (estado) => mensajeAviso(estado, responsable.nombre));
  }

  /** POST /lider/tareas/:id/devolver: terminada → en_proceso, con la observación, y avisa al responsable. */
  async devolver(
    tareaId: number,
    observacion: string,
    origen: string,
    ip: string,
    nombreSesion: string | null,
  ): Promise<ResultadoDevolverCrm> {
    const responsableId = await this.responsableDe(tareaId);
    const [responsable, lider] = await Promise.all([this.personas.contacto(responsableId), this.personas.lider()]);
    const correoId = await this.bd.transaccion(async (conexion) => {
      const actual = await bloquear(conexion, tareaId);
      if (actual.estado !== 'terminada') throw conflicto(SOLO_DEVOLVER_TERMINADA);
      const ahora = new Date();
      await conexion.query(
        "UPDATE crm_tareas SET estado = 'en_proceso', terminada_en = NULL, actualizado_en = ? WHERE id = ?",
        [ahora, tareaId],
      );
      await registrarEvento(conexion, {
        tareaId,
        tipo: 'devuelta',
        actor: 'lider',
        personaId: lider?.id ?? null,
        deEstado: 'terminada',
        aEstado: 'en_proceso',
        detalle: observacion,
        ip,
        creadoEn: ahora,
      });
      // Una terminada no se puede reasignar: el responsable es el mismo que se leyó antes.
      if (!responsable || responsable.id !== actual.responsableId) return null;
      const correo = correoTareaDevuelta({
        titulo: actual.titulo,
        descripcion: actual.descripcion,
        responsable: { nombre: responsable.nombre },
        lider: { nombre: lider?.nombre ?? nombreLiderSesion(nombreSesion) },
        fechaLimite: actual.fechaLimite,
        observacion,
        archivos: [],
        enlace: enlaceEquipo(origen, responsable.id, tareaId),
      });
      return this.correo.encolar(conexion, {
        tipo: 'tarea_devuelta',
        tareaId,
        para: responsable.correo,
        responderA: lider?.correo ?? null,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        adjuntos: [],
      });
    });
    const aviso: EstadoAvisoCrm =
      correoId === null
        ? {
            correoId: null,
            estado: 'sin_configurar',
            mensaje: 'La tarea quedó devuelta, pero no se encontró a la persona responsable para avisarle.',
          }
        : await this.enviarAviso(correoId, (estado) => mensajeAviso(estado, responsable?.nombre ?? ''));
    return { tarea: await this.detalleLider(tareaId), aviso };
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async filaDetalle(tareaId: number, personaId?: number): Promise<Fila<FilaTareaDetalleCrm> | undefined> {
    const equipo = personaId !== undefined;
    const filas = await this.bd.filas<Fila<FilaTareaDetalleCrm>>(
      `SELECT ${CAMPOS_DETALLE} ${DESDE_TAREAS}
        WHERE t.id = ? AND t.eliminada_en IS NULL${equipo ? ` AND ${DE_PERSONA_ACTIVA}` : ''}`,
      equipo ? [tareaId, personaId] : [tareaId],
    );
    return filas[0];
  }

  private async armarDetalle(fila: FilaTareaDetalleCrm, urlBase: string): Promise<TareaDetalleCrm> {
    const tareaId = Number(fila.id);
    const [archivos, eventos] = await Promise.all([
      this.bd.filas<Fila<FilaArchivoCrm>>(SQL_ARCHIVOS, [tareaId]),
      this.bd.filas<Fila<FilaEventoCrm>>(SQL_EVENTOS, [tareaId]),
    ]);
    return aDetalle(
      fila,
      archivos.map((archivo) => aArchivo(archivo, urlBase)),
      eventos.map((evento) => aEvento(evento)),
      hoyBogota(),
    );
  }

  /** Responsable de una tarea no eliminada (404 si no). */
  private async responsableDe(tareaId: number): Promise<number> {
    const filas = await this.bd.filas<Fila<{ responsable_id: number | string }>>(
      'SELECT responsable_id FROM crm_tareas WHERE id = ? AND eliminada_en IS NULL',
      [tareaId],
    );
    const fila = filas[0];
    if (!fila) throw noEncontrado(NO_EXISTE_TAREA);
    return Number(fila.responsable_id);
  }

  /** Persona líder activa, para persona_id de los eventos del líder (null si no hay). */
  private async idLider(): Promise<number | null> {
    return (await this.personas.lider())?.id ?? null;
  }

  /** Tope por IP de los cambios del equipo (y de sus subidas), contado en crm_tarea_eventos. */
  private async verificarTopeIp(ip: string, esSubida: boolean): Promise<void> {
    const ahora = new Date();
    const filas = await this.bd.filas<Fila<FilaTope>>(SQL_TOPE, [ip, new Date(ahora.getTime() - VENTANA_TOPE_MS)]);
    const fila = filas[0];
    revisarTopeIp(
      {
        cambios: Number(fila?.cambios ?? 0),
        primerCambio: aFecha(fila?.primer_cambio),
        subidas: Number(fila?.subidas ?? 0),
        primeraSubida: aFecha(fila?.primera_subida),
      },
      esSubida,
      ahora,
    );
  }

  /** Quita un archivo de la tarea (ya bloqueada), recolecta el del almacén y deja el evento. */
  private async quitarArchivo(
    conexion: Conexion,
    quitar: {
      tareaId: number;
      archivoId: number;
      tipo: TipoArchivoCrm;
      actor: 'lider' | 'responsable';
      personaId: number | null;
      ip: string | null;
    },
  ): Promise<void> {
    const [filas] = await conexion.query<Fila<FilaArchivoAlmacen>[]>(
      'SELECT archivo_id, nombre FROM crm_tarea_archivos WHERE id = ? AND tarea_id = ? AND tipo = ? FOR UPDATE',
      [quitar.archivoId, quitar.tareaId, quitar.tipo],
    );
    const fila = filas[0];
    if (!fila) throw noEncontrado(NO_EXISTE_ARCHIVO);
    await conexion.query('DELETE FROM crm_tarea_archivos WHERE id = ?', [quitar.archivoId]);
    await this.archivos.recolectar(conexion, [Number(fila.archivo_id)]);
    const ahora = new Date();
    await tocarTarea(conexion, quitar.tareaId, ahora);
    await registrarEvento(conexion, {
      tareaId: quitar.tareaId,
      tipo: 'archivo_quitado',
      actor: quitar.actor,
      personaId: quitar.personaId,
      detalle: fila.nombre,
      ip: quitar.ip,
      creadoEn: ahora,
    });
  }

  private async enviarArchivo(req: Request, res: Response, fila: FilaArchivoAlmacen | undefined): Promise<void> {
    if (!fila) throw noEncontrado(NO_EXISTE_ARCHIVO);
    await this.archivos.enviar(req, res, {
      archivoId: Number(fila.archivo_id),
      nombre: fila.nombre,
      disposicion: 'attachment',
      cache: 'privado',
    });
  }

  /**
   * Envía el correo ya confirmado y arma el aviso con el texto para la
   * persona. `enviar` no lanza; si lo hiciera, el correo sigue en la bandeja.
   */
  private async enviarAviso(correoId: number, mensaje: (estado: EstadoCorreo) => string): Promise<EstadoAvisoCrm> {
    let estado: EstadoCorreo;
    try {
      estado = (await this.correo.enviar(correoId)).estado;
    } catch (error) {
      this.registro.error(
        `No se pudo enviar el correo ${correoId} del CRM: ${error instanceof Error ? error.message : String(error)}`,
      );
      estado = 'pendiente';
    }
    return { correoId, estado, mensaje: mensaje(estado) };
  }
}
