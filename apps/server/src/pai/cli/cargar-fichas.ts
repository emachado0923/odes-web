/**
 * Carga en la base las fichas del PAI (estructura, metas y el historial de
 * reportes importado de los Excel).
 *
 *   npm run pai:cargar-fichas -- [--archivo <ruta>] [--vigencia 2026] [--bimestre-abierto N|cerrado] [--forzar] [--aceptar-renumeracion]
 *
 * --archivo por defecto: apps/server/datos/pai/<vigencia>/pai-<vigencia>.json
 * (datos/pai/2026/pai-2026.json; ver su LEEME.md). Ver carga/guardar-fichas.ts
 * para las reglas: se niega si la vigencia ya tiene datos del aplicativo
 * (reportes, evidencias, asignaciones o autorizaciones), salvo --forzar, que
 * conserva lo que sigue en el archivo y avisa de lo que se pierde; y se
 * niega (también con --forzar) si un código con datos del aplicativo cambia
 * de nombre (códigos corridos), salvo --aceptar-renumeracion.
 *
 * Usa la conexión de la aplicación (apps/server/.env) y necesita el esquema
 * versión 5 (npm run repositorio:migrar). La función de Vercel no lleva
 * datos/: la carga siempre se hace desde una estación con esta CLI.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { NumeroBimestre } from '../api-pai.js';
import { cargarArchivoEnv, RAIZ_SERVIDOR } from '../../config/configuracion.js';
import {
  abrirBaseDatos,
  ejecutarCli,
  ErrorCli,
  rutaDeOpcion,
} from '../../repositorio/cli/comun.js';
import { ErrorDatosFichas, leerArchivoFichas } from '../carga/datos-fichas.js';
import { ErrorCargaFichas, guardarFichas } from '../carga/guardar-fichas.js';

const AYUDA = `Uso: npm run pai:cargar-fichas -- [--archivo <ruta>] [--vigencia 2026] [--bimestre-abierto N|cerrado] [--forzar] [--aceptar-renumeracion]

  --archivo           JSON de las fichas (por defecto ${join('datos', 'pai', '<vigencia>', 'pai-<vigencia>.json')})
  --vigencia          año (por defecto 2026); debe coincidir con el del archivo
  --bimestre-abierto  1-6 abre ese bimestre al terminar; "cerrado" lo cierra
                      (sin la opción, el bimestre abierto no cambia)
  --forzar            carga aunque la vigencia tenga reportes del aplicativo,
                      evidencias, asignaciones o autorizaciones (se conserva lo
                      que sigue en el archivo y se avisa de lo que se pierde)
  --aceptar-renumeracion
                      carga aunque un código con datos del aplicativo cambie de
                      nombre: esos datos quedan con el indicador que ahora tiene
                      el código. Sin la opción la carga se niega, porque casi
                      siempre significa que los códigos se corrieron (se agregó
                      o quitó una fila en medio de la hoja)
  --ayuda             muestra esta ayuda

Conviene cerrar el bimestre (o cargar cuando nadie esté reportando) antes de
una carga con --forzar.`;

/** Código de salida cuando la carga se niega por datos del aplicativo. */
const SALIDA_DATOS_APLICATIVO = 3;

/** --bimestre-abierto: undefined (no cambia), null ("cerrado") o 1-6. */
function bimestreDeOpcion(
  valor: string | undefined,
): NumeroBimestre | null | undefined {
  if (valor === undefined) return undefined;
  const texto = valor.trim().toLowerCase();
  if (texto === 'cerrado' || texto === 'ninguno') return null;
  if (/^[1-6]$/.test(texto)) return Number(texto) as NumeroBimestre;
  throw new ErrorCli(
    '--bimestre-abierto debe ser un número de 1 a 6 o "cerrado".',
    2,
  );
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      archivo: { type: 'string' },
      vigencia: { type: 'string' },
      'bimestre-abierto': { type: 'string' },
      forzar: { type: 'boolean', default: false },
      'aceptar-renumeracion': { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const textoVigencia = values.vigencia ?? '2026';
  if (!/^\d{4}$/.test(textoVigencia)) {
    throw new ErrorCli('--vigencia debe ser un año de cuatro cifras.', 2);
  }
  const vigencia = Number(textoVigencia);
  const bimestreAbierto = bimestreDeOpcion(values['bimestre-abierto']);
  const ruta = values.archivo
    ? rutaDeOpcion(values.archivo)
    : join(
        RAIZ_SERVIDOR,
        'datos',
        'pai',
        String(vigencia),
        `pai-${vigencia}.json`,
      );

  let archivo;
  try {
    archivo = await leerArchivoFichas(ruta);
  } catch (error) {
    if (error instanceof ErrorDatosFichas) {
      throw new ErrorCli(`El archivo ${ruta} no es válido: ${error.message}`);
    }
    throw new ErrorCli(`No se pudo leer ${ruta}: ${(error as Error).message}`);
  }
  if (archivo.vigencia !== vigencia) {
    throw new ErrorCli(
      `El archivo es de la vigencia ${archivo.vigencia}, no de ${vigencia}. Use --vigencia ${archivo.vigencia}.`,
      2,
    );
  }

  const bd = await abrirBaseDatos();
  try {
    const resultado = await guardarFichas(bd, archivo, {
      forzar: values.forzar ?? false,
      aceptarRenumeracion: values['aceptar-renumeracion'] ?? false,
      bimestreAbierto,
    });
    console.log(
      `PAI ${resultado.vigencia} cargado${resultado.vigenciaNueva ? ' (vigencia nueva)' : ''}: ` +
        `${resultado.dependencias} dependencias, ${resultado.procesos} procesos, ${resultado.acciones} acciones y ` +
        `${resultado.indicadores} indicadores (${resultado.indicadoresNuevos} nuevos, ${resultado.indicadoresActualizados} con cambios, ` +
        `${resultado.indicadoresBorrados} borrados); ${resultado.reportesImportados} reportes importados y ` +
        `${resultado.reportesConservados} del aplicativo conservados.`,
    );
    for (const aviso of resultado.avisos) console.warn(`Aviso: ${aviso}`);
    if (resultado.evidenciasBorradas > 0) {
      console.warn(
        `Aviso: ${resultado.evidenciasBorradas === 1 ? 'se borró 1 evidencia' : `se borraron ${resultado.evidenciasBorradas} evidencias`} de la base; para liberar sus archivos ejecute npm run pai:recolectar-evidencias.`,
      );
    }
    if (bimestreAbierto !== undefined) {
      console.log(
        bimestreAbierto === null
          ? 'Bimestre cerrado.'
          : `Bimestre ${bimestreAbierto} abierto (sin fecha límite).`,
      );
    }
  } catch (error) {
    if (error instanceof ErrorCargaFichas) {
      throw new ErrorCli(error.message, SALIDA_DATOS_APLICATIVO);
    }
    if (error instanceof ErrorDatosFichas) {
      throw new ErrorCli(`El archivo no es válido: ${error.message}`);
    }
    throw error;
  } finally {
    await bd.cerrar();
  }
  return 0;
}

await ejecutarCli(principal);
