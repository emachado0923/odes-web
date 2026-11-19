import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ArchivoInfo } from '../../../repositorio/api-repositorio.js';
import { noDisponible } from '../../../repositorio/errores-repositorio.js';
import type {
  DocumentoLectura,
  ListadoLectura,
} from '../../../repositorio/servicios/lectura-repositorio.js';
import { type ArchivoBajoDemanda, ErrorArchivoFuente } from './fuente.js';
import {
  FuenteMysql,
  huellaDocumentos,
  type LectorRepositorio,
  urlMiniaturaRepositorio,
} from './fuente-mysql.js';

const sha256 = (datos: Buffer | string): string =>
  createHash('sha256').update(datos).digest('hex');

const PDF = Buffer.from('%PDF-1.4 contenido de prueba');
const MINIATURA_SHA = sha256('miniatura');

function info(datos: Buffer, tipo: string, extension: string): ArchivoInfo {
  return { tipo, bytes: datos.length, extension, sha256: sha256(datos) };
}

function documento(parcial: Partial<DocumentoLectura> & Pick<DocumentoLectura, 'id'>): DocumentoLectura {
  return {
    orden: 1,
    titulo: `Título de ${parcial.id}`,
    subtitulo: null,
    categoria: 'Boletín',
    numero: null,
    anio: 2021,
    mes: 8,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Acceso'],
    urlVer: `/api/repositorio/documentos/${parcial.id}/ver`,
    urlDescarga: null,
    urlVerExterna: null,
    urlOriginal: 'https://sapiencia.gov.co/original.pdf',
    urlEntradaBlog: null,
    nota: null,
    equivalenteEnEspanol: null,
    archivo: info(PDF, 'application/pdf', 'pdf'),
    portada: { tipo: 'image/jpeg', bytes: 10, extension: 'jpg', sha256: sha256('portada') },
    miniatura: { tipo: 'image/webp', bytes: 10, extension: 'webp', sha256: MINIATURA_SHA },
    actualizadoEn: '2026-10-08T00:00:00.000Z',
    ...parcial,
  };
}

