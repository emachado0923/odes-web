import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cerrojoOcupado,
  cerrojoVigente,
  type DatosCerrojo,
  MAXIMA_EDAD_MS,
  rutaCerrojo,
  tomarCerrojo,
} from './cerrojo.js';

const directorios: string[] = [];
afterEach(() => {
  for (const directorio of directorios.splice(0)) rmSync(directorio, { recursive: true, force: true });
});

function indice(): string {
  const directorio = mkdtempSync(join(tmpdir(), 'odes-cerrojo-'));
  directorios.push(directorio);
  return join(directorio, 'indice.sqlite');
}

/** PID de un proceso que ya terminó. */
async function pidTerminado(): Promise<number> {
  const hijo = spawn(process.execPath, ['-e', '0']);
  await new Promise((resolver) => hijo.on('close', resolver));
  return hijo.pid!;
}

function escribir(ruta: string, datos: Partial<DatosCerrojo>): void {
  writeFileSync(
    rutaCerrojo(ruta),
    JSON.stringify({ pid: 1, host: hostname(), inicio: new Date().toISOString(), descripcion: 'otro', ...datos }),
  );
}

describe('cerrojo de la indexación', () => {
  it('se toma una sola vez y se libera', () => {
    const ruta = indice();
    const primero = tomarCerrojo(ruta, 'prueba');
    expect(primero.tomado).toBe(true);
    expect(JSON.parse(readFileSync(rutaCerrojo(ruta), 'utf8'))).toMatchObject({ pid: process.pid, descripcion: 'prueba' });
    if (!primero.tomado) return;
    primero.cerrojo.liberar();
    expect(existsSync(rutaCerrojo(ruta))).toBe(false);
    primero.cerrojo.liberar(); // dos veces: sin error
  });

  it('crea la carpeta del índice si no existe', () => {
    const ruta = join(indice(), '..', 'nuevo', 'sub', 'indice.sqlite');
    const resultado = tomarCerrojo(ruta, 'prueba');
    expect(resultado.tomado).toBe(true);
    expect(existsSync(rutaCerrojo(ruta))).toBe(true);
    if (resultado.tomado) resultado.cerrojo.liberar();
  });

  it('ocupado por un proceso vivo: no se toma y se informa', () => {
    const ruta = indice();
    escribir(ruta, { pid: process.ppid || 1, descripcion: 'odes:indexar --fuente mysql' });
    const resultado = tomarCerrojo(ruta, 'prueba');
    expect(resultado).toMatchObject({ tomado: false, ocupado: { descripcion: 'odes:indexar --fuente mysql' } });
    expect(cerrojoOcupado(ruta)?.pid).toBe(process.ppid || 1);
  });

  it('abandonado (proceso terminado o demasiado viejo): se reemplaza', async () => {
    const ruta = indice();
    escribir(ruta, { pid: await pidTerminado() });
    expect(cerrojoOcupado(ruta)).toBeNull();
    const resultado = tomarCerrojo(ruta, 'prueba');
    expect(resultado.tomado).toBe(true);
    if (resultado.tomado) resultado.cerrojo.liberar();

    escribir(ruta, { pid: process.ppid || 1, inicio: new Date(Date.now() - MAXIMA_EDAD_MS - 1000).toISOString() });
    expect(tomarCerrojo(ruta, 'prueba').tomado).toBe(true);
  });

  it('no libera un cerrojo que ya no es suyo', () => {
    const ruta = indice();
    const resultado = tomarCerrojo(ruta, 'prueba');
    if (!resultado.tomado) throw new Error('no se tomó');
    escribir(ruta, { pid: process.ppid || 1 });
    resultado.cerrojo.liberar();
    expect(existsSync(rutaCerrojo(ruta))).toBe(true);
  });

  it('un cerrojo ilegible recién creado se respeta (otro proceso lo está escribiendo)', () => {
    const ruta = indice();
    writeFileSync(rutaCerrojo(ruta), '');
    expect(tomarCerrojo(ruta, 'prueba').tomado).toBe(false);
  });

  it('cerrojoVigente: en otra máquina no se puede comprobar el PID y se respeta', () => {
    const datos: DatosCerrojo = { pid: 123, host: 'otra-maquina', inicio: new Date().toISOString(), descripcion: '' };
    expect(cerrojoVigente(datos, Date.now(), () => false)).toBe(true);
    expect(cerrojoVigente({ ...datos, host: hostname() }, Date.now(), () => false)).toBe(false);
    expect(cerrojoVigente({ ...datos, inicio: 'no es fecha' })).toBe(false);
  });
});
