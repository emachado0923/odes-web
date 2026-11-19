import { describe, expect, it } from 'vitest';
import {
  esquemaCasos,
  evaluarCaso,
  rangoReciproco,
  recallEn,
  resumir,
} from './metricas.js';

const caso = (id: string) => ({ id, consulta: id, relevantes: ['a'] });

describe('métricas de evaluación', () => {
  it('recall@k se acota a min(relevantes, k)', () => {
    expect(recallEn(['a', 'x', 'b'], ['a', 'b'], 5)).toBe(1);
    expect(recallEn(['a', 'x', 'b'], ['a', 'b'], 1)).toBe(1);
    expect(recallEn(['x', 'a'], ['a', 'b', 'c', 'd', 'e', 'f'], 5)).toBeCloseTo(
      1 / 5,
    );
    expect(recallEn([], ['a'], 5)).toBe(0);
  });

  it('rango recíproco del primer relevante', () => {
    expect(rangoReciproco(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3);
    expect(rangoReciproco(['x'], ['a'])).toBe(0);
  });

  it('resume varios casos', () => {
    const resumen = resumir([
      evaluarCaso(caso('uno'), ['a']),
      evaluarCaso(caso('dos'), ['x']),
    ]);
    expect(resumen).toMatchObject({
      casos: 2,
      recall5: 0.5,
      mrr: 0.5,
      sinAciertos: ['dos'],
    });
  });

  it('valida el archivo de casos', () => {
    expect(
      esquemaCasos.safeParse({
        casos: [{ id: 'a', consulta: 'b', relevantes: [] }],
      }).success,
    ).toBe(false);
  });
});
