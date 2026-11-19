import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Supabase Storage falso, en memoria, con la parte de la API REST que usa el
 * servidor (almacen-supabase.ts): subir, leer (con Range), URL pública (con
 * ?download), borrar, listar (con created_at), subidas con URL firmada y,
 * para los buckets PRIVADOS (evidencias del PAI), descargas con URL firmada
 * que vence (POST /object/sign + GET /object/sign?token=…&download=…). Exige
 * la clave en las rutas privadas, como el real, y un bucket privado no tiene
 * URL pública. GET /bucket/<id> dice si el bucket es público (`publicos`; una
 * prueba puede agregar un bucket privado para simular un error de
 * configuración).
 */

export interface ObjetoFalso {
  datos: Buffer;
  tipo: string;
  /** Cabecera cache-control con la que se subió. */
  cache?: string;
  /** created_at del listado (por defecto, cuando se subió). */
  creado?: Date;
}

/** Una URL firmada de descarga que pidió el servidor. */
export interface FirmaDescargaFalsa {
  bucket: string;
  ruta: string;
  segundos: number;
}

export interface StorageFalso {
  url: string;
  clave: string;
  /** Bucket público (el del repositorio). */
  bucket: string;
  /** Objetos del bucket público. */
  objetos: Map<string, ObjetoFalso>;
  /** Objetos de cada bucket privado (nombre del bucket -> objetos). */
  privados: Map<string, Map<string, ObjetoFalso>>;
  /** URL firmadas de descarga pedidas, en orden. */
  firmasDescarga: FirmaDescargaFalsa[];
  /** Buckets que GET /bucket/<id> informa como públicos (al empezar, solo `bucket`). */
  publicos: Set<string>;
  /** Peticiones recibidas: "MÉTODO ruta". */
  peticiones: string[];
  cerrar(): Promise<void>;
}

async function cuerpo(req: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  return Buffer.concat(partes);
}

