import type { Request } from 'express';

/**
 * Utilidades puras sobre la petición: cookies (sin cookie-parser), mismo
 * sitio (CSRF) e IP del cliente.
 */

/** Valor de una cookie de la cabecera Cookie, o undefined. */
export function leerCookie(
  cabecera: string | undefined,
  nombre: string,
): string | undefined {
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(';')) {
    const igual = parte.indexOf('=');
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() !== nombre) continue;
    let valor = parte.slice(igual + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) {
      valor = valor.slice(1, -1);
    }
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return undefined;
}

const PUERTOS_POR_DEFECTO: Readonly<Record<string, string>> = {
  'http:': '80',
  'https:': '443',
};

/**
 * ¿La petición viene de una página de este mismo sitio? Fetch Metadata
 * (Sec-Fetch-Site) y, en navegadores que no lo envían, Origin contra Host.
 * Sin ninguna de las dos es un cliente que no es navegador (curl, pruebas):
 * se admite, porque ese cliente no lleva la cookie de nadie más.
 */
export function esMismoSitio(req: Pick<Request, 'get'>): boolean {
  const sitio = req.get('sec-fetch-site');
  if (sitio) return sitio === 'same-origin' || sitio === 'none';
  const origen = req.get('origin');
  if (!origen) return true;
  const host = req.get('host')?.toLowerCase();
  if (!host || origen === 'null') return false;
  try {
    const url = new URL(origen);
    if (url.host === host) return true;
    const puerto = PUERTOS_POR_DEFECTO[url.protocol];
    return (
      !url.port && puerto !== undefined && `${url.hostname}:${puerto}` === host
    );
  } catch {
    return false;
  }
}

/** IP del cliente (con TRUST_PROXY, la real detrás de nginx), sin el prefijo ::ffff:. */
export function ipCliente(req: Pick<Request, 'ip' | 'socket'>): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'desconocida';
  return ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1').slice(0, 45);
}

export function esMutacion(metodo: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(metodo.toUpperCase());
}
