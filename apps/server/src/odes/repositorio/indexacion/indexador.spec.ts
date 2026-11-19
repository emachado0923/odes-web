import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { leerMetaIndice } from '../meta-indice.js';
import { RepositorioSqlite } from '../repositorio-sqlite.js';
import { VERSION_CACHE } from './cache-extraccion.js';
import { OPCIONES_EXTRACCION_POR_DEFECTO } from './extraccion.js';
import {
  type ArchivoBajoDemanda,
  ErrorArchivoFuente,
  type FuenteRepositorio,
  type LecturaFuente,
  type MetadatosFuente,
  type RegistroFuente,
} from './fuente.js';
import { ErrorIndexacion, indexar, type OpcionesIndexacion } from './indexador.js';

/**
 * Indexador con una fuente de archivos BAJO DEMANDA (como la base de datos
 * del repositorio): con la caché de extracción al día no se pide ningún
 * archivo; los errores de la fuente detienen la indexación sin tocar el
 * índice vigente; lo despublicado durante la indexación no entra.
 */

const directorios: string[] = [];
afterEach(() => {
  for (const directorio of directorios.splice(0)) rmSync(directorio, { recursive: true, force: true });
});

function carpeta(): string {
  const directorio = mkdtempSync(join(tmpdir(), 'odes-indexador-'));
  directorios.push(directorio);
  return directorio;
}

const sha256 = (datos: Buffer | string): string => createHash('sha256').update(datos).digest('hex');

