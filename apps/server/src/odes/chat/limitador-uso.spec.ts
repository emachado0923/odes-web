import { describe, expect, it } from 'vitest';
import { diaColombia, LimitadorUso, segundosHastaMedianoche } from './limitador-uso.js';

/** 2026-10-08 10:00 hora de Colombia (15:00 UTC). */
const BASE = Date.UTC(2026, 9, 8, 15, 0, 0);

function limitador(limites: Partial<{ limitePorMinuto: number; limitePorDia: number; limiteGlobalDia: number }>) {
  let ahora = BASE;
  const instancia = new LimitadorUso(
    { limitePorMinuto: 6, limitePorDia: 80, limiteGlobalDia: 3000, ...limites },
    () => ahora,
  );
  return { instancia, avanzar: (ms: number) => (ahora += ms) };
}

describe('LimitadorUso', () => {
  it('ventana deslizante de 60 s por IP con Retry-After', () => {
    const { instancia, avanzar } = limitador({ limitePorMinuto: 2 });
    expect(instancia.intentarIp('a')).toBeNull();
    avanzar(10_000);
    expect(instancia.intentarIp('a')).toBeNull();
    avanzar(5_000);
    expect(instancia.intentarIp('a')).toEqual({ motivo: 'minuto', reintentarEn: 45 });
    expect(instancia.intentarIp('b')).toBeNull();
    avanzar(45_000);
    expect(instancia.intentarIp('a')).toBeNull();
  });

  it('cupo diario por IP que se renueva a la medianoche de Colombia', () => {
    const { instancia, avanzar } = limitador({ limitePorMinuto: 0, limitePorDia: 3 });
    for (let i = 0; i < 3; i++) expect(instancia.intentarIp('a')).toBeNull();
    const rechazo = instancia.intentarIp('a');
    expect(rechazo?.motivo).toBe('dia');
    expect(rechazo?.reintentarEn).toBe(14 * 3600); // de las 10:00 a la medianoche
    avanzar(14 * 3600 * 1000);
    expect(instancia.intentarIp('a')).toBeNull();
  });

  it('las preguntas rechazadas no cuentan', () => {
    const { instancia } = limitador({ limitePorMinuto: 1, limitePorDia: 2 });
    expect(instancia.intentarIp('a')).toBeNull();
    for (let i = 0; i < 5; i++) expect(instancia.intentarIp('a')?.motivo).toBe('minuto');
  });

  it('cupo global diario', () => {
    const { instancia, avanzar } = limitador({ limiteGlobalDia: 2 });
    expect(instancia.intentarGlobal()).toBeNull();
    expect(instancia.intentarGlobal()).toBeNull();
    expect(instancia.intentarGlobal()?.motivo).toBe('global');
    avanzar(24 * 3600 * 1000);
    expect(instancia.intentarGlobal()).toBeNull();
  });

  it('0 desactiva cada límite', () => {
    const { instancia } = limitador({ limitePorMinuto: 0, limitePorDia: 0, limiteGlobalDia: 0 });
    for (let i = 0; i < 200; i++) {
      expect(instancia.intentarIp('a')).toBeNull();
      expect(instancia.intentarGlobal()).toBeNull();
    }
  });

  it('purga las IP inactivas de días anteriores', () => {
    const { instancia, avanzar } = limitador({});
    for (let i = 0; i < 300; i++) instancia.intentarIp(`ip-${i}`);
    expect(instancia.ipsRegistradas).toBe(300);
    avanzar(2 * 24 * 3600 * 1000);
    for (let i = 0; i < 200; i++) instancia.intentarIp('nueva');
    expect(instancia.ipsRegistradas).toBe(1);
  });
});

describe('día de Colombia', () => {
  it('cambia a las 00:00 de Medellín (05:00 UTC)', () => {
    expect(diaColombia(Date.UTC(2026, 9, 9, 4, 59))).toBe(diaColombia(BASE));
    expect(diaColombia(Date.UTC(2026, 9, 9, 5, 0))).toBe(diaColombia(BASE) + 1);
    expect(segundosHastaMedianoche(Date.UTC(2026, 9, 9, 4, 59, 30))).toBe(30);
  });
});
