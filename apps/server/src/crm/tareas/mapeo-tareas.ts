import {
  type ArchivoCrm,
  type ConteoTareasCrm,
  type EstadoTarea,
  type EventoTareaCrm,
  inicialesDe,
  type ResponsableCrm,
  type TareaCrm,
  type TareaDetalleCrm,
  type TipoArchivoCrm,
  type TipoEventoCrm,
} from '../api-crm.js';
import { aFechaTexto, aIso } from '../compartido/fechas.js';
import { esEstadoTarea } from './validacion-tareas.js';

/**
 * Filas de la base (crm_tareas, crm_tarea_archivos, crm_tarea_eventos) a los
 * tipos del contrato. Puro: sin base ni Nest. Los números pueden llegar como
 * texto y las fechas como Date o texto (mysql2 y pg no entregan igual), por
 * eso todo pasa por Number/aIso/aFechaTexto. Pruebas en tareas.spec.ts.
 */

type FechaBd = Date | string;
type NumeroBd = number | string;

/** Una tarea con su responsable (JOIN crm_personas p) y los conteos de archivos. */
export interface FilaTareaCrm {
  id: NumeroBd;
  titulo: string;
  estado: string;
  responsable_id: NumeroBd;
  fecha_limite: FechaBd | null;
  requiere_entregable: NumeroBd | boolean;
  creado_en: FechaBd;
  actualizado_en: FechaBd;
  terminada_en: FechaBd | null;
  responsable_nombre: string | null;
  responsable_foto_archivo_id: NumeroBd | null;
  responsable_foto_version: NumeroBd | null;
  adjuntos: NumeroBd | null;
  entregables: NumeroBd | null;
}

export interface FilaTareaDetalleCrm extends FilaTareaCrm {
  descripcion: string | null;
  nota_cierre: string | null;
  avisada_en: FechaBd | null;
}

/** crm_tarea_archivos JOIN crm_almacen_archivos (mime, bytes). */
export interface FilaArchivoCrm {
  id: NumeroBd;
  tipo: string;
  nombre: string;
  mime: string;
  bytes: NumeroBd;
  creado_en: FechaBd;
}

/** crm_tarea_eventos LEFT JOIN crm_personas (nombre de quien lo hizo). */
export interface FilaEventoCrm {
  id: NumeroBd;
  tipo: string;
  actor: string;
  persona_nombre: string | null;
  de_estado: string | null;
  a_estado: string | null;
  detalle: string | null;
  creado_en: FechaBd;
}

/** Ruta de descarga de los archivos de una tarea para el equipo (sin el id del archivo). */
export function urlArchivosEquipo(personaId: number, tareaId: number): string {
  return `/api/crm/personas/${personaId}/tareas/${tareaId}/archivos`;
}

/** Ruta de descarga de los archivos de una tarea para el líder (sin el id del archivo). */
export function urlArchivosLider(tareaId: number): string {
  return `/api/crm/lider/tareas/${tareaId}/archivos`;
}

/**
 * URL de la foto de una persona, o null si no tiene. La misma que arma
 * personas/mapeo-personas.ts para las tarjetas: cambia con foto_version.
 */
export function urlFotoPersona(personaId: number, fotoArchivoId: unknown, fotoVersion: unknown): string | null {
  if (fotoArchivoId === null || fotoArchivoId === undefined) return null;
  const version = Number(fotoVersion ?? 0);
  return `/api/crm/personas/${personaId}/foto?v=${Number.isFinite(version) ? version : 0}`;
}

/** Bandera 0/1 de la base (TINYINT en MySQL, SMALLINT en Postgres). */
export function aBooleano(valor: unknown): boolean {
  return valor === true || Number(valor) === 1;
}

/** Estado guardado; uno desconocido (no debería haber) se lee como pendiente. */
export function aEstadoTarea(valor: unknown): EstadoTarea {
  return esEstadoTarea(valor) ? valor : 'pendiente';
}

function estadoONull(valor: unknown): EstadoTarea | null {
  return esEstadoTarea(valor) ? valor : null;
}

/** fechaLimite anterior a hoy (Bogotá, 'AAAA-MM-DD') y no terminada. */
export function esVencida(fechaLimite: string | null, estado: EstadoTarea, hoy: string): boolean {
  return fechaLimite !== null && estado !== 'terminada' && fechaLimite < hoy;
}

export function aResponsable(fila: FilaTareaCrm): ResponsableCrm {
  const id = Number(fila.responsable_id);
  const nombre = fila.responsable_nombre ?? '';
  return {
    id,
    nombre,
    iniciales: inicialesDe(nombre),
    foto: urlFotoPersona(id, fila.responsable_foto_archivo_id, fila.responsable_foto_version),
  };
}

