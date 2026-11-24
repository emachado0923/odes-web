import { describe, expect, it } from 'vitest';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorCli } from '../../repositorio/cli/comun.js';
import { hashContrasena } from '../../repositorio/dominio/contrasenas.js';
import {
  AYUDA_CLAVE_LIDER,
  contrasenaDelEntorno,
  guardarClaveLider,
  interpretarArgumentosClaveLider,
  leerMotor,
  literalSql,
  NOMBRE_LIDER_POR_DEFECTO,
  SQL_NOMBRE_LIDER,
  sqlClaveLider,
  textoUnaLinea,
  VARIABLE_CLAVE_LIDER,
} from './clave-lider.js';

/**
 * Unitarias de la CLI crm:clave-lider: argumentos, la contraseña del entorno,
 * el SQL de --solo-sql y las escrituras contra una base falsa. El SQL se
 * probó contra MySQL y Postgres reales al escribir la migración 010.
 */

const HASH = 'scrypt$32768$8$1$c2FsLWRlLXBydWViYQ==$aGFzaA==';

function errorCli(funcion: () => unknown): ErrorCli {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorCli) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorCli');
}

/** Base falsa: responde las dos consultas de lectura y anota todo lo que se ejecuta. */
function baseFalsa(respuestas: { lideres?: Array<{ nombre: string }>; usuarios?: Array<{ id: number }> } = {}) {
  const consultas: Array<{ sql: string; valores: readonly unknown[] }> = [];
  const conexion = {
    dialecto: 'mysql',
    query: async (sql: string, valores: readonly unknown[] = []) => {
      consultas.push({ sql, valores });
      if (sql.startsWith('SELECT nombre FROM crm_personas')) return [respuestas.lideres ?? [], undefined];
      if (sql.startsWith('SELECT id FROM crm_acceso_usuarios')) return [respuestas.usuarios ?? [], undefined];
      return [{ insertId: 7, affectedRows: 1 }, undefined];
    },
  } as unknown as Conexion;
  const bd = { transaccion: async <T>(accion: (c: Conexion) => Promise<T>): Promise<T> => accion(conexion) };
  return { bd, consultas };
}

describe('interpretarArgumentosClaveLider', () => {
  it('--ayuda devuelve null y la ayuda nombra la variable de la contraseña', () => {
    expect(interpretarArgumentosClaveLider(['--ayuda'])).toBeNull();
    expect(interpretarArgumentosClaveLider(['-h'])).toBeNull();
    expect(AYUDA_CLAVE_LIDER).toContain(VARIABLE_CLAVE_LIDER);
  });

  it('por defecto: se conecta, MySQL y el nombre de la persona líder', () => {
    expect(interpretarArgumentosClaveLider([])).toEqual({ soloSql: false, motor: 'mysql', nombre: null });
    expect(interpretarArgumentosClaveLider(['--solo-sql'])).toEqual({ soloSql: true, motor: 'mysql', nombre: null });
  });

  it('--solo-sql --motor postgres y --nombre en una línea', () => {
    expect(
      interpretarArgumentosClaveLider(['--solo-sql', '--motor', ' Postgres ', '--nombre', '  José   David\tRamírez \u0007']),
    ).toEqual({ soloSql: true, motor: 'postgres', nombre: 'José David Ramírez' });
  });

  it('rechaza opciones mal escritas, con un mensaje claro y código 2', () => {
    for (const argumentos of [
      ['--solo-sql', '--motor', 'oracle'],
      ['--motor', 'postgres'],
      ['--nombre', '   '],
      ['--nombre', 'x'.repeat(121)],
      ['--otra'],
      ['lider'],
      ['--nombre'],
    ]) {
      const error = errorCli(() => interpretarArgumentosClaveLider(argumentos));
      expect(error.codigoSalida).toBe(2);
    }
    expect(errorCli(() => interpretarArgumentosClaveLider(['--otra'])).message).toContain('Opción no válida');
    expect(errorCli(() => interpretarArgumentosClaveLider(['--motor', 'postgres'])).message).toContain('--solo-sql');
  });

  it('nunca acepta la contraseña en los argumentos (y no la repite)', () => {
    for (const argumentos of [['--clave=Secreta-de-prueba-1'], ['--contrasena', 'Secreta-de-prueba-1'], ['-p']]) {
      const error = errorCli(() => interpretarArgumentosClaveLider(argumentos));
      expect(error.message).toContain('línea de comandos');
      expect(error.message).not.toContain('Secreta-de-prueba-1');
    }
  });
});

describe('contrasenaDelEntorno', () => {
  it('sin la variable devuelve null (se pide oculta); con una válida la devuelve', () => {
    expect(contrasenaDelEntorno({})).toBeNull();
    expect(contrasenaDelEntorno({ [VARIABLE_CLAVE_LIDER]: 'una clave larga de prueba' })).toBe('una clave larga de prueba');
  });

  it('una contraseña corta da error sin repetirla', () => {
    const error = errorCli(() => contrasenaDelEntorno({ [VARIABLE_CLAVE_LIDER]: 'Corta-123' }));
    expect(error.message).toContain(VARIABLE_CLAVE_LIDER);
    expect(error.message).not.toContain('Corta-123');
  });
});

