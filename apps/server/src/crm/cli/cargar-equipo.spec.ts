import { describe, expect, it } from 'vitest';
import { PATRON_CORREO } from '../../pai/usuarios/validacion-usuarios.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorCli } from '../../repositorio/cli/comun.js';
import {
  cargarEquipo,
  interpretarArgumentosCargarEquipo,
  leerEquipo,
  PATRON_CORREO_CRM,
  type PersonaEquipoCrm,
  sqlCargarEquipo,
  validarEquipo,
} from './cargar-equipo.js';

/**
 * Unitarias de la CLI crm:cargar-equipo: validación del JSON, el SQL de
 * --solo-sql y las escrituras contra una base falsa. Los nombres y correos
 * son de prueba.
 */

function errorCli(funcion: () => unknown): ErrorCli {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorCli) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorCli');
}

const EQUIPO: PersonaEquipoCrm[] = [
  { nombre: 'Líder de Prueba', correo: 'lider@ejemplo.gov.co', esLider: true, orden: 1 },
  { nombre: "Ana O'Neil \\ Ruiz", correo: "ana.o'neil@ejemplo.gov.co", esLider: false, orden: 2 },
];

describe('validarEquipo', () => {
  it('normaliza nombres y correos y numera el orden desde 1', () => {
    expect(
      validarEquipo([
        { nombre: '  Líder   de\tPrueba ', correo: ' Lider@Ejemplo.GOV.co ', lider: true },
        { nombre: 'Ana Pérez', correo: 'ana@ejemplo.gov.co', lider: false },
        { nombre: 'Luis', correo: 'luis@ejemplo.gov.co' },
      ]),
    ).toEqual([
      { nombre: 'Líder de Prueba', correo: 'lider@ejemplo.gov.co', esLider: true, orden: 1 },
      { nombre: 'Ana Pérez', correo: 'ana@ejemplo.gov.co', esLider: false, orden: 2 },
      { nombre: 'Luis', correo: 'luis@ejemplo.gov.co', esLider: false, orden: 3 },
    ]);
  });

  it('el patrón de correo es el mismo de los usuarios del PAI', () => {
    expect(PATRON_CORREO_CRM.source).toBe(PATRON_CORREO.source);
  });

  it('junta todos los problemas de los datos, con la persona y el campo', () => {
    const mensaje = errorCli(() =>
      validarEquipo([
        { nombre: 'Líder', correo: 'lider@ejemplo.gov.co', lider: true },
        { nombre: 'Sin correo' },
        { nombre: 'Correo malo', correo: 'ana@ejemplo' },
        { nombre: '   ', correo: 'vacio@ejemplo.gov.co' },
        { nombre: 'x'.repeat(121), correo: 'largo@ejemplo.gov.co' },
        { nombre: 'Clave rara', correo: 'rara@ejemplo.gov.co', lidera: true },
        { nombre: 'Líder mal escrito', correo: 'otro@ejemplo.gov.co', lider: 'si' },
        { nombre: 'Correo largo', correo: `${'a'.repeat(250)}@ejemplo.gov.co` },
      ]),
    ).message;
    expect(mensaje).toContain('Persona 2 (correo): falta el correo');
    expect(mensaje).toContain('Persona 3 (correo): el correo no es válido');
    expect(mensaje).toContain('Persona 4 (nombre): el nombre está vacío');
    expect(mensaje).toContain('Persona 5 (nombre): el nombre pasa de 120 caracteres');
    expect(mensaje).toContain('Persona 6: no se esperaba "lidera"');
    expect(mensaje).toContain('Persona 7 (lider): "lider" debe ser true o false');
    expect(mensaje).toContain('Persona 8 (correo): el correo pasa de 254 caracteres');
  });

  it('exige un arreglo con al menos una persona', () => {
    expect(errorCli(() => validarEquipo({ nombre: 'Ana' })).message).toContain('El archivo: debe ser un arreglo');
    expect(errorCli(() => validarEquipo([])).message).toContain('el arreglo está vacío');
    expect(errorCli(() => validarEquipo(['Ana'])).message).toContain('Persona 1');
  });

  it('rechaza correos repetidos (sin distinguir mayúsculas)', () => {
    const error = errorCli(() =>
      validarEquipo([
        { nombre: 'Ana', correo: 'ana@ejemplo.gov.co', lider: true },
        { nombre: 'Luis', correo: 'luis@ejemplo.gov.co' },
        { nombre: 'Ana otra vez', correo: 'ANA@ejemplo.gov.co' },
      ]),
    );
    expect(error.message).toContain('El correo ana@ejemplo.gov.co está repetido (personas 1, 3).');
    expect(error.codigoSalida).toBe(2);
  });

  it('exige exactamente un líder', () => {
    expect(
      errorCli(() =>
        validarEquipo([
          { nombre: 'Ana', correo: 'ana@ejemplo.gov.co' },
          { nombre: 'Luis', correo: 'luis@ejemplo.gov.co', lider: false },
        ]),
      ).message,
    ).toContain('Ninguna persona tiene "lider": true');
    expect(
      errorCli(() =>
        validarEquipo([
          { nombre: 'Ana', correo: 'ana@ejemplo.gov.co', lider: true },
          { nombre: 'Luis', correo: 'luis@ejemplo.gov.co', lider: true },
        ]),
      ).message,
    ).toContain('Hay 2 personas con "lider": true (Ana, Luis): debe haber exactamente una.');
  });
});

describe('leerEquipo', () => {
  it('acepta el JSON con BOM y avisa si no es JSON', () => {
    const texto = '﻿[{ "nombre": "Ana", "correo": "ana@ejemplo.gov.co", "lider": true }]';
    expect(leerEquipo(texto)).toEqual([{ nombre: 'Ana', correo: 'ana@ejemplo.gov.co', esLider: true, orden: 1 }]);
    expect(errorCli(() => leerEquipo('[{ nombre: "Ana" }]')).message).toContain('no es un JSON válido');
  });
});

