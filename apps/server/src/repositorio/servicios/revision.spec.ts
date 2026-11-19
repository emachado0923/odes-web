import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES_REPOSITORIO } from '../api-repositorio.js';
import { DIRECTORIO_SQL } from '../bd/esquema.js';
import { claveNormalizada } from '../dominio/normalizacion.js';
import { contarPalabras } from '../dominio/validacion.js';
import type { RegistroDocumento } from './registros.js';
import { diferencias, esquemaRevision, incompletos, type Revision } from './revision.js';

type CambioDocumento = Revision['documentos'][number];

/** Texto de `n` palabras separadas por un espacio. */
function palabras(n: number): string {
  return Array.from({ length: n }, (_, i) => `palabra${i + 1}`).join(' ');
}

const SEIS_CLAVES = ['Educación superior', 'Acceso', 'Permanencia', 'Medellín', 'Becas', 'Deserción'];
const ID = 'boletin-30-prueba-2024';

/** Un documento publicado con todo lo necesario para estarlo. */
function registro(cambios: Partial<RegistroDocumento> = {}): RegistroDocumento {
  return {
    id: ID,
    orden: 1,
    titulo: 'Boletín de prueba',
    subtitulo: null,
    descripcion: palabras(30),
    categoriaId: 1,
    categoria: 'Boletín',
    numero: '30',
    anio: 2024,
    mes: 5,
    idioma: 'es',
    tipo: 'documento',
    claves: [...SEIS_CLAVES],
    urlVerExterna: 'https://sapiencia.gov.co/boletin-30.pdf',
    urlEntradaBlog: null,
    nota: null,
    permiteDescarga: false,
    equivalenteEnEspanol: null,
    notasInternas: null,
    publicado: true,
    urlOriginal: null,
    archivo: null,
    portada: null,
    miniatura: null,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
    actualizadoEn: new Date('2026-01-01T00:00:00Z'),
    actualizadoPor: null,
    ...cambios,
  };
}

describe('diferencias: qué cambia una revisión en un documento', () => {
  it('sin campos (solo el id) no cambia nada', () => {
    expect(diferencias(registro(), { id: ID })).toEqual([]);
  });

  it('los mismos valores no son cambios; las palabras clave se comparan sin tildes ni mayúsculas', () => {
    const actual = registro();
    const igual: CambioDocumento = {
      id: ID,
      categoria: 'Boletín',
      publicado: true,
      anio: 2024,
      mes: 5,
      descripcion: palabras(30),
      claves: ['EDUCACION SUPERIOR', 'acceso', 'Permanencia', 'medellin', 'BECAS', 'desercion'],
    };
    expect(diferencias(actual, igual)).toEqual([]);
  });

  it('cada campo que cambia, con su nombre y de qué a qué (∅ = vacío; las palabras clave, separadas por |)', () => {
    const actual = registro({ mes: null, descripcion: null, claves: ['Acceso'] });
    const cambio: CambioDocumento = {
      id: ID,
      categoria: 'Estudio',
      publicado: false,
      anio: 2023,
      mes: 11,
      descripcion: 'Nueva descripción.',
      claves: ['Acceso', 'Becas'],
    };
    expect(diferencias(actual, cambio)).toEqual([
      { campo: 'categoría', antes: 'Boletín', despues: 'Estudio' },
      { campo: 'publicado', antes: 'true', despues: 'false' },
      { campo: 'año', antes: '2024', despues: '2023' },
      { campo: 'mes', antes: '∅', despues: '11' },
      { campo: 'descripción', antes: '∅', despues: 'Nueva descripción.' },
      { campo: 'palabras clave', antes: 'Acceso', despues: 'Acceso | Becas' },
    ]);
  });

  it('solo cuenta lo que trae: un campo que falta queda como está', () => {
    const actual = registro({ publicado: false, descripcion: null, claves: [] });
    expect(diferencias(actual, { id: ID, anio: 2024 })).toEqual([]);
    expect(diferencias(actual, { id: ID, publicado: true })).toEqual([{ campo: 'publicado', antes: 'false', despues: 'true' }]);
  });

  it('quitar el mes (null) es un cambio', () => {
    expect(diferencias(registro({ mes: 5 }), { id: ID, mes: null })).toEqual([{ campo: 'mes', antes: '5', despues: '∅' }]);
    expect(diferencias(registro({ mes: null }), { id: ID, mes: null })).toEqual([]);
  });

  it('el orden de las palabras clave cuenta (es el de la tarjeta)', () => {
    expect(diferencias(registro({ claves: ['Acceso', 'Becas'] }), { id: ID, claves: ['Becas', 'Acceso'] })).toEqual([
      { campo: 'palabras clave', antes: 'Acceso | Becas', despues: 'Becas | Acceso' },
    ]);
    // Quitarlas todas también es un cambio (la lista vacía se muestra vacía).
    expect(diferencias(registro({ claves: ['Acceso'] }), { id: ID, claves: [] })).toEqual([
      { campo: 'palabras clave', antes: 'Acceso', despues: '' },
    ]);
  });

  it('la descripción se compara tal cual: cambiar una tilde o un punto es un cambio', () => {
    const actual = registro({ descripcion: 'El boletín presenta cifras de acceso.' });
    expect(diferencias(actual, { id: ID, descripcion: 'El boletin presenta cifras de acceso.' })).toHaveLength(1);
    expect(diferencias(actual, { id: ID, descripcion: 'El boletín presenta cifras de acceso' })).toHaveLength(1);
  });
});

