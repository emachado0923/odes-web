import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DocumentoAdmin, RespuestaSubida } from '../src/repositorio/api-repositorio.js';
import { AlmacenArchivosSupabase, rutaObjeto } from '../src/repositorio/archivos/almacen-supabase.js';
import { crearAlmacenArchivos } from '../src/repositorio/archivos/crear-almacen.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import type { ConfiguracionRepositorio } from '../src/repositorio/configuracion-repositorio.js';
import { importarPaquete } from '../src/repositorio/importacion/importador.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAdminPrueba,
  crearAppRepositorio,
  crearBasePrueba,
  crearPaqueteSintetico,
  HAY_BD,
  iniciarSesion,
  MOTOR_PRUEBAS,
  type PaqueteSintetico,
  type Sesion,
} from './repositorio-apoyo.js';
import { pdfFalso } from './repositorio-fixtures.js';
import { crearStorageFalso, type StorageFalso } from './storage-falso.js';

/**
 * Archivos en Supabase Storage (con un Storage falso en memoria) sobre una base
 * desechable: la importación sube los archivos al bucket, las descargas
 * redirigen a la URL pública, la administración sube directo al bucket con
 * una URL firmada y los objetos sin ficha se borran.
 */

avisarSiNoHayBd('repositorio-storage');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const USUARIO = 'observatorio';
const CONTRASENA = 'clave-de-pruebas-2026';
const PUB = '/api/repositorio/documentos';
const ADM = '/api/repositorio/admin';
const B19 = 'boletin-19-fe-erratas-boletin-n-19-2021';

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

