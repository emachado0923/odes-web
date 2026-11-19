import { z } from 'zod';
import type {
  FiltrosRepositorio,
  FragmentoRepositorio,
} from '../repositorio.tipos.js';

/**
 * Evaluación de la búsqueda con un conjunto de casos (consulta + documentos
 * relevantes), en datos/odes/evaluacion-busqueda.json.
 *
 * - Ranking de DOCUMENTOS: los fragmentos de `buscar` en orden, sin repetir
 *   documento.
 * - recall@k = relevantes entre los k primeros / min(relevantes, k): así un
 *   caso con más de k relevantes puede llegar a 1.
 * - MRR = promedio de 1 / posición del primer relevante (0 si no aparece en
 *   los resultados).
 */

const esquemaFiltros = z
  .object({
    categorias: z.array(z.string()).optional(),
    anioDesde: z.number().int().optional(),
    anioHasta: z.number().int().optional(),
    idioma: z.enum(['es', 'en']).optional(),
  })
  .strict();

export const esquemaCasos = z.object({
  descripcion: z.string().optional(),
  casos: z
    .array(
      z
        .object({
          id: z.string().min(1),
          consulta: z.string().min(1),
          filtros: esquemaFiltros.optional(),
          relevantes: z.array(z.string().min(1)).min(1),
          nota: z.string().optional(),
        })
        .strict(),
    )
    .min(1),
});

export type CasosEvaluacion = z.infer<typeof esquemaCasos>;
export type CasoEvaluacion = CasosEvaluacion['casos'][number];

export interface ResultadoCaso {
  caso: CasoEvaluacion;
  /** Documentos en el orden de los resultados (sin repetir). */
  documentos: string[];
  recall5: number;
  recall10: number;
  /** 1 / posición del primer relevante, o 0. */
  rr: number;
  /** Posición (desde 1) de cada relevante en los resultados, o null. */
  posiciones: Record<string, number | null>;
}

export interface ResumenEvaluacion {
  casos: number;
  recall5: number;
  recall10: number;
  mrr: number;
  /** Casos sin ningún relevante en los resultados. */
  sinAciertos: string[];
}

export function documentosEnOrden(
  fragmentos: readonly FragmentoRepositorio[],
): string[] {
  return [...new Set(fragmentos.map((fragmento) => fragmento.documento.id))];
}

export function recallEn(
  documentos: readonly string[],
  relevantes: readonly string[],
  k: number,
): number {
  const conjunto = new Set(relevantes);
  const aciertos = documentos
    .slice(0, k)
    .filter((id) => conjunto.has(id)).length;
  return aciertos / Math.min(conjunto.size, k);
}

export function rangoReciproco(
  documentos: readonly string[],
  relevantes: readonly string[],
): number {
  const conjunto = new Set(relevantes);
  const posicion = documentos.findIndex((id) => conjunto.has(id));
  return posicion === -1 ? 0 : 1 / (posicion + 1);
}

export function evaluarCaso(
  caso: CasoEvaluacion,
  documentos: string[],
): ResultadoCaso {
  const posiciones: Record<string, number | null> = {};
  for (const id of caso.relevantes) {
    const posicion = documentos.indexOf(id);
    posiciones[id] = posicion === -1 ? null : posicion + 1;
  }
  return {
    caso,
    documentos,
    recall5: recallEn(documentos, caso.relevantes, 5),
    recall10: recallEn(documentos, caso.relevantes, 10),
    rr: rangoReciproco(documentos, caso.relevantes),
    posiciones,
  };
}

function promedio(valores: number[]): number {
  return valores.length === 0
    ? 0
    : valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

export function resumir(
  resultados: readonly ResultadoCaso[],
): ResumenEvaluacion {
  return {
    casos: resultados.length,
    recall5: promedio(resultados.map((r) => r.recall5)),
    recall10: promedio(resultados.map((r) => r.recall10)),
    mrr: promedio(resultados.map((r) => r.rr)),
    sinAciertos: resultados.filter((r) => r.rr === 0).map((r) => r.caso.id),
  };
}

export function filtrosDeCaso(caso: CasoEvaluacion): FiltrosRepositorio {
  return caso.filtros ?? {};
}
