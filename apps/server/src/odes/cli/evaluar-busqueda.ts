/**
 * Evalúa la búsqueda del repositorio con casos conocidos.
 *
 *   npm run odes:evaluar-busqueda -- [--indice <archivo>] [--casos <archivo.json>]
 *                                    [--detalle] [--pesos 6,3,1] [--limite 20]
 *
 * Imprime recall@5, recall@10 y MRR (ver repositorio/evaluacion/metricas.ts)
 * y, con --detalle, la posición de cada documento relevante por caso. Sirve
 * para ajustar la normalización y los pesos sin adivinar: cambie, reindexe
 * (si tocó la normalización) y compare los números.
 *
 * Sale con código 1 si el índice no está disponible o los casos son inválidos.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import {
  DIRECTORIO_DATOS_ODES,
  rutaIndiceDesdeEntorno,
} from '../repositorio/configuracion-repositorio.js';
import {
  documentosEnOrden,
  esquemaCasos,
  evaluarCaso,
  filtrosDeCaso,
  resumir,
} from '../repositorio/evaluacion/metricas.js';
import { RepositorioSqlite } from '../repositorio/repositorio-sqlite.js';

const DIRECTORIO_LLAMADA = process.env.INIT_CWD ?? process.cwd();

function rutaDeOpcion(valor: string): string {
  return isAbsolute(valor)
    ? resolve(valor)
    : resolve(DIRECTORIO_LLAMADA, valor);
}

function porcentaje(valor: number): string {
  return `${(valor * 100).toFixed(1)} %`;
}

function leerPesos(
  valor: string | undefined,
): [number, number, number] | undefined {
  if (valor === undefined) return undefined;
  const partes = valor.split(',').map(Number);
  if (partes.length !== 3 || partes.some((p) => !Number.isFinite(p) || p < 0)) {
    throw new Error(
      `--pesos debe ser "titulo,claves,cuerpo" con números ≥ 0 (recibido: "${valor}").`,
    );
  }
  return partes as [number, number, number];
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      indice: { type: 'string' },
      casos: { type: 'string' },
      detalle: { type: 'boolean', default: false },
      pesos: { type: 'string' },
      limite: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  const rutaIndice = values.indice
    ? rutaDeOpcion(values.indice)
    : rutaIndiceDesdeEntorno();
  const rutaCasos = values.casos
    ? rutaDeOpcion(values.casos)
    : join(DIRECTORIO_DATOS_ODES, 'evaluacion-busqueda.json');
  const limite = values.limite ? Number(values.limite) : 20;

  const casos = esquemaCasos.safeParse(
    JSON.parse(await readFile(rutaCasos, 'utf8')),
  );
  if (!casos.success) {
    console.error(`Casos inválidos en ${rutaCasos}:`);
    for (const issue of casos.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return 1;
  }

  const repositorio = new RepositorioSqlite({
    rutaIndice,
    pesos: leerPesos(values.pesos),
    registro: { log: () => {}, warn: (mensaje) => console.error(mensaje) },
  });
  try {
    const estado = repositorio.estado();
    if (!estado.disponible) {
      console.error(`El índice ${rutaIndice} no está disponible.`);
      return 1;
    }
    const desconocidos = casos.data.casos.flatMap((caso) =>
      caso.relevantes
        .filter((id) => repositorio.obtener(id) === null)
        .map((id) => `${caso.id}: ${id}`),
    );
    if (desconocidos.length > 0) {
      console.error('Hay documentos relevantes que no existen en el índice:');
      for (const linea of desconocidos) console.error(`  ${linea}`);
      return 1;
    }

    console.log(`Índice: ${rutaIndice} (generado ${estado.generado})`);
    console.log(`Casos:  ${rutaCasos} (${casos.data.casos.length})\n`);
    const resultados = casos.data.casos.map((caso) =>
      evaluarCaso(
        caso,
        documentosEnOrden(
          repositorio.buscar(caso.consulta, filtrosDeCaso(caso), limite),
        ),
      ),
    );

    for (const resultado of resultados) {
      const { caso } = resultado;
      const marca =
        resultado.rr === 0 ? '✗' : resultado.recall10 === 1 ? '✓' : '~';
      console.log(
        `${marca} ${caso.id.padEnd(34)} R@5 ${porcentaje(resultado.recall5).padStart(7)}  ` +
          `R@10 ${porcentaje(resultado.recall10).padStart(7)}  RR ${resultado.rr.toFixed(2)}  ` +
          `«${caso.consulta}»`,
      );
      if (values.detalle) {
        for (const [id, posicion] of Object.entries(resultado.posiciones)) {
          console.log(
            `      ${posicion === null ? '  -' : String(posicion).padStart(3)}  ${id}`,
          );
        }
        const otros = resultado.documentos
          .slice(0, 10)
          .filter((id) => !caso.relevantes.includes(id));
        if (otros.length > 0)
          console.log(`      otros en el top 10: ${otros.join(', ')}`);
      }
    }

    const resumen = resumir(resultados);
    console.log(
      `\nTotal (${resumen.casos} casos): recall@5 ${porcentaje(resumen.recall5)} · ` +
        `recall@10 ${porcentaje(resumen.recall10)} · MRR ${resumen.mrr.toFixed(3)}`,
    );
    if (resumen.sinAciertos.length > 0) {
      console.log(`Sin ningún relevante: ${resumen.sinAciertos.join(', ')}`);
    }
    return 0;
  } finally {
    repositorio.cerrar();
  }
}

try {
  process.exitCode = await principal();
} catch (error) {
  console.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
