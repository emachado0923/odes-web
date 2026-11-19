import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocumentoIndexable } from './indexacion/documento-indexable.js';
import { escribirIndice } from './indexacion/escritor-indice.js';
import type { FuenteRepositorio } from './indexacion/fuente.js';
import { indexar } from './indexacion/indexador.js';
import { OPCIONES_EXTRACCION_POR_DEFECTO } from './indexacion/extraccion.js';
import {
  RepositorioSqlite,
  type RegistroRepositorio,
} from './repositorio-sqlite.js';
import { crearConstructorUrl } from './url-documento.js';

// ── Índice de prueba ──────────────────────────────────────────────────────

function documento(
  parcial: Partial<DocumentoIndexable> &
    Pick<DocumentoIndexable, 'id' | 'orden'>,
): DocumentoIndexable {
  return {
    titulo: `Documento ${parcial.id}`,
    subtitulo: null,
    categoria: 'Boletín',
    numero: null,
    anio: 2020,
    mes: null,
    idioma: 'es',
    tipo: 'pdf',
    formato: 'pdf',
    claves: [],
    urlVer: `https://sapiencia.gov.co/${parcial.id}.pdf`,
    tieneArchivo: true,
    portada: `${parcial.id}.webp`,
    nota: null,
    equivalente: null,
    equivalenteId: null,
    paginas: [],
    paginasOcr: [],
    ...parcial,
  };
}

function relleno(tema: string, largo = 1300): string {
  const frase = `En esta página se analiza ${tema} con cifras y contexto de Medellín. `;
  return frase.repeat(Math.ceil(largo / frase.length)).slice(0, largo);
}

const DOCUMENTOS: DocumentoIndexable[] = [
  documento({
    id: 'boletin-5-desercion',
    orden: 4,
    titulo: 'Deserción en la educación superior',
    numero: '5',
    anio: 2017,
    claves: ['Deserción', 'Permanencia', 'Becas Tecnologías'],
    paginas: [
      'Boletín N.º 5 · Observatorio',
      relleno('la tasa de deserción por periodo, que fue de 9,1 %'),
      relleno('la permanencia de quienes reciben becas'),
    ],
  }),
  documento({
    id: 'tablero-matricula',
    orden: 1,
    titulo: 'Demanda y matrícula de las 3 IES del Distrito',
    categoria: 'Educación superior en cifras',
    anio: 2023,
    tipo: 'tablero',
    formato: null,
    claves: ['Matrícula', 'IES adscritas al Distrito'],
    urlVer: 'https://app.powerbi.com/view?r=abc',
    tieneArchivo: false,
  }),
  documento({
    id: 'infografia-en-dropout',
    orden: 3,
    titulo: 'Dropout of Sapiencia funds beneficiaries',
    categoria: 'Infografía',
    anio: null,
    idioma: 'en',
    formato: 'imagen',
    tipo: 'imagen',
    claves: ['Deserción'],
    equivalente: 'Deserción de beneficiarios de los Fondos (Infografía, 2020)',
    equivalenteId: 'infografia-desercion-beneficiarios',
    paginas: [
      'Dropout rate of Sapiencia funds beneficiaries between 2015 and 2019 was low.',
    ],
    paginasOcr: [1],
  }),
  documento({
    id: 'infografia-desercion-beneficiarios',
    orden: 2,
    titulo: 'Deserción de beneficiarios de los Fondos',
    categoria: 'Infografía',
    anio: 2020,
    claves: ['Deserción', 'Fondos Sapiencia'],
    equivalente: 'Dropout of Sapiencia funds beneficiaries',
    equivalenteId: 'infografia-en-dropout',
    paginas: [
      'La deserción de los beneficiarios de los Fondos Sapiencia entre 2015 y 2019.',
    ],
  }),
  documento({
    id: 'estudio-largo',
    orden: 5,
    titulo: 'Estudio de seguimiento a bachilleres',
    categoria: 'Estudio',
    anio: 2022,
    claves: ['Seguimiento a bachilleres'],
    paginas: Array.from({ length: 12 }, (_, i) =>
      relleno(`la deserción en la cohorte ${i + 1}`, 1700),
    ),
  }),
  documento({
    id: 'boletin-19-fe-erratas',
    orden: 6,
    titulo: 'Fe de erratas del Boletín N.º 19',
    numero: '19',
    anio: 2021,
    claves: ['Marco normativo'],
    paginas: [relleno('el marco normativo de la educación postsecundaria')],
  }),
  documento({
    id: 'estudio-paginas-enormes',
    orden: 7,
    titulo: 'Anexo estadístico',
    categoria: 'Estudio',
    anio: 2019,
    paginas: Array.from({ length: 4 }, (_, i) =>
      relleno(`el anexo ${i + 1}`, 15_000),
    ),
  }),
];