describe.skipIf(!HAY_BD)(`archivos en Supabase Storage con ${MOTOR_PRUEBAS} (e2e)`, () => {
  let base: BasePrueba;
  let storage: StorageFalso;
  let config: ConfiguracionRepositorio;
  let paquete: PaqueteSintetico;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let sesion: Sesion;
  let bd: BaseDatosRepositorio;

  const agente = () => request(prueba.servidor);
  const escritura = (r: request.Test) => r.set('Cookie', sesion.cookie).set('X-CSRF-Token', sesion.csrf);
  const objetosArchivo = () => [...storage.objetos.keys()].filter((ruta) => ruta.startsWith('archivos/'));

  beforeAll(async () => {
    base = await crearBasePrueba('storage');
    storage = await crearStorageFalso();
    config = {
      ...base.config,
      supabase: { url: storage.url, clave: storage.clave, bucket: storage.bucket },
    };
    paquete = await crearPaqueteSintetico();
    dist = await crearDistTemporal();
    bd = new BaseDatosRepositorio(config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
    await crearAdminPrueba(base, USUARIO, CONTRASENA);
    prueba = await crearAppRepositorio(config, dist.directorio, { REPOSITORIO_SUPABASE_URL: storage.url });
    sesion = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await bd?.cerrar();
    await storage?.cerrar();
    await base?.borrar();
    await paquete?.limpiar();
    await dist?.limpiar();
  });

  it('la importación sube cada archivo al bucket y no usa repositorio_almacen_archivo_trozos', async () => {
    const [fichas] = await base.admin.query<Array<{ id: number; sha256: string; mime: string; trozos: number }>>(
      'SELECT id, sha256, mime, trozos FROM repositorio_almacen_archivos ORDER BY id',
    );
    expect(fichas.length).toBeGreaterThan(5);
    expect(fichas.every((ficha) => Number(ficha.trozos) === 0)).toBe(true);
    expect(objetosArchivo().toSorted()).toEqual(
      fichas.map((ficha) => rutaObjeto({ id: Number(ficha.id), sha256: ficha.sha256.trim(), mime: ficha.mime })).toSorted(),
    );
    const [trozos] = await base.admin.query<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM repositorio_almacen_archivo_trozos');
    expect(Number(trozos[0]!.n)).toBe(0);
    const pdf = storage.objetos.get(objetosArchivo().find((ruta) => ruta.endsWith('.pdf'))!);
    expect(pdf).toMatchObject({ tipo: 'application/pdf' });
    expect(sha256(pdf!.datos)).toBe(sha256(paquete.archivos[`${B19}.pdf`]!));
  });

  it('ver, descargar, portada y miniatura redirigen a la URL pública del bucket', async () => {
    const ver = await agente().get(`${PUB}/${B19}/ver`).expect(302);
    expect(ver.headers.location).toMatch(
      new RegExp(`^${storage.url}/storage/v1/object/public/repositorio/archivos/\\d+-[0-9a-f]{64}\\.pdf$`),
    );
    expect(ver.headers['cache-control']).toBe('public, max-age=600, must-revalidate');
    const contenido = await request(storage.url).get(new URL(ver.headers.location).pathname).expect(200);
    expect(sha256(contenido.body as Buffer)).toBe(sha256(paquete.archivos[`${B19}.pdf`]!));

    const descarga = await agente().get(`${PUB}/${B19}/descargar`).expect(302);
    const destino = new URL(descarga.headers.location);
    expect(destino.searchParams.get('download')).toBe('Boletín 19 - Fe de erratas del Boletín N.º 19.pdf');

    const listado = (await agente().get(PUB).expect(200)).body as { documentos: Array<{ id: string; urlPortada: string }> };
    const portada = listado.documentos.find((d) => d.id === B19)!.urlPortada;
    const imagen = await agente().get(portada).expect(302);
    expect(imagen.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(imagen.headers.location).toMatch(/\.jpg$/);
    await agente().get(`${PUB}/${B19}/miniatura`).expect(302);
  });

  it('la CSP admite el dominio de Storage para imágenes y conexiones', async () => {
    const csp = String((await agente().get(PUB).expect(200)).headers['content-security-policy']);
    expect(csp).toContain(`img-src 'self' data: blob: ${storage.url}`);
    expect(csp).toContain(`connect-src 'self' blob: data: ${storage.url}`);
  });

  it('subida directa: URL firmada, PUT al bucket y JSON al servidor; borra la subida y el archivo viejo', async () => {
    const anterior = objetosArchivo().find((ruta) => ruta.endsWith('.pdf'))!;
    const preparada = (await escritura(agente().post(`${ADM}/subidas`)).expect(200)).body as RespuestaSubida;
    expect(preparada).toMatchObject({ directa: true, maxBytes: 80 * 1024 * 1024 });
    if (!preparada.directa) throw new Error('Se esperaba subida directa');
    expect(preparada.ruta).toMatch(/^subidas\/[0-9a-f-]{36}$/);

    // El navegador sube directo al bucket, sin pasar por el servidor (ni por su límite de tamaño).
    const nuevo = pdfFalso(5_000_000);
    const firmada = new URL(preparada.url);
    await request(storage.url)
      .put(`${firmada.pathname}${firmada.search}`)
      .set('Content-Type', 'application/pdf')
      .send(nuevo)
      .expect(200);
    expect(storage.objetos.has(preparada.ruta)).toBe(true);

    const res = await escritura(agente().put(`${ADM}/documentos/${B19}/archivo`))
      .send({ subida: preparada.ruta, nombre: 'boletín nuevo.pdf', tipo: 'application/pdf' })
      .expect(200);
    const documento = res.body as DocumentoAdmin;
    expect(documento.archivo).toMatchObject({ tipo: 'application/pdf', bytes: 5_000_000 });
    expect(storage.objetos.has(preparada.ruta)).toBe(false);
    const nueva = objetosArchivo().find((ruta) => ruta.includes(sha256(nuevo)));
    expect(nueva).toBeTruthy();
    // El PDF anterior quedó sin uso: se quita del bucket cuando la transacción terminó.
    await vi.waitFor(() => expect(storage.objetos.has(anterior)).toBe(false), { timeout: 8000, interval: 200 });
  });

  it('rechaza una subida directa con una ruta que no es de subidas/', async () => {
    const res = await escritura(agente().put(`${ADM}/documentos/${B19}/archivo`))
      .send({ subida: 'archivos/1-abc.pdf', nombre: 'x.pdf', tipo: 'application/pdf' })
      .expect(400);
    expect(res.body).toMatchObject({ codigo: 'solicitud_invalida' });
  });

  it('recolectarHuerfanos borra del bucket los objetos sin ficha', async () => {
    storage.objetos.set('archivos/999999-perdido.pdf', { datos: Buffer.from('x'), tipo: 'application/pdf' });
    const almacen = crearAlmacenArchivos(bd);
    expect(almacen).toBeInstanceOf(AlmacenArchivosSupabase);
    await almacen.recolectarHuerfanos();
    expect(storage.objetos.has('archivos/999999-perdido.pdf')).toBe(false);
    // Lo que sí tiene ficha sigue ahí.
    expect(objetosArchivo().length).toBeGreaterThan(5);
  });
});

describe.skipIf(!HAY_BD)('sin Supabase Storage la subida no es directa (e2e)', () => {
  let base: BasePrueba;
  let dist: DistTemporal;
  let prueba: AppPrueba;

  beforeAll(async () => {
    base = await crearBasePrueba('sinstorage');
    dist = await crearDistTemporal();
    await crearAdminPrueba(base, USUARIO, CONTRASENA);
    prueba = await crearAppRepositorio(base.config, dist.directorio);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await dist?.limpiar();
  });

  it('POST /subidas responde { directa: false } con el tamaño de parte (subida por partes)', async () => {
    const sesion = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
    const res = await request(prueba.servidor)
      .post(`${ADM}/subidas`)
      .set('Cookie', sesion.cookie)
      .set('X-CSRF-Token', sesion.csrf)
      .expect(200);
    expect(res.body).toEqual({ directa: false, tamanoParte: 4 * 1024 * 1024, maxBytes: 80 * 1024 * 1024 });
  });
});