function json(res: ServerResponse, estado: number, datos: unknown): void {
  const texto = JSON.stringify(datos);
  res.writeHead(estado, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(texto);
}

function enviarObjeto(req: IncomingMessage, res: ServerResponse, objeto: ObjetoFalso, extra: Record<string, string> = {}): void {
  const cache = objeto.cache ? { 'Cache-Control': objeto.cache } : {};
  const rango = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
  if (rango) {
    const inicio = Number(rango[1]);
    const fin = Math.min(Number(rango[2]), objeto.datos.length - 1);
    res.writeHead(206, {
      'Content-Type': objeto.tipo,
      'Content-Range': `bytes ${inicio}-${fin}/${objeto.datos.length}`,
      'Content-Length': String(fin - inicio + 1),
      ...cache,
      ...extra,
    });
    res.end(objeto.datos.subarray(inicio, fin + 1));
    return;
  }
  res.writeHead(200, { 'Content-Type': objeto.tipo, 'Content-Length': String(objeto.datos.length), ...cache, ...extra });
  res.end(objeto.datos);
}

function adjunto(descarga: string | null): Record<string, string> {
  return descarga !== null
    ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(descarga)}` }
    : {};
}

export async function crearStorageFalso(
  bucket = 'repositorio',
  { privados = [] }: { privados?: readonly string[] } = {},
): Promise<StorageFalso> {
  const clave = `sb_secret_${randomBytes(8).toString('hex')}`;
  const objetos = new Map<string, ObjetoFalso>();
  const bucketsPrivados = new Map<string, Map<string, ObjetoFalso>>(
    privados.map((nombre) => [nombre, new Map<string, ObjetoFalso>()]),
  );
  /** Todos los buckets: el público y los privados. */
  const buckets = new Map<string, Map<string, ObjetoFalso>>([[bucket, objetos], ...bucketsPrivados]);
  const firmas = new Map<string, { bucket: string; ruta: string }>(); // token de subida -> destino
  const firmasLectura = new Map<string, { bucket: string; ruta: string; vence: number }>(); // token de descarga
  const firmasDescarga: FirmaDescargaFalsa[] = [];
  const peticiones: string[] = [];
  const publicos = new Set<string>([bucket]);

  /** "<prefijo><bucket>/<ruta>" -> [bucket, ruta], para cualquiera de los buckets. */
  const separar = (resto: string, prefijo: string): [string, string] | null => {
    for (const nombre of buckets.keys()) {
      if (resto.startsWith(`${prefijo}${nombre}/`)) return [nombre, resto.slice(`${prefijo}${nombre}/`.length)];
    }
    return null;
  };

  const servidor: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const ruta = decodeURIComponent(url.pathname);
      peticiones.push(`${req.method} ${ruta}`);
      // Como el gateway de Supabase: la clave en apikey (y, si viene Authorization, la misma).
      const autorizada =
        req.headers.apikey === clave &&
        (req.headers.authorization === undefined || req.headers.authorization === `Bearer ${clave}`);
      const infoBucket = /^\/storage\/v1\/bucket\/([^/]+)$/.exec(ruta);
      if (req.method === 'GET' && infoBucket) {
        if (!autorizada) return json(res, 403, { message: 'sin clave' });
        const nombre = infoBucket[1];
        if (!buckets.has(nombre)) return json(res, 400, { message: 'Bucket not found' });
        return json(res, 200, { id: nombre, name: nombre, public: publicos.has(nombre) });
      }
      const prefijo = '/storage/v1/object/';
      if (!ruta.startsWith(prefijo)) return json(res, 404, { message: 'no existe' });
      const resto = ruta.slice(prefijo.length);

      const publico = separar(resto, 'public/');
      if (req.method === 'GET' && publico) {
        const [nombreBucket, nombre] = publico;
        // Un bucket privado no se puede leer por la URL pública.
        if (nombreBucket !== bucket) return json(res, 400, { message: 'Bucket not found' });
        const objeto = objetos.get(nombre);
        if (!objeto) return json(res, 400, { message: 'Object not found' });
        return enviarObjeto(req, res, objeto, adjunto(url.searchParams.get('download')));
      }
      const subida = separar(resto, 'upload/sign/');
      if (subida) {
        const [nombreBucket, destino] = subida;
        if (req.method === 'POST') {
          if (!autorizada) return json(res, 403, { message: 'sin clave' });
          const token = randomBytes(8).toString('hex');
          firmas.set(token, { bucket: nombreBucket, ruta: destino });
          return json(res, 200, { url: `/object/upload/sign/${nombreBucket}/${destino}?token=${token}` });
        }
        if (req.method === 'PUT') {
          const token = url.searchParams.get('token') ?? '';
          const firma = firmas.get(token);
          if (firma?.bucket !== nombreBucket || firma.ruta !== destino) {
            return json(res, 400, { message: 'firma inválida' });
          }
          firmas.delete(token);
          buckets.get(nombreBucket)!.set(destino, {
            datos: await cuerpo(req),
            tipo: String(req.headers['content-type'] ?? ''),
            creado: new Date(),
          });
          return json(res, 200, { Key: destino });
        }
      }
      const lectura = separar(resto, 'sign/');
      if (lectura) {
        const [nombreBucket, nombre] = lectura;
        if (req.method === 'POST') {
          if (!autorizada) return json(res, 403, { message: 'sin clave' });
          if (!buckets.get(nombreBucket)!.has(nombre)) return json(res, 400, { message: 'Object not found' });
          const { expiresIn } = JSON.parse((await cuerpo(req)).toString() || '{}') as { expiresIn?: unknown };
          if (typeof expiresIn !== 'number' || expiresIn < 1) {
            return json(res, 400, { message: 'expiresIn is required' });
          }
          const token = randomBytes(12).toString('hex');
          firmasLectura.set(token, { bucket: nombreBucket, ruta: nombre, vence: Date.now() + expiresIn * 1000 });
          firmasDescarga.push({ bucket: nombreBucket, ruta: nombre, segundos: expiresIn });
          return json(res, 200, { signedURL: `/object/sign/${nombreBucket}/${nombre}?token=${token}` });
        }
        if (req.method === 'GET') {
          const firma = firmasLectura.get(url.searchParams.get('token') ?? '');
          if (firma?.bucket !== nombreBucket || firma.ruta !== nombre) {
            return json(res, 400, { message: 'InvalidSignature' });
          }
          if (Date.now() > firma.vence) return json(res, 400, { message: 'jwt expired' });
          const objeto = buckets.get(nombreBucket)!.get(nombre);
          if (!objeto) return json(res, 400, { message: 'Object not found' });
          return enviarObjeto(req, res, objeto, adjunto(url.searchParams.get('download')));
        }
      }
      if (!autorizada) return json(res, 403, { message: 'sin clave' });
      const listado = req.method === 'POST' && resto.startsWith('list/') ? buckets.get(resto.slice(5)) : undefined;
      if (listado) {
        const { prefix, limit, offset } = JSON.parse((await cuerpo(req)).toString()) as {
          prefix: string;
          limit: number;
          offset: number;
        };
        const lote = [...listado.entries()]
          .filter(([nombre]) => nombre.startsWith(`${prefix}/`))
          .map(([nombre, objeto]) => ({ name: nombre.slice(prefix.length + 1), objeto }))
          .filter(({ name }) => !name.includes('/'))
          .toSorted((a, b) => a.name.localeCompare(b.name))
          .slice(offset, offset + limit);
        return json(
          res,
          200,
          lote.map(({ name, objeto }) => ({
            name,
            id: name,
            created_at: (objeto.creado ?? new Date()).toISOString(),
          })),
        );
      }
      const borrado = req.method === 'DELETE' ? buckets.get(resto) : undefined;
      if (borrado) {
        const { prefixes } = JSON.parse((await cuerpo(req)).toString()) as { prefixes: string[] };
        const quitados = prefixes.filter((nombre) => borrado.delete(nombre));
        return json(res, 200, quitados.map((name) => ({ name })));
      }
      const objeto = separar(resto, '');
      if (objeto) {
        const [nombreBucket, nombre] = objeto;
        const contenido = buckets.get(nombreBucket)!;
        if (req.method === 'POST') {
          if (contenido.has(nombre) && req.headers['x-upsert'] !== 'true') {
            return json(res, 409, { message: 'The resource already exists' });
          }
          contenido.set(nombre, {
            datos: await cuerpo(req),
            tipo: String(req.headers['content-type'] ?? ''),
            cache: typeof req.headers['cache-control'] === 'string' ? req.headers['cache-control'] : undefined,
            creado: new Date(),
          });
          return json(res, 200, { Key: `${nombreBucket}/${nombre}` });
        }
        if (req.method === 'GET') {
          const encontrado = contenido.get(nombre);
          if (!encontrado) return json(res, 400, { message: 'Object not found' });
          return enviarObjeto(req, res, encontrado);
        }
      }
      return json(res, 404, { message: 'ruta no soportada' });
    })();
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    clave,
    bucket,
    objetos,
    privados: bucketsPrivados,
    firmasDescarga,
    publicos,
    peticiones,
    cerrar: () => new Promise((listo) => servidor.close(() => listo())),
  };
}