let directorio: string;
let rutaIndice: string;
let repositorio: RepositorioSqlite;
const avisos: string[] = [];
const registro: RegistroRepositorio = {
  log: () => {},
  warn: (mensaje) => avisos.push(mensaje),
};

function escribir(ruta: string, documentos = DOCUMENTOS): void {
  escribirIndice(ruta, {
    generado: '2026-10-08T12:00:00.000Z',
    fuente: 'prueba',
    versionFuente: '1',
    categorias: [
      'Boletín',
      'Estudio',
      'Infografía',
      'Educación superior en cifras',
    ],
    documentos,
  });
}

beforeAll(() => {
  directorio = mkdtempSync(join(tmpdir(), 'odes-indice-'));
  rutaIndice = join(directorio, 'indice.sqlite');
  escribir(rutaIndice);
  repositorio = new RepositorioSqlite({ rutaIndice, registro });
});

afterAll(() => {
  repositorio.cerrar();
  rmSync(directorio, { recursive: true, force: true });
});

// ── Pruebas ───────────────────────────────────────────────────────────────

describe('escribirIndice', () => {
  it('escribe de forma atómica (sin temporales al terminar)', () => {
    expect(readdirSync(directorio)).toEqual(['indice.sqlite']);
  });
});

describe('estado y categorías', () => {
  it('informa los conteos del índice', () => {
    expect(repositorio.estado()).toMatchObject({
      disponible: true,
      documentos: DOCUMENTOS.length,
      documentosConTexto: DOCUMENTOS.length - 1,
      generado: '2026-10-08T12:00:00.000Z',
    });
    expect(repositorio.estado().fragmentos).toBeGreaterThan(DOCUMENTOS.length);
  });

  it('devuelve las categorías en el orden del repositorio', () => {
    expect(repositorio.categorias()).toEqual([
      'Boletín',
      'Estudio',
      'Infografía',
      'Educación superior en cifras',
    ]);
  });
});

