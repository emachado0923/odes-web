import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  crearZip,
  docxFalso,
  jpegFalso,
  pdfFalso,
  pngFalso,
  pptxFalso,
  webpFalso,
} from '../../../test/repositorio-fixtures.js';
import { EXTENSIONES_ARCHIVO_CRM, EXTENSIONES_FOTO_CRM, LIMITES_CRM } from '../api-crm.js';
import { extensionDeMime, MIME } from '../../repositorio/archivos/tipos-archivo.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import {
  ALMACEN_CRM,
  type ClaseArchivoCrm,
  MAX_NOMBRE_ARCHIVO_CRM,
  nombreArchivoCrm,
  ServicioArchivosCrm,
  TIPOS_ARCHIVO_CRM,
} from './servicio-archivos-crm.js';

let carpeta: string;

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'crm-archivos-'));
});

afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

/** Escribe `datos` en la carpeta temporal y devuelve lo que entregaría multer. */
async function subido(
  original: string,
  datos: Buffer,
  mimetype = 'application/octet-stream',
  size = datos.length,
): Promise<Express.Multer.File> {
  const ruta = join(carpeta, `${Math.random().toString(36).slice(2)}.tmp`);
  await writeFile(ruta, datos);
  return { originalname: original, mimetype, size, path: ruta } as Express.Multer.File;
}

function xlsxFalso(): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
    { nombre: 'xl/workbook.xml', datos: Buffer.from('<workbook/>') },
  ]);
}

/** Servicio sin base: solo para validar. */
const servicio = new ServicioArchivosCrm({ tamanoTrozo: 1024 * 1024 } as unknown as BaseDatosRepositorio);

async function errorDe(promesa: Promise<unknown>): Promise<ErrorRepositorioHttp> {
  const error = await promesa.then(
    () => null,
    (motivo: unknown) => motivo,
  );
  expect(error).toBeInstanceOf(ErrorRepositorioHttp);
  return error as ErrorRepositorioHttp;
}

/** Extensiones que corresponden a una lista de tipos (las del contrato llevan punto). */
function extensiones(tipos: readonly string[]): string[] {
  return tipos.flatMap((mime) => (mime === MIME.jpeg ? ['.jpg', '.jpeg'] : [`.${extensionDeMime(mime)}`])).toSorted();
}

describe('nombre del archivo', () => {
  it.each([
    ['informe final.pdf', MIME.pdf, 'informe final.pdf'],
    ['  Informe\tde   avance.PDF ', MIME.pdf, 'Informe de avance.PDF'],
    ['C:\\Users\\ana\\Desktop\\acta.docx', MIME.docx, 'acta.docx'],
    ['../../etc/avance.xlsx', MIME.xlsx, 'avance.xlsx'],
    ['acta\u0000 firmada\u0007.pdf', MIME.pdf, 'acta firmada.pdf'],
    ['acta\u202e.pdf', MIME.pdf, 'acta.pdf'],
    ['foto.JPEG', MIME.jpeg, 'foto.JPEG'],
    ['informe.', MIME.pdf, 'informe.pdf'],
    // Sin extensión, o con una que no es la del tipo real: se agrega la del tipo real.
    ['blob', MIME.png, 'blob.png'],
    ['foto de la reunión', MIME.jpeg, 'foto de la reunión.jpg'],
    ['Informe v2.1', MIME.pdf, 'Informe v2.1.pdf'],
    ['.pdf', MIME.pdf, 'archivo.pdf'],
    // Sin nombre útil.
    ['', MIME.pdf, 'archivo.pdf'],
    ['..', MIME.webp, 'archivo.webp'],
    ['carpeta/', MIME.pptx, 'archivo.pptx'],
  ])('%j (%s) -> %j', (original, mime, esperado) => {
    expect(nombreArchivoCrm(original, mime)).toBe(esperado);
  });

  it('arregla los nombres UTF-8 que busboy entrega leídos como latin1', () => {
    const latin1 = Buffer.from('Ejecución año 2026.pdf', 'utf8').toString('latin1');
    expect(nombreArchivoCrm(latin1, MIME.pdf)).toBe('Ejecución año 2026.pdf');
    // Uno que ya viene bien (con caracteres fuera de latin1) no se toca.
    expect(nombreArchivoCrm('Informe – año.pdf', MIME.pdf)).toBe('Informe – año.pdf');
  });

  it('recorta a 255 caracteres conservando la extensión', () => {
    const nombre = nombreArchivoCrm(`${'á'.repeat(400)}.xlsx`, MIME.xlsx);
    expect(Array.from(nombre)).toHaveLength(MAX_NOMBRE_ARCHIVO_CRM);
    expect(nombre.endsWith('á.xlsx')).toBe(true);
    const emojis = nombreArchivoCrm(`${'📊'.repeat(300)}.pdf`, MIME.pdf);
    expect(Array.from(emojis)).toHaveLength(MAX_NOMBRE_ARCHIVO_CRM);
    expect(emojis.endsWith('📊.pdf')).toBe(true);
  });

  it('los tipos aceptados son los mismos que anuncia el contrato', () => {
    expect(extensiones(TIPOS_ARCHIVO_CRM.documento)).toEqual([...EXTENSIONES_ARCHIVO_CRM].toSorted());
    expect(extensiones(TIPOS_ARCHIVO_CRM.foto)).toEqual([...EXTENSIONES_FOTO_CRM].toSorted());
  });
});

