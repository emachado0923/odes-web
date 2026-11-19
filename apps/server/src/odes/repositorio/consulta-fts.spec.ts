import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import {
  construirConsulta,
  MAX_GRUPOS_CONSULTA,
  restringirAColumnas,
} from './consulta-fts.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE VIRTUAL TABLE busqueda USING fts5(titulo, claves, cuerpo,
    tokenize = 'unicode61 remove_diacritics 2');
  INSERT INTO busqueda (titulo, claves, cuerpo) VALUES
    ('desercion educacion superior', 'boletin 5', 'tasa desercion 2018 2'),
    ('matricul cero', 'estudi', 'beca credit');
`);
afterAll(() => db.close());

function ejecutar(expresion: string): unknown[] {
  return db
    .prepare('SELECT rowid FROM busqueda WHERE busqueda MATCH ?')
    .all(expresion);
}

/** Lo que queda de la expresión al quitar los términos citados: solo operadores. */
function sinTerminos(expresion: string): string {
  return expresion.replace(/"[^"]*"\*?/g, '').replace(/\{[a-z ]+\} :/g, '');
}

describe('construirConsulta', () => {
  it('devuelve null si no queda ningún término útil', () => {
    expect(construirConsulta('')).toBeNull();
    expect(construirConsulta('   ')).toBeNull();
    expect(construirConsulta('de la y el')).toBeNull();
    expect(construirConsulta('"*()-:^')).toBeNull();
  });

  it('cita cada término, con prefijo solo en raíces largas y nunca en cifras', () => {
    expect(construirConsulta('becas')?.y).toBe('"beca"');
    expect(construirConsulta('matrícula')?.y).toBe('"matricul"*');
    expect(construirConsulta('2018')?.y).toBe('"2018"');
  });

  it('une con AND (y) y con OR (o)', () => {
    const consulta = construirConsulta('deserción becas');
    expect(consulta?.grupos).toBe(2);
    expect(consulta?.y).toBe('"desercion"* AND "beca"');
    expect(consulta?.o).toBe('"desercion"* OR "beca"');
  });

  it('convierte las palabras unidas por guion en una frase', () => {
    expect(construirConsulta('convocatoria 2018-2')?.y).toBe(
      '"convocatori"* AND "2018 2"',
    );
    expect(ejecutar(construirConsulta('2018-2')!.y)).toHaveLength(1);
  });

  it('amplía siglas y palabras en inglés con su equivalente', () => {
    expect(construirConsulta('IES')?.y).toBe(
      '("ies" OR "institucion educacion superior")',
    );
    expect(construirConsulta('dropout')?.y).toContain('"desercion"*');
  });

  it('recorta las consultas muy largas', () => {
    const larga = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ');
    expect(construirConsulta(larga)?.grupos).toBe(MAX_GRUPOS_CONSULTA);
  });

  it.each([
    'deserción" OR "a',
    'titulo:desercion',
    '{titulo claves}: desercion',
    'NEAR(desercion educacion, 2)',
    'desercion AND OR NOT',
    'deser*',
    '-desercion +educacion',
    '^desercion',
    '(desercion',
    'desercion)',
    '"desercion',
    "l'éducation d'abord",
    'col:"x" * ( ) " : ^ -',
    'SELECT * FROM documentos; --',
    '\u0000desercion\u0007',
    'deserción\u2019s',
  ])('el texto %j no puede romper ni alterar la sintaxis de FTS5', (texto) => {
    const consulta = construirConsulta(texto);
    if (!consulta) return;
    for (const expresion of [
      consulta.y,
      consulta.o,
      restringirAColumnas(consulta.y, ['titulo']),
    ]) {
      expect(() => ejecutar(expresion)).not.toThrow();
      expect(sinTerminos(expresion)).toMatch(/^[\s()*ANDOR]*$/);
    }
  });

  it('la restricción por columnas es sintaxis válida', () => {
    const consulta = construirConsulta('desercion boletin')!;
    expect(
      ejecutar(restringirAColumnas(consulta.y, ['titulo', 'claves'])),
    ).toHaveLength(1);
    expect(ejecutar(restringirAColumnas(consulta.y, ['cuerpo']))).toHaveLength(
      0,
    );
  });
});
