import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import type { FilasTablas } from './datos-matricula.js';

/** Filas por INSERT: unos miles de parámetros, lejos del límite de Postgres (65.535). */
const TAMANO_LOTE = 500;

/** INSERT por lotes (lo usan también los demás tableros). */
export async function insertarLotes(
  conexion: Conexion,
  tabla: string,
  columnas: readonly string[],
  filas: ReadonlyArray<readonly unknown[]>,
): Promise<void> {
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE);
    const marcas = lote.map(() => `(${columnas.map(() => '?').join(', ')})`).join(', ');
    await conexion.query(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${marcas}`, lote.flat());
  }
}

/**
 * Reemplaza, en una sola transacción, los datos de matrícula y la fila del
 * tablero: o queda todo lo nuevo o se conserva lo anterior. Funciona igual en
 * MySQL y en Postgres (la conexión traduce los parámetros).
 */
export async function guardarMatricula(bd: BaseDatosRepositorio, filas: FilasTablas): Promise<void> {
  await bd.transaccion(
    async (conexion) => {
      // De las filas hacia las dimensiones, por las llaves foráneas.
      await conexion.query('DELETE FROM sivu_tablero_matricula_2025_filas');
      await conexion.query('DELETE FROM sivu_tablero_matricula_2025_programas');
      await conexion.query('DELETE FROM sivu_tablero_matricula_2025_ies');
      await conexion.query('DELETE FROM sivu_tablero_matricula_2025_categorias');
      await conexion.query('DELETE FROM sivu_tablero_matricula_2025_meta');
      await conexion.query('DELETE FROM sivu_tableros WHERE id = ?', [filas.tablero.id]);
      await conexion.query('INSERT INTO sivu_tableros (id, titulo, definiciones) VALUES (?, ?, ?)', [
        filas.tablero.id,
        filas.tablero.titulo,
        filas.tablero.definiciones,
      ]);
      const { meta } = filas;
      await conexion.query(
        'INSERT INTO sivu_tablero_matricula_2025_meta (id, municipio, anio, referencia, fuente, generado) VALUES (1, ?, ?, ?, ?, ?)',
        [meta.municipio, meta.anio, meta.referencia, meta.fuente, meta.generado],
      );
      await insertarLotes(conexion, 'sivu_tablero_matricula_2025_categorias', ['dimension', 'indice', 'nombre', 'padre'], filas.categorias);
      await insertarLotes(
        conexion,
        'sivu_tablero_matricula_2025_ies',
        ['indice', 'nombre', 'corto', 'sector', 'caracter', 'acreditada', 'codigos'],
        filas.ies,
      );
      await insertarLotes(
        conexion,
        'sivu_tablero_matricula_2025_programas',
        ['indice', 'codigo', 'nombre', 'ies', 'nivel_formacion', 'modalidad', 'nbc', 'cine', 'acreditado'],
        filas.programas,
      );
      await insertarLotes(conexion, 'sivu_tablero_matricula_2025_filas', ['n', 'programa', 'sexo', 'periodo', 'matriculados'], filas.filas);
    },
    { reintentos: 0 },
  );
}
