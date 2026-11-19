/**
 * Carga en la base los datos del tablero "Matrícula en educación superior en
 * Medellín (2025)" (/tableros/matricula-2025).
 *
 *   npm run tableros:cargar-matricula -- [--matricula <ruta>] [--definiciones <ruta>]
 *
 * Lee datos/matricula.js (lo genera etl_matricula.py del tablero, con la base
 * del SNIES) y datos/definiciones.js (los textos), por defecto las copias de
 * apps/server/datos/tableros/matricula-2025/, y reemplaza en una transacción
 * todo lo que haya en las tablas sivu_tablero_matricula_2025_* y en la fila
 * del tablero en sivu_tableros.
 *
 * Usa la conexión de la aplicación (REPOSITORIO_MYSQL_* o
 * REPOSITORIO_POSTGRES_URL de apps/server/.env). La base debe tener el esquema
 * versión 5 o posterior: npm run repositorio:migrar.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { cargarArchivoEnv, RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { abrirBaseDatos, ejecutarCli, ErrorCli, rutaDeOpcion } from '../../repositorio/cli/comun.js';
import { aFilasTablas, leerArchivosTablero } from './datos-matricula.js';
import { guardarMatricula } from './guardar-matricula.js';

const CARPETA_DATOS = join(RAIZ_SERVIDOR, 'datos', 'tableros', 'matricula-2025');

const AYUDA = `Uso: npm run tableros:cargar-matricula -- [--matricula <ruta>] [--definiciones <ruta>]

  --matricula     datos/matricula.js del tablero (por defecto ${join('datos', 'tableros', 'matricula-2025', 'matricula.js')})
  --definiciones  datos/definiciones.js del tablero (por defecto, el de la misma carpeta)
  --ayuda         muestra esta ayuda`;

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      matricula: { type: 'string' },
      definiciones: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const rutaMatricula = values.matricula ? rutaDeOpcion(values.matricula) : join(CARPETA_DATOS, 'matricula.js');
  const rutaDefiniciones = values.definiciones
    ? rutaDeOpcion(values.definiciones)
    : join(CARPETA_DATOS, 'definiciones.js');

  let filas;
  try {
    const { matricula, definiciones } = await leerArchivosTablero(rutaMatricula, rutaDefiniciones);
    filas = aFilasTablas(matricula, definiciones);
  } catch (error) {
    throw new ErrorCli(`No se pudieron leer los datos del tablero: ${(error as Error).message}`);
  }

  const bd = await abrirBaseDatos();
  try {
    await guardarMatricula(bd, filas);
  } finally {
    await bd.cerrar();
  }
  console.log(
    `Tablero ${filas.tablero.id} cargado: ${filas.ies.length} instituciones, ${filas.programas.length} programas, ` +
      `${filas.categorias.length} categorías y ${filas.filas.length} filas de matrícula.`,
  );
  return 0;
}

await ejecutarCli(principal);
