import {
  chmodSync,
  mkdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEtagPorContenido } from './etag-contenido.js';

/** chmod 000 no impide leer a root ni existe en Windows. */
const sinPermisosReales =
  process.platform === 'win32' || process.getuid?.() === 0;

describe('crearEtagPorContenido', () => {
  let directorio: string;

  beforeEach(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'sapiencia-etag-'));
  });

  afterEach(async () => {
    await rm(directorio, { recursive: true, force: true });
  });

  function escribir(relativa: string, contenido: string, segundos?: number) {
    const ruta = join(directorio, relativa);
    mkdirSync(join(ruta, '..'), { recursive: true });
    writeFileSync(ruta, contenido);
    if (segundos !== undefined) utimesSync(ruta, segundos, segundos);
    return ruta;
  }

  it('el ETag es débil y depende solo del contenido, no de la fecha (build nuevo)', () => {
    const etags = crearEtagPorContenido();
    const ruta = escribir('modelo.glb', 'contenido-AAAA', 1_000_000);
    const primero = etags.obtener(ruta, statSync(ruta));
    expect(primero).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/);

    // Lo que hace un build: copia el mismo archivo con otra fecha.
    escribir('modelo.glb', 'contenido-AAAA', 2_000_000);
    expect(etags.obtener(ruta, statSync(ruta))).toBe(primero);

    // Mismo tamaño, otro contenido: ETag distinto.
    escribir('modelo.glb', 'contenido-BBBB', 3_000_000);
    expect(etags.obtener(ruta, statSync(ruta))).not.toBe(primero);
  });

  it('dos instancias dan el mismo ETag para el mismo contenido', () => {
    const a = escribir('a.wasm', 'xyz');
    const b = escribir('b.wasm', 'xyz');
    expect(crearEtagPorContenido().obtener(a, statSync(a))).toBe(
      crearEtagPorContenido().obtener(b, statSync(b)),
    );
  });

  it.skipIf(sinPermisosReales)(
    'devuelve undefined si el archivo no se puede leer',
    () => {
      const ruta = escribir('ilegible.bin', 'x');
      chmodSync(ruta, 0o000);
      expect(crearEtagPorContenido().obtener(ruta, statSync(ruta))).toBe(
        undefined,
      );
    },
  );

  it('precalcular() deja los hashes en memoria y omite las carpetas excluidas', async () => {
    const rutas = [
      escribir('sivu/edificiofinal.glb', 'modelo'),
      escribir('assets/index-abc.js', 'js'),
      escribir('.oculto/x.bin', 'x'),
    ];
    const estados = rutas.map((ruta) => statSync(ruta));
    const etags = crearEtagPorContenido();
    await etags.precalcular(directorio, ['assets']);

    // Ya no se pueden leer: solo puede responder desde la memoria.
    for (const ruta of rutas) rmSync(ruta);
    const [glb, asset, oculto] = rutas.map((ruta, i) =>
      etags.obtener(ruta, estados[i]),
    );
    expect(glb).toMatch(/^W\/"/);
    expect(asset).toBe(undefined);
    expect(oculto).toBe(undefined);
  });

  it('precalcular() no falla si la carpeta no existe', async () => {
    await expect(
      crearEtagPorContenido().precalcular(join(directorio, 'no-existe')),
    ).resolves.toBeUndefined();
  });
});
