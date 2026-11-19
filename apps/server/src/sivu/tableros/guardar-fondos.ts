import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { FilasFondos } from './datos-fondos.js';
import { insertarLotes } from './guardar-matricula.js';

/** Tablas del tablero, de las que dependen de los programas hacia los programas (orden para borrar). */
const TABLAS_FONDOS = [
  'sivu_tablero_fondos_2026_estados',
  'sivu_tablero_fondos_2026_giros',
  'sivu_tablero_fondos_2026_cohortes',
  'sivu_tablero_fondos_2026_activos',
  'sivu_tablero_fondos_2026_destinos',
  'sivu_tablero_fondos_2026_categorias',
  'sivu_tablero_fondos_2026_programas',
  'sivu_tablero_fondos_2026_meta',
] as const;

/**
 * Reemplaza, en una sola transacción, los datos del tablero de los fondos y su
 * fila en sivu_tableros: o queda todo lo nuevo o se conserva lo anterior.
 * Funciona igual en MySQL y en Postgres (la conexión traduce los parámetros).
 */
export async function guardarFondos(bd: BaseDatosRepositorio, filas: FilasFondos): Promise<void> {
  await bd.transaccion(
    async (conexion) => {
      for (const tabla of TABLAS_FONDOS) await conexion.query(`DELETE FROM ${tabla}`);
      await conexion.query('DELETE FROM sivu_tableros WHERE id = ?', [filas.tablero.id]);
      await conexion.query('INSERT INTO sivu_tableros (id, titulo, definiciones) VALUES (?, ?, ?)', [
        filas.tablero.id,
        filas.tablero.titulo,
        filas.tablero.definiciones,
      ]);
      await conexion.query(
        'INSERT INTO sivu_tablero_fondos_2026_meta (id, corte, periodo_actual, fuente, generado, beneficios, filas_origen, excluidos) ' +
          'VALUES (1, ?, ?, ?, ?, ?, ?, ?)',
        filas.meta,
      );
      await insertarLotes(conexion, 'sivu_tablero_fondos_2026_programas', ['indice', 'clave', 'nombre', 'corto', 'linea'], filas.programas);
      await insertarLotes(conexion, 'sivu_tablero_fondos_2026_categorias', ['dimension', 'indice', 'nombre'], filas.categorias);
      await insertarLotes(
        conexion,
        'sivu_tablero_fondos_2026_estados',
        ['programa', 'convocatoria', 'periodo', 'estado', 'beneficios'],
        filas.estados,
      );
      await insertarLotes(
        conexion,
        'sivu_tablero_fondos_2026_giros',
        ['programa', 'periodo', 'monto', 'matricula', 'sostenimiento', 'con_giro'],
        filas.giros,
      );
      await insertarLotes(conexion, 'sivu_tablero_fondos_2026_cohortes', ['programa', 'convocatoria', 'estado', 'beneficios'], filas.cohortes);
      await insertarLotes(
        conexion,
        'sivu_tablero_fondos_2026_activos',
        ['tipo', 'programa', 'periodo', 'categoria', 'beneficios'],
        filas.activos,
      );
      await insertarLotes(conexion, 'sivu_tablero_fondos_2026_destinos', ['convocatoria', 'pais', 'beneficios'], filas.destinos);
    },
    { reintentos: 0 },
  );
}
