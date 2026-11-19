/**
 * Indexador del repositorio del Observatorio para el Asistente ODES.
 *
 *   npm run odes:indexar [-- --fuente mysql|paquete] [opciones]
 *
 * Lee los documentos de una de dos fuentes:
 * - mysql: la base de datos de la rama /repositorio (REPOSITORIO_MYSQL_*):
 *   solo los documentos PUBLICADOS y sus archivos guardados en la base. Es la
 *   fuente por defecto cuando la base está configurada. Los enlaces quedan
 *   apuntando a las copias propias (/api/repositorio/documentos/<id>/ver) y
 *   las miniaturas a /api/repositorio/documentos/<id>/miniatura.
 * - paquete: el paquete de datos (repositorio.json + documentos/ + portadas/).
 *
 * Extrae el texto de cada archivo (pdftotext; OCR con tesseract en páginas
 * sin texto; XML de DOCX/PPTX), lo fragmenta por páginas y escribe el índice
 * SQLite FTS5 que usa el servidor (por defecto datos/odes/indice.sqlite). El
 * archivo se reemplaza de forma atómica: un servidor en marcha lo recarga solo
 * (en menos de un minuto). El texto extraído queda en una caché por sha256:
 * reindexar sin cambios no vuelve a ejecutar nada (y, con la base, no
 * descarga ningún archivo).
 *
 * Herramientas necesarias SOLO aquí (no en el servidor web): poppler
 * (pdftotext, pdftoppm, pdfinfo), tesseract con los idiomas spa y eng, unzip
 * y, con --miniaturas, cwebp (libwebp). Se comprueban antes de empezar: si
 * falta alguna, no se toca el índice.
 *
 * Solo corre una indexación a la vez por índice (cerrojo <índice>.lock).
 *
 * Códigos de salida: 0 bien, 1 error, 2 uso o configuración, 3 faltan
 * herramientas, 75 ya hay otra indexación en curso, 143 cancelada.
 */
import { readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  cargarArchivoEnv,
  ErrorDeConfiguracion,
} from '../../config/configuracion.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { cargarConfiguracionRepositorio } from '../../repositorio/configuracion-repositorio.js';
import { ServicioLecturaRepositorio } from '../../repositorio/servicios/lectura-repositorio.js';
import {
  DIRECTORIO_DATOS_ODES,
  DIRECTORIO_MINIATURAS_POR_DEFECTO,
  type FuenteIndexador,
  fuenteDesdeEntorno,
  interpretarFuente,
  paqueteDesdeEntorno,
  rutaIndiceDesdeEntorno,
} from '../repositorio/configuracion-repositorio.js';
import { type Cerrojo, tomarCerrojo } from '../repositorio/indexacion/cerrojo.js';
import { OPCIONES_EXTRACCION_POR_DEFECTO } from '../repositorio/indexacion/extraccion.js';
import {
  ErrorArchivoFuente,
  type FuenteRepositorio,
} from '../repositorio/indexacion/fuente.js';
import { FuenteMysql } from '../repositorio/indexacion/fuente-mysql.js';
import { FuentePaqueteJson } from '../repositorio/indexacion/fuente-paquete-json.js';
import {
  herramientasFaltantes,
  mensajeHerramientasFaltantes,
} from '../repositorio/indexacion/herramientas-indexacion.js';
import {
  ErrorIndexacion,
  indexar,
  type ResultadoIndexacion,
} from '../repositorio/indexacion/indexador.js';
import type {
  CodigoResultadoIndexacion,
  ResultadoIndexacionCli,
} from './resultado-indexacion.js';

