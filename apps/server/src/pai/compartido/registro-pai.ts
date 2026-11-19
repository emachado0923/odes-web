import type { RowDataPacket } from 'mysql2/promise';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import type { AccionRegistroPai, NumeroBimestre } from '../api-pai.js';

/**
 * Escritura en el registro (auditoría) del PAI, tabla pai_registro. La usan
 * todas las partes (sesión, reportes, evidencias, administración) dentro de
 * la transacción de la acción, para que el registro y el cambio queden juntos.
 * La lectura (GET /admin/registro) está en servicios/servicio-registro.ts.
 */

export interface EntradaNuevaRegistroPai {
  accion: AccionRegistroPai;
  /** Quién (null para la CLI o acciones del sistema). */
  usuarioId?: number | null;
  /** Nombre de usuario (login); se guarda aunque la cuenta cambie después. */
  usuario?: string | null;
  indicadorId?: number | null;
  /** Si falta y hay indicadorId, se busca en pai_indicadores. */
  codigoIndicador?: string | null;
  bimestre?: NumeroBimestre | null;
  /**
   * Valores anteriores y nuevos u otros datos (se guarda como JSON). Nunca
   * contraseñas, hashes ni tokens.
   */
  detalle?: Record<string, unknown> | null;
  /** Por defecto, new Date(). */
  fecha?: Date;
}

/**
 * Tamaño máximo del detalle JSON (caracteres). La columna es MEDIUMTEXT en
 * MySQL (16 MB) y text en Postgres: el límite no viene de la base. El
 * detalle más grande que produce la API, un guardar_reporte con los 7
 * campos de 10 000 caracteres antes y después (con el escape de JSON), queda
 * muy por debajo (unos 300 000).
 */
export const MAX_DETALLE_REGISTRO = 1_000_000;

/** Caracteres que se conservan de cada texto si hay que recortar el detalle. */
export const MAX_TEXTO_DETALLE_RECORTADO = 2_000;

interface FilaCodigo extends RowDataPacket {
  codigo: string;
}

/** Copia del valor con cada texto de más de `maximo` caracteres recortado (y marcado). */
function recortarTextos(valor: unknown, maximo: number): unknown {
  if (typeof valor === 'string') {
    return valor.length > maximo
      ? `${valor.slice(0, maximo)}… [recortado: ${valor.length} caracteres]`
      : valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((elemento) => recortarTextos(elemento, maximo));
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, elemento]) => [
        clave,
        recortarTextos(elemento, maximo),
      ]),
    );
  }
  return valor;
}

/**
 * Detalle como JSON. Si pasa de MAX_DETALLE_REGISTRO, se recorta cada texto
 * por separado (la estructura, p. ej. antes / después y motivo, se
 * conserva) y se marca `recortado: true`; solo si aun así no cabe, se guarda
 * el comienzo del JSON.
 */
export function detalleJson(
  detalle: Record<string, unknown> | null | undefined,
): string | null {
  if (!detalle) return null;
  const texto = JSON.stringify(detalle);
  if (texto.length <= MAX_DETALLE_REGISTRO) return texto;
  const porTextos = JSON.stringify({
    ...(recortarTextos(detalle, MAX_TEXTO_DETALLE_RECORTADO) as Record<
      string,
      unknown
    >),
    recortado: true,
  });
  if (porTextos.length <= MAX_DETALLE_REGISTRO) return porTextos;
  return JSON.stringify({
    recortado: true,
    inicio: texto.slice(0, MAX_DETALLE_REGISTRO - 200),
  });
}

function recortar(
  texto: string | null | undefined,
  maximo: number,
): string | null {
  if (!texto) return null;
  return texto.length > maximo ? texto.slice(0, maximo) : texto;
}

export async function registrarEnPai(
  conexion: Pick<Conexion, 'query'>,
  entrada: EntradaNuevaRegistroPai,
): Promise<void> {
  let codigo = entrada.codigoIndicador ?? null;
  if (!codigo && entrada.indicadorId) {
    const [filas] = await conexion.query<FilaCodigo[]>(
      'SELECT codigo FROM pai_indicadores WHERE id = ?',
      [entrada.indicadorId],
    );
    codigo = filas[0]?.codigo ?? null;
  }
  await conexion.query(
    'INSERT INTO pai_registro (fecha, usuario_id, usuario, accion, indicador_id, codigo_indicador, bimestre, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      entrada.fecha ?? new Date(),
      entrada.usuarioId ?? null,
      recortar(entrada.usuario, 64),
      entrada.accion,
      entrada.indicadorId ?? null,
      recortar(codigo, 20),
      entrada.bimestre ?? null,
      detalleJson(entrada.detalle),
    ],
  );
}
