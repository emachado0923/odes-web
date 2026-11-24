import { describe, expect, it } from 'vitest';
import {
  debeServirIndex,
  esRutaDelFrontend,
  pareceArchivo,
  redireccionAntigua,
} from './rutas-spa.js';

describe('rutas de la SPA', () => {
  it.each([
    '/',
    '/sivu',
    '/sivu/',
    '/sivu/a/b',
    '/SIVU/piso-1',
    '/odes',
    '/odes/x',
    '/repositorio',
    '/repositorio/',
    '/repositorio/admin',
    '/Repositorio/admin/documentos/x',
    '/tableros/matricula-2025',
    '/pai',
    '/pai/',
    '/pai/admin',
    '/pai/indicadores/SAF-TH-02',
    '/PAI/admin/usuarios',
    '/pertinencia',
    '/pertinencia/',
    '/Pertinencia/x',
    '/crm',
    '/crm/',
    '/crm/equipo/3',
    '/CRM/lider/tareas/nueva',
  ])('%s es ruta del front-end', (ruta) => {
    expect(esRutaDelFrontend(ruta)).toBe(true);
  });

  it.each([
    '/otra',
    '/sivux',
    '/odes-algo',
    '/repositorios',
    '/repositorio-admin',
    '/pais',
    '/pai-x',
    '/pertinencias',
    '/pertinencia-x',
    '/crms',
    '/crm-x',
    '/api/crm/personas',
    '/api/pai/sesion',
    '/api',
    '/api/repositorio/documentos',
    '/api/sivu',
    '',
    '/assets/a.js',
  ])('%j no es ruta del front-end', (ruta) => {
    expect(esRutaDelFrontend(ruta)).toBe(false);
  });

  it.each([
    ['/sivu/falta.glb', true],
    ['/sivu/draco/draco_decoder.wasm', true],
    ['/sivu/falta%2Eglb', true],
    ['/sivu/..%2f..%2fpackage.json', true],
    ['/sivu/.env', true],
    ['/sivu/%E0%A4%A', true],
    ['/sivu/piso-1', false],
    ['/sivu/', false],
    ['/sivu/v1.', false],
    ['/', false],
  ])('pareceArchivo(%j) = %j', (ruta, esperado) => {
    expect(pareceArchivo(ruta)).toBe(esperado);
  });

  it('solo sirve index.html en rutas propias sin extensión', () => {
    expect(debeServirIndex('/sivu/recorrido')).toBe(true);
    expect(debeServirIndex('/repositorio/admin')).toBe(true);
    expect(debeServirIndex('/pai/admin/registro')).toBe(true);
    expect(debeServirIndex('/pai/evidencia.pdf')).toBe(false);
    expect(debeServirIndex('/pertinencia')).toBe(true);
    expect(debeServirIndex('/pertinencia/resolucion.pdf')).toBe(false);
    expect(debeServirIndex('/repositorio/logo.png')).toBe(false);
    expect(debeServirIndex('/sivu/falta.glb')).toBe(false);
    expect(debeServirIndex('/otra')).toBe(false);
  });

  it('las páginas estáticas que pasaron a la SPA redirigen a su ruta nueva', () => {
    expect(redireccionAntigua('/tableros/bateria-indicadores/index.html')).toBe(
      '/tableros/bateria-indicadores',
    );
    expect(redireccionAntigua('/Tableros/Bateria-Indicadores/INDEX.HTML')).toBe(
      '/tableros/bateria-indicadores',
    );
    expect(redireccionAntigua('/tableros/bateria-indicadores')).toBeNull();
    expect(
      redireccionAntigua('/tableros/bateria-indicadores/datos/vistas.js'),
    ).toBeNull();
    expect(redireccionAntigua('/tableros/pertinencia/index.html')).toBeNull();
    expect(redireccionAntigua('/index.html')).toBeNull();
  });
});
