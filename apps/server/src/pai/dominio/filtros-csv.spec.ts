import { describe, expect, it } from 'vitest';
import type {
  AccionTableroPai,
  IndicadorTableroPai,
  ProcesoTableroPai,
  TableroPai,
} from '../api-pai.js';
import {
  BOM_UTF8,
  celdaNumero,
  celdaPorcentaje,
  celdaTexto,
  generarCsv,
} from './csv-pai.js';
import { filtrarIndicadoresTablero } from './filtros-pai.js';

function proceso(
  cambios: Partial<ProcesoTableroPai> & { id: number },
): ProcesoTableroPai {
  return {
    clave: `p-${cambios.id}`,
    codigo: `P${cambios.id}`,
    nombre: `Proceso ${cambios.id}`,
    dependenciaId: 1,
    tipo: 'proceso',
    programa: null,
    lineaPlanDesarrollo: null,
    dimensionPlanEstrategico: null,
    orden: cambios.id,
    ...cambios,
  };
}

function indicador(
  cambios: Partial<IndicadorTableroPai> & { id: number },
): IndicadorTableroPai {
  return {
    codigo: `SAF-TH-0${cambios.id}`,
    nombre: `Indicador ${cambios.id}`,
    procesoId: 1,
    accionId: 1,
    orden: 1,
    tipoMeta: 'numero',
    metas: [1, 1, 1, 1, 1, 1],
    metaTotal: 6,
    avances: [null, null, null, null, null, null],
    avanceTotal: null,
    porcentajes: [null, null, null, null, null, null],
    porcentajeTotal: null,
    estados: [
      'pendiente',
      'pendiente',
      'pendiente',
      'pendiente',
      'futuro',
      'futuro',
    ],
    editables: [false, false, false, false, false, false],
    motivos: [
      'sin_permiso',
      'sin_permiso',
      'sin_permiso',
      'sin_permiso',
      'sin_permiso',
      'sin_permiso',
    ],
    tieneTextos: [false, false, false, false, false, false],
    evidencias: [0, 0, 0, 0, 0, 0],
    actualizadoEn: [null, null, null, null, null, null],
    ...cambios,
  };
}

const procesos = [
  proceso({
    id: 1,
    dependenciaId: 1,
    programa: 'Programa A',
    lineaPlanDesarrollo: '1. Creemos',
    dimensionPlanEstrategico: 'Dimensión X',
  }),
  proceso({
    id: 2,
    dependenciaId: 2,
    tipo: 'proyecto',
    lineaPlanDesarrollo: '2. Otra',
  }),
];
const acciones: AccionTableroPai[] = [
  {
    id: 1,
    procesoId: 1,
    orden: 1,
    descripcion: 'Acción 1',
    riesgoIds: [10, 11],
  },
  { id: 2, procesoId: 2, orden: 1, descripcion: 'Acción 2', riesgoIds: [] },
];
const indicadores = [
  indicador({
    id: 1,
    nombre: 'Número de encuestas de satisfacción',
    estados: [
      'reportado',
      'reportado',
      'reportado',
      'reportado',
      'futuro',
      'futuro',
    ],
  }),
  indicador({ id: 2, nombre: 'Porcentaje de ejecución', codigo: 'SAF-TH-02' }),
  indicador({
    id: 3,
    procesoId: 2,
    accionId: 2,
    codigo: 'DTF-FO-01',
    nombre: 'Créditos aprobados',
    metas: [0, 0, 0, 0, 0, 0],
    estados: [
      'sin_meta',
      'sin_meta',
      'sin_meta',
      'sin_meta',
      'futuro',
      'futuro',
    ],
  }),
];

function tablero(bimestreAbierto: TableroPai['vigencia']['bimestreAbierto']) {
  return {
    vigencia: { bimestreAbierto } as TableroPai['vigencia'],
    procesos,
    acciones,
    indicadores,
  };
}

const ids = (lista: IndicadorTableroPai[]) => lista.map((i) => i.id);


/** Parte una línea de CSV por `separador`, respetando las comillas dobles. */
function partirCsv(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === separador) {
      celdas.push(celda);
      celda = '';
    } else celda += c;
  }
  celdas.push(celda);
  return celdas;
}

