import type { RowDataPacket } from 'mysql2/promise';
import {
  type ConteoTareasCrm,
  inicialesDe,
  LIMITES_CRM,
  type PersonaAdminCrm,
  type PersonaCrm,
} from '../api-crm.js';
import { haceDias, hoyBogota } from '../compartido/fechas.js';
import type { ContactoPersonaCrm } from './servicio-personas-crm.js';

/**
 * Filas de crm_personas y crm_tareas -> tipos de la API (funciones puras).
 * El correo solo sale en PersonaAdminCrm y en ContactoPersonaCrm: las
 * consultas del equipo ni siquiera lo leen (COLUMNAS_PUBLICAS_PERSONA).
 */

/** Columnas de crm_personas sin el correo (lista del equipo, fotos). */
export const COLUMNAS_PUBLICAS_PERSONA = 'id, nombre, es_lider, activo, orden, foto_archivo_id, foto_version';

/** Con el correo: pantalla Equipo del líder y avisos. */
export const COLUMNAS_PERSONA = `${COLUMNAS_PUBLICAS_PERSONA}, correo`;

/**
 * mysql2 (decimalNumbers, supportBigNumbers) y pg (TIPOS_POSTGRES) entregan
 * números; los booleanos son TINYINT(1)/smallint 0/1. Se convierte igual
 * por si llegara texto.
 */
export interface FilaPersonaPublica extends RowDataPacket {
  id: number;
  nombre: string;
  es_lider: number;
  activo: number;
  orden: number;
  foto_archivo_id: number | null;
  foto_version: number;
}

export interface FilaPersonaCrm extends FilaPersonaPublica {
  correo: string;
}

export interface FilaConteoTareas extends RowDataPacket {
  persona_id: number;
  pendientes: number | null;
  en_proceso: number | null;
  terminadas_recientes: number | null;
  vencidas: number | null;
}

/** Entero de una columna numérica (null, texto o NaN -> 0). */
function entero(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/** Bandera 0/1 de la base (también true/false o '1'). */
export function aBooleano(valor: unknown): boolean {
  return valor === true || Number(valor) === 1;
}

export function conteoVacio(): ConteoTareasCrm {
  return { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 };
}

/** URL de la foto (cambia con foto_version, así la caché del navegador no sirve la anterior) o null. */
export function urlFotoPersona(id: number, fotoArchivoId: unknown, fotoVersion: unknown): string | null {
  if (fotoArchivoId === null || fotoArchivoId === undefined) return null;
  return `/api/crm/personas/${id}/foto?v=${entero(fotoVersion)}`;
}

export function aConteoTareas(fila: FilaConteoTareas): ConteoTareasCrm {
  return {
    pendientes: entero(fila.pendientes),
    enProceso: entero(fila.en_proceso),
    terminadasRecientes: entero(fila.terminadas_recientes),
    vencidas: entero(fila.vencidas),
  };
}

/** Lo público: se arma campo por campo, así una fila con correo no lo filtra. */
export function aPersonaCrm(fila: FilaPersonaPublica, conteo: ConteoTareasCrm): PersonaCrm {
  const id = Number(fila.id);
  return {
    id,
    nombre: fila.nombre,
    iniciales: inicialesDe(fila.nombre),
    esLider: aBooleano(fila.es_lider),
    foto: urlFotoPersona(id, fila.foto_archivo_id, fila.foto_version),
    conteo: { ...conteo },
  };
}

export function aPersonaAdminCrm(fila: FilaPersonaCrm, conteo: ConteoTareasCrm): PersonaAdminCrm {
  return {
    ...aPersonaCrm(fila, conteo),
    correo: fila.correo,
    activo: aBooleano(fila.activo),
    orden: entero(fila.orden),
  };
}

export function aContactoPersonaCrm(fila: FilaPersonaCrm): ContactoPersonaCrm {
  const id = Number(fila.id);
  return {
    id,
    nombre: fila.nombre,
    correo: fila.correo,
    iniciales: inicialesDe(fila.nombre),
    foto: urlFotoPersona(id, fila.foto_archivo_id, fila.foto_version),
    esLider: aBooleano(fila.es_lider),
    activo: aBooleano(fila.activo),
  };
}

/**
 * Conteos de tareas por persona en UNA consulta agrupada. Parte de
 * crm_personas con LEFT JOIN para que quien no tiene tareas salga con
 * ceros; las tareas ocultas (eliminada_en) no cuentan. Las fechas van como
 * parámetros: el instante de hace LIMITES_CRM.diasTerminadasRecientes días
 * y hoy en Bogotá ('AAAA-MM-DD'; vencida = fecha límite anterior a hoy).
 * `personaIds` vacío no se debe pasar (IN () no es SQL válido).
 */
export function consultaConteos(
  personaIds?: readonly number[],
  ahora: Date = new Date(),
): { sql: string; valores: unknown[] } {
  const valores: unknown[] = [haceDias(LIMITES_CRM.diasTerminadasRecientes, ahora), hoyBogota(ahora)];
  let sql = `SELECT p.id AS persona_id,
       SUM(CASE WHEN t.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
       SUM(CASE WHEN t.estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
       SUM(CASE WHEN t.estado = 'terminada' AND t.terminada_en >= ? THEN 1 ELSE 0 END) AS terminadas_recientes,
       SUM(CASE WHEN t.estado <> 'terminada' AND t.fecha_limite IS NOT NULL AND t.fecha_limite < ? THEN 1 ELSE 0 END) AS vencidas
     FROM crm_personas p
     LEFT JOIN crm_tareas t ON t.responsable_id = p.id AND t.eliminada_en IS NULL`;
  if (personaIds !== undefined) {
    sql += '\n     WHERE p.id IN (?)';
    valores.push([...personaIds]);
  }
  sql += '\n     GROUP BY p.id';
  return { sql, valores };
}