describe('validación de archivos', () => {
  it('sin archivo: 400 con campos.archivo', async () => {
    const error = await errorDe(servicio.validar(undefined, 'documento'));
    expect(error.getStatus()).toBe(400);
    expect(error.cuerpo).toEqual({
      codigo: 'solicitud_invalida',
      mensaje: 'Adjunte un archivo.',
      campos: { archivo: 'Adjunte un archivo.' },
    });
  });

  it.each([
    ['informe.pdf', pdfFalso(2048), MIME.pdf, MIME.pdf],
    ['acta.docx', docxFalso(), MIME.docx, MIME.docx],
    ['avance.xlsx', xlsxFalso(), MIME.xlsx, 'application/octet-stream'],
    ['comite.pptx', pptxFalso(), MIME.pptx, ''],
    ['grafica.png', pngFalso(800, 600), MIME.png, MIME.png],
    ['foto.jpg', jpegFalso(320, 240), MIME.jpeg, 'image/jpg'],
    ['mapa.webp', webpFalso(100, 50), MIME.webp, MIME.webp],
  ])('documento %s: tipo por firma', async (nombre, datos, mime, declarado) => {
    const recibido = await servicio.validar(await subido(nombre, datos, declarado), 'documento');
    expect(recibido).toMatchObject({ nombre, mime, bytes: datos.length, ancho: null, alto: null });
  });

  it.each([
    ['perfil.png', pngFalso(640, 480), MIME.png, 640, 480],
    ['perfil.jpeg', jpegFalso(1200, 900), MIME.jpeg, 1200, 900],
    ['perfil.webp', webpFalso(300, 200, 'VP8L'), MIME.webp, 300, 200],
  ])('foto %s: tipo y medidas', async (nombre, datos, mime, ancho, alto) => {
    const recibido = await servicio.validar(await subido(nombre, datos, mime), 'foto');
    expect(recibido).toMatchObject({ nombre, mime, ancho, alto });
  });

  it('foto con medidas que no caben en la base: sin medidas', async () => {
    const recibido = await servicio.validar(await subido('ancha.png', pngFalso(70_000, 10), MIME.png), 'foto');
    expect(recibido).toMatchObject({ ancho: null, alto: null });
  });

  it('una foto no puede ser PDF', async () => {
    const error = await errorDe(servicio.validar(await subido('perfil.pdf', pdfFalso(), MIME.pdf), 'foto'));
    expect(error.getStatus()).toBe(415);
    expect(error.cuerpo.mensaje).toBe('«perfil.pdf» no es de un tipo permitido. Use una imagen PNG, JPG o WEBP.');
  });

  it('un tipo desconocido: 415 con la lista de tipos', async () => {
    const error = await errorDe(
      servicio.validar(await subido('notas.txt', Buffer.from('hola, esto es texto'), 'text/plain'), 'documento'),
    );
    expect(error.getStatus()).toBe(415);
    expect(error.cuerpo).toMatchObject({ codigo: 'tipo_no_permitido', campos: { archivo: error.cuerpo.mensaje } });
    expect(error.cuerpo.mensaje).toBe(
      '«notas.txt» no es de un tipo permitido. Use PDF, Word, Excel, PowerPoint o una imagen (PNG, JPG o WEBP).',
    );
  });

  it('un ZIP que no es de Office tampoco pasa', async () => {
    const zip = crearZip([{ nombre: 'leame.txt', datos: Buffer.from('x') }]);
    expect((await errorDe(servicio.validar(await subido('acta.docx', zip), 'documento'))).getStatus()).toBe(415);
  });

  it('la extensión o el Content-Type que no corresponden al contenido: 415', async () => {
    const extension = await errorDe(servicio.validar(await subido('informe.pdf', pngFalso(10, 10)), 'documento'));
    expect(extension.getStatus()).toBe(415);
    expect(extension.cuerpo.mensaje).toMatch(/^La extensión o el tipo de «informe\.pdf» no corresponde a su contenido \(PNG\)\. Use PDF/);
    const tipo = await errorDe(servicio.validar(await subido('informe.pdf', pdfFalso(), MIME.png), 'documento'));
    expect(tipo.getStatus()).toBe(415);
  });

  it('demasiado grande: 413 con el tamaño y el máximo de la clase', async () => {
    // Lo que informa multer basta para rechazar sin leer el archivo.
    const documento = await errorDe(
      servicio.validar(await subido('base.pdf', pdfFalso(), MIME.pdf, 26 * 1024 * 1024), 'documento'),
    );
    expect(documento.getStatus()).toBe(413);
    expect(documento.cuerpo.mensaje).toBe('«base.pdf» pesa 26 MB; el máximo es 25 MB.');
    // Y si multer se equivoca, manda el tamaño real en disco.
    const grande = Buffer.concat([pngFalso(10, 10), Buffer.alloc(LIMITES_CRM.maxBytesFoto + 1024 * 1024)]);
    const foto = await errorDe(servicio.validar(await subido('perfil.png', grande, MIME.png, 100), 'foto'));
    expect(foto.getStatus()).toBe(413);
    expect(foto.cuerpo.mensaje).toBe('«perfil.png» pesa 3 MB; el máximo es 2 MB.');
  });

  it('vacío: 400', async () => {
    const error = await errorDe(servicio.validar(await subido('vacio.pdf', Buffer.alloc(0), MIME.pdf), 'documento'));
    expect(error.getStatus()).toBe(400);
    expect(error.cuerpo.mensaje).toBe('«vacio.pdf» está vacío.');
  });

  it('el nombre guardado es el limpio, con la extensión del tipo real', async () => {
    const recibido = await servicio.validar(await subido('C:\\fotos\\Reunión\tcomité', jpegFalso(10, 10)), 'documento');
    expect(recibido.nombre).toBe('Reunión comité.jpg');
  });
});