const AYUDA = `Uso: npm run odes:indexar -- [--fuente mysql|paquete] [--paquete <carpeta>]
       [--indice <archivo>] [--solo-metadatos] [--miniaturas] [--destino-miniaturas <carpeta>]
       [--sin-ocr] [--max-ocr <n>] [--concurrencia <n>] [--sin-cache] [--cache <carpeta>]
       [--permitir-fallos] [--resultado <archivo.json>]

  --fuente         mysql = base de datos del repositorio (REPOSITORIO_MYSQL_*), solo publicados;
                   paquete = carpeta con repositorio.json. Por defecto: ODES_FUENTE, o paquete si
                   se da --paquete, o mysql si la base está configurada, o paquete con ODES_PAQUETE
  --paquete        carpeta con repositorio.json, documentos/ y portadas/ (o ODES_PAQUETE)
  --indice         archivo del índice (o ODES_INDICE; por defecto datos/odes/indice.sqlite)
  --solo-metadatos solo fichas de metadatos, sin extraer texto (no necesita herramientas)
  --miniaturas     (solo paquete) genera las miniaturas WebP (192 px) en apps/web/public/odes/portadas
  --sin-ocr        sin OCR en las páginas sin texto
  --max-ocr        máximo de páginas con OCR por documento (por defecto 60)
  --concurrencia   procesos externos a la vez (por defecto: núcleos - 1)
  --sin-cache      vuelve a extraer todo aunque esté en la caché
  --cache          carpeta de la caché de extracción (por defecto datos/odes/cache)
  --permitir-fallos escribe el índice aunque falle la extracción de más de la mitad de los archivos
  --resultado      escribe aquí un JSON con el resultado (lo usa la administración)`;

/** Carpeta desde la que se ejecutó `npm run` (npm cambia el cwd a apps/server). */
const DIRECTORIO_LLAMADA = process.env.INIT_CWD ?? process.cwd();

/** Proporción de archivos fallidos a partir de la cual no se reemplaza el índice. */
const MAX_PROPORCION_FALLOS = 0.5;

type CodigoResultado = CodigoResultadoIndexacion;
type ResultadoCli = ResultadoIndexacionCli;

class ErrorCli extends Error {
  constructor(
    mensaje: string,
    readonly codigoSalida: number,
    readonly codigo: CodigoResultado,
  ) {
    super(mensaje);
    this.name = 'ErrorCli';
  }
}

function rutaDeOpcion(valor: string): string {
  return isAbsolute(valor)
    ? resolve(valor)
    : resolve(DIRECTORIO_LLAMADA, valor);
}