function hay(comando: string): boolean {
  try {
    execFileSync(comando, ['-v'], { stdio: 'ignore' });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

/** PDF mínimo válido con una página de texto (Helvetica, ASCII). */
function pdfConTexto(lineas: readonly string[]): Buffer {
  const contenido = `BT /F1 11 Tf 50 750 Td 14 TL ${lineas.map((l) => `(${l}) '`).join(' ')} ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((objeto, i) => {
    posiciones.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const posicion of posiciones) pdf += `${String(posicion).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const TEXTO_LARGO =
  'La desercion anual en educacion superior en Medellin fue del 9,8 por ciento en 2023 segun el Observatorio. ';

function metadatos(id: string, extra: Partial<MetadatosFuente> = {}): MetadatosFuente {
  return {
    id,
    orden: 1,
    titulo: `Documento ${id}`,
    subtitulo: null,
    categoria: 'Boletín',
    numero: null,
    anio: 2023,
    mes: null,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Deserción'],
    urlVer: `/api/repositorio/documentos/${id}/ver`,
    nota: null,
    equivalenteEnEspanol: null,
    archivoTipo: 'application/pdf',
    urlMiniatura: `/api/repositorio/documentos/${id}/miniatura?v=0123456789abcdef`,
    ...extra,
  };
}

interface ArchivoFalso extends ArchivoBajoDemanda {
  obtenidos: number;
  liberados: number;
}

/** Archivo bajo demanda: `obtener` escribe `datos` en una carpeta (o lanza `falla`). */
function archivoFalso(id: string, datos: Buffer, falla: Error | null = null): ArchivoFalso {
  const directorio = carpeta();
  const archivo: ArchivoFalso = {
    nombre: `${id}.pdf`,
    sha256: sha256(datos),
    bytes: datos.length,
    obtenidos: 0,
    liberados: 0,
    obtener: async () => {
      archivo.obtenidos += 1;
      if (falla) throw falla;
      const ruta = join(directorio, `${id}.pdf`);
      writeFileSync(ruta, datos);
      return ruta;
    },
    liberar: async () => {
      archivo.liberados += 1;
      rmSync(join(directorio, `${id}.pdf`), { force: true });
    },
  };
  return archivo;
}

/** Entrada de la caché de extracción como la deja una indexación anterior. */
function precargarCache(directorio: string, datos: Buffer, paginas: string[]): void {
  mkdirSync(directorio, { recursive: true });
  writeFileSync(
    join(directorio, `${sha256(datos)}.json`),
    JSON.stringify({ version: VERSION_CACHE, idiomasOcr: OPCIONES_EXTRACCION_POR_DEFECTO.idiomasOcr, nativas: paginas, ocr: {} }),
  );
}

class FuenteFalsa implements FuenteRepositorio {
  vigentes: ReadonlySet<string> | null = null;
  constructor(readonly registros: RegistroFuente[]) {}
  async leer(): Promise<LecturaFuente> {
    return {
      descripcion: 'base de prueba',
      version: '42',
      registros: this.registros,
      avisos: [],
      origen: 'mysql',
      huella: 'h'.repeat(64),
    };
  }
  async idsVigentes(): Promise<ReadonlySet<string>> {
    return this.vigentes ?? new Set(this.registros.map((r) => r.metadatos.id));
  }
}

function opciones(fuente: FuenteRepositorio, extra: Partial<OpcionesIndexacion> = {}): OpcionesIndexacion {
  const raiz = carpeta();
  return {
    fuente,
    rutaIndice: join(raiz, 'indice.sqlite'),
    soloMetadatos: false,
    extraccion: OPCIONES_EXTRACCION_POR_DEFECTO,
    directorioCache: join(raiz, 'cache'),
    reutilizarCache: true,
    concurrencia: 2,
    directorioMiniaturas: join(raiz, 'sin-miniaturas'),
    generarMiniaturas: false,
    registro: () => {},
    ...extra,
  };
}

describe('indexar con archivos bajo demanda', () => {
  it('con la caché al día no pide ningún archivo, y guarda enlaces, miniaturas y la huella de la fuente', async () => {
    const datos = Buffer.from('%PDF-1.4 contenido que no hace falta leer');
    const archivo = archivoFalso('boletin-uno', datos);
    const fuente = new FuenteFalsa([
      { metadatos: metadatos('boletin-uno'), archivo, portada: null },
      {
        metadatos: metadatos('tablero-dos', {
          orden: 2,
          tipo: 'tablero',
          archivoTipo: null,
          urlVer: 'https://app.powerbi.com/view?r=x',
          urlMiniatura: null,
        }),
        archivo: null,
        portada: null,
      },
    ]);
    const o = opciones(fuente);
    precargarCache(o.directorioCache!, datos, [TEXTO_LARGO.repeat(3), TEXTO_LARGO.repeat(2)]);

    const resultado = await indexar(o);
    expect(archivo.obtenidos).toBe(0);
    expect(resultado.desdeCache).toBe(1);
    expect(resultado.escritura.documentosConTexto).toBe(1);
    expect(resultado.origenFuente).toBe('mysql');
    expect(resultado.conUrlMiniatura).toBe(1);

    const meta = leerMetaIndice(o.rutaIndice);
    expect(meta).toMatchObject({ disponible: true, origen: 'mysql', huella: 'h'.repeat(64), versionFuente: '42', documentos: 2 });

    const repositorio = new RepositorioSqlite({ rutaIndice: o.rutaIndice });
    try {
      const boletin = repositorio.obtener('boletin-uno')!;
      expect(boletin.url).toBe('/api/repositorio/documentos/boletin-uno/ver');
      expect(boletin.urlMiniatura).toBe('/api/repositorio/documentos/boletin-uno/miniatura?v=0123456789abcdef');
      const tablero = repositorio.obtener('tablero-dos')!;
      expect(tablero.url).toBe('https://app.powerbi.com/view?r=x');
      expect(tablero.urlMiniatura).toBeUndefined();
      const [fragmento] = repositorio.buscar('desercion medellin');
      expect(fragmento?.url).toBe('/api/repositorio/documentos/boletin-uno/ver#page=1');
    } finally {
      repositorio.cerrar();
    }
  });

  it.skipIf(!hay('pdftotext'))('si falta en la caché, pide el archivo una vez, lo libera y la siguiente vez ya no lo pide', async () => {
    const datos = pdfConTexto([TEXTO_LARGO.slice(0, 80), TEXTO_LARGO.slice(20, 100), 'Matricula y permanencia en 2023.']);
    const archivo = archivoFalso('estudio-tres', datos);
    const fuente = new FuenteFalsa([{ metadatos: metadatos('estudio-tres'), archivo, portada: null }]);
    const o = opciones(fuente);

    const primera = await indexar(o);
    expect(primera.fallos).toEqual([]);
    expect(archivo.obtenidos).toBe(1);
    expect(archivo.liberados).toBe(1);
    expect(primera.escritura.documentosConTexto).toBe(1);
    expect(existsSync(join(o.directorioCache!, `${sha256(datos)}.json`))).toBe(true);

    const segunda = await indexar(o);
    expect(archivo.obtenidos).toBe(1);
    expect(segunda.desdeCache).toBe(1);
    expect(segunda.escritura.documentosConTexto).toBe(1);
  });

  it('un error de la fuente detiene la indexación y deja intacto el índice anterior', async () => {
    const buenos = Buffer.from('%PDF bueno');
    const bueno = archivoFalso('bueno', buenos);
    const o = opciones(new FuenteFalsa([{ metadatos: metadatos('bueno'), archivo: bueno, portada: null }]));
    precargarCache(o.directorioCache!, buenos, [TEXTO_LARGO.repeat(2)]);
    await indexar(o);
    const antes = statSync(o.rutaIndice);

    const caido = archivoFalso('caido', Buffer.from('%PDF otro'), new ErrorArchivoFuente('la base dejó de responder'));
    const fuente = new FuenteFalsa([
      { metadatos: metadatos('bueno'), archivo: bueno, portada: null },
      { metadatos: metadatos('caido', { orden: 2 }), archivo: caido, portada: null },
    ]);
    await expect(indexar({ ...o, fuente })).rejects.toThrow(/la base dejó de responder/);
    expect(caido.liberados).toBe(1);
    const despues = statSync(o.rutaIndice);
    expect(despues.ino).toBe(antes.ino);
    expect(despues.mtimeMs).toBe(antes.mtimeMs);
    expect(leerMetaIndice(o.rutaIndice).documentos).toBe(1);
  });

  it('un archivo que no se puede obtener (sin ser error de la fuente) deja ese documento con su ficha', async () => {
    const buenos = Buffer.from('%PDF bueno');
    const retirado = archivoFalso('retirado', Buffer.from('%PDF x'), new Error('el documento dejó de estar publicado'));
    const fuente = new FuenteFalsa([
      { metadatos: metadatos('bueno'), archivo: archivoFalso('bueno', buenos), portada: null },
      { metadatos: metadatos('retirado', { orden: 2 }), archivo: retirado, portada: null },
    ]);
    const o = opciones(fuente, { maxProporcionFallos: 0.5 });
    precargarCache(o.directorioCache!, buenos, [TEXTO_LARGO.repeat(2)]);
    const resultado = await indexar(o);
    expect(resultado.fallos).toEqual([{ id: 'retirado', motivo: 'el documento dejó de estar publicado' }]);
    expect(resultado.escritura.documentos).toBe(2);
    expect(retirado.liberados).toBe(1);
  });

  it('con demasiados fallos no reemplaza el índice (p. ej. faltan herramientas)', async () => {
    const fuente = new FuenteFalsa([
      { metadatos: metadatos('uno'), archivo: archivoFalso('uno', Buffer.from('a'), new Error('No se encontró "pdftotext".')), portada: null },
      { metadatos: metadatos('dos', { orden: 2 }), archivo: archivoFalso('dos', Buffer.from('b'), new Error('No se encontró "pdftotext".')), portada: null },
    ]);
    const o = opciones(fuente, { maxProporcionFallos: 0.5 });
    const error = await indexar(o).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorIndexacion);
    expect(String(error)).toMatch(/Falló la extracción de texto de 2 de 2 archivos.*No se encontró "pdftotext"/);
    expect(existsSync(o.rutaIndice)).toBe(false);

    // Sin tope (o con --solo-metadatos) se escribe igual.
    expect((await indexar({ ...o, maxProporcionFallos: null })).fallos).toHaveLength(2);
    expect(existsSync(o.rutaIndice)).toBe(true);
  });

  it('lo que se despublicó durante la indexación no entra en el índice', async () => {
    const fuente = new FuenteFalsa([
      { metadatos: metadatos('queda'), archivo: null, portada: null },
      { metadatos: metadatos('se-va', { orden: 2 }), archivo: null, portada: null },
    ]);
    fuente.vigentes = new Set(['queda']);
    const o = opciones(fuente);
    const resultado = await indexar(o);
    expect(resultado.retirados).toEqual(['se-va']);
    expect(resultado.escritura.documentos).toBe(1);
    const repositorio = new RepositorioSqlite({ rutaIndice: o.rutaIndice });
    try {
      expect(repositorio.obtener('se-va')).toBeNull();
      expect(repositorio.obtener('queda')).not.toBeNull();
    } finally {
      repositorio.cerrar();
    }
  });
});

describe('índices anteriores', () => {
  it('un índice sin la columna url_miniatura se sigue leyendo (sin miniatura de la base)', async () => {
    const o = opciones(new FuenteFalsa([{ metadatos: metadatos('viejo'), archivo: null, portada: null }]));
    await indexar(o);
    const db = new DatabaseSync(o.rutaIndice);
    db.exec('ALTER TABLE documentos DROP COLUMN url_miniatura');
    db.exec("DELETE FROM meta WHERE clave IN ('fuente_tipo', 'huella_fuente')");
    db.close();
    const repositorio = new RepositorioSqlite({ rutaIndice: o.rutaIndice });
    try {
      expect(repositorio.estado().disponible).toBe(true);
      expect(repositorio.obtener('viejo')?.urlMiniatura).toBeUndefined();
    } finally {
      repositorio.cerrar();
    }
    expect(leerMetaIndice(o.rutaIndice)).toMatchObject({ disponible: true, origen: null, huella: null });
  });

  it('leerMetaIndice explica por qué no hay índice', () => {
    const raiz = carpeta();
    expect(leerMetaIndice(join(raiz, 'no-existe.sqlite'))).toMatchObject({ disponible: false, error: expect.stringMatching(/todavía no se ha generado/) });
    writeFileSync(join(raiz, 'roto.sqlite'), 'esto no es sqlite');
    expect(leerMetaIndice(join(raiz, 'roto.sqlite'))).toMatchObject({ disponible: false, error: expect.stringMatching(/No se pudo leer el índice/) });
    expect(readFileSync(join(raiz, 'roto.sqlite'), 'utf8')).toBe('esto no es sqlite');
  });
});
