import { describe, expect, it } from 'vitest';
import { RepositorioEnMemoria } from '../../../test/odes-apoyo.js';
import { dividirEnBloques, fuenteAuxiliar, fuenteDeDocumento, RegistroFuentes } from './fuentes.js';

describe('dividirEnBloques', () => {
  it('párrafos como bloques, uniendo los muy cortos', () => {
    const texto = 'Título\n\nPrimer párrafo con suficiente texto para ser un bloque por sí mismo. '.repeat(1) +
      'x'.repeat(200) + '\n\nSegundo párrafo ' + 'y'.repeat(200);
    const bloques = dividirEnBloques(texto);
    expect(bloques).toHaveLength(2);
    expect(bloques[0]!.startsWith('Título\nPrimer párrafo')).toBe(true);
  });

  it('corta los párrafos largos por oraciones sin pasar de ~700 caracteres', () => {
    const oracion = 'Esta es una oración de prueba con algunas palabras. ';
    const bloques = dividirEnBloques(oracion.repeat(60));
    expect(bloques.length).toBeGreaterThan(3);
    for (const bloque of bloques) expect(bloque.length).toBeLessThanOrEqual(700);
  });

  it('nunca devuelve bloques vacíos y limita la cantidad', () => {
    expect(dividirEnBloques('   \n\n  ')).toEqual([]);
    const muchos = Array.from({ length: 40 }, (_, i) => `Párrafo ${i} ${'z'.repeat(300)}`).join('\n\n');
    expect(dividirEnBloques(muchos).length).toBeLessThanOrEqual(14);
  });
});

const cita = (indice: number, source: string, inicio = 1, fin = 2) => ({
  type: 'search_result_location' as const,
  cited_text: 'texto',
  source,
  title: null,
  search_result_index: indice,
  start_block_index: inicio,
  end_block_index: fin,
});

describe('RegistroFuentes', () => {
  const repositorio = new RepositorioEnMemoria();
  const boletin = repositorio.obtener('boletin-29-resultados-preliminares-2024')!;
  const estudio = repositorio.obtener('estudio-desercion-2023')!;

  function registro() {
    const r = new RegistroFuentes();
    r.registrar(fuenteDeDocumento(boletin, 1, 1, 'u1', 'Párrafo uno con el dato del 41 %. ' + 'a'.repeat(200)));
    r.registrar(fuenteAuxiliar('odes:catalogo/total', 'Total', 'Coinciden 3'));
    r.registrar(fuenteDeDocumento(estudio, 2, 2, 'u2', 'Factores de deserción. ' + 'b'.repeat(200)));
    r.registrar(fuenteDeDocumento(boletin, 1, 1, 'u1-otra-vez', 'Mismo documento y página. ' + 'c'.repeat(200)));
    return r;
  }

  it('asigna índices desde 1 y reutiliza el del mismo documento y páginas', () => {
    const r = registro();
    expect(r.citar(cita(2, 'u2'))?.indice).toBe(1);
    expect(r.citar(cita(0, 'u1'))?.indice).toBe(2);
    expect(r.citar(cita(3, 'u1-otra-vez'))?.indice).toBe(2);
    expect(r.citar(cita(2, 'u2'))?.indice).toBe(1);
  });

  it('el evento lleva el documento, las páginas, la URL y el texto citado sin el encabezado', () => {
    const evento = registro().citar(cita(0, 'u1', 0, 2));
    expect(evento).toMatchObject({
      tipo: 'cita',
      indice: 1,
      documento: { id: boletin.id, titulo: boletin.titulo, categoria: 'Boletín', anio: '2024', portada: 'boletin-29.jpg' },
      paginaInicio: 1,
      paginaFin: 1,
      url: 'u1',
    });
    expect(evento?.textoCitado.startsWith('Párrafo uno con el dato del 41 %.')).toBe(true);
  });

  it('ignora fuentes auxiliares e índices desconocidos; si el índice no cuadra busca por URL', () => {
    const r = registro();
    expect(r.citar(cita(1, 'odes:catalogo/total', 0, 1))).toBeNull();
    expect(r.citar(cita(99, 'desconocida'))).toBeNull();
    expect(r.citar(cita(99, 'u2'))?.documento.id).toBe(estudio.id);
  });
});
