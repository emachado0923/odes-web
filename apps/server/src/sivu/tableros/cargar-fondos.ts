/**
 * Carga en la base los datos del tablero "Beneficiarios de los fondos de
 * Sapiencia (2026)" (/tableros/fondos-2026).
 *
 *   npm run tableros:cargar-fondos -- [--fondos <ruta>] [--definiciones <ruta>]
 *
 * Lee fondos.json (lo genera etl_fondos.py con el Power BI de seguimiento de
 * los fondos: solo cifras agregadas) y definiciones.json (los textos), por
 * defecto los de apps/server/datos/tableros/fondos-2026/, y reemplaza en una
 * transacción todo lo que haya en las tablas sivu_tablero_fondos_2026_* y en
 * la fila del tablero en sivu_tableros.
 *
 * Usa la conexión de la aplicación (REPOSITORIO_MYSQL_* o
 * REPOSITORIO_POSTGRES_URL de apps/server/.env). La base debe tener el esquema
 * versión 7 o posterior: npm run repositorio:migrar.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { cargarArchivoEnv, RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { abrirBaseDatos, ejecutarCli, ErrorCli, rutaDeOpcion } from '../../repositorio/cli/comun.js';
import { aFilasFondos, ID_TABLERO_FONDOS, leerArchivosFondos } from './datos-fondos.js';
import { guardarFondos } from './guardar-fondos.js';

const CARPETA_DATOS = join(RAIZ_SERVIDOR, 'datos', 'tableros', ID_TABLERO_FONDOS);

const AYUDA = `Uso: npm run tableros:cargar-fondos -- [--fondos <ruta>] [--definiciones <ruta>]

  --fondos        fondos.json, el que genera etl_fondos.py (por defecto ${join('datos', 'tableros', ID_TABLERO_FONDOS, 'fondos.json')})
  --definiciones  definiciones.json con los textos (por defecto, el de la misma carpeta)
  --ayuda         muestra esta ayuda`;

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      fondos: { type: 'string' },
      definiciones: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const rutaFondos = values.fondos ? rutaDeOpcion(values.fondos) : join(CARPETA_DATOS, 'fondos.json');
  const rutaDefiniciones = values.definiciones ? rutaDeOpcion(values.definiciones) : join(CARPETA_DATOS, 'definiciones.json');

  let filas;
  try {
    const { fondos, definiciones } = await leerArchivosFondos(rutaFondos, rutaDefiniciones);
    filas = aFilasFondos(fondos, definiciones);
  } catch (error) {
    throw new ErrorCli(`No se pudieron leer los datos del tablero: ${(error as Error).message}`);
  }

  const bd = await abrirBaseDatos();
  try {
    await guardarFondos(bd, filas);
  } finally {
    await bd.cerrar();
  }
  console.log(
    `Tablero ${filas.tablero.id} cargado: ${filas.programas.length} programas, ${filas.estados.length} filas de estados, ` +
      `${filas.giros.length} de giros, ${filas.cohortes.length} de convocatorias y ${filas.activos.length} de activos.`,
  );
  return 0;
}

await ejecutarCli(principal);
