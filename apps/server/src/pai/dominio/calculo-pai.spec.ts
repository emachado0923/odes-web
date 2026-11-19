import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CalculoIndicadorPai } from '../api-pai.js';
import {
  aFilasFichas,
  type ArchivoFichasPai,
  CLAVES_BIMESTRE_JSON,
  type FilaIndicador,
  type IndicadorJson,
  validarFormaFichas,
} from '../carga/datos-fichas.js';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import {
  avanceTotal,
  calcularIndicador,
  calculoDeColumnas,
  combinarResumenes,
  contarEstados,
  porcentajeBimestre,
  promedio,
  redondear,
  resumirIndicadores,
  sumarConteos,
  topeBimestre,
  topeTotal,
  totalSegunRegla,
} from './calculo-pai.js';

const SIN_TOPE: CalculoIndicadorPai = {
  reglaMetaTotal: 'suma',
  divisorMetaTotal: null,
  reglaAvanceTotal: 'suma',
  divisorAvanceTotal: null,
  tope100: false,
  topePorBimestre: null,
};
const CON_TOPE: CalculoIndicadorPai = { ...SIN_TOPE, tope100: true };
const MIXTO: CalculoIndicadorPai = {
  ...SIN_TOPE,
  tope100: null,
  topePorBimestre: {
    bimestres: [true, true, false, false, false, false],
    total: false,
  },
};

describe('porcentajeBimestre', () => {
  it('avance / meta como fracción', () => {
    expect(porcentajeBimestre(1, 2, false)).toBe(0.5);
    expect(porcentajeBimestre(0, 5, true)).toBe(0);
  });

  it('null sin meta (0 o negativa) o sin avance', () => {
    expect(porcentajeBimestre(3, 0, false)).toBeNull();
    expect(porcentajeBimestre(3, -1, true)).toBeNull();
    expect(porcentajeBimestre(null, 4, true)).toBeNull();
    expect(porcentajeBimestre(Number.NaN, 4, true)).toBeNull();
  });

  it('el tope deja el máximo en 100 % solo si aplica', () => {
    expect(porcentajeBimestre(3, 2, true)).toBe(1);
    expect(porcentajeBimestre(3, 2, false)).toBe(1.5);
  });
});