describe('incompletos: publicados que no cumplen lo necesario para estarlo', () => {
  it('vacío si todo lo publicado está completo (o no hay nada)', () => {
    expect(incompletos([])).toEqual([]);
    expect(incompletos([registro(), registro({ id: 'otro', descripcion: palabras(25) })])).toEqual([]);
  });

  it('un borrador (despublicado) puede quedar incompleto', () => {
    const borrador = registro({ id: 'borrador', publicado: false, tipo: 'tablero', anio: null, descripcion: null, claves: [] });
    expect(incompletos([borrador])).toEqual([]);
  });

  it('cada publicado incompleto sale con su id y sus problemas, en el orden de la lista', () => {
    const lista = [
      registro({ id: 'tablero-publicado', tipo: 'tablero', anio: null, descripcion: null, claves: ['Uno'] }),
      registro({ id: 'completo' }),
      registro({ id: 'descripcion-corta', descripcion: palabras(24) }),
      registro({ id: 'cinco-claves', claves: SEIS_CLAVES.slice(0, 5) }),
      registro({ id: 'borrador', publicado: false, descripcion: null }),
    ];
    expect(incompletos(lista)).toEqual([
      'tablero-publicado: Para publicar, indique el año de publicación. ' +
        'Para publicar, escriba la descripción (unas 30 palabras). ' +
        'Para publicar, el documento necesita 6 palabras clave (tiene 1).',
      'descripcion-corta: La descripción tiene 24 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
      'cinco-claves: Para publicar, el documento necesita 6 palabras clave (tiene 5).',
    ]);
  });
});