describe('buscar', () => {
  it('encuentra fragmentos con su página y el enlace a esa página', () => {
    const fragmentos = repositorio.buscar('tasa de deserción por periodo');
    expect(fragmentos[0]?.documento.id).toBe('boletin-5-desercion');
    const conPagina = fragmentos.filter(
      (f) => f.documento.tipo === 'pdf' && f.paginaInicio !== null,
    );
    expect(conPagina.length).toBeGreaterThan(0);
    for (const fragmento of conPagina) {
      expect(fragmento.url).toBe(
        `${fragmento.documento.url}#page=${fragmento.paginaInicio}`,
      );
    }
    const conTasa = fragmentos.find((f) => f.texto.includes('9,1 %'))!;
    expect(conTasa.paginaInicio).toBeLessThanOrEqual(2);
    expect(conTasa.paginaFin).toBeGreaterThanOrEqual(2);
  });

  it('ordena por puntaje sin subir nunca', () => {
    const puntajes = repositorio
      .buscar('deserción', {}, 20)
      .map((f) => f.puntaje);
    expect(puntajes.length).toBeGreaterThan(3);
    for (let i = 1; i < puntajes.length; i++)
      expect(puntajes[i]).toBeLessThanOrEqual(puntajes[i - 1]!);
  });

  it('encuentra los tableros por su ficha (sin páginas, con el enlace del documento)', () => {
    const [ficha] = repositorio.buscar('matrícula IES');
    expect(ficha?.documento.id).toBe('tablero-matricula');
    expect(ficha).toMatchObject({
      paginaInicio: null,
      paginaFin: null,
      url: 'https://app.powerbi.com/view?r=abc',
    });
    expect(ficha?.texto).toContain('Tablero interactivo de Power BI');
    expect(ficha?.texto).toContain(
      'Palabras clave: Matrícula, IES adscritas al Distrito',
    );
  });

  it('prefiere el texto a la ficha cuando el documento tiene texto', () => {
    const fragmentos = repositorio.buscar('fe de erratas');
    expect(fragmentos[0]?.documento.id).toBe('boletin-19-fe-erratas');
    expect(fragmentos[0]?.paginaInicio).toBe(1);
  });

  it('limita los fragmentos por documento (diversidad)', () => {
    const fragmentos = repositorio.buscar('deserción cohorte', {}, 20);
    const delEstudio = fragmentos.filter(
      (f) => f.documento.id === 'estudio-largo',
    );
    expect(delEstudio.length).toBeGreaterThan(0);
    expect(delEstudio.length).toBeLessThanOrEqual(3);
    const primeros = repositorio.buscar('deserción', {}, 8);
    const porDocumento = new Map<string, number>();
    for (const f of primeros)
      porDocumento.set(
        f.documento.id,
        (porDocumento.get(f.documento.id) ?? 0) + 1,
      );
    expect(Math.max(...porDocumento.values())).toBeLessThanOrEqual(3);
  });

  it('respeta el límite por defecto (8) y el máximo (20)', () => {
    expect(repositorio.buscar('medellín').length).toBeLessThanOrEqual(8);
    expect(repositorio.buscar('medellín', {}, 100).length).toBeLessThanOrEqual(
      20,
    );
    expect(repositorio.buscar('medellín', {}, 0).length).toBeGreaterThan(0);
  });

  it('filtra por categoría (sin importar tildes ni plurales)', () => {
    const fragmentos = repositorio.buscar(
      'deserción',
      { categorias: ['infografías'] },
      20,
    );
    expect(fragmentos.length).toBeGreaterThan(0);
    expect(
      fragmentos.every((f) => f.documento.categoria === 'Infografía'),
    ).toBe(true);
    expect(
      repositorio.buscar('deserción', { categorias: ['No existe'] }),
    ).toEqual([]);
  });

  it('filtra por años y deja fuera los documentos sin fecha', () => {
    const fragmentos = repositorio.buscar('deserción', { anioDesde: 2018 }, 20);
    expect(fragmentos.length).toBeGreaterThan(0);
    for (const f of fragmentos) {
      expect(f.documento.anio).not.toBe('S. F.');
      expect(Number(f.documento.anio)).toBeGreaterThanOrEqual(2018);
    }
    // Un rango invertido se corrige (2021-2017 = 2017-2021).
    const invertido = repositorio.buscar(
      'deserción',
      { anioDesde: 2021, anioHasta: 2017 },
      20,
    );
    expect(invertido.length).toBeGreaterThan(0);
    for (const f of invertido) {
      expect(Number(f.documento.anio)).toBeGreaterThanOrEqual(2017);
      expect(Number(f.documento.anio)).toBeLessThanOrEqual(2021);
    }
  });

  it('filtra por idioma y no repite un documento con su traducción', () => {
    const ingles = repositorio.buscar('deserción beneficiarios', {
      idioma: 'en',
    });
    expect(ingles.map((f) => f.documento.id)).toEqual([
      'infografia-en-dropout',
    ]);
    const todos = repositorio
      .buscar('deserción beneficiarios fondos', {}, 20)
      .map((f) => f.documento.id);
    expect(todos).toContain('infografia-desercion-beneficiarios');
    expect(todos).not.toContain('infografia-en-dropout');
    const enIngles = repositorio
      .buscar('dropout funds beneficiaries', {}, 20)
      .map((f) => f.documento.id);
    expect(enIngles[0]).toBe('infografia-en-dropout');
    expect(enIngles).not.toContain('infografia-desercion-beneficiarios');
  });

  it('completa con resultados parciales (O) después de los completos (Y)', () => {
    const fragmentos = repositorio.buscar('deserción xilófono');
    expect(fragmentos.length).toBeGreaterThan(0);
  });

  it('no se rompe con sintaxis de FTS5 ni texto raro', () => {
    for (const texto of [
      'deserción" OR "x',
      'titulo:*',
      'NEAR(a b)',
      ')(',
      '',
      'de la',
      '\u0000',
    ]) {
      expect(() => repositorio.buscar(texto)).not.toThrow();
    }
    expect(repositorio.buscar('de la')).toEqual([]);
    expect(repositorio.buscar(undefined as unknown as string)).toEqual([]);
  });

  it('entrega copias: modificar un resultado no cambia el índice', () => {
    const [primero] = repositorio.buscar('fe de erratas');
    primero!.documento.titulo = 'cambiado';
    primero!.documento.claves.push('x');
    expect(repositorio.obtener('boletin-19-fe-erratas')).toMatchObject({
      titulo: 'Fe de erratas del Boletín N.º 19',
      claves: ['Marco normativo'],
    });
  });
});

