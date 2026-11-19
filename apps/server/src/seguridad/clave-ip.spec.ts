import { describe, expect, it } from 'vitest';
import { claveLimiteIp, gruposIpv6 } from './clave-ip.js';

describe('claveLimiteIp', () => {
  it('una IPv4 (también escrita como IPv6) se cuenta tal cual', () => {
    expect(claveLimiteIp('203.0.113.7')).toBe('203.0.113.7');
    expect(claveLimiteIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(claveLimiteIp('::FFFF:1.2.3.4')).toBe('1.2.3.4');
    expect(claveLimiteIp('::ffff:102:304')).toBe('1.2.3.4');
    expect(claveLimiteIp('0:0:0:0:0:ffff:102:304')).toBe('1.2.3.4');
  });

  it('todas las direcciones de un mismo /64 comparten la clave', () => {
    const claves = new Set(
      ['2001:db8:1:2::1', '2001:db8:1:2::65', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:0DB8:0001:0002:0:0:0:70', '2001:db8:1:2::1%eth0'].map(
        claveLimiteIp,
      ),
    );
    expect([...claves]).toEqual(['2001:db8:1:2::/64']);
  });

  it('dos /64 distintos no comparten la clave', () => {
    expect(claveLimiteIp('2001:db8:1:2::1')).not.toBe(claveLimiteIp('2001:db8:1:3::1'));
    expect(claveLimiteIp('::1')).toBe('0:0:0:0::/64');
    expect(claveLimiteIp('64:ff9b::1.2.3.4')).toBe('64:ff9b:0:0::/64');
  });

  it('lo que no es una IP se devuelve sin cambios', () => {
    expect(claveLimiteIp('desconocida')).toBe('desconocida');
    expect(claveLimiteIp('1.2.3')).toBe('1.2.3');
    expect(claveLimiteIp(' 10.0.0.1 ')).toBe('10.0.0.1');
  });

  it('gruposIpv6 expande "::" y la IPv4 incrustada', () => {
    expect(gruposIpv6('2001:db8::8:800:200c:417a')).toEqual([0x2001, 0xdb8, 0, 0, 8, 0x800, 0x200c, 0x417a]);
    expect(gruposIpv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(gruposIpv6('::ffff:10.1.2.3')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0a01, 0x0203]);
    expect(gruposIpv6('10.1.2.3')).toBeNull();
    expect(gruposIpv6('2001:db8::1::2')).toBeNull();
  });
});
