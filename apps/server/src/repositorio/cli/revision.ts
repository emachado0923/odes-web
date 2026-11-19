/**
 * Aplica una revisión de datos del repositorio desde un archivo JSON
 * (servicios/revision.ts): categoría, publicación, año y mes, descripción y
 * palabras clave de cada documento, y categorías que quedan sin uso.
 *
 *   npm run repositorio:revision -- --archivo <revision.json> [--aplicar] [--usuario <nombre>]
 *        [--permitir-incompletos] [--detalle]
 *
 * - Sin --aplicar solo SIMULA: hace todo dentro de una transacción que se
 *   deshace al final, muestra qué cambiaría y no deja nada escrito.
 * - Con --aplicar escribe todo en UNA transacción (o todo o nada).
 * - Si al final quedara publicado algo sin lo necesario para publicar (año,
 *   descripción de 25 a 35 palabras y 6 palabras clave), no escribe nada
 *   (salvo --permitir-incompletos).
 * - Usa la conexión de la aplicación (REPOSITORIO_MYSQL_*).
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import { cargarConfiguracionRepositorio } from '../configuracion-repositorio.js';
import { aplicarRevision, ErrorRevision, esquemaRevision, type Revision } from '../servicios/revision.js';
import { abrirBaseDatos, ejecutarCli, ErrorCli, rutaDeOpcion } from './comun.js';

const AYUDA = `Uso: npm run repositorio:revision -- --archivo <revision.json> [--aplicar] [--usuario <nombre>]
       [--permitir-incompletos] [--detalle]

  --archivo               revisión en JSON (formato en src/repositorio/servicios/revision.ts)
  --aplicar               escribe los cambios (sin esta opción solo simula)
  --usuario               nombre que queda en el registro de cambios (por defecto: revision)
  --permitir-incompletos  aplica aunque quede publicado algo sin lo necesario para publicar
  --detalle               muestra, documento por documento, qué cambia (de qué a qué)
  --ayuda                 muestra esta ayuda`;

function recortar(texto: string, maximo = 90): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      archivo: { type: 'string' },
      aplicar: { type: 'boolean', default: false },
      usuario: { type: 'string', default: 'revision' },
      'permitir-incompletos': { type: 'boolean', default: false },
      detalle: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  if (!values.archivo) throw new ErrorCli(`Falta --archivo.\n\n${AYUDA}`, 2);
  const ruta = rutaDeOpcion(values.archivo);
  let revision: Revision;
  try {
    revision = esquemaRevision.parse(JSON.parse(await readFile(ruta, 'utf8')));
  } catch (error) {
    throw new ErrorCli(`El archivo ${ruta} no es una revisión válida: ${error instanceof Error ? error.message : error}`, 2);
  }

  const config = cargarConfiguracionRepositorio(process.env);
  const destino = config.postgres ?? config.mysql;
  const bd = await abrirBaseDatos(config);
  try {
    if (destino) console.log(`Base:      ${destino.baseDatos} en ${destino.host}:${destino.puerto}`);
    console.log(`Revisión:  ${revision.titulo} (${revision.documentos.length} documentos)`);
    console.log(`Modo:      ${values.aplicar ? 'APLICAR (escribe en la base)' : 'simulación (no escribe nada)'}`);
    const r = await aplicarRevision(bd, revision, {
      aplicar: values.aplicar,
      usuario: values.usuario,
      permitirIncompletos: values['permitir-incompletos'],
    }).catch((error: unknown) => {
      if (error instanceof ErrorRevision) throw new ErrorCli(error.message);
      throw error;
    });
    if (values.detalle) {
      for (const c of r.cambios) {
        console.log(`\n${c.id}`);
        for (const d of c.diferencias) console.log(`  ${d.campo}: ${recortar(d.antes)} → ${recortar(d.despues)}`);
      }
    }
    console.log(`\n${r.aplicada ? 'Aplicada' : 'Simulada'}: ${r.cambios.length} documentos con cambios.`);
    for (const [campo, n] of Object.entries(r.porCampo).toSorted((a, b) => b[1] - a[1])) {
      console.log(`  ${campo.padEnd(16)} ${n}`);
    }
    if (r.categoriasQuitadas.length) console.log(`Categorías quitadas: ${r.categoriasQuitadas.join(', ')}`);
    console.log(`Publicados después: ${r.publicados}; publicados incompletos: ${r.incompletos.length}`);
    console.log(`Versión del contenido: ${r.versionAntes} → ${r.versionDespues}`);
    if (!r.aplicada) console.log('\nNo se escribió nada. Para escribir, repita con --aplicar.');
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
