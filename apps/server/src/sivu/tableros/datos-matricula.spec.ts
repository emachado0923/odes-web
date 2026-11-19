import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import {
  aFilasTablas,
  armarConjunto,
  type ConjuntoMatricula,
  ErrorDatosTablero,
  type FilasLeidas,
  type FilasTablas,
  leerArchivosTablero,
  validarConjunto,
} from './datos-matricula.js';

const CARPETA = join(RAIZ_SERVIDOR, 'datos', 'tableros', 'matricula-2025');

/** Lo que devolvería la base con esas filas (Postgres puede dar números como texto). */
function comoBase(filas: FilasTablas, { numerosComoTexto = false } = {}): FilasLeidas {
  const n = (valor: number): number | string => (numerosComoTexto ? String(valor) : valor);
  return {
    meta: { ...filas.meta, anio: n(filas.meta.anio) },
    categorias: filas.categorias
      .toSorted((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1))
      .map(([dimension, indice, nombre, padre]) => ({ dimension, indice: n(indice), nombre, padre: padre === null ? null : n(padre) })),
    ies: filas.ies.map(([indice, nombre, corto, sector, caracter, acreditada, codigos]) => ({
      indice: n(indice),
      nombre,
      corto,
      sector,
      caracter,
      acreditada: n(acreditada),
      codigos,
    })),
    programas: filas.programas.map(([indice, codigo, nombre, ies, nivel, modalidad, nbc, cine, acreditado]) => ({
      indice: n(indice),
      codigo,
      nombre,
      ies: n(ies),
      nivel_formacion: n(nivel),
      modalidad: n(modalidad),
      nbc: n(nbc),
      cine: n(cine),
      acreditado: n(acreditado),
    })),
    filas: filas.filas.map(([, programa, sexo, periodo, matriculados]) => ({
      programa: n(programa),
      sexo: n(sexo),
      periodo: n(periodo),
      matriculados: n(matriculados),
    })),
  };
}

function conjuntoMinimo(): ConjuntoMatricula {
  return {
    meta: {
      municipio: 'Medellín',
      anio: 2025,
      periodos: ['2025-1'],
      referencia: '2025-1',
      registros: 2,
      fuente: 'SNIES',
      generado: '2026-09-07',
      resumen: { '2025-1': { matriculados: 15, ies: 1, programas: 1 } },
    },
    dim: {
      ies: [{ nombre: 'Universidad X', corto: 'UX', sector: 'Oficial', caracter: 'Universidad', acreditada: true, codigos: ['1', '2'] }],
      programa: [{ nombre: 'Derecho', codigo: '100', ies: 0, nivelForm: 0, modalidad: 0, nbc: 0, cine: 0, acreditado: false }],
      nivelAcad: ['Pregrado'],
      nivelForm: [{ nombre: 'Universitaria', acad: 0 }],
      modalidad: ['Presencial'],
      area: ['Ciencias sociales'],
      nbc: [{ nombre: 'Derecho y afines', area: 0 }],
      cineAmplio: ['Ciencias sociales'],
      cineEspecifico: [{ nombre: 'Derecho', amplio: 0 }],
      cineDetallado: [{ nombre: 'Derecho', especifico: 0 }],
      sexo: ['Masculino', 'Femenino'],
      periodo: ['2025-1'],
    },
    filas: [
      [0, 0, 0, 10],
      [0, 1, 0, 5],
    ],
  };
}

describe('datos del tablero de matrícula', () => {
  it('ida y vuelta con los datos reales: archivo -> filas de las tablas -> el mismo objeto', async () => {
    const { matricula, definiciones } = await leerArchivosTablero(
      join(CARPETA, 'matricula.js'),
      join(CARPETA, 'definiciones.js'),
    );
    expect(matricula.filas).toHaveLength(matricula.meta.registros);
    expect(definiciones).toMatchObject({ intro: { titulo: expect.stringContaining('matrícula') } });

    const filas = aFilasTablas(matricula, definiciones);
    expect(filas.ies).toHaveLength(matricula.dim.ies.length);
    expect(filas.programas).toHaveLength(matricula.dim.programa.length);
    expect(JSON.parse(filas.tablero.definiciones)).toEqual(definiciones);

    // meta.periodos, registros y resumen (matriculados, IES y programas por periodo) se recalculan
    // con las filas: deben dar lo mismo que calculó el ETL.
    expect(armarConjunto(comoBase(filas))).toEqual(matricula);
    expect(armarConjunto(comoBase(filas, { numerosComoTexto: true }))).toEqual(matricula);
  });

  it('las IES sin códigos vuelven como lista vacía', () => {
    const conjunto = conjuntoMinimo();
    conjunto.dim.ies[0]!.codigos = [];
    expect(armarConjunto(comoBase(aFilasTablas(conjunto, {}))).dim.ies[0]!.codigos).toEqual([]);
  });

  it('rechaza un archivo con posiciones fuera de su lista', () => {
    const conjunto = conjuntoMinimo();
    conjunto.filas.push([3, 0, 0, 1]);
    expect(() => validarConjunto(conjunto)).toThrow(ErrorDatosTablero);
    const otro = conjuntoMinimo();
    otro.dim.nbc[0]!.area = 7;
    expect(() => validarConjunto(otro)).toThrow(/nbc\[0\]\.area/);
    const sinMeta = conjuntoMinimo() as Partial<ConjuntoMatricula>;
    delete sinMeta.meta;
    expect(() => validarConjunto(sinMeta)).toThrow(/meta/);
  });
});