describe('filtrarIndicadoresTablero', () => {
  it('sin filtros (o vacíos) devuelve todo', () => {
    expect(ids(filtrarIndicadoresTablero(tablero(4), {}))).toEqual([1, 2, 3]);
    expect(
      ids(
        filtrarIndicadoresTablero(tablero(4), {
          dependencia: null,
          q: '',
          programa: null,
        }),
      ),
    ).toEqual([1, 2, 3]);
  });

  it('dependencia, proceso, tipo, programa, línea y dimensión', () => {
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { dependencia: 2 })),
    ).toEqual([3]);
    expect(ids(filtrarIndicadoresTablero(tablero(4), { proceso: 1 }))).toEqual([
      1, 2,
    ]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { tipo: 'proyecto' })),
    ).toEqual([3]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { programa: 'Programa A' })),
    ).toEqual([1, 2]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { linea: '2. Otra' })),
    ).toEqual([3]);
    expect(
      ids(
        filtrarIndicadoresTablero(tablero(4), {
          dimension: 'Dimensión X',
          proceso: 2,
        }),
      ),
    ).toEqual([]);
  });

  it('riesgo: el de la acción del indicador', () => {
    expect(ids(filtrarIndicadoresTablero(tablero(4), { riesgo: 11 }))).toEqual([
      1, 2,
    ]);
    expect(ids(filtrarIndicadoresTablero(tablero(4), { riesgo: 99 }))).toEqual(
      [],
    );
  });

  it('estado: el del bimestre abierto (sin bimestre abierto no aplica)', () => {
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { estado: 'reportado' })),
    ).toEqual([1]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { estado: 'pendiente' })),
    ).toEqual([2]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { estado: 'sin_meta' })),
    ).toEqual([3]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(null), { estado: 'reportado' })),
    ).toEqual([1, 2, 3]);
  });

  it('q: código o nombre sin mayúsculas ni tildes', () => {
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { q: 'SATISFACCION' })),
    ).toEqual([1]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { q: 'creditos' })),
    ).toEqual([3]);
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { q: 'saf-th-02' })),
    ).toEqual([2]);
    expect(
      ids(
        filtrarIndicadoresTablero(tablero(4), { q: 'Ejecución', proceso: 2 }),
      ),
    ).toEqual([]);
    // Como la web: el código y el nombre se buscan por separado.
    expect(
      ids(filtrarIndicadoresTablero(tablero(4), { q: 'th-02 porcentaje' })),
    ).toEqual([]);
  });
});

describe('CSV para Excel es-CO', () => {
  it('celdaTexto: siempre entre comillas, con las comillas dobladas y las fórmulas neutralizadas', () => {
    expect(celdaTexto(null)).toBe('');
    expect(celdaTexto('')).toBe('');
    expect(celdaTexto('Simple')).toBe('"Simple"');
    expect(celdaTexto('a;b')).toBe('"a;b"');
    expect(celdaTexto('dice "hola"')).toBe('"dice ""hola"""');
    expect(celdaTexto('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
    expect(celdaTexto(' espacio')).toBe('" espacio"');
    expect(celdaTexto('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celdaTexto('+57 300')).toBe(`"'+57 300"`);
    expect(celdaTexto('-5')).toBe(`"'-5"`);
    expect(celdaTexto('@SUMA')).toBe(`"'@SUMA"`);
  });

  it('celdaTexto: una coma o un tabulador en medio no parten la celda con otro separador (SEG-5)', () => {
    // Sin comillas, al abrir con separador "," o tabulador la segunda parte
    // quedaría como otra celda que empieza por "=" (una fórmula viva).
    expect(celdaTexto('Ver acta, -1+2')).toBe('"Ver acta, -1+2"');
    expect(celdaTexto('a\t=1+1')).toBe('"a\t=1+1"');
    expect(
      celdaTexto('Listo,=HYPERLINK(CHAR(104)&CHAR(116)&A2)'),
    ).toBe('"Listo,=HYPERLINK(CHAR(104)&CHAR(116)&A2)"');
    // Partido como lo haría un lector de CSV con otro separador que respeta
    // las comillas: una sola celda.
    for (const separador of [',', '\t', ' ']) {
      const celdas = partirCsv(
        [celdaTexto('SAF-TH-01'), celdaTexto('Listo,=1+1\t=2+2 =3')].join(';'),
        separador,
      );
      expect(celdas.some((c) => /^[=+\-@]/.test(c))).toBe(false);
    }
  });

  it('celdaNumero: coma decimal, sin miles ni ceros sobrantes', () => {
    expect(celdaNumero(null)).toBe('');
    expect(celdaNumero(0)).toBe('0');
    expect(celdaNumero(1234567.5)).toBe('1234567,5');
    expect(celdaNumero(0.1666666667)).toBe('0,1666666667');
    expect(celdaNumero(1e-7)).toBe('0,0000001');
    expect(celdaNumero(100)).toBe('100');
  });

  it('celdaPorcentaje: escala 0-100 con dos decimales', () => {
    expect(celdaPorcentaje(1)).toBe('100');
    expect(celdaPorcentaje(1 / 3)).toBe('33,33');
    expect(celdaPorcentaje(null)).toBe('');
  });

  it('generarCsv: BOM, separador ; y CRLF', () => {
    const csv = generarCsv(
      ['Código', 'Nombre; largo'],
      [['SAF-TH-01', celdaTexto('Uno')]],
    ).toString('utf8');
    expect(csv.startsWith(BOM_UTF8)).toBe(true);
    expect(csv.slice(1)).toBe('"Código";"Nombre; largo"\r\nSAF-TH-01;"Uno"\r\n');
  });
});