describe('listar', () => {
  it('lista del más reciente al más antiguo con el total', () => {
    const { total, documentos } = repositorio.listar({}, 3);
    expect(total).toBe(DOCUMENTOS.length);
    expect(documentos.map((d) => d.id)).toEqual([
      'tablero-matricula',
      'infografia-desercion-beneficiarios',
      'infografia-en-dropout',
    ]);
  });

  it('busca en título y palabras clave, no en el texto completo', () => {
    expect(
      repositorio.listar({ texto: 'erratas' }).documentos.map((d) => d.id),
    ).toEqual(['boletin-19-fe-erratas']);
    expect(repositorio.listar({ texto: 'cohorte' }).total).toBe(0);
  });

  it('filtra por palabra clave, categoría, años e idioma', () => {
    expect(repositorio.listar({ palabraClave: 'deserción' }).total).toBe(3);
    expect(
      repositorio.listar({ palabraClave: 'becas' }).documentos.map((d) => d.id),
    ).toEqual(['boletin-5-desercion']);
    expect(repositorio.listar({ categorias: ['Estudios'] }).total).toBe(2);
    expect(
      repositorio.listar({ anioDesde: 2021 }).documentos.map((d) => d.id),
    ).toEqual(['tablero-matricula', 'estudio-largo', 'boletin-19-fe-erratas']);
    expect(repositorio.listar({ idioma: 'en' }).total).toBe(1);
  });
});

describe('leer y obtener', () => {
  it('devuelve el texto por páginas con su enlace', () => {
    const paginas = repositorio.leer('boletin-5-desercion')!;
    expect(paginas.map((p) => p.paginaInicio)).toEqual([1, 2, 3]);
    expect(paginas[1]!.url).toBe(
      'https://sapiencia.gov.co/boletin-5-desercion.pdf#page=2',
    );
    expect(
      repositorio.leer('boletin-5-desercion', 2, 2)!.map((p) => p.paginaInicio),
    ).toEqual([2]);
    expect(
      repositorio.leer('boletin-5-desercion', 3, 2)!.map((p) => p.paginaInicio),
    ).toEqual([2, 3]);
    expect(repositorio.leer('boletin-5-desercion', 10)).toEqual([]);
  });

  it('acota el total de caracteres de una lectura', () => {
    const paginas = repositorio.leer('estudio-paginas-enormes')!;
    expect(paginas).toHaveLength(1);
    expect(paginas[0]!.texto.length).toBeLessThanOrEqual(15_000);
    expect(
      repositorio
        .leer('estudio-paginas-enormes', 2)!
        .map((p) => p.paginaInicio),
    ).toEqual([2]);
    const largas = repositorio.leer('estudio-largo')!;
    expect(
      largas.reduce((suma, p) => suma + p.texto.length, 0),
    ).toBeLessThanOrEqual(24_000);
  });

  it('null si no existe; lista vacía si no tiene texto', () => {
    expect(repositorio.leer('no-existe')).toBeNull();
    expect(repositorio.leer('tablero-matricula')).toEqual([]);
  });

  it('obtiene los metadatos según el contrato', () => {
    expect(repositorio.obtener('infografia-en-dropout')).toEqual({
      id: 'infografia-en-dropout',
      titulo: 'Dropout of Sapiencia funds beneficiaries',
      categoria: 'Infografía',
      anio: 'S. F.',
      claves: ['Deserción'],
      idioma: 'en',
      tipo: 'imagen',
      url: 'https://sapiencia.gov.co/infografia-en-dropout.pdf',
      portada: 'infografia-en-dropout.webp',
      textoIndexado: true,
      paginas: 1,
    });
    expect(repositorio.obtener('no-existe')).toBeNull();
  });
});

describe('plantilla de enlaces (ODES_URL_DOCUMENTO)', () => {
  it('se aplica a los documentos con archivo y no a los tableros', () => {
    const conPlantilla = new RepositorioSqlite({
      rutaIndice,
      registro,
      construirUrl: crearConstructorUrl('/api/repositorio/documentos/{id}/ver'),
    });
    try {
      expect(conPlantilla.obtener('boletin-5-desercion')?.url).toBe(
        '/api/repositorio/documentos/boletin-5-desercion/ver',
      );
      expect(conPlantilla.obtener('tablero-matricula')?.url).toBe(
        'https://app.powerbi.com/view?r=abc',
      );
      expect(conPlantilla.leer('boletin-5-desercion', 2, 2)?.[0]?.url).toBe(
        '/api/repositorio/documentos/boletin-5-desercion/ver#page=2',
      );
    } finally {
      conPlantilla.cerrar();
    }
  });
});