function enteroPositivo(
  valor: string | undefined,
  nombre: string,
  porDefecto: number,
): number {
  if (valor === undefined) return porDefecto;
  if (!/^\d+$/.test(valor) || Number(valor) < 1) {
    throw new ErrorCli(
      `--${nombre} debe ser un entero mayor que 0 (recibido: "${valor}").`,
      2,
      'uso',
    );
  }
  return Number(valor);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Limpieza (también al recibir SIGTERM/SIGINT) ───────────────────────────

const limpiezas: Array<() => Promise<void> | void> = [];
let rutaResultado: string | null = null;

function escribirResultado(resultado: ResultadoCli): void {
  if (!rutaResultado) return;
  try {
    const temporal = `${rutaResultado}.${process.pid}.tmp`;
    writeFileSync(temporal, JSON.stringify(resultado));
    renameSync(temporal, rutaResultado);
  } catch (error) {
    console.error(
      `Aviso: no se pudo escribir ${rutaResultado}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function limpiar(): Promise<void> {
  for (const accion of limpiezas.splice(0).toReversed()) {
    try {
      await accion();
    } catch {
      // La limpieza nunca debe tapar el error original.
    }
  }
}

/** Temporales del escritor de este proceso (<índice>.tmp-<pid>-…) que quedaron a medias. */
function borrarTemporalesIndice(rutaIndice: string): void {
  const prefijo = `${basename(rutaIndice)}.tmp-${process.pid}-`;
  try {
    for (const nombre of readdirSync(dirname(rutaIndice))) {
      if (nombre.startsWith(prefijo)) {
        rmSync(join(dirname(rutaIndice), nombre), { force: true });
      }
    }
  } catch {
    // La carpeta puede no existir todavía.
  }
}

let cancelando = false;
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    if (cancelando) return;
    cancelando = true;
    console.error('Error: indexación cancelada; el índice anterior no se modificó.');
    escribirResultado({
      ok: false,
      codigo: 'cancelada',
      error: 'La indexación se canceló; el índice anterior no se modificó.',
    });
    void limpiar().finally(() => process.exit(143));
  });
}

// ── Fuente ─────────────────────────────────────────────────────────────────

function elegirFuente(
  opcion: string | undefined,
  conPaquete: boolean,
): FuenteIndexador {
  if (opcion) {
    try {
      return interpretarFuente(opcion, '--fuente');
    } catch (error) {
      throw new ErrorCli((error as Error).message, 2, 'uso');
    }
  }
  if (conPaquete) return 'paquete';
  const delEntorno = fuenteDesdeEntorno();
  if (delEntorno) return delEntorno;
  if (cargarConfiguracionRepositorio(process.env).mysql) return 'mysql';
  return 'paquete';
}

async function abrirBaseRepositorio(): Promise<{
  fuente: FuenteMysql;
  descripcion: string;
}> {
  const config = cargarConfiguracionRepositorio(process.env);
  const m = config.mysql;
  if (!m) {
    throw new ErrorCli(
      'La fuente mysql necesita la conexión a la base del repositorio: defina ' +
        'REPOSITORIO_MYSQL_HOST/USER/PASSWORD/DATABASE (o REPOSITORIO_MYSQL_URL) en apps/server/.env, ' +
        'o use --fuente paquete --paquete <carpeta>.',
      2,
      'uso',
    );
  }
  const destino = `${m.baseDatos} en ${m.host}:${m.puerto}`;
  const bd = new BaseDatosRepositorio(config);
  bd.registro = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  bd.iniciar();
  limpiezas.push(() => bd.cerrar());
  try {
    await bd.listo();
  } catch {
    throw new ErrorCli(
      bd.estado === 'sin_esquema'
        ? `La base ${destino} no tiene el esquema del repositorio (npm run repositorio:migrar).`
        : `No se pudo conectar a la base del repositorio (${destino}). Revise REPOSITORIO_MYSQL_*, ` +
            'la red autorizada de Cloud SQL y el certificado TLS. El índice anterior no se modificó.',
      1,
      'fuente',
    );
  }
  const fuente = new FuenteMysql(new ServicioLecturaRepositorio(bd), {
    destino,
  });
  return { fuente, descripcion: `base de datos ${destino} (solo publicados)` };
}

// ── Principal ──────────────────────────────────────────────────────────────

async function principal(): Promise<number> {
  cargarArchivoEnv();
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        fuente: { type: 'string' },
        paquete: { type: 'string' },
        indice: { type: 'string' },
        'solo-metadatos': { type: 'boolean', default: false },
        miniaturas: { type: 'boolean', default: false },
        'destino-miniaturas': { type: 'string' },
        'sin-ocr': { type: 'boolean', default: false },
        'max-ocr': { type: 'string' },
        concurrencia: { type: 'string' },
        'sin-cache': { type: 'boolean', default: false },
        cache: { type: 'string' },
        'permitir-fallos': { type: 'boolean', default: false },
        resultado: { type: 'string' },
        ayuda: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new ErrorCli(`${(error as Error).message}\n\n${AYUDA}`, 2, 'uso');
  }
  if (values.resultado) rutaResultado = rutaDeOpcion(values.resultado);
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }

  const tipoFuente = elegirFuente(values.fuente, values.paquete !== undefined);
  const paquete =
    tipoFuente === 'paquete'
      ? values.paquete
        ? rutaDeOpcion(values.paquete)
        : paqueteDesdeEntorno()
      : null;
  if (tipoFuente === 'paquete' && !paquete) {
    throw new ErrorCli(
      'Falta la fuente: use --paquete <carpeta> (o ODES_PAQUETE), o configure la base del repositorio ' +
        '(REPOSITORIO_MYSQL_*) para indexar desde ella.\n\n' +
        AYUDA,
      2,
      'uso',
    );
  }
  if (tipoFuente === 'mysql' && values.paquete) {
    throw new ErrorCli('--paquete solo se usa con --fuente paquete.', 2, 'uso');
  }
  if (tipoFuente === 'mysql' && values.miniaturas) {
    throw new ErrorCli(
      '--miniaturas solo se usa con --fuente paquete: con la base, las miniaturas se sirven desde ' +
        '/api/repositorio/documentos/<id>/miniatura.',
      2,
      'uso',
    );
  }

  const rutaIndice = values.indice
    ? rutaDeOpcion(values.indice)
    : rutaIndiceDesdeEntorno();
  const directorioMiniaturas = values['destino-miniaturas']
    ? rutaDeOpcion(values['destino-miniaturas'])
    : DIRECTORIO_MINIATURAS_POR_DEFECTO;
  const directorioCache = values.cache
    ? rutaDeOpcion(values.cache)
    : join(DIRECTORIO_DATOS_ODES, 'cache');
  const concurrencia = enteroPositivo(
    values.concurrencia,
    'concurrencia',
    Math.max(1, availableParallelism() - 1),
  );
  const extraccion = {
    ...OPCIONES_EXTRACCION_POR_DEFECTO,
    ocr: !values['sin-ocr'],
    maxPaginasOcr: enteroPositivo(
      values['max-ocr'],
      'max-ocr',
      OPCIONES_EXTRACCION_POR_DEFECTO.maxPaginasOcr,
    ),
  };

  // Una sola indexación a la vez sobre este índice.
  const cerrojo = tomarCerrojo(
    rutaIndice,
    `odes:indexar --fuente ${tipoFuente}`,
  );
  if (!cerrojo.tomado) {
    const { ocupado } = cerrojo;
    throw new ErrorCli(
      `Ya hay una indexación en curso sobre ${rutaIndice}` +
        (ocupado.pid > 0
          ? ` (proceso ${ocupado.pid} en ${ocupado.host}, desde ${ocupado.inicio})`
          : '') +
        '. Espere a que termine.',
      75,
      'cerrojo',
    );
  }
  const tomado: Cerrojo = cerrojo.cerrojo;
  limpiezas.push(() => tomado.liberar());
  limpiezas.push(() => borrarTemporalesIndice(rutaIndice));

  if (!values['solo-metadatos']) {
    const faltan = mensajeHerramientasFaltantes(
      await herramientasFaltantes({
        ocr: extraccion.ocr,
        idiomasOcr: extraccion.idiomasOcr,
        miniaturas: values.miniaturas,
      }),
    );
    if (faltan) throw new ErrorCli(faltan, 3, 'herramientas');
  }

  let fuente: FuenteRepositorio;
  let descripcion: string;
  if (tipoFuente === 'mysql') {
    ({ fuente, descripcion } = await abrirBaseRepositorio());
  } else {
    fuente = new FuentePaqueteJson(paquete!);
    descripcion = `paquete ${paquete}`;
  }
  limpiezas.push(() => fuente.cerrar?.());

  console.log(`Fuente:  ${descripcion}`);
  console.log(`Índice:  ${rutaIndice}`);
  let resultado: ResultadoIndexacion;
  try {
    resultado = await indexar({
      fuente,
      rutaIndice,
      soloMetadatos: values['solo-metadatos'],
      extraccion,
      directorioCache,
      reutilizarCache: !values['sin-cache'],
      concurrencia,
      directorioMiniaturas,
      generarMiniaturas: values.miniaturas,
      maxProporcionFallos: values['permitir-fallos'] ? null : MAX_PROPORCION_FALLOS,
      registro: (mensaje) => console.log(mensaje),
    });
  } catch (error) {
    if (error instanceof ErrorArchivoFuente) {
      throw new ErrorCli(
        `${error.message}. El índice anterior no se modificó.`,
        1,
        'fuente',
      );
    }
    if (error instanceof ErrorIndexacion) {
      throw new ErrorCli(error.message, 1, 'fallos');
    }
    throw error;
  }

  imprimirResumen(resultado, directorioMiniaturas);
  escribirResultado({
    ok: true,
    resumen: {
      fuente: resultado.fuente,
      origen: resultado.origenFuente,
      documentos: resultado.escritura.documentos,
      documentosConTexto: resultado.escritura.documentosConTexto,
      conArchivo: resultado.conArchivo,
      paginas: resultado.escritura.paginas,
      paginasOcr: resultado.ocr.paginas,
      desdeCache: resultado.desdeCache,
      fallos: resultado.fallos.length,
      retirados: resultado.retirados.length,
      duracionMs: resultado.duracionMs,
    },
  });
  return 0;
}

function imprimirResumen(
  resultado: ResultadoIndexacion,
  directorioMiniaturas: string,
): void {
  const { escritura } = resultado;
  console.log('\nÍndice escrito.');
  console.log(
    `  Documentos:            ${escritura.documentos} (${resultado.conArchivo} con archivo)`,
  );
  console.log(`  Con texto indexado:    ${escritura.documentosConTexto}`);
  console.log(
    `  Páginas con texto:     ${escritura.paginas}; con OCR: ${resultado.ocr.paginas} ` +
      `en ${resultado.ocr.documentos.length} documentos` +
      (resultado.ocr.paginasSinOcrPorTope > 0
        ? ` (${resultado.ocr.paginasSinOcrPorTope} páginas sin OCR por el tope)`
        : ''),
  );
  console.log(
    `  Fragmentos:            ${escritura.fragmentosTexto} de texto + ${escritura.fichas} fichas`,
  );
  console.log(`  Traducciones enlazadas: ${resultado.traduccionesEmparejadas}`);
  console.log(`  Desde la caché:        ${resultado.desdeCache} documentos`);
  if (resultado.origenFuente === 'mysql') {
    console.log(
      `  Miniaturas de la base: ${resultado.conUrlMiniatura} documentos`,
    );
  }
  if (resultado.retirados.length > 0) {
    console.log(
      `  Despublicados durante la indexación (no incluidos): ${resultado.retirados.join(', ')}`,
    );
  }
  console.log(`  Tamaño del índice:     ${megabytes(escritura.bytes)}`);
  console.log(
    `  Duración:              ${(resultado.duracionMs / 1000).toFixed(1)} s`,
  );
  if (resultado.miniaturas) {
    const m = resultado.miniaturas;
    console.log(
      `  Miniaturas:            ${m.generadas} generadas, ${m.archivos} en total (${megabytes(m.bytes)})` +
        (m.eliminadas ? `, ${m.eliminadas} huérfanas eliminadas` : ''),
    );
    for (const fallo of m.fallos) console.log(`    fallo: ${fallo}`);
  }
  if (resultado.portadasSinMiniatura > 0) {
    console.log(
      `  Aviso: ${resultado.portadasSinMiniatura} documentos sin miniatura en ${directorioMiniaturas} ` +
        '(quedan sin portada en el índice; ejecute con --miniaturas).',
    );
  }
  if (resultado.sinTexto.length > 0) {
    console.log(
      `  Archivos sin texto útil (${resultado.sinTexto.length}): ${resultado.sinTexto.join(', ')}`,
    );
  }
  if (resultado.fallos.length > 0) {
    console.log(
      `  Fallos (${resultado.fallos.length}; esos documentos quedan solo con su ficha):`,
    );
    for (const fallo of resultado.fallos)
      console.log(`    ${fallo.id}: ${fallo.motivo}`);
  }
}

try {
  process.exitCode = await principal();
} catch (error) {
  let mensaje = error instanceof Error ? error.message : String(error);
  let codigoSalida = 1;
  let codigo: CodigoResultado = 'error';
  if (error instanceof ErrorCli) {
    ({ codigoSalida, codigo } = error);
  } else if (error instanceof ErrorDeConfiguracion) {
    codigoSalida = 2;
    codigo = 'uso';
  }
  // La primera línea de un error de uso es el mensaje; la ayuda va aparte.
  console.error(`Error: ${mensaje}`);
  mensaje = mensaje.split('\n\n')[0]!;
  escribirResultado({ ok: false, codigo, error: mensaje });
  process.exitCode = codigoSalida;
} finally {
  if (!cancelando) await limpiar();
}
