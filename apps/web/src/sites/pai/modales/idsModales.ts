import type { NumeroBimestre } from '../api-pai'

/** id de la pestaña de un bimestre (PestanasBimestre), para el aria-labelledby del panel. */
export function idPestana(id: string, bimestre: NumeroBimestre): string {
  return `${id}-pestana-${bimestre}`
}
