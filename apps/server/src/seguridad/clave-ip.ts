import { isIPv4, isIPv6 } from 'node:net';

/**
 * Clave con la que se cuentan los límites por IP (preguntas del chat de ODES,
 * fallos de inicio de sesión del repositorio).
 *
 * Un cliente IPv6 suele controlar al menos un /64 completo (2^64 direcciones):
 * contar por la dirección exacta le permitiría saltarse cualquier límite
 * cambiando de dirección en cada petición. Por eso una IPv6 se cuenta por su
 * prefijo /64 (lo que normalmente es una sola máquina, red o VPS), como hace
 * `ipv6Subnet` en express-rate-limit. Una IPv4, o una IPv4 escrita como IPv6
 * (::ffff:a.b.c.d), se cuenta tal cual. Lo que no sea una IP se devuelve sin
 * cambios.
 *
 * Solo para contar: los registros y las sesiones guardan la dirección completa.
 */

/** Bits del prefijo IPv6 que identifican a un mismo cliente. */
export const PREFIJO_IPV6_LIMITES = 64;

const GRUPOS_PREFIJO = PREFIJO_IPV6_LIMITES / 16;

/** Los 8 grupos de 16 bits de una IPv6 válida (sin zona), o null. */
export function gruposIpv6(ip: string): number[] | null {
  let texto = ip.split('%')[0]!.toLowerCase();
  if (!isIPv6(texto)) return null;
  // IPv4 incrustada al final (::ffff:1.2.3.4, 64:ff9b::1.2.3.4): dos grupos.
  const ultimo = texto.lastIndexOf(':');
  const cola = texto.slice(ultimo + 1);
  if (cola.includes('.')) {
    if (!isIPv4(cola)) return null;
    const [a, b, c, d] = cola.split('.').map(Number) as [number, number, number, number];
    texto = `${texto.slice(0, ultimo + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const partes = texto.split('::');
  if (partes.length > 2) return null;
  const izquierda = partes[0] ? partes[0].split(':') : [];
  const derecha = partes.length === 2 && partes[1] ? partes[1].split(':') : [];
  const relleno = partes.length === 2 ? 8 - izquierda.length - derecha.length : 0;
  if (relleno < 0) return null;
  const grupos = [...izquierda, ...Array<string>(relleno).fill('0'), ...derecha].map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN,
  );
  return grupos.length === 8 && grupos.every((g) => Number.isInteger(g)) ? grupos : null;
}

export function claveLimiteIp(ip: string): string {
  const texto = ip.trim();
  if (isIPv4(texto)) return texto;
  const grupos = gruposIpv6(texto);
  if (!grupos) return texto;
  // IPv4 mapeada (::ffff:a.b.c.d, también en hexadecimal): la IPv4.
  if (grupos.slice(0, 5).every((g) => g === 0) && grupos[5] === 0xffff) {
    const [alto, bajo] = [grupos[6]!, grupos[7]!];
    return `${alto >> 8}.${alto & 0xff}.${bajo >> 8}.${bajo & 0xff}`;
  }
  return `${grupos
    .slice(0, GRUPOS_PREFIJO)
    .map((g) => g.toString(16))
    .join(':')}::/${PREFIJO_IPV6_LIMITES}`;
}
