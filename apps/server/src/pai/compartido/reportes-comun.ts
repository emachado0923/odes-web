import type { RowDataPacket } from 'mysql2/promise';
import { ErrorReintentar } from '../../repositorio/bd/base-datos.js';
import type {
  Conexion,
  ResultadoEscritura,
} from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import type { NumeroBimestre } from '../api-pai.js';

/**
 * Operaciones sobre pai_reportes que comparten reportes y evidencias.
 */

interface FilaId extends RowDataPacket {
  id: number;
}

async function buscarReporte(
  conexion: Pick<Conexion, 'query'>,
  indicadorId: number,
  bimestre: NumeroBimestre,
  bloquear = false,
): Promise<number | null> {
  const [filas] = await conexion.query<FilaId[]>(
    'SELECT id FROM pai_reportes WHERE indicador_id = ? AND bimestre = ?' +
      (bloquear ? ' FOR SHARE' : ''),
    [indicadorId, bimestre],
  );
  return filas[0] ? Number(filas[0].id) : null;
}

/**
 * id del reporte (indicador, bimestre); si no existe, crea uno vacío (origen
 * 'aplicativo', sin avance ni textos: su estado sigue siendo pendiente o
 * sin_meta). Lo usa, por ejemplo, la primera evidencia de un bimestre sin
 * reporte (pai_evidencias.reporte_id es obligatorio). No toca un reporte
 * existente (ni su actualizado_en, que es el token de concurrencia).
 *
 * Llamar dentro de una transacción, después de comprobar los permisos. Dos
 * llamadas simultáneas no duplican la fila (UNIQUE indicador + bimestre): la
 * que pierde vuelve a leer con FOR SHARE, que en MySQL (REPEATABLE READ) sí
 * ve la fila que la otra acaba de confirmar aunque la transacción ya hubiera
 * leído antes; si aun así no la encuentra, lanza ErrorReintentar y
 * BaseDatosRepositorio.transaccion repite la transacción entera.
 */
export async function asegurarReporte(
  conexion: Pick<Conexion, 'query'>,
  indicadorId: number,
  bimestre: NumeroBimestre,
  usuarioId: number | null,
): Promise<number> {
  const existente = await buscarReporte(conexion, indicadorId, bimestre);
  if (existente !== null) return existente;
  try {
    const [resultado] = await conexion.query<ResultadoEscritura>(
      "INSERT INTO pai_reportes (indicador_id, bimestre, origen, actualizado_por) VALUES (?, ?, 'aplicativo', ?)",
      [indicadorId, bimestre, usuarioId],
    );
    return Number(resultado.insertId);
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const creado = await buscarReporte(conexion, indicadorId, bimestre, true);
    if (creado === null) throw new ErrorReintentar(error);
    return creado;
  }
}