describe('sqlCargarEquipo', () => {
  it('MySQL: un solo líder y ON DUPLICATE KEY UPDATE por persona (sin VALUES()), con las comillas escapadas', () => {
    const sql = sqlCargarEquipo('mysql', EQUIPO);
    expect(sql).toContain('SET NAMES utf8mb4;\nSTART TRANSACTION;');
    expect(sql).toContain("UPDATE crm_personas SET es_lider = 0 WHERE es_lider = 1 AND correo <> 'lider@ejemplo.gov.co';");
    expect(sql).toContain(
      "INSERT INTO crm_personas (nombre, correo, es_lider, activo, orden) VALUES ('Líder de Prueba', 'lider@ejemplo.gov.co', 1, 1, 1)\n" +
        "  ON DUPLICATE KEY UPDATE nombre = 'Líder de Prueba', es_lider = 1, activo = 1, orden = 1;",
    );
    expect(sql).toContain(
      "VALUES ('Ana O''Neil \\\\ Ruiz', 'ana.o''neil@ejemplo.gov.co', 0, 1, 2)\n" +
        "  ON DUPLICATE KEY UPDATE nombre = 'Ana O''Neil \\\\ Ruiz', es_lider = 0, activo = 1, orden = 2;",
    );
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).not.toMatch(/=\s*VALUES\s*\(/);
  });

  it('Postgres: ON CONFLICT (correo) y la barra invertida tal cual', () => {
    const sql = sqlCargarEquipo('postgres', EQUIPO);
    expect(sql).toContain('BEGIN;');
    expect(sql).not.toContain('SET NAMES');
    expect(sql).toContain("VALUES ('Ana O''Neil \\ Ruiz', 'ana.o''neil@ejemplo.gov.co', 0, 1, 2)");
    expect(sql.match(/ON CONFLICT \(correo\) DO UPDATE SET nombre = EXCLUDED\.nombre, es_lider = EXCLUDED\.es_lider, activo = 1, orden = EXCLUDED\.orden;/g)).toHaveLength(2);
  });
});

describe('interpretarArgumentosCargarEquipo', () => {
  it('--ayuda, --archivo obligatorio y MySQL por defecto', () => {
    expect(interpretarArgumentosCargarEquipo(['--ayuda'])).toBeNull();
    expect(interpretarArgumentosCargarEquipo(['--archivo', 'datos/crm/equipo.json'])).toEqual({
      archivo: 'datos/crm/equipo.json',
      soloSql: false,
      motor: 'mysql',
    });
    expect(interpretarArgumentosCargarEquipo(['--archivo', 'e.json', '--solo-sql', '--motor', 'postgres'])).toEqual({
      archivo: 'e.json',
      soloSql: true,
      motor: 'postgres',
    });
    for (const argumentos of [[], ['--archivo', ' '], ['--archivo', 'e.json', '--motor', 'postgres'], ['e.json'], ['--x']]) {
      expect(errorCli(() => interpretarArgumentosCargarEquipo(argumentos)).codigoSalida).toBe(2);
    }
  });
});

describe('cargarEquipo (base falsa)', () => {
  it('quita el líder a los demás, actualiza por correo o crea, y cuenta los que no están en el archivo', async () => {
    const consultas: Array<{ sql: string; valores: readonly unknown[] }> = [];
    const conexion = {
      dialecto: 'mysql',
      query: async (sql: string, valores: readonly unknown[] = []) => {
        consultas.push({ sql, valores });
        if (sql.startsWith('UPDATE crm_personas SET es_lider = 0')) return [{ insertId: 0, affectedRows: 1 }, undefined];
        if (sql.startsWith('SELECT id FROM crm_personas')) return [valores[0] === 'lider@ejemplo.gov.co' ? [{ id: 4 }] : [], undefined];
        if (sql.startsWith('SELECT COUNT(*)')) return [[{ n: '2' }], undefined];
        return [{ insertId: 9, affectedRows: 1 }, undefined];
      },
    } as unknown as Conexion;
    const bd = { transaccion: async <T>(accion: (c: Conexion) => Promise<T>): Promise<T> => accion(conexion) };

    expect(await cargarEquipo(bd, EQUIPO)).toEqual({ creadas: 1, actualizadas: 1, lideresQuitados: 1, fueraDelArchivo: 2 });
    expect(consultas.map((c) => [c.sql, c.valores])).toEqual([
      ['UPDATE crm_personas SET es_lider = 0 WHERE es_lider = 1 AND correo <> ?', ['lider@ejemplo.gov.co']],
      ['SELECT id FROM crm_personas WHERE correo = ?', ['lider@ejemplo.gov.co']],
      ['UPDATE crm_personas SET nombre = ?, es_lider = ?, orden = ?, activo = 1 WHERE id = ?', ['Líder de Prueba', 1, 1, 4]],
      ['SELECT id FROM crm_personas WHERE correo = ?', ["ana.o'neil@ejemplo.gov.co"]],
      [
        'INSERT INTO crm_personas (nombre, correo, es_lider, activo, orden) VALUES (?, ?, ?, 1, ?)',
        ["Ana O'Neil \\ Ruiz", "ana.o'neil@ejemplo.gov.co", 0, 2],
      ],
      [
        'SELECT COUNT(*) AS n FROM crm_personas WHERE activo = 1 AND correo NOT IN (?)',
        [['lider@ejemplo.gov.co', "ana.o'neil@ejemplo.gov.co"]],
      ],
    ]);
  });
});