describe('almacén del CRM', () => {
  it('guarda en crm_almacen_* con el tipo y las medidas, y devuelve el id', async () => {
    const sentencias: Array<{ sql: string; valores: readonly unknown[] }> = [];
    const conexion = {
      dialecto: 'mysql',
      query: (sql: string, valores: readonly unknown[] = []) => {
        sentencias.push({ sql, valores });
        return Promise.resolve(sql.includes('INSERT') ? [{ insertId: 41, affectedRows: 1 }, null] : [[], null]);
      },
      execute: (sql: string, valores: readonly unknown[] = []) => {
        sentencias.push({ sql, valores });
        return Promise.resolve([{ insertId: 0, affectedRows: 1 }, null]);
      },
    } as unknown as Conexion;
    const datos = pngFalso(64, 32);
    const clase: ClaseArchivoCrm = 'foto';
    const recibido = await servicio.validar(await subido('perfil.png', datos, MIME.png), clase);
    expect(await servicio.guardar(conexion, recibido)).toBe(41);
    expect(sentencias[0].sql).toMatch(/FROM crm_almacen_archivos WHERE sha256 = \? FOR SHARE/);
    expect(sentencias[1].sql).toMatch(/INSERT INTO crm_almacen_archivos/);
    expect(sentencias[1].valores.slice(1, 7)).toEqual([MIME.png, datos.length, 1, 1024 * 1024, 64, 32]);
    expect(sentencias[2].sql).toMatch(/INSERT INTO crm_almacen_archivo_trozos/);
    expect(sentencias[2].valores).toEqual([41, 0, datos]);
  });

  it('recolecta mirando las tareas y las fotos de las personas', async () => {
    const sentencias: string[] = [];
    const conexion = {
      dialecto: 'mysql',
      query: (sql: string) => {
        sentencias.push(sql);
        return Promise.resolve(
          sql.includes('FOR UPDATE')
            ? [[{ id: 5, sha256: 'a', mime: MIME.pdf, bytes: 1, trozos: 1, tamano_trozo: 1, creado_en: new Date() }], null]
            : [[], null],
        );
      },
    } as unknown as Conexion;
    await servicio.recolectar(conexion, [5, 0, -1]);
    expect(sentencias.some((s) => s.includes(`FROM ${ALMACEN_CRM.usos[0].tabla} WHERE archivo_id = ?`))).toBe(true);
    expect(sentencias.some((s) => s.includes('FROM crm_personas WHERE foto_archivo_id = ?'))).toBe(true);
    expect(sentencias.at(-1)).toBe('DELETE FROM crm_almacen_archivos WHERE id = ?');
  });

  it('lee un archivo completo por id; si no existe, 404', async () => {
    const contenido = Buffer.from('%PDF-1.7 contenido de prueba');
    const bd = {
      tamanoTrozo: 16,
      filas: (sql: string, valores: unknown[]) =>
        Promise.resolve(
          sql.includes('FROM crm_almacen_archivos WHERE id = ?') && valores[0] === 9
            ? [{ id: 9, sha256: 'x', mime: MIME.pdf, bytes: contenido.length, trozos: 2, tamano_trozo: 16, creado_en: new Date() }]
            : [],
        ),
      preparada: (sql: string, [, n]: number[]) => {
        expect(sql).toContain('FROM crm_almacen_archivo_trozos');
        return Promise.resolve([{ datos: contenido.subarray(n * 16, n * 16 + 16) }]);
      },
    } as unknown as BaseDatosRepositorio;
    const conBase = new ServicioArchivosCrm(bd);
    expect(await conBase.leerCompleto(9)).toEqual(contenido);
    const error = await errorDe(conBase.leerCompleto(10));
    expect(error.getStatus()).toBe(404);
    expect(error.cuerpo.mensaje).toBe('El archivo no existe.');
    const envio = await errorDe(
      conBase.enviar({} as never, {} as never, { archivoId: 10, nombre: 'x.pdf', disposicion: 'attachment', cache: 'privado' }),
    );
    expect(envio.getStatus()).toBe(404);
  });
});