describe('piezas comunes', () => {
  it('leerMotor: mysql por defecto', () => {
    expect(leerMotor(undefined)).toBe('mysql');
    expect(leerMotor('MYSQL')).toBe('mysql');
    expect(leerMotor('postgres')).toBe('postgres');
    expect(errorCli(() => leerMotor('postgresql')).codigoSalida).toBe(2);
  });

  it('literalSql dobla las comillas y, solo en MySQL, la barra invertida', () => {
    expect(literalSql('mysql', "O'Neil \\ Ruiz")).toBe("'O''Neil \\\\ Ruiz'");
    expect(literalSql('postgres', "O'Neil \\ Ruiz")).toBe("'O''Neil \\ Ruiz'");
    expect(literalSql('mysql', null)).toBe('NULL');
  });

  it('textoUnaLinea: NFC, sin control y con espacios simples', () => {
    expect(textoUnaLinea('  Ana\n\tMaría \u0007 Pérez  ')).toBe('Ana María Pérez');
  });
});

describe('sqlClaveLider', () => {
  it('MySQL: crea o actualiza con ON DUPLICATE KEY UPDATE (sin VALUES()), cierra sesiones y levanta el bloqueo', () => {
    const sql = sqlClaveLider('mysql', HASH, "D'Arcy \\ Líder");
    const nombre = "'D''Arcy \\\\ Líder'";
    expect(sql).toContain('SET NAMES utf8mb4;\nSTART TRANSACTION;');
    expect(sql).toContain(
      `INSERT INTO crm_acceso_usuarios (usuario, nombre, hash_contrasena, activo)\n  VALUES ('lider', ${nombre}, '${HASH}', 1)`,
    );
    expect(sql).toContain(`ON DUPLICATE KEY UPDATE nombre = ${nombre}, hash_contrasena = '${HASH}', activo = 1;`);
    expect(sql).toContain(
      "DELETE FROM crm_acceso_sesiones WHERE usuario_id = (SELECT id FROM crm_acceso_usuarios WHERE usuario = 'lider');",
    );
    expect(sql).toContain("DELETE FROM crm_acceso_intentos WHERE usuario = 'lider';");
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).not.toMatch(/=\s*VALUES\s*\(/);
    expect(sql).not.toContain('#');
  });

  it('Postgres: ON CONFLICT (usuario) y la barra invertida tal cual', () => {
    const sql = sqlClaveLider('postgres', HASH, "D'Arcy \\ Líder");
    expect(sql).toContain("VALUES ('lider', 'D''Arcy \\ Líder',");
    expect(sql).toContain(
      'ON CONFLICT (usuario) DO UPDATE SET nombre = EXCLUDED.nombre, hash_contrasena = EXCLUDED.hash_contrasena, activo = 1;',
    );
    expect(sql).toMatch(/^-- .*\n-- .*\nBEGIN;\n/);
    expect(sql).not.toContain('SET NAMES');
  });

  it('sin nombre, lo toma la sentencia de la persona líder (o «Líder»)', () => {
    const delLider = `COALESCE((${SQL_NOMBRE_LIDER}), '${NOMBRE_LIDER_POR_DEFECTO}')`;
    const mysql = sqlClaveLider('mysql', HASH, null);
    expect(mysql.split(delLider)).toHaveLength(3); // en el INSERT y en el UPDATE
    expect(sqlClaveLider('postgres', HASH, null)).toContain(`VALUES ('lider', ${delLider}, '${HASH}', 1)`);
  });

  it('lleva el hash y nunca la contraseña', async () => {
    const contrasena = 'Contraseña-de-prueba-larga-1';
    const hash = await hashContrasena(contrasena);
    for (const motor of ['mysql', 'postgres'] as const) {
      const sql = sqlClaveLider(motor, hash, null);
      expect(sql).toContain(hash);
      expect(sql).not.toContain(contrasena);
    }
  });
});

describe('guardarClaveLider (base falsa)', () => {
  it('crea la cuenta con el nombre de la persona líder y levanta el bloqueo', async () => {
    const { bd, consultas } = baseFalsa({ lideres: [{ nombre: 'José David Ramírez Abraham' }] });
    expect(await guardarClaveLider(bd, HASH, null)).toEqual({ creada: true, nombre: 'José David Ramírez Abraham' });
    expect(consultas.map((c) => [c.sql, c.valores])).toEqual([
      [SQL_NOMBRE_LIDER, []],
      ['SELECT id FROM crm_acceso_usuarios WHERE usuario = ?', ['lider']],
      [
        'INSERT INTO crm_acceso_usuarios (usuario, nombre, hash_contrasena, activo) VALUES (?, ?, ?, 1)',
        ['lider', 'José David Ramírez Abraham', HASH],
      ],
      ['DELETE FROM crm_acceso_intentos WHERE usuario = ?', ['lider']],
    ]);
  });

  it('sin persona líder, el nombre es «Líder»', async () => {
    const { bd } = baseFalsa();
    expect(await guardarClaveLider(bd, HASH, null)).toEqual({ creada: true, nombre: NOMBRE_LIDER_POR_DEFECTO });
  });

  it('si existe: cambia hash y nombre, la reactiva y cierra sus sesiones (sin preguntar por la persona líder)', async () => {
    const { bd, consultas } = baseFalsa({ usuarios: [{ id: 3 }], lideres: [{ nombre: 'No se usa' }] });
    expect(await guardarClaveLider(bd, HASH, 'Jefe de Planeación')).toEqual({ creada: false, nombre: 'Jefe de Planeación' });
    expect(consultas.map((c) => [c.sql, c.valores])).toEqual([
      ['SELECT id FROM crm_acceso_usuarios WHERE usuario = ?', ['lider']],
      ['UPDATE crm_acceso_usuarios SET nombre = ?, hash_contrasena = ?, activo = 1 WHERE id = ?', ['Jefe de Planeación', HASH, 3]],
      ['DELETE FROM crm_acceso_sesiones WHERE usuario_id = ?', [3]],
      ['DELETE FROM crm_acceso_intentos WHERE usuario = ?', ['lider']],
    ]);
  });
});
