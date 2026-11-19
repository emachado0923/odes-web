import { describe, expect, it } from 'vitest';
import { SaludController } from './salud.controller.js';

describe('SaludController', () => {
  it('reporta estado ok', () => {
    const estado = new SaludController().obtenerEstado();
    expect(estado.estado).toBe('ok');
    expect(estado.servicio).toBe('sapiencia-web');
    expect(Number.isNaN(Date.parse(estado.marcaTiempo))).toBe(false);
  });
});