const BOLETIN = documento({ id: 'boletin-19-fe-erratas', numero: '19', claves: ['Normatividad', 'Becas'] });
const TABLERO = documento({
  id: 'tablero-matricula',
  orden: 2,
  categoria: 'Educación superior en cifras',
  tipo: 'tablero',
  anio: null,
  mes: null,
  archivo: null,
  miniatura: null,
  urlVer: 'https://app.powerbi.com/view?r=abc',
  urlVerExterna: 'https://app.powerbi.com/view?r=abc',
  urlOriginal: 'https://app.powerbi.com/view?r=abc',
  nota: 'Requiere conexión a internet.',
});
const TRADUCCION = documento({
  id: 'infografia-en-job-placement',
  orden: 3,
  categoria: 'Infografía',
  idioma: 'en',
  equivalenteEnEspanol: 'Empleabilidad (Infografía, 2022)',
  archivo: info(Buffer.from('PK docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'),
});

class LectorFalso implements LectorRepositorio {
  listados: ListadoLectura[];
  archivos = new Map<string, Buffer>([[BOLETIN.id, PDF]]);
  fallaListar: unknown = null;
  fallaGuardar: unknown = null;
  guardados: string[] = [];

  constructor(...listados: ListadoLectura[]) {
    this.listados = listados;
  }

  async listarPublicados(): Promise<ListadoLectura> {
    if (this.fallaListar) throw this.fallaListar;
    return this.listados.length > 1 ? this.listados.shift()! : this.listados[0]!;
  }

  async guardarArchivoEn(id: string, ruta: string): Promise<ArchivoInfo | null> {
    if (this.fallaGuardar) throw this.fallaGuardar;
    const datos = this.archivos.get(id);
    if (!datos) return null;
    await writeFile(ruta, datos);
    this.guardados.push(ruta);
    return info(datos, 'application/pdf', 'pdf');
  }
}

const listado = (documentos: DocumentoLectura[], version = 7): ListadoLectura => ({
  version,
  actualizado: '2026-10-08T12:00:00.000Z',
  documentos,
});

describe('FuenteMysql', () => {
  it('entrega solo lo que lista la base, con enlaces propios o externos y la miniatura versionada', async () => {
    const fuente = new FuenteMysql(new LectorFalso(listado([BOLETIN, TABLERO, TRADUCCION])), {
      destino: 'repositoriobd en 127.0.0.1:3306',
    });
    const lectura = await fuente.leer();
    expect(lectura.origen).toBe('mysql');
    expect(lectura.version).toBe('7');
    expect(lectura.descripcion).toContain('repositoriobd en 127.0.0.1:3306');
    expect(lectura.huella).toBe(huellaDocumentos([BOLETIN, TABLERO, TRADUCCION]));
    expect(lectura.avisos).toEqual([]);
    expect(lectura.registros.map((r) => r.metadatos.id)).toEqual([BOLETIN.id, TABLERO.id, TRADUCCION.id]);

    const [boletin, tablero, traduccion] = lectura.registros;
    expect(boletin!.metadatos).toEqual({
      id: BOLETIN.id,
      orden: 1,
      titulo: BOLETIN.titulo,
      subtitulo: null,
      categoria: 'Boletín',
      numero: '19',
      anio: 2021,
      mes: 8,
      idioma: 'es',
      tipo: 'documento',
      claves: ['Normatividad', 'Becas'],
      urlVer: `/api/repositorio/documentos/${BOLETIN.id}/ver`,
      nota: null,
      equivalenteEnEspanol: null,
      archivoTipo: 'application/pdf',
      urlMiniatura: `/api/repositorio/documentos/${BOLETIN.id}/miniatura?v=${MINIATURA_SHA.slice(0, 16)}`,
    });
    expect(boletin!.portada).toBeNull();
    const archivo = boletin!.archivo as ArchivoBajoDemanda;
    expect(archivo).toMatchObject({ nombre: `${BOLETIN.id}.pdf`, sha256: sha256(PDF), bytes: PDF.length });

    // Sin archivo: la URL externa, sin archivo ni miniatura.
    expect(tablero!.metadatos.urlVer).toBe('https://app.powerbi.com/view?r=abc');
    expect(tablero!.metadatos.nota).toBe('Requiere conexión a internet.');
    expect(tablero!.metadatos.urlMiniatura).toBeNull();
    expect(tablero!.archivo).toBeNull();
    expect(traduccion!.metadatos.equivalenteEnEspanol).toBe('Empleabilidad (Infografía, 2022)');
    expect((traduccion!.archivo as ArchivoBajoDemanda).nombre).toBe(`${TRADUCCION.id}.docx`);
    await fuente.cerrar();
  });

  it('nunca expone notas internas ni la URL histórica', async () => {
    const conExtras = { ...BOLETIN, notasInternas: 'SECRETO', urlOriginal: 'https://historica.test/x.pdf' };
    const lectura = await new FuenteMysql(new LectorFalso(listado([conExtras]))).leer();
    const texto = JSON.stringify(lectura.registros.map((r) => r.metadatos));
    expect(texto).not.toContain('SECRETO');
    expect(texto).not.toContain('historica.test');
  });

  it('omite con un aviso los documentos sin destino o con un id no admitido', async () => {
    const sinDestino = documento({ id: 'sin-destino', archivo: null, urlVer: '' });
    const raro = documento({ id: 'Con Espacios' });
    const lectura = await new FuenteMysql(new LectorFalso(listado([BOLETIN, sinDestino, raro, BOLETIN]))).leer();
    expect(lectura.registros.map((r) => r.metadatos.id)).toEqual([BOLETIN.id]);
    expect(lectura.avisos).toHaveLength(3);
    expect(lectura.avisos.join('\n')).toMatch(/sin-destino: no tiene archivo ni URL externa/);
  });

  it('copia el archivo bajo demanda a una carpeta temporal y lo borra al liberar y al cerrar', async () => {
    const lector = new LectorFalso(listado([BOLETIN]));
    const fuente = new FuenteMysql(lector);
    const archivo = (await fuente.leer()).registros[0]!.archivo as ArchivoBajoDemanda;
    expect(lector.guardados).toEqual([]);
    const ruta = await archivo.obtener();
    expect(ruta.endsWith(`${BOLETIN.id}.pdf`)).toBe(true);
    expect(readFileSync(ruta)).toEqual(PDF);
    await archivo.liberar();
    expect(existsSync(ruta)).toBe(false);
    expect(existsSync(dirname(ruta))).toBe(true);
    await fuente.cerrar();
    expect(existsSync(dirname(ruta))).toBe(false);
    await fuente.cerrar(); // dos veces: sin error
  });

  it('un error de la base al copiar es de la fuente (detiene la indexación); un documento retirado no', async () => {
    const lector = new LectorFalso(listado([BOLETIN]));
    const fuente = new FuenteMysql(lector);
    const archivo = (await fuente.leer()).registros[0]!.archivo as ArchivoBajoDemanda;

    lector.fallaGuardar = noDisponible();
    await expect(archivo.obtener()).rejects.toThrow(ErrorArchivoFuente);
    await expect(archivo.obtener()).rejects.toThrow(/no está disponible/);

    lector.fallaGuardar = null;
    lector.archivos.clear(); // despublicado: guardarArchivoEn devuelve null
    const retirado = await archivo.obtener().catch((error: unknown) => error);
    expect(retirado).toBeInstanceOf(Error);
    expect(retirado).not.toBeInstanceOf(ErrorArchivoFuente);
    expect(String(retirado)).toMatch(/dejó de estar publicado/);

    lector.archivos.set(BOLETIN.id, Buffer.from('otro contenido')); // reemplazado mientras tanto
    const cambiado = await archivo.obtener().catch((error: unknown) => error);
    expect(cambiado).not.toBeInstanceOf(ErrorArchivoFuente);
    expect(String(cambiado)).toMatch(/cambió durante la indexación/);
    await fuente.cerrar();
  });

  it('si la base no responde al listar, lanza ErrorArchivoFuente con el mensaje del repositorio', async () => {
    const lector = new LectorFalso(listado([BOLETIN]));
    lector.fallaListar = noDisponible();
    const fuente = new FuenteMysql(lector);
    await expect(fuente.leer()).rejects.toThrow(ErrorArchivoFuente);
    await expect(fuente.leer()).rejects.toThrow(/No se pudo leer el repositorio en la base de datos: El repositorio no está disponible/);
    await expect(fuente.idsVigentes()).rejects.toThrow(ErrorArchivoFuente);
  });

  it('idsVigentes vuelve a consultar lo publicado', async () => {
    const fuente = new FuenteMysql(new LectorFalso(listado([BOLETIN, TABLERO]), listado([TABLERO], 8)));
    expect((await fuente.leer()).registros).toHaveLength(2);
    expect([...(await fuente.idsVigentes())]).toEqual([TABLERO.id]);
  });
});

describe('huellaDocumentos', () => {
  const base = huellaDocumentos([BOLETIN, TABLERO]);

  it('cambia con lo que usa el índice', () => {
    expect(huellaDocumentos([BOLETIN])).not.toBe(base);
    expect(huellaDocumentos([{ ...BOLETIN, titulo: 'Otro título' }, TABLERO])).not.toBe(base);
    expect(huellaDocumentos([{ ...BOLETIN, claves: ['Becas'] }, TABLERO])).not.toBe(base);
    expect(huellaDocumentos([{ ...BOLETIN, archivo: info(Buffer.from('v2'), 'application/pdf', 'pdf') }, TABLERO])).not.toBe(base);
    expect(huellaDocumentos([{ ...BOLETIN, miniatura: null }, TABLERO])).not.toBe(base);
    expect(huellaDocumentos([TABLERO, BOLETIN])).not.toBe(base);
  });

  it('no cambia con lo que el índice no usa', () => {
    expect(
      huellaDocumentos([
        { ...BOLETIN, actualizadoEn: '2030-01-01T00:00:00.000Z', urlDescarga: '/x', urlEntradaBlog: 'https://b.test' },
        { ...TABLERO, portada: null, urlOriginal: null },
      ]),
    ).toBe(base);
  });
});

describe('urlMiniaturaRepositorio', () => {
  it('codifica el id y usa los primeros 16 hexadecimales del sha256', () => {
    expect(urlMiniaturaRepositorio({ id: 'a-b', miniatura: { tipo: 'image/webp', bytes: 1, extension: 'webp', sha256: 'f'.repeat(64) } })).toBe(
      `/api/repositorio/documentos/a-b/miniatura?v=${'f'.repeat(16)}`,
    );
    expect(urlMiniaturaRepositorio({ id: 'a-b', miniatura: null })).toBeNull();
  });
});