describe('topes', () => {
  it('tope100 true/false manda en todos los bimestres y en el total', () => {
    for (const b of [1, 2, 3, 4, 5, 6] as const) {
      expect(topeBimestre(CON_TOPE, b)).toBe(true);
      expect(topeBimestre(SIN_TOPE, b)).toBe(false);
    }
    expect(topeTotal(CON_TOPE)).toBe(true);
    expect(topeTotal(SIN_TOPE)).toBe(false);
  });

  it('mixto: tope por bimestre y en el total', () => {
    expect([1, 2, 3, 4, 5, 6].map((b) => topeBimestre(MIXTO, b as 1))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(topeTotal(MIXTO)).toBe(false);
    expect(topeTotal({ ...MIXTO, topePorBimestre: null })).toBe(false);
  });
});

describe('totalSegunRegla', () => {
  it('suma (null cuenta como 0) y redondea el ruido de coma flotante', () => {
    expect(totalSegunRegla('suma', null, [1, null, 2, 0, 0, 0], 99)).toBe(3);
    expect(totalSegunRegla('suma', null, [0.1, 0.2, 0, 0, 0, 0], 0)).toBe(0.3);
  });

  it('suma_dividida usa el divisor (sin divisor válido, la suma)', () => {
    expect(
      totalSegunRegla('suma_dividida', 6, [100, 100, 100, 100, 100, 100], 0),
    ).toBe(100);
    expect(totalSegunRegla('suma_dividida', 4, [100, 0, 100, 0, 0, 0], 0)).toBe(
      50,
    );
    expect(totalSegunRegla('suma_dividida', null, [1, 1, 0, 0, 0, 0], 0)).toBe(
      2,
    );
  });

  it('si_suma_mayor_99_entonces_100', () => {
    expect(
      totalSegunRegla(
        'si_suma_mayor_99_entonces_100',
        null,
        [50, 50, 0, 0, 0, 0],
        0,
      ),
    ).toBe(100);
    expect(
      totalSegunRegla(
        'si_suma_mayor_99_entonces_100',
        null,
        [50, 49, 0, 0, 0, 0],
        0,
      ),
    ).toBe(0);
  });

  it('constante devuelve el valor guardado', () => {
    expect(totalSegunRegla('constante', null, [1, 2, 3, 4, 5, 6], 7)).toBe(7);
  });
});

describe('avanceTotal y calcularIndicador', () => {
  it('sin ningún avance el total es null (y el % total también)', () => {
    expect(
      avanceTotal([null, null, null, null, null, null], SIN_TOPE),
    ).toBeNull();
    const resultado = calcularIndicador({
      metas: [1, 0, 1, 0, 1, 0],
      metaTotalGuardada: 3,
      avances: [null, null, null, null, null, null],
      calculo: SIN_TOPE,
    });
    expect(resultado).toEqual({
      porcentajes: [null, null, null, null, null, null],
      metaTotal: 3,
      avanceTotal: null,
      porcentajeTotal: null,
    });
  });

  it('un avance 0 sí cuenta (0 %)', () => {
    const resultado = calcularIndicador({
      metas: [1, 0, 1, 0, 1, 0],
      metaTotalGuardada: 3,
      avances: [0, null, null, null, null, null],
      calculo: SIN_TOPE,
    });
    expect(resultado.porcentajes[0]).toBe(0);
    expect(resultado.avanceTotal).toBe(0);
    expect(resultado.porcentajeTotal).toBe(0);
  });

  it('a demanda: avance total = Σ/6 frente a meta 100', () => {
    const resultado = calcularIndicador({
      metas: [100, 100, 100, 100, 100, 100],
      metaTotalGuardada: 100,
      avances: [100, 100, 100, null, null, null],
      calculo: {
        ...CON_TOPE,
        reglaMetaTotal: 'suma_dividida',
        divisorMetaTotal: 6,
        reglaAvanceTotal: 'suma_dividida',
        divisorAvanceTotal: 6,
      },
    });
    expect(resultado.avanceTotal).toBe(50);
    expect(resultado.porcentajeTotal).toBe(0.5);
    expect(resultado.porcentajes).toEqual([1, 1, 1, null, null, null]);
  });

  it('la regla constante del avance se trata como suma', () => {
    expect(
      avanceTotal([1, 2, null, null, null, null], {
        ...SIN_TOPE,
        reglaAvanceTotal: 'constante',
      }),
    ).toBe(3);
  });

  it('sin tope el % pasa de 100 %; mixto: tope por bimestre y en el total', () => {
    const sinTope = calcularIndicador({
      metas: [1, 1, 0, 0, 0, 0],
      metaTotalGuardada: 2,
      avances: [3, 1, 0, null, null, null],
      calculo: SIN_TOPE,
    });
    expect(sinTope.porcentajes.slice(0, 3)).toEqual([3, 1, null]);
    expect(sinTope.porcentajeTotal).toBe(2);
    const mixto = calcularIndicador({
      metas: [1, 1, 1, 0, 0, 0],
      metaTotalGuardada: 3,
      avances: [3, 3, 3, null, null, null],
      calculo: MIXTO,
    });
    expect(mixto.porcentajes.slice(0, 3)).toEqual([1, 1, 3]);
    expect(mixto.porcentajeTotal).toBe(3);
  });

  it('la meta total es la guardada (ya normalizada en la carga)', () => {
    const resultado = calcularIndicador({
      metas: [0, 0, 0, 0, 0, 0],
      metaTotalGuardada: 5,
      avances: [1, null, null, null, null, null],
      calculo: { ...SIN_TOPE, reglaMetaTotal: 'constante' },
    });
    expect(resultado.metaTotal).toBe(5);
    expect(resultado.porcentajeTotal).toBe(0.2);
  });
});

describe('calculoDeColumnas', () => {
  it('convierte las columnas de la base', () => {
    expect(
      calculoDeColumnas({
        regla_meta_total: 'suma_dividida',
        divisor_meta_total: 6,
        regla_avance_total: 'suma_dividida',
        divisor_avance_total: 6,
        tope_100: 1,
        tope_por_bimestre: null,
      }),
    ).toEqual({
      reglaMetaTotal: 'suma_dividida',
      divisorMetaTotal: 6,
      reglaAvanceTotal: 'suma_dividida',
      divisorAvanceTotal: 6,
      tope100: true,
      topePorBimestre: null,
    });
  });

  it('mixto: lee tope_por_bimestre (JSON inválido = sin tope)', () => {
    const base = {
      regla_meta_total: 'suma',
      divisor_meta_total: null,
      regla_avance_total: 'suma',
      divisor_avance_total: null,
      tope_100: null,
    } as const;
    expect(
      calculoDeColumnas({
        ...base,
        tope_por_bimestre:
          '{"1":true,"2":true,"3":false,"4":false,"5":false,"6":false,"total":false}',
      }).topePorBimestre,
    ).toEqual({
      bimestres: [true, true, false, false, false, false],
      total: false,
    });
    expect(
      calculoDeColumnas({ ...base, tope_por_bimestre: 'no es json' })
        .topePorBimestre,
    ).toEqual({
      bimestres: [false, false, false, false, false, false],
      total: false,
    });
    // Un tope fijo ignora tope_por_bimestre.
    expect(
      calculoDeColumnas({
        ...base,
        tope_100: 0,
        tope_por_bimestre: '{"1":true}',
      }).topePorBimestre,
    ).toBeNull();
  });
});

function conteo(reportados: number, pendientes: number, sinMeta: number) {
  return { bimestre: 4 as const, reportados, pendientes, sinMeta };
}

describe('promedios y resúmenes', () => {
  it('promedio ignora null (null si no hay valores)', () => {
    expect(promedio([1, null, 0])).toBe(0.5);
    expect(promedio([null, null])).toBeNull();
    expect(promedio([])).toBeNull();
  });

  /** Estados con los bimestres 1-3 exigibles y 4-6 futuros. */
  const HASTA_3 = [
    'pendiente',
    'pendiente',
    'pendiente',
    'futuro',
    'futuro',
    'futuro',
  ] as const;

  it('logro por bimestre: solo los indicadores con meta > 0; sin avance cuenta 0', () => {
    const resumen = resumirIndicadores([
      {
        metas: [1, 0, 0, 0, 0, 0],
        porcentajes: [1, null, null, null, null, null],
        metaTotal: 1,
        porcentajeTotal: 1,
        estados: ['reportado', 'sin_meta', 'sin_meta', 'futuro', 'futuro', 'futuro'],
      },
      {
        metas: [2, 0, 0, 0, 0, 0],
        porcentajes: [null, null, null, null, null, null],
        metaTotal: 2,
        porcentajeTotal: null,
        estados: [...HASTA_3],
      },
      // Sin meta en el bimestre 1: no entra aunque tenga %.
      {
        metas: [0, 1, 0, 0, 0, 0],
        porcentajes: [null, 0.5, null, null, null, null],
        metaTotal: 1,
        porcentajeTotal: 0.5,
        estados: ['sin_meta', 'reportado', 'sin_meta', 'futuro', 'futuro', 'futuro'],
      },
    ]);
    expect(resumen.logros).toEqual([0.5, 0.5, null, null, null, null]);
    expect(resumen.avanceAnual).toBe(0.5);
    expect(resumen.indicadores).toBe(3);
  });

  it('un bimestre exigible en el que nadie reportó da 0 %, no null (NEG-1)', () => {
    const resumen = resumirIndicadores([
      {
        metas: [1, 1, 1, 1, 1, 1],
        porcentajes: [1, null, null, null, null, null],
        metaTotal: 6,
        porcentajeTotal: null,
        estados: ['reportado', 'pendiente', 'pendiente', 'futuro', 'futuro', 'futuro'],
      },
    ]);
    // Bim 2 y 3 ya se debían reportar: 0 %. Bim 4-6 todavía no: null.
    expect(resumen.logros).toEqual([1, 0, 0, null, null, null]);
    // Sin avance total pero con bimestres exigibles: cuenta como 0 %.
    expect(resumen.avanceAnual).toBe(0);
    expect(resumirIndicadores([]).logros).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(resumirIndicadores([]).avanceAnual).toBeNull();
  });

  it('los bimestres futuros no entran: un futuro reportado se promedia solo con los reportados', () => {
    const resumen = resumirIndicadores([
      {
        metas: [0, 0, 0, 0, 2, 0],
        porcentajes: [null, null, null, null, 0.5, null],
        metaTotal: 2,
        porcentajeTotal: 0.5,
        estados: ['sin_meta', 'sin_meta', 'sin_meta', 'sin_meta', 'reportado', 'futuro'],
      },
      {
        metas: [0, 0, 0, 0, 1, 1],
        porcentajes: [null, null, null, null, null, null],
        metaTotal: 2,
        porcentajeTotal: null,
        estados: ['sin_meta', 'sin_meta', 'sin_meta', 'sin_meta', 'futuro', 'futuro'],
      },
    ]);
    expect(resumen.logros).toEqual([null, null, null, null, 0.5, null]);
    // El segundo solo tiene metas en bimestres futuros: no baja el avance anual.
    expect(resumen.avanceAnual).toBe(0.5);
  });

  it('una vigencia que no ha empezado no tiene logros ni avance anual', () => {
    const resumen = resumirIndicadores([
      {
        metas: [1, 1, 1, 1, 1, 1],
        porcentajes: [null, null, null, null, null, null],
        metaTotal: 6,
        porcentajeTotal: null,
        estados: ['futuro', 'futuro', 'futuro', 'futuro', 'futuro', 'futuro'],
      },
    ]);
    expect(resumen.logros).toEqual([null, null, null, null, null, null]);
    expect(resumen.avanceAnual).toBeNull();
  });

  it('combinarResumenes promedia los grupos y suma indicadores y conteos', () => {
    const combinado = combinarResumenes([
      {
        logros: [1, 0.5, null, null, null, null],
        avanceAnual: 0.8,
        indicadores: 3,
        conteo: conteo(1, 2, 0),
      },
      {
        logros: [0, null, null, null, null, null],
        avanceAnual: null,
        indicadores: 2,
        conteo: conteo(0, 1, 1),
      },
    ]);
    expect(combinado).toEqual({
      logros: [0.5, 0.5, null, null, null, null],
      avanceAnual: 0.8,
      indicadores: 5,
      conteo: conteo(1, 3, 1),
    });
  });

  it('contarEstados cuenta el bimestre abierto; sin bimestre abierto, null', () => {
    const estados = [
      ['reportado', 'pendiente', 'sin_meta', 'pendiente', 'futuro', 'futuro'],
      ['reportado', 'reportado', 'reportado', 'sin_meta', 'futuro', 'futuro'],
      ['pendiente', 'pendiente', 'pendiente', 'reportado', 'futuro', 'futuro'],
    ] as const;
    expect(
      contarEstados(
        estados.map((e) => [...e]),
        4,
      ),
    ).toEqual({ bimestre: 4, reportados: 1, pendientes: 1, sinMeta: 1 });
    expect(contarEstados([], 2)).toEqual({
      bimestre: 2,
      reportados: 0,
      pendientes: 0,
      sinMeta: 0,
    });
    expect(
      contarEstados(
        estados.map((e) => [...e]),
        null,
      ),
    ).toBeNull();
    expect(sumarConteos([null, null])).toBeNull();
  });

  it('redondear', () => {
    expect(redondear(0.1 + 0.2)).toBe(0.3);
    expect(redondear(-0)).toBe(0);
    expect(redondear(1.00000000004)).toBe(1);
  });
});

// ── Los 344 indicadores del PAI 2026 frente a los Excel ────────────────────

const ARCHIVO = join(RAIZ_SERVIDOR, 'datos', 'pai', '2026', 'pai-2026.json');
const datos: ArchivoFichasPai = validarFormaFichas(
  JSON.parse(readFileSync(ARCHIVO, 'utf8')),
);
const indicadoresJson = new Map<string, IndicadorJson>();
for (const proceso of datos.procesos) {
  for (const accion of proceso.acciones) {
    for (const indicador of accion.indicadores)
      indicadoresJson.set(indicador.codigo, indicador);
  }
}
/** Filas que guarda la carga: el cálculo del aplicativo parte de ellas (las mismas columnas de la base). */
const filas = aFilasFichas(datos);

function avancesDe(indicador: IndicadorJson): (number | null)[] {
  return CLAVES_BIMESTRE_JSON.map(
    (b) => indicador.seguimiento[b]?.avance ?? null,
  );
}

function calcular(fila: FilaIndicador) {
  const indicador = indicadoresJson.get(fila.codigo) as IndicadorJson;
  return calcularIndicador({
    metas: fila.metas,
    metaTotalGuardada: fila.meta_total,
    avances: avancesDe(indicador),
    calculo: calculoDeColumnas(fila),
  });
}

/** Igualdad con tolerancia (los Excel redondean a 10 cifras, nota 13); null = null. */
function igual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
}

