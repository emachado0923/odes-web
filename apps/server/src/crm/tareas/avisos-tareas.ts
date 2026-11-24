import { type EstadoAvisoCrm, type EstadoCorreo, LIMITES_CRM } from '../api-crm.js';
import type { DatosCorreoTarea } from '../correo/plantillas.js';

/**
 * Lo puro de los avisos por correo de las tareas: qué archivos van adjuntos
 * (por tamaño), los enlaces al CRM y el texto que se le muestra a la persona
 * según el estado del envío. Pruebas en tareas.spec.ts.
 */

export const MENSAJE_CORREO_SIN_CONFIGURAR =
  'El correo todavía no está configurado: el aviso quedó guardado y saldrá cuando se configure.';
export const MENSAJE_CORREO_NO_SALIO =
  'El correo no salió; quedó en la bandeja de correos del líder para reintentarlo.';
export const MENSAJE_TAREA_TERMINADA = 'La tarea quedó terminada.';

/** Al terminar, sin líder activo no hay a quién escribirle. */
export const AVISO_SIN_LIDER: Readonly<EstadoAvisoCrm> = {
  correoId: null,
  estado: 'sin_configurar',
  mensaje: 'La tarea quedó terminada. No hay un líder activo para avisarle.',
};

/** «José David Ramírez Abraham» → «José». */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

/** Texto del resultado de un aviso, con el primer nombre de quien lo recibe. */
export function mensajeAviso(estado: EstadoCorreo, destinatario: string): string {
  switch (estado) {
    case 'enviado': {
      const nombre = primerNombre(destinatario);
      return nombre ? `Se le avisó a ${nombre} por correo.` : 'Se envió el aviso por correo.';
    }
    case 'sin_configurar':
      return MENSAJE_CORREO_SIN_CONFIGURAR;
    default:
      return MENSAJE_CORREO_NO_SALIO;
  }
}

/** Al terminar: si el correo al líder no salió, se aclara primero que la tarea sí quedó terminada. */
export function mensajeAvisoTerminada(estado: EstadoCorreo, lider: string): string {
  const mensaje = mensajeAviso(estado, lider);
  return estado === 'enviado' ? mensaje : `${MENSAJE_TAREA_TERMINADA} ${mensaje}`;
}

/** Un archivo de la tarea candidato a ir en un correo. */
export interface ArchivoParaCorreo {
  /** Id de crm_tarea_archivos. */
  id: number;
  nombre: string;
  bytes: number;
  /** ISO 8601. */
  creadoEn: string;
}

export interface SeleccionAdjuntos {
  /** Ids de crm_tarea_archivos que van adjuntos (MensajeCrm.adjuntos). */
  adjuntos: number[];
  /** Todos, en orden, marcando cuáles van adjuntos (DatosCorreoTarea.archivos). */
  archivos: DatosCorreoTarea['archivos'];
}

/**
 * Escoge qué archivos van adjuntos: en el orden en que se subieron, cada uno
 * entra si con él el total no pasa de `maxBytes`; el que no cabe va como
 * enlace (`adjunto: false`, se descarga en el CRM) y se sigue probando con
 * los siguientes, que pueden ser más pequeños.
 */
export function escogerAdjuntos(
  archivos: readonly ArchivoParaCorreo[],
  maxBytes: number = LIMITES_CRM.maxBytesAdjuntosCorreo,
): SeleccionAdjuntos {
  const ordenados = archivos.toSorted((a, b) => {
    if (a.creadoEn !== b.creadoEn) return a.creadoEn < b.creadoEn ? -1 : 1;
    return a.id - b.id;
  });
  const adjuntos: number[] = [];
  const lista: SeleccionAdjuntos['archivos'] = [];
  let total = 0;
  for (const archivo of ordenados) {
    const cabe = total + archivo.bytes <= maxBytes;
    if (cabe) {
      total += archivo.bytes;
      adjuntos.push(archivo.id);
    }
    lista.push({ nombre: archivo.nombre, bytes: archivo.bytes, adjunto: cabe });
  }
  return { adjuntos, archivos: lista };
}

/** Lo que se necesita de la petición para armar los enlaces (la Request de Express sirve). */
export interface PeticionConOrigen {
  protocol: string;
  get(cabecera: string): string | undefined;
}

/** CRM_URL_SITIO sin barra final, o null si no está configurada. */
export function origenConfigurado(urlSitio: string | null): string | null {
  return urlSitio?.trim().replace(/\/+$/, '') || null;
}

/**
 * Base de los enlaces de los correos que pide el líder (con sesión):
 * CRM_URL_SITIO o, si no está, el origen de su petición. Los que dispara el
 * equipo (sin sesión) usan solo origenConfigurado: allí el Host lo escribe
 * cualquiera, y con él el enlace del correo al líder llevaría a otro sitio.
 */
export function origenSitio(urlSitio: string | null, req: PeticionConOrigen): string {
  return origenConfigurado(urlSitio) ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

/** Enlace del líder a una tarea. */
export function enlaceLider(origen: string, tareaId: number): string {
  return `${origen}/crm/lider/tareas/${tareaId}`;
}

/** Enlace del responsable a una tarea de su tablero. */
export function enlaceEquipo(origen: string, personaId: number, tareaId: number): string {
  return `${origen}/crm/equipo/${personaId}?tarea=${tareaId}`;
}