describe('esquemaRevision: el archivo de la revisión', () => {
  it('un archivo válido: limpia los espacios de los textos y no inventa los campos que no trae', () => {
    const revision = esquemaRevision.parse({
      titulo: '  Revisión   de prueba ',
      documentos: [
        {
          id: 'boletin-30',
          categoria: ' Estudio  ',
          publicado: true,
          anio: 2023,
          mes: null,
          descripcion: ` ${palabras(30).replaceAll(' ', '  \n')} `,
          claves: ['  Acceso ', 'Educación\nsuperior'],
        },
        { id: 'tablero-1', publicado: false },
      ],
      categoriasQuitar: [' Informe   dinámico '],
    });
    expect(revision).toEqual({
      titulo: 'Revisión de prueba',
      documentos: [
        {
          id: 'boletin-30',
          categoria: 'Estudio',
          publicado: true,
          anio: 2023,
          mes: null,
          descripcion: palabras(30),
          claves: ['Acceso', 'Educación superior'],
        },
        { id: 'tablero-1', publicado: false },
      ],
      categoriasQuitar: ['Informe dinámico'],
    });
    // Lo que no viene no aparece (ni como undefined): aplicarRevision lo deja como está.
    expect(Object.keys(revision.documentos[1])).toEqual(['id', 'publicado']);
  });

  it('categoriasQuitar es opcional y los límites del contrato se aceptan justos', () => {
    const revision = esquemaRevision.parse({
      titulo: 't'.repeat(200),
      documentos: [
        {
          id: 'x'.repeat(120),
          anio: 1900,
          mes: 12,
          descripcion: 'd'.repeat(LIMITES_REPOSITORIO.maxDescripcion),
          claves: ['c'.repeat(80), 'b', 'c', 'd', 'e', 'f'],
          categoria: 'k'.repeat(100),
        },
        { id: 'otro', anio: 2100, mes: 1, claves: [] },
      ],
    });
    expect(revision.categoriasQuitar).toBeUndefined();
    expect(revision.documentos).toHaveLength(2);
  });

  const valida = { titulo: 'Revisión', documentos: [{ id: 'boletin-30' }] };
  const conDocumento = (documento: Record<string, unknown>) => ({ ...valida, documentos: [{ id: 'boletin-30', ...documento }] });

  it.each<[string, unknown]>([
    ['no es un objeto', []],
    ['sin título', { documentos: valida.documentos }],
    ['título en blanco', { ...valida, titulo: '   ' }],
    ['título de más de 200 caracteres', { ...valida, titulo: 't'.repeat(201) }],
    ['sin documentos', { titulo: 'Revisión' }],
    ['lista de documentos vacía', { ...valida, documentos: [] }],
    ['una clave desconocida arriba', { ...valida, autor: 'Observatorio' }],
    ['un campo que la revisión no cambia (título)', conDocumento({ titulo: 'Otro título' })],
    ['un campo que la revisión no cambia (tipo)', conDocumento({ tipo: 'documento' })],
    ['documento sin id', { ...valida, documentos: [{ anio: 2023 }] }],
    ['id vacío', { ...valida, documentos: [{ id: '' }] }],
    ['id de más de 120 caracteres', { ...valida, documentos: [{ id: 'x'.repeat(121) }] }],
    ['año antes de 1900', conDocumento({ anio: 1899 })],
    ['año después de 2100', conDocumento({ anio: 2101 })],
    ['año con decimales', conDocumento({ anio: 2023.5 })],
    ['año como texto', conDocumento({ anio: '2023' })],
    ['año null (el año no se puede quitar)', conDocumento({ anio: null })],
    ['mes 0', conDocumento({ mes: 0 })],
    ['mes 13', conDocumento({ mes: 13 })],
    ['publicado como texto', conDocumento({ publicado: 'true' })],
    ['publicado como número', conDocumento({ publicado: 1 })],
    ['descripción vacía', conDocumento({ descripcion: '' })],
    ['descripción en blanco', conDocumento({ descripcion: ' \n ' })],
    ['descripción null (la revisión no borra descripciones)', conDocumento({ descripcion: null })],
    ['descripción de más de 700 caracteres', conDocumento({ descripcion: 'd'.repeat(701) })],
    ['más de 6 palabras clave', conDocumento({ claves: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })],
    ['una palabra clave en blanco', conDocumento({ claves: ['a', '  '] })],
    ['una palabra clave de más de 80 caracteres', conDocumento({ claves: ['c'.repeat(81)] })],
    ['palabras clave que no son una lista', conDocumento({ claves: 'a, b, c' })],
    ['categoría en blanco', conDocumento({ categoria: ' ' })],
    ['categoría de más de 100 caracteres', conDocumento({ categoria: 'k'.repeat(101) })],
    ['una categoría en blanco para quitar', { ...valida, categoriasQuitar: [''] }],
  ])('rechaza: %s', (_caso, archivo) => {
    expect(esquemaRevision.safeParse(archivo).success).toBe(false);
  });

  it('rechaza un documento repetido y dice cuál', () => {
    const resultado = esquemaRevision.safeParse({
      titulo: 'Revisión',
      documentos: [{ id: 'boletin-30', anio: 2023 }, { id: 'estudio-1' }, { id: 'boletin-30', mes: 5 }],
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((problema) => problema.message)).toEqual([
      'Documento repetido en la revisión: boletin-30',
    ]);
  });
});

const REVISION_12_NOV = join(DIRECTORIO_SQL, 'revisiones', '2026-11-12-comentarios-observatorio.json');
const revision = (): Revision => esquemaRevision.parse(JSON.parse(readFileSync(REVISION_12_NOV, 'utf8')));

describe.skipIf(!existsSync(REVISION_12_NOV))('la revisión del 12 de noviembre de 2026 (db/repositorio/revisiones)', () => {

  it('es un archivo válido', () => {
    expect(revision().documentos.length).toBeGreaterThan(300);
  });

  it('oculta los 64 tableros y la entrada de blog (comentario 4), con la descripción lista por si se vuelven a publicar', () => {
    const ocultos = revision().documentos.filter((d) => d.publicado === false);
    expect(ocultos).toHaveLength(65);
    expect(ocultos.filter((d) => !d.descripcion || d.claves?.length !== 6).map((d) => d.id)).toEqual([]);
  });

  it('cada descripción tiene de 25 a 35 palabras y cada lista de palabras clave, 6 distintas', () => {
    const { minimo, maximo } = LIMITES_REPOSITORIO.palabrasDescripcion;
    const problemas: string[] = [];
    for (const d of revision().documentos) {
      const n = contarPalabras(d.descripcion);
      if (d.descripcion !== undefined && (n < minimo || n > maximo)) problemas.push(`${d.id}: descripción de ${n} palabras`);
      if (d.claves !== undefined) {
        // Las repetidas (sin tildes ni mayúsculas) se guardarían una sola vez y no llegarían a 6.
        const distintas = new Set(d.claves.map(claveNormalizada)).size;
        if (distintas !== LIMITES_REPOSITORIO.clavesParaPublicar) problemas.push(`${d.id}: ${distintas} palabras clave distintas`);
      }
    }
    expect(problemas).toEqual([]);
  });
});
