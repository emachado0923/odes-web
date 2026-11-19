import type { RowDataPacket } from 'mysql2/promise';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { type EvidenciaPai, RUTA_API_PAI, RUTAS_API_PAI } from '../api-pai.js';

/**
 * Filas de pai_evidencias -> EvidenciaPai (contrato). Lo usan el servicio de
 * evidencias y, para la ficha del indicador, el de indicadores
 * (evidenciasDeReportes): así las dos respuestas son iguales.
 */

/** Columnas de una evidencia con el nombre de quien la subió (alias e = pai_evidencias, u = pai_usuarios). */
export const COLUMNAS_EVIDENCIA_PAI =
  'e.id, e.reporte_id, e.archivo_id, e.ruta_privada, e.nombre, e.tipo, e.bytes, e.subido_en, u.nombre AS subido_por_nombre';

/** FROM con el usuario que la subió (puede no existir ya: LEFT JOIN). */
export const DESDE_EVIDENCIAS_PAI =
  'pai_evidencias e LEFT JOIN pai_usuarios u ON u.id = e.subido_por';

export interface FilaEvidenciaPai extends RowDataPacket {
  id: number;
  reporte_id: number;
  archivo_id: number;
  ruta_privada: string | null;
  nombre: string;
  tipo: string;
  bytes: number;
  subido_en: Date | string;
  subido_por_nombre: string | null;
}

/** GET de la descarga: /api/pai/evidencias/:id. */
export function urlDescargaEvidencia(id: number): string {
  return `${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(id)}`;
}

function fechaIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

export function aEvidenciaPai(
  fila: Pick<
    FilaEvidenciaPai,
    'id' | 'nombre' | 'tipo' | 'bytes' | 'subido_en' | 'subido_por_nombre'
  >,
): EvidenciaPai {
  const id = Number(fila.id);
  return {
    id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    bytes: Number(fila.bytes),
    subidoEn: fechaIso(fila.subido_en),
    subidoPor: fila.subido_por_nombre ?? null,
    urlDescarga: urlDescargaEvidencia(id),
  };
}

/** Reportes por consulta (muy por debajo del límite de parámetros de Postgres). */
const TAMANO_LOTE = 500;

/**
 * Evidencias de varios reportes (pai_reportes.id), agrupadas por reporte y
 * en orden de subida. Un reporte sin evidencias no aparece en el mapa.
 */
export async function evidenciasDeReportes(
  conexion: Pick<Conexion, 'query'>,
  reporteIds: readonly number[],
): Promise<Map<number, EvidenciaPai[]>> {
  const porReporte = new Map<number, EvidenciaPai[]>();
  const unicos = [...new Set(reporteIds)];
  for (let i = 0; i < unicos.length; i += TAMANO_LOTE) {
    const lote = unicos.slice(i, i + TAMANO_LOTE);
    const [filas] = await conexion.query<FilaEvidenciaPai[]>(
      `SELECT ${COLUMNAS_EVIDENCIA_PAI} FROM ${DESDE_EVIDENCIAS_PAI}
        WHERE e.reporte_id IN (?)
        ORDER BY e.reporte_id, e.subido_en, e.id`,
      [lote],
    );
    for (const fila of filas) {
      const reporteId = Number(fila.reporte_id);
      const lista = porReporte.get(reporteId) ?? [];
      lista.push(aEvidenciaPai(fila));
      porReporte.set(reporteId, lista);
    }
  }
  return porReporte;
}
