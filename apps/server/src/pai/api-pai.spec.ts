import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../config/configuracion.js';
import {
  ACEPTAR_EVIDENCIAS,
  BIMESTRES_PAI,
  bimestreDeMes,
  esCodigoIndicador,
  esNumeroBimestre,
  infoBimestre,
  MENSAJES_ERROR_PAI,
  nombreArchivoExportacion,
  NUMEROS_BIMESTRE,
  PATRON_USUARIO_PAI,
  RUTA_API_PAI,
  RUTA_COOKIE_PAI,
  RUTAS_API_PAI,
} from './api-pai.js';

const CONTRATO_SERVIDOR = resolve(RAIZ_SERVIDOR, 'src', 'pai', 'api-pai.ts');
const CONTRATO_WEB = resolve(
  RAIZ_SERVIDOR,
  '..',
  'web',
  'src',
  'sites',
  'pai',
  'api-pai.ts',
);
const DATOS_2026 = join(RAIZ_SERVIDOR, 'datos', 'pai', '2026', 'pai-2026.json');

describe('contrato de la API del PAI (api-pai.ts)', () => {
  it('es idéntico byte a byte en el servidor y en la web', async () => {
    const [servidor, web] = await Promise.all([
      readFile(CONTRATO_SERVIDOR),
      readFile(CONTRATO_WEB),
    ]);
    expect(web.equals(servidor)).toBe(true);
  });

  it('bimestres: seis, con nombre y meses, y el bimestre de cada mes', () => {
    expect(NUMEROS_BIMESTRE).toEqual([1, 2, 3, 4, 5, 6]);
    expect(BIMESTRES_PAI.map((b) => b.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(infoBimestre(4)).toEqual({
      numero: 4,
      nombre: 'Bimestre 4',
      meses: 'julio–agosto',
    });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(bimestreDeMes)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    expect(() => bimestreDeMes(13)).toThrow(RangeError);
    expect([1, 6].every(esNumeroBimestre)).toBe(true);
    expect([0, 7, 1.5, '1', null].some(esNumeroBimestre)).toBe(false);
  });

  it('todos los códigos de indicador de los datos 2026 cumplen PATRON_CODIGO_INDICADOR', async () => {
    const datos = JSON.parse(await readFile(DATOS_2026, 'utf8')) as {
      procesos: { acciones: { indicadores: { codigo: string }[] }[] }[];
    };
    const codigos = datos.procesos.flatMap((p) =>
      p.acciones.flatMap((a) => a.indicadores.map((i) => i.codigo)),
    );
    expect(codigos).toHaveLength(344);
    expect(codigos.filter((codigo) => !esCodigoIndicador(codigo))).toEqual([]);
    expect(esCodigoIndicador('saf-th-02')).toBe(true);
    expect(['SAF-TH', '12', 'SAF TH 02', ''].some(esCodigoIndicador)).toBe(
      false,
    );
  });

  it('rutas, usuario, nombres de archivo y mensajes', () => {
    expect(RUTA_COOKIE_PAI).toBe(RUTA_API_PAI);
    expect(RUTAS_API_PAI.indicador('SAF-TH-02')).toBe('/indicadores/SAF-TH-02');
    expect(RUTAS_API_PAI.reporte(12, 4)).toBe('/indicadores/12/bimestres/4');
    expect(RUTAS_API_PAI.subidasEvidencia(12, 4)).toBe(
      '/indicadores/12/bimestres/4/evidencias/subidas',
    );
    expect(RUTAS_API_PAI.adminAsignaciones(3)).toBe(
      '/admin/usuarios/3/asignaciones',
    );
    expect(PATRON_USUARIO_PAI.test('maria.lopez')).toBe(true);
    expect(PATRON_USUARIO_PAI.test('María')).toBe(false);
    expect(nombreArchivoExportacion(2026, 4)).toBe('pai-2026-bimestre-4.csv');
    expect(ACEPTAR_EVIDENCIAS).toContain('.xlsx');
    expect(MENSAJES_ERROR_PAI.no_disponible).toMatch(
      /Plan de Acción Institucional/,
    );
    expect(
      Object.values(MENSAJES_ERROR_PAI).some((m) => /repositorio/i.test(m)),
    ).toBe(false);
  });
});
