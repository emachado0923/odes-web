import { describe, expect, it } from 'vitest';
import { ClienteStorage, esRutaSubida, estaEnStorage, rutaObjeto } from './almacen-supabase.js';

/** fetch falso: anota cada petición y responde lo indicado. */
function fetchFalso(responder: (url: string, init: RequestInit) => Response) {
  const peticiones: Array<{ url: string; init: RequestInit }> = [];
  const pedir = (async (entrada: string | URL | Request, init: RequestInit = {}) => {
    const url = String(entrada);
    peticiones.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
  return { peticiones, pedir };
}

const OPCIONES = { url: 'https://abcd.supabase.co', clave: 'sb_secret_x', bucket: 'repositorio' };

function respuestaVacia(): Response {
  return new Response('{}', { status: 200 });
}

describe('ClienteStorage', () => {
  it('URL pública, con ?download= para descargar con nombre (codificado)', () => {
    const cliente = new ClienteStorage(OPCIONES);
    expect(cliente.urlPublica('archivos/1-abc.pdf')).toBe(
      'https://abcd.supabase.co/storage/v1/object/public/repositorio/archivos/1-abc.pdf',
    );
    expect(cliente.urlPublica('archivos/1-abc.pdf', 'Boletín 19.pdf')).toBe(
      'https://abcd.supabase.co/storage/v1/object/public/repositorio/archivos/1-abc.pdf?download=Bolet%C3%ADn%2019.pdf',
    );
  });

  it('clave nueva (sb_secret_): solo apikey; clave JWT antigua: también Authorization', async () => {
    const nueva = fetchFalso(respuestaVacia);
    await new ClienteStorage(OPCIONES, nueva.pedir).subir('archivos/1-a.pdf', Buffer.from('x'), 'application/pdf');
    const cabeceras = nueva.peticiones[0]!.init.headers as Record<string, string>;
    expect(cabeceras).toMatchObject({ apikey: 'sb_secret_x', 'Content-Type': 'application/pdf', 'x-upsert': 'true' });
    expect(cabeceras.Authorization).toBeUndefined();
    expect(nueva.peticiones[0]!.url).toBe('https://abcd.supabase.co/storage/v1/object/repositorio/archivos/1-a.pdf');

    const antigua = fetchFalso(respuestaVacia);
    await new ClienteStorage({ ...OPCIONES, clave: 'eyJhbGciOi.x.y' }, antigua.pedir).borrar(['archivos/1-a.pdf']);
    expect(antigua.peticiones[0]!.init.headers).toMatchObject({
      apikey: 'eyJhbGciOi.x.y',
      Authorization: 'Bearer eyJhbGciOi.x.y',
    });
    expect(JSON.parse(String(antigua.peticiones[0]!.init.body))).toEqual({ prefixes: ['archivos/1-a.pdf'] });
  });

  it('pide rangos y convierte la URL firmada relativa en absoluta', async () => {
    const { peticiones, pedir } = fetchFalso((url) =>
      url.includes('/upload/sign/')
        ? Response.json({ url: '/object/upload/sign/repositorio/subidas/x?token=t' })
        : new Response('ab', { status: 206 }),
    );
    const cliente = new ClienteStorage(OPCIONES, pedir);
    const parcial = await cliente.descargar('archivos/1-a.pdf', { inicio: 10, fin: 11 });
    expect(parcial.status).toBe(206);
    expect(peticiones[0]!.init.headers).toMatchObject({ Range: 'bytes=10-11' });
    expect(await cliente.firmarSubida('subidas/x')).toBe(
      'https://abcd.supabase.co/storage/v1/object/upload/sign/repositorio/subidas/x?token=t',
    );
  });

  it('subir sin upsert y sin caché (evidencias del PAI)', async () => {
    const { peticiones, pedir } = fetchFalso(respuestaVacia);
    await new ClienteStorage(OPCIONES, pedir).subir('evidencias/a.pdf', Buffer.from('x'), 'application/pdf', {
      upsert: false,
      cacheControl: 'private, no-store',
    });
    expect(peticiones[0]!.init.headers).toMatchObject({ 'x-upsert': 'false', 'cache-control': 'private, no-store' });
  });

  it('firmarDescarga: POST /object/sign con expiresIn y ?download= con el nombre codificado', async () => {
    const { peticiones, pedir } = fetchFalso(() =>
      Response.json({ signedURL: '/object/sign/pai-evidencias/evidencias/a.pdf?token=t.k' }),
    );
    const cliente = new ClienteStorage({ ...OPCIONES, bucket: 'pai-evidencias' }, pedir);
    expect(await cliente.firmarDescarga('evidencias/a.pdf', 60, 'Informe N.º 1 (final).pdf')).toBe(
      'https://abcd.supabase.co/storage/v1/object/sign/pai-evidencias/evidencias/a.pdf?token=t.k' +
        '&download=Informe%20N.%C2%BA%201%20(final).pdf',
    );
    expect(peticiones[0]!.url).toBe('https://abcd.supabase.co/storage/v1/object/sign/pai-evidencias/evidencias/a.pdf');
    expect(peticiones[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(peticiones[0]!.init.body))).toEqual({ expiresIn: 60 });
    expect(await cliente.firmarDescarga('evidencias/a.pdf', 60)).toBe(
      'https://abcd.supabase.co/storage/v1/object/sign/pai-evidencias/evidencias/a.pdf?token=t.k',
    );
  });

  it('firmarDescarga falla si Storage no devuelve la URL o responde un error', async () => {
    const sinUrl = fetchFalso(() => Response.json({}));
    await expect(new ClienteStorage(OPCIONES, sinUrl.pedir).firmarDescarga('a', 60)).rejects.toMatchObject({
      estado: 502,
    });
    const error = fetchFalso(() => Response.json({ message: 'Object not found' }, { status: 400 }));
    await expect(new ClienteStorage(OPCIONES, error.pedir).firmarDescarga('a', 60)).rejects.toMatchObject({
      estado: 400,
      message: expect.stringMatching(/Object not found/),
    });
  });

  it('listarObjetos trae la fecha de creación; listar, solo las rutas (sin carpetas)', async () => {
    const { pedir } = fetchFalso(() =>
      Response.json([
        { name: 'a.pdf', id: '1', created_at: '2026-10-01T10:00:00.000Z' },
        { name: 'b.pdf', id: '2' },
        { name: 'c.pdf', id: '3', created_at: 'no es fecha' },
        { name: 'carpeta', id: null },
      ]),
    );
    const cliente = new ClienteStorage(OPCIONES, pedir);
    expect(await cliente.listarObjetos('evidencias')).toEqual([
      { ruta: 'evidencias/a.pdf', creadoEn: new Date('2026-10-01T10:00:00.000Z') },
      { ruta: 'evidencias/b.pdf', creadoEn: null },
      { ruta: 'evidencias/c.pdf', creadoEn: null },
    ]);
    expect(await cliente.listar('evidencias')).toEqual(['evidencias/a.pdf', 'evidencias/b.pdf', 'evidencias/c.pdf']);
  });

  it('un error de Storage lleva el estado y el mensaje', async () => {
    const { pedir } = fetchFalso(() => Response.json({ message: 'Bucket not found' }, { status: 404 }));
    await expect(new ClienteStorage(OPCIONES, pedir).descargar('archivos/x')).rejects.toMatchObject({
      estado: 404,
      message: expect.stringMatching(/Bucket not found/),
    });
  });
});

describe('rutas del bucket', () => {
  it('archivos/<id>-<sha256>.<extensión> y subidas/<uuid>', () => {
    expect(rutaObjeto({ id: 7, sha256: 'f'.repeat(64), mime: 'application/pdf' })).toBe(`archivos/7-${'f'.repeat(64)}.pdf`);
    expect(esRutaSubida('subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d')).toBe(true);
    expect(esRutaSubida('archivos/7-x.pdf')).toBe(false);
    expect(esRutaSubida('subidas/../archivos/x')).toBe(false);
  });

  it('una ficha con trozos (o vacía) se lee de la base, no de Storage', () => {
    expect(estaEnStorage({ trozos: 0, bytes: 10 })).toBe(true);
    expect(estaEnStorage({ trozos: 3, bytes: 10 })).toBe(false);
    expect(estaEnStorage({ trozos: 0, bytes: 0 })).toBe(false);
  });
});