/*
 * Excepciones justificadas (todas documentadas en las notas 11 y 17 del JSON y
 * en indicador.calculo.*.normalizado / calculo.porcentaje.bimestres_tecleados):
 *
 * Avance total:
 * - OPE-GES-04, OPE-PC-05, OPE-PC-07: indicadores "a demanda" cuyo Excel trae
 *   el total de avance como SUM (200); el aplicativo aplica Σ/6 como en los
 *   demás a demanda (33,33). calculo.avance_total.regla_excel = 'suma'.
 * - OPE-PC-04: la celda de total de avance está vacía en el Excel (sin
 *   fórmula); el aplicativo aplica la regla del total de meta (SUM = 20).
 *   calculo.avance_total.regla_excel = 'vacio'. (OPE-PC-08, 09 y 10 tienen la
 *   misma celda vacía pero ningún avance: Excel vacío y aplicativo sin avance
 *   coinciden.)
 * % total (consecuencia de lo anterior):
 * - OPE-GES-04 y OPE-PC-05: el Excel tiene la meta total tecleada en 0
 *   (#DIV/0!, sin %); la meta normalizada es 100 (extras.excel.meta_total = 0).
 * - OPE-PC-07: el Excel divide SUM (200) por 100 con tope = 100 %; el
 *   aplicativo, 33,33 / 100.
 * - OPE-PC-04: total de avance vacío en Excel (0 %); el aplicativo, 20 / 100.
 * % por bimestre:
 * - GEP-EIA-01..04 en los bimestres tecleados a mano (meta 0, % escrito 0):
 *   el aplicativo no tiene % sin meta (null).
 * - SAF-SST-15 (Bim 3), SAF-SST-16 (Bim 2), OCI-AI-11 (Bim 2) y OCI-AI-35
 *   (Bim 2): avance vacío con meta 1; el Excel cuenta la celda vacía como 0
 *   (0 %) y el aplicativo la muestra sin avance (null).
 */