/** `hoy`: hoyBogota(). */
export function aTarea(fila: FilaTareaCrm, hoy: string): TareaCrm {
  const estado = aEstadoTarea(fila.estado);
  const fechaLimite = aFechaTexto(fila.fecha_limite);
  return {
    id: Number(fila.id),
    titulo: fila.titulo,
    estado,
    responsable: aResponsable(fila),
    fechaLimite,
    vencida: esVencida(fechaLimite, estado, hoy),
    requiereEntregable: aBooleano(fila.requiere_entregable),
    adjuntos: Number(fila.adjuntos ?? 0),
    entregables: Number(fila.entregables ?? 0),
    creadaEn: aIso(fila.creado_en) ?? '',
    actualizadaEn: aIso(fila.actualizado_en) ?? '',
    terminadaEn: aIso(fila.terminada_en),
  };
}

/** `urlBase`: urlArchivosEquipo(...) o urlArchivosLider(...). */
export function aArchivo(fila: FilaArchivoCrm, urlBase: string): ArchivoCrm {
  const id = Number(fila.id);
  return {
    id,
    tipo: (fila.tipo === 'entregable' ? 'entregable' : 'adjunto') satisfies TipoArchivoCrm,
    nombre: fila.nombre,
    mime: fila.mime,
    bytes: Number(fila.bytes),
    subidoEn: aIso(fila.creado_en) ?? '',
    url: `${urlBase}/${id}`,
  };
}

export function aEvento(fila: FilaEventoCrm): EventoTareaCrm {
  return {
    id: Number(fila.id),
    tipo: fila.tipo as TipoEventoCrm,
    actor: fila.actor === 'lider' ? 'lider' : 'responsable',
    personaNombre: fila.persona_nombre ?? null,
    deEstado: estadoONull(fila.de_estado),
    aEstado: estadoONull(fila.a_estado),
    detalle: fila.detalle ?? null,
    creadoEn: aIso(fila.creado_en) ?? '',
  };
}

/**
 * Detalle sin `correos` (las rutas del líder los agregan). Los conteos salen
 * de `archivos`, para que coincidan con la lista que se muestra.
 */
export function aDetalle(
  fila: FilaTareaDetalleCrm,
  archivos: ArchivoCrm[],
  eventos: EventoTareaCrm[],
  hoy: string,
): TareaDetalleCrm {
  return {
    ...aTarea(fila, hoy),
    adjuntos: archivos.filter((archivo) => archivo.tipo === 'adjunto').length,
    entregables: archivos.filter((archivo) => archivo.tipo === 'entregable').length,
    descripcion: fila.descripcion ?? '',
    notaCierre: fila.nota_cierre ?? null,
    archivos,
    eventos,
    avisada: fila.avisada_en !== null && fila.avisada_en !== undefined,
  };
}

/**
 * Orden del tablero de una persona: primero las no terminadas, por fecha
 * límite (las sin fecha al final) y luego por creación; después las
 * terminadas, de la más reciente a la más antigua. Las fechas ISO de aIso
 * tienen todas el mismo formato y se comparan como texto.
 */
export function ordenarTablero(tareas: readonly TareaCrm[]): TareaCrm[] {
  const abiertas = tareas
    .filter((tarea) => tarea.estado !== 'terminada')
    .toSorted((a, b) => {
      if (a.fechaLimite !== b.fechaLimite) {
        if (a.fechaLimite === null) return 1;
        if (b.fechaLimite === null) return -1;
        return a.fechaLimite < b.fechaLimite ? -1 : 1;
      }
      if (a.creadaEn !== b.creadaEn) return a.creadaEn < b.creadaEn ? -1 : 1;
      return a.id - b.id;
    });
  const terminadas = tareas
    .filter((tarea) => tarea.estado === 'terminada')
    .toSorted((a, b) => {
      const enA = a.terminadaEn ?? '';
      const enB = b.terminadaEn ?? '';
      if (enA !== enB) return enA < enB ? 1 : -1;
      return b.id - a.id;
    });
  return [...abiertas, ...terminadas];
}

/** Suma de los conteos de varias personas (totales del resumen del líder). */
export function sumarConteos(conteos: readonly ConteoTareasCrm[]): ConteoTareasCrm {
  const total: ConteoTareasCrm = { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 };
  for (const conteo of conteos) {
    total.pendientes += conteo.pendientes;
    total.enProceso += conteo.enProceso;
    total.terminadasRecientes += conteo.terminadasRecientes;
    total.vencidas += conteo.vencidas;
  }
  return total;
}