describe('índice ausente, dañado y recarga en caliente', () => {
  it('sin índice: no disponible, listas vacías y un solo aviso', () => {
    const propios: string[] = [];
    let reloj = 0;
    const ausente = new RepositorioSqlite({
      rutaIndice: join(directorio, 'no-existe.sqlite'),
      registro: { log: () => {}, warn: (m) => propios.push(m) },
      ahora: () => reloj,
    });
    expect(ausente.estado()).toEqual({
      disponible: false,
      documentos: 0,
      documentosConTexto: 0,
      fragmentos: 0,
      generado: null,
    });
    reloj += 60_000;
    expect(ausente.buscar('deserción')).toEqual([]);
    expect(ausente.listar({ texto: 'x' })).toEqual({
      total: 0,
      documentos: [],
    });
    expect(ausente.leer('boletin-5-desercion')).toBeNull();
    expect(ausente.obtener('boletin-5-desercion')).toBeNull();
    expect(ausente.categorias()).toEqual([]);
    expect(propios).toHaveLength(1);
    expect(propios[0]).toContain('npm run odes:indexar');
  });

  it('índice dañado: no disponible con aviso, sin lanzar', () => {
    const danado = join(directorio, 'danado.sqlite');
    writeFileSync(danado, 'esto no es una base de datos SQLite '.repeat(200));
    const propios: string[] = [];
    const repo = new RepositorioSqlite({
      rutaIndice: danado,
      registro: { log: () => {}, warn: (m) => propios.push(m) },
    });
    expect(repo.estado().disponible).toBe(false);
    expect(repo.buscar('deserción')).toEqual([]);
    expect(propios).toHaveLength(1);
  });

  it('recarga el índice cuando se reemplaza, como mucho cada intervalo', () => {
    const ruta = join(directorio, 'recarga.sqlite');
    let reloj = 1_000_000;
    const repo = new RepositorioSqlite({
      rutaIndice: ruta,
      registro: { log: () => {}, warn: () => {} },
      ahora: () => reloj,
    });
    try {
      expect(repo.estado().disponible).toBe(false);

      // Aparece el índice: se carga en la siguiente consulta pasado el intervalo.
      escribir(ruta, DOCUMENTOS.slice(0, 2));
      reloj += 10_000;
      expect(repo.estado().disponible).toBe(false);
      reloj += 25_000;
      expect(repo.estado()).toMatchObject({ disponible: true, documentos: 2 });

      // Se reemplaza (rename atómico): se recarga.
      escribir(ruta, DOCUMENTOS);
      reloj += 31_000;
      expect(repo.estado().documentos).toBe(DOCUMENTOS.length);
      expect(repo.buscar('fe de erratas')[0]?.documento.id).toBe(
        'boletin-19-fe-erratas',
      );

      // Si el reemplazo está dañado, se sigue usando el anterior.
      rmSync(ruta);
      writeFileSync(ruta, 'basura '.repeat(500));
      reloj += 31_000;
      expect(repo.estado()).toMatchObject({
        disponible: true,
        documentos: DOCUMENTOS.length,
      });
    } finally {
      repo.cerrar();
    }
  });
});

describe('indexar (sin herramientas externas)', () => {
  it('con --solo-metadatos crea fichas para todo el catálogo', async () => {
    const destino = join(directorio, 'metadatos.sqlite');
    const fuente: FuenteRepositorio = {
      leer: async () => ({
        descripcion: 'fuente de prueba',
        version: '1',
        avisos: [],
        registros: [
          {
            metadatos: {
              id: 'tablero-uno',
              orden: 1,
              titulo: 'Tablero de inscripciones',
              subtitulo: null,
              categoria: 'Educación superior en cifras',
              numero: null,
              anio: 2023,
              mes: 4,
              idioma: 'es',
              tipo: 'tablero',
              claves: ['Inscripciones'],
              urlVer: 'https://app.powerbi.com/view?r=uno',
              nota: null,
              equivalenteEnEspanol: null,
              archivoTipo: null,
            },
            archivo: null,
            portada: null,
          },
        ],
      }),
    };
    const resultado = await indexar({
      fuente,
      rutaIndice: destino,
      soloMetadatos: true,
      extraccion: OPCIONES_EXTRACCION_POR_DEFECTO,
      directorioCache: null,
      reutilizarCache: false,
      concurrencia: 1,
      directorioMiniaturas: join(directorio, 'miniaturas'),
      generarMiniaturas: false,
      registro: () => {},
    });
    expect(resultado.escritura).toMatchObject({
      documentos: 1,
      documentosConTexto: 0,
      fichas: 1,
    });
    expect(existsSync(destino)).toBe(true);
    const repo = new RepositorioSqlite({ rutaIndice: destino, registro });
    try {
      const [ficha] = repo.buscar('inscripciones');
      expect(ficha?.texto).toContain('Fecha: abril de 2023');
      expect(repo.obtener('tablero-uno')?.portada).toBeUndefined();
    } finally {
      repo.cerrar();
    }
  });
});