const EXCEPCIONES_AVANCE_TOTAL = [
  'OPE-GES-04',
  'OPE-PC-04',
  'OPE-PC-05',
  'OPE-PC-07',
];
const EXCEPCIONES_PORCENTAJE_TOTAL = [
  'OPE-GES-04',
  'OPE-PC-04',
  'OPE-PC-05',
  'OPE-PC-07',
];
const EXCEPCIONES_PORCENTAJE_BIMESTRE = [
  'GEP-EIA-01:1',
  'GEP-EIA-01:2',
  'GEP-EIA-02:2',
  'GEP-EIA-03:1',
  'GEP-EIA-03:2',
  'GEP-EIA-04:1',
  'GEP-EIA-04:2',
  'SAF-SST-15:3',
  'SAF-SST-16:2',
  'OCI-AI-11:2',
  'OCI-AI-35:2',
];

describe('PAI 2026: recálculo de los 344 indicadores frente a los Excel', () => {
  it('el archivo trae 344 indicadores', () => {
    expect(filas.indicadores).toHaveLength(344);
  });

  it('la meta total guardada coincide con su regla en los 344', () => {
    const distintos = filas.indicadores.filter(
      (fila) =>
        !igual(
          totalSegunRegla(
            fila.regla_meta_total,
            fila.divisor_meta_total,
            fila.metas,
            fila.meta_total,
          ),
          fila.meta_total,
        ),
    );
    expect(distintos.map((f) => f.codigo)).toEqual([]);
  });

  it('avance total = extras.excel.avance_total salvo las excepciones documentadas', () => {
    const distintos: string[] = [];
    for (const fila of filas.indicadores) {
      const excel = (indicadoresJson.get(fila.codigo)?.extras.excel ?? {}) as {
        avance_total: number | null;
      };
      // Excel muestra 0 donde el aplicativo no tiene avance (null).
      if (!igual(calcular(fila).avanceTotal ?? 0, excel.avance_total ?? 0))
        distintos.push(fila.codigo);
    }
    expect(distintos.toSorted()).toEqual(EXCEPCIONES_AVANCE_TOTAL.toSorted());
    // Cada excepción tiene su motivo en el JSON.
    for (const codigo of EXCEPCIONES_AVANCE_TOTAL) {
      expect(
        indicadoresJson.get(codigo)?.calculo.avance_total.normalizado,
      ).toBeTruthy();
    }
  });

  it('% total = extras.excel.porcentaje_total salvo las excepciones documentadas', () => {
    const distintos: string[] = [];
    for (const fila of filas.indicadores) {
      const excel = (indicadoresJson.get(fila.codigo)?.extras.excel ?? {}) as {
        porcentaje_total: number | null;
      };
      const resultado = calcular(fila);
      const app =
        resultado.porcentajeTotal ?? (resultado.metaTotal > 0 ? 0 : null);
      if (!igual(app, excel.porcentaje_total)) distintos.push(fila.codigo);
    }
    expect(distintos.toSorted()).toEqual(
      EXCEPCIONES_PORCENTAJE_TOTAL.toSorted(),
    );
  });

  it('% de cada bimestre reportado = la celda % de Excel salvo las excepciones documentadas', () => {
    const distintos: string[] = [];
    let comparados = 0;
    for (const fila of filas.indicadores) {
      const indicador = indicadoresJson.get(fila.codigo) as IndicadorJson;
      const resultado = calcular(fila);
      CLAVES_BIMESTRE_JSON.forEach((b, i) => {
        const seguimiento = indicador.seguimiento[b];
        if (!seguimiento) return;
        comparados++;
        if (!igual(resultado.porcentajes[i], seguimiento.porcentaje))
          distintos.push(`${fila.codigo}:${b}`);
      });
    }
    expect(comparados).toBe(957);
    expect(distintos.toSorted()).toEqual(
      EXCEPCIONES_PORCENTAJE_BIMESTRE.toSorted(),
    );
    // Los de GEP-EIA están marcados como tecleados en el JSON.
    for (const clave of EXCEPCIONES_PORCENTAJE_BIMESTRE.filter((c) =>
      c.startsWith('GEP-EIA'),
    )) {
      const [codigo, b] = clave.split(':');
      expect(
        indicadoresJson
          .get(codigo)
          ?.calculo.porcentaje.bimestres_tecleados.map(String),
      ).toContain(b);
    }
  });

  it('logro del Bimestre 3 por dependencia y general: los procesos que no reportaron cuentan 0 % (NEG-1)', () => {
    // En el Bimestre 3 no reportaron saf-presupuesto, ope-direccionamiento-
    // estrategico, ope-gesco-i, ope-pipc ni ope-odes: con la regla del Excel
    // (nota 18, hoja Consolidado) cuentan como 0 % y no salen del promedio.
    const procesoDe = new Map<string, { clave: string; dependencia: string }>();
    for (const proceso of datos.procesos) {
      for (const accion of proceso.acciones) {
        for (const indicador of accion.indicadores) {
          procesoDe.set(indicador.codigo, {
            clave: proceso.clave,
            dependencia: proceso.dependencia,
          });
        }
      }
    }
    const porProceso = new Map<
      string,
      { dependencia: string; lista: Parameters<typeof resumirIndicadores>[0][number][] }
    >();
    for (const fila of filas.indicadores) {
      const r = calcular(fila);
      const proceso = procesoDe.get(fila.codigo) as {
        clave: string;
        dependencia: string;
      };
      const grupo = porProceso.get(proceso.clave) ?? {
        dependencia: proceso.dependencia,
        lista: [],
      };
      grupo.lista.push({
        metas: fila.metas,
        porcentajes: r.porcentajes,
        metaTotal: r.metaTotal,
        porcentajeTotal: r.porcentajeTotal,
        estados: ['pendiente', 'pendiente', 'pendiente', 'pendiente', 'futuro', 'futuro'],
      });
      porProceso.set(proceso.clave, grupo);
    }
    const porDependencia = new Map<string, ReturnType<typeof combinarResumenes>[]>();
    const logroBim3 = new Map<string, number | null>();
    for (const [clave, { dependencia, lista }] of porProceso) {
      const resumen = { ...resumirIndicadores(lista), conteo: null };
      logroBim3.set(clave, resumen.logros[2]);
      const lista2 = porDependencia.get(dependencia) ?? [];
      lista2.push(resumen);
      porDependencia.set(dependencia, lista2);
    }
    const dependencias = new Map(
      [...porDependencia].map(([sigla, resumenes]) => [
        sigla,
        combinarResumenes(resumenes),
      ]),
    );
    const general = combinarResumenes([...dependencias.values()]);
    expect(
      [
        'saf-presupuesto',
        'ope-direccionamiento-estrategico',
        'ope-gesco-i',
        'ope-pipc',
        'ope-odes',
      ].map((clave) => logroBim3.get(clave)),
    ).toEqual([0, 0, 0, 0, 0]);
    expect(dependencias.get('OPE')?.logros[2]).toBeCloseTo(0.2352, 4);
    expect(dependencias.get('SAF')?.logros[2]).toBeCloseTo(0.8915, 4);
    expect(general.logros[2]).toBeCloseTo(0.7673, 4);
  });

  it('el resumen del PAI completo da logros entre 0 y 1 (o null) y cuenta los 344', () => {
    const resumen = resumirIndicadores(
      filas.indicadores.map((fila) => {
        const r = calcular(fila);
        return {
          metas: fila.metas,
          porcentajes: r.porcentajes,
          metaTotal: r.metaTotal,
          porcentajeTotal: r.porcentajeTotal,
          // Como el 11 de octubre de 2026 con el Bimestre 4 abierto.
          estados: [
            'pendiente',
            'pendiente',
            'pendiente',
            'pendiente',
            'futuro',
            'futuro',
          ] as const,
        };
      }),
    );
    expect(resumen.indicadores).toBe(344);
    // Bim 1-3 reportados; Bim 4 abierto sin reportes: 0 % (cuenta como no
    // reportado); Bim 5-6 todavía no se deben reportar: null.
    expect(resumen.logros.slice(0, 3).every((l) => l !== null && l > 0)).toBe(
      true,
    );
    expect(resumen.logros.slice(3)).toEqual([0, null, null]);
    expect(resumen.avanceAnual).not.toBeNull();
  });
});
