import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../config/configuracion.js';
import { esFechaValida, inicialesDe, tamanoLegible } from './api-crm.js';

const CONTRATO_SERVIDOR = resolve(RAIZ_SERVIDOR, 'src', 'crm', 'api-crm.ts');
const CONTRATO_WEB = resolve(RAIZ_SERVIDOR, '..', 'web', 'src', 'sites', 'crm', 'api-crm.ts');

describe('contrato de la API del CRM (api-crm.ts)', () => {
  it('es idéntico byte a byte en el servidor y en la web', async () => {
    const [servidor, web] = await Promise.all([readFile(CONTRATO_SERVIDOR), readFile(CONTRATO_WEB)]);
    expect(web.equals(servidor)).toBe(true);
  });

  it('saca las iniciales del primer nombre y del primer apellido', () => {
    expect(inicialesDe('Jose David Ramírez Abraham')).toBe('JR');
    expect(inicialesDe('Luciana Vélez Arenas')).toBe('LV');
    expect(inicialesDe('Juan Pablo Escobar Marín')).toBe('JE');
    expect(inicialesDe('  ana   maría  ')).toBe('AM');
    expect(inicialesDe('Óscar')).toBe('ÓS');
    expect(inicialesDe('')).toBe('?');
  });

  it('escribe tamaños legibles', () => {
    expect(tamanoLegible(900)).toBe('900 B');
    expect(tamanoLegible(820 * 1024)).toBe('820 KB');
    expect(tamanoLegible(3.4 * 1024 * 1024)).toBe('3,4 MB');
  });

  it('valida fechas AAAA-MM-DD del calendario', () => {
    expect(esFechaValida('2026-11-24')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('24/11/2026')).toBe(false);
  });
});
