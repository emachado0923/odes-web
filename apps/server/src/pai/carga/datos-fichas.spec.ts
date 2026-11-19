import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import {
  aFilasFichas,
  type ArchivoFichasPai,
  deFilasFichas,
  ErrorDatosFichas,
  leerArchivoFichas,
  objetoJson,
  validarFormaFichas,
} from './datos-fichas.js';

const ARCHIVO = join(RAIZ_SERVIDOR, 'datos', 'pai', '2026', 'pai-2026.json');
const original = (): ArchivoFichasPai =>
  JSON.parse(readFileSync(ARCHIVO, 'utf8')) as ArchivoFichasPai;

/** Archivo mínimo válido (un proceso, una acción, un indicador). */
function archivoMinimo(): ArchivoFichasPai {
  return {
    vigencia: 2027,
    formato: 'F-ES-DE-003',
    generado_desde: [],
    notas: ['nota'],
    dependencias: [{ sigla: 'SAF', nombre: 'Subdirección Administrativa' }],
    procesos: [
      {
        clave: 'saf-talento-humano',
        codigo: 'SAF-TH',
        dependencia: 'SAF',
        nombre: 'Talento Humano',
        hoja: 'TALENTO HUMANO',
        tipo: 'proceso',
        linea_plan_desarrollo: '1- Creemos',
        dimension_plan_estrategico: null,
        objetivo: 'Objetivo',
        programa: null,
        extras: {
          riesgos: [
            {
              numeral: 1,
              texto: '1. Riesgo (RC)',
              descripcion: 'Riesgo',
              rc: true,
              bloque: 1,
            },
          ],
          codigo_proyecto: null,
          linea_pdd_normalizada: '1. Creemos',
          area_reporta: 'SAF',
        },
        fuente: { estructura: { archivo: 'x.xlsx', hoja: 'TH' } },
        acciones: [
          {
            orden: 1,
            descripcion: 'Acción',
            riesgos: ['1. Riesgo (RC)'],
            indicadores: [
              {
                orden: 1,
                codigo: 'SAF-TH-01',
                nombre: 'Número de planes',
                tipo_meta: 'numero',
                regla_tipo_meta: 'por defecto (conteo)',
                metas: { 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, total: 2 },
                calculo: {
                  meta_total: {
                    formula: 'SUM(meta1:meta6)',
                    regla: 'suma',
                    divisor: null,
                  },
                  avance_total: {
                    formula: 'SUM(avance1:avance6)',
                    regla: 'suma',
                    divisor: null,
                  },
                  porcentaje: {
                    regla: 'con_tope_100',
                    tope_100: true,
                    bimestres_tecleados: [],
                  },
                },
                productos: null,
                rol_responsable: null,
                responsable: 'Líder',
                corresponsables: null,
                extras: {
                  consecutivo: 1,
                  excel: { avance_total: 1, porcentaje_total: 0.5 },
                },
                seguimiento: {
                  1: {
                    avance: 1,
                    porcentaje: 1,
                    logros: 'Logro',
                    observaciones: null,
                    riesgo_materializado: 'NO',
                    numeral_riesgo: null,
                    descripcion_riesgo: null,
                    fuentes_verificacion: 'N/A',
                    fuente: { archivo: 'otro.xlsx' },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
    resumen: { procesos: 1 },
    conflictos: [],
    no_mapeados: [],
    hojas_no_usadas: [],
    avisos_extractor: [],
  };
}

describe('datos de las fichas: JSON <-> filas', () => {
  it('ida y vuelta exacta con el PAI 2026 real', () => {
    const datos = validarFormaFichas(original());
    const filas = aFilasFichas(datos);
    // La vuelta pasa por texto JSON, como la base.
    const vuelta = deFilasFichas(JSON.parse(JSON.stringify(filas)));
    expect(vuelta).toEqual(original());
  });

  it('cuenta lo esperado del PAI 2026', () => {
    const filas = aFilasFichas(validarFormaFichas(original()));
    expect(filas.vigencia.anio).toBe(2026);
    expect(filas.dependencias.map((d) => d.sigla)).toEqual([
      'SAF',
      'DTF',
      'GEP',
      'OCI',
      'OPE',
    ]);
    expect(filas.procesos).toHaveLength(27);
    expect(filas.acciones).toHaveLength(228);
    expect(filas.indicadores).toHaveLength(344);
    expect(filas.riesgos).toHaveLength(105);
    expect(filas.reportes).toHaveLength(957);
    // La línea de la columna es la normalizada.
    const fondos = filas.procesos.find((p) => p.clave === 'dtf-fondos');
    expect(fondos?.linea_plan_desarrollo).toBe(
      '1. Creemos en la educación y en las oportunidades para el bienestar económico',
    );
    expect(
      objetoJson<{ linea_plan_desarrollo: string }>(fondos?.extras)
        ?.linea_plan_desarrollo,
    ).toMatch(/^1-Creemos/);
    // GEP-EDI-01: metas de 10 decimales se guardan tal cual.
    expect(
      filas.indicadores.find((i) => i.codigo === 'GEP-EDI-01')?.metas[0],
    ).toBe(0.1666666667);
    // Los mixtos llevan tope_por_bimestre.
    const mixtos = filas.indicadores.filter((i) => i.tope_100 === null);
    expect(mixtos.map((i) => i.codigo).toSorted()).toEqual([
      'GEP-EIA-02',
      'GEP-EIA-03',
      'GEP-EIA-04',
      'SAF-CAR-01',
    ]);
    expect(mixtos.every((i) => i.tope_por_bimestre !== null)).toBe(true);
  });

  it('ida y vuelta del archivo mínimo (con fuente alterna del seguimiento)', () => {
    const minimo = archivoMinimo();
    const filas = aFilasFichas(validarFormaFichas(minimo));
    expect(filas.reportes).toEqual([
      {
        codigo: 'SAF-TH-01',
        bimestre: 1,
        avance: 1,
        logros: 'Logro',
        observaciones: null,
        riesgo_materializado: 'NO',
        numeral_riesgo: null,
        descripcion_riesgo: null,
        fuentes_verificacion: 'N/A',
      },
    ]);
    expect(filas.accionRiesgos).toEqual([
      { proceso: 'saf-talento-humano', accion: 1, riesgo: 1, orden: 1 },
    ]);
    expect(deFilasFichas(filas)).toEqual(archivoMinimo());
  });

  it('conserva la ausencia de claves que pasan a columnas', () => {
    const minimo = archivoMinimo();
    delete minimo.procesos[0].extras.codigo_proyecto;
    delete minimo.procesos[0].extras.linea_pdd_normalizada;
    const filas = aFilasFichas(minimo);
    expect(filas.procesos[0].linea_plan_desarrollo).toBeNull();
    expect(deFilasFichas(filas).procesos[0].extras).not.toHaveProperty(
      'codigo_proyecto',
    );
    expect(deFilasFichas(filas)).toEqual(minimo);
  });

  it('rechaza la forma inválida con la ruta del problema', () => {
    const malo = archivoMinimo() as unknown as {
      procesos: {
        acciones: { indicadores: { metas: Record<string, unknown> }[] }[];
      }[];
    };
    malo.procesos[0].acciones[0].indicadores[0].metas['1'] = 'uno';
    expect(() => validarFormaFichas(malo)).toThrow(ErrorDatosFichas);
    expect(() => validarFormaFichas(malo)).toThrow(/metas\.1/);
    expect(() => validarFormaFichas({ vigencia: 1999 })).toThrow(
      ErrorDatosFichas,
    );
  });

  it('rechaza incoherencias: códigos repetidos, riesgos fuera del catálogo, divisores, dependencias', () => {
    const repetido = archivoMinimo();
    const accion = repetido.procesos[0].acciones[0];
    accion.indicadores.push({ ...accion.indicadores[0], orden: 2 });
    expect(() => aFilasFichas(repetido)).toThrow(/código repetido/);

    const riesgo = archivoMinimo();
    riesgo.procesos[0].acciones[0].riesgos = ['9. No existe'];
    expect(() => aFilasFichas(riesgo)).toThrow(/no está en el catálogo/);

    const divisor = archivoMinimo();
    divisor.procesos[0].acciones[0].indicadores[0].calculo.avance_total = {
      formula: null,
      regla: 'suma_dividida',
      divisor: null,
    };
    expect(() => aFilasFichas(divisor)).toThrow(/no tiene divisor/);

    const dependencia = archivoMinimo();
    dependencia.procesos[0].dependencia = 'XYZ';
    expect(() => aFilasFichas(dependencia)).toThrow(/XYZ no está/);

    const codigo = archivoMinimo();
    codigo.procesos[0].acciones[0].indicadores[0].codigo = 'saf-th-1';
    expect(() => aFilasFichas(codigo)).toThrow(/forma esperada/);

    const largo = archivoMinimo();
    largo.procesos[0].nombre = 'x'.repeat(301);
    expect(() => aFilasFichas(largo)).toThrow(/máximo 300 caracteres/);
  });

  it('objetoJson: objeto o null', () => {
    expect(objetoJson('{"a":1}')).toEqual({ a: 1 });
    expect(objetoJson('[1]')).toBeNull();
    expect(objetoJson('no')).toBeNull();
    expect(objetoJson(null)).toBeNull();
  });

  describe('leerArchivoFichas', () => {
    let carpeta: string;
    beforeAll(async () => {
      carpeta = await mkdtemp(join(tmpdir(), 'pai-fichas-'));
    });
    afterAll(async () => {
      await rm(carpeta, { recursive: true, force: true });
    });

    it('lee el archivo real', async () => {
      const datos = await leerArchivoFichas(ARCHIVO);
      expect(datos.vigencia).toBe(2026);
    });

    it('JSON inválido: ErrorDatosFichas', async () => {
      const ruta = join(carpeta, 'malo.json');
      await writeFile(ruta, '{ no es json');
      await expect(leerArchivoFichas(ruta)).rejects.toThrow(
        /no es JSON válido/,
      );
    });
  });
});
