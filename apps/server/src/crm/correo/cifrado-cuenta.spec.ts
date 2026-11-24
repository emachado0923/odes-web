import { hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import type {
  ConfiguracionRepositorio,
  OpcionesMysql,
  OpcionesPostgres,
} from '../../repositorio/configuracion-repositorio.js';
import {
  cifrarClave,
  crearLlaveCuentaCorreoCrm,
  derivarLlave,
  descifrarClave,
  secretoDeLlave,
} from './cifrado-cuenta.js';

type Bases = Pick<ConfiguracionRepositorio, 'mysql' | 'postgres'>;

function conMysql(contrasena: string): Bases {
  return { mysql: { contrasena } as OpcionesMysql, postgres: null };
}

function conPostgres(url: string): Bases {
  return { mysql: null, postgres: { url } as OpcionesPostgres };
}

const SIN_BASE: Bases = { mysql: null, postgres: null };
const CLAVE = 'abcdefghijklmnop';

describe('cifrado de la contraseña de la cuenta', () => {
  it('cifra y descifra (ida y vuelta) con un iv nuevo cada vez, en el formato v1.base64url(iv | tag | cifrado)', () => {
    const llave = derivarLlave('secreto-del-servidor');
    const primera = cifrarClave(CLAVE, llave);
    const segunda = cifrarClave(CLAVE, llave);
    expect(primera).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(primera).not.toBe(segunda);
    expect(primera).not.toContain(CLAVE);
    // 12 de iv + 16 de tag + los 16 bytes de la clave.
    expect(Buffer.from(primera.slice(3), 'base64url')).toHaveLength(12 + 16 + 16);
    expect(descifrarClave(primera, llave)).toBe(CLAVE);
    expect(descifrarClave(segunda, llave)).toBe(CLAVE);
    expect(descifrarClave(cifrarClave('contraseña-ñ-€', llave), llave)).toBe('contraseña-ñ-€');
  });

  it('con otra llave, sin llave, alterado o en otro formato no descifra (null)', () => {
    const llave = derivarLlave('secreto-del-servidor');
    const cifrada = cifrarClave(CLAVE, llave);
    expect(descifrarClave(cifrada, derivarLlave('otro-secreto'))).toBeNull();
    expect(descifrarClave(cifrada, null)).toBeNull();
    const datos = Buffer.from(cifrada.slice(3), 'base64url');
    datos[datos.length - 1] ^= 0x01;
    expect(descifrarClave(`v1.${datos.toString('base64url')}`, llave)).toBeNull();
    for (const otro of ['', 'v1.', 'v1.***', `v2.${cifrada.slice(3)}`, cifrada.slice(3), 'v1.AAAA']) {
      expect(descifrarClave(otro, llave)).toBeNull();
    }
  });

  it('la llave es HKDF-SHA256 (sal crm-correo-cuenta, info v1) de 32 bytes: la misma para el mismo secreto', () => {
    const llave = derivarLlave('secreto');
    expect(llave).toHaveLength(32);
    expect(llave.equals(derivarLlave('secreto'))).toBe(true);
    expect(llave.equals(derivarLlave('secreto2'))).toBe(false);
    expect(llave.equals(Buffer.from(hkdfSync('sha256', 'secreto', 'crm-correo-cuenta', 'v1', 32)))).toBe(true);
  });
});

describe('secreto de la llave', () => {
  it('CRM_CORREO_LLAVE manda; si no, la contraseña de la base (MySQL, o la de la URL de Postgres)', () => {
    const variable = 'una-llave-larga-del-servidor';
    expect(secretoDeLlave({ CRM_CORREO_LLAVE: ` ${variable} ` }, conMysql('clave-mysql'))).toEqual({
      secreto: variable,
      origen: 'CRM_CORREO_LLAVE',
    });
    expect(secretoDeLlave({}, conMysql('clave-mysql'))).toEqual({
      secreto: 'clave-mysql',
      origen: 'contraseña de la base',
    });
    expect(secretoDeLlave({ CRM_CORREO_LLAVE: '   ' }, conPostgres('postgresql://app:cl%40ve%2F1@db.example:5432/repo'))).toEqual({
      secreto: 'cl@ve/1',
      origen: 'contraseña de la base',
    });
  });

  it('sin variable ni contraseña de la base no hay llave; una CRM_CORREO_LLAVE corta detiene el arranque', () => {
    expect(secretoDeLlave({}, SIN_BASE)).toBeNull();
    expect(secretoDeLlave({}, conMysql(''))).toBeNull();
    expect(secretoDeLlave({}, conPostgres('postgresql://app@db.example:5432/repo'))).toBeNull();
    expect(crearLlaveCuentaCorreoCrm({}, SIN_BASE)).toEqual({ llave: null, origen: null });
    expect(() => secretoDeLlave({ CRM_CORREO_LLAVE: 'corta' }, conMysql('x'))).toThrow(ErrorDeConfiguracion);
  });

  it('la llave de CRM_CORREO_LLAVE no es la de la contraseña de la base: cambiar el secreto deja ilegible lo guardado', () => {
    const deVariable = crearLlaveCuentaCorreoCrm({ CRM_CORREO_LLAVE: 'una-llave-larga-del-servidor' }, conMysql('clave-mysql'));
    const deBase = crearLlaveCuentaCorreoCrm({}, conMysql('clave-mysql'));
    expect(deVariable.origen).toBe('CRM_CORREO_LLAVE');
    expect(deBase.origen).toBe('contraseña de la base');
    expect(deVariable.llave?.equals(derivarLlave('una-llave-larga-del-servidor'))).toBe(true);
    const cifrada = cifrarClave(CLAVE, deBase.llave as Buffer);
    expect(descifrarClave(cifrada, deBase.llave)).toBe(CLAVE);
    expect(descifrarClave(cifrada, deVariable.llave)).toBeNull();
    expect(descifrarClave(cifrada, crearLlaveCuentaCorreoCrm({}, conMysql('clave-rotada')).llave)).toBeNull();
  });
});
