import type { ConfiguracionOdes } from '../configuracion-odes.js';

/**
 * Límites de uso en memoria (un solo proceso; con varios procesos cada uno
 * cuenta por separado):
 * - por IP: ventana deslizante de 60 s y cupo por día de Colombia;
 * - global: preguntas con IA por día (tope de costo para todo el sitio).
 *
 * El día se cuenta en la hora de Colombia (UTC-5, sin horario de verano):
 * los cupos se renuevan a la medianoche de Medellín.
 */

const MINUTO_MS = 60_000;
const DESFASE_COLOMBIA_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Cada cuántas consultas se purgan las IP inactivas. */
const PURGA_CADA = 500;
/** Tope de IP en memoria: por encima se olvidan las más antiguas. */
const MAX_IPS = 100_000;

export type Rechazo = {
  readonly motivo: 'minuto' | 'dia' | 'global';
  /** Segundos para la cabecera Retry-After. */
  readonly reintentarEn: number;
};

interface RegistroIp {
  /** Marcas de tiempo (ms) de las preguntas del último minuto. */
  minuto: number[];
  dia: number;
  cuentaDia: number;
}

export type Reloj = () => number;

/** Número de día de Colombia (días desde 1970 en UTC-5). */
export function diaColombia(ahora: number): number {
  return Math.floor((ahora + DESFASE_COLOMBIA_MS) / DIA_MS);
}

/** Segundos hasta la próxima medianoche de Colombia. */
export function segundosHastaMedianoche(ahora: number): number {
  const siguiente = (diaColombia(ahora) + 1) * DIA_MS - DESFASE_COLOMBIA_MS;
  return Math.max(1, Math.ceil((siguiente - ahora) / 1000));
}

export class LimitadorUso {
  readonly #porIp = new Map<string, RegistroIp>();
  #diaGlobal = -1;
  #cuentaGlobal = 0;
  #consultas = 0;

  constructor(
    private readonly limites: Pick<
      ConfiguracionOdes,
      'limitePorMinuto' | 'limitePorDia' | 'limiteGlobalDia'
    >,
    private readonly reloj: Reloj = Date.now,
  ) {}

  /**
   * Registra una pregunta de `ip` si está dentro de los límites por IP.
   * Devuelve null si se acepta, o el motivo del rechazo (sin registrarla).
   */
  intentarIp(ip: string): Rechazo | null {
    const ahora = this.reloj();
    if (++this.#consultas % PURGA_CADA === 0) this.#purgar(ahora);
    const dia = diaColombia(ahora);
    let registro = this.#porIp.get(ip);
    if (!registro) {
      registro = { minuto: [], dia, cuentaDia: 0 };
      this.#porIp.set(ip, registro);
    }
    registro.minuto = registro.minuto.filter((marca) => ahora - marca < MINUTO_MS);
    if (registro.dia !== dia) {
      registro.dia = dia;
      registro.cuentaDia = 0;
    }
    const { limitePorMinuto, limitePorDia } = this.limites;
    if (limitePorMinuto > 0 && registro.minuto.length >= limitePorMinuto) {
      const masAntigua = registro.minuto[0] ?? ahora;
      return {
        motivo: 'minuto',
        reintentarEn: Math.max(1, Math.ceil((masAntigua + MINUTO_MS - ahora) / 1000)),
      };
    }
    if (limitePorDia > 0 && registro.cuentaDia >= limitePorDia) {
      return { motivo: 'dia', reintentarEn: segundosHastaMedianoche(ahora) };
    }
    registro.minuto.push(ahora);
    registro.cuentaDia++;
    return null;
  }

  /** Registra una pregunta con IA en el cupo global del día. */
  intentarGlobal(): Rechazo | null {
    const ahora = this.reloj();
    const dia = diaColombia(ahora);
    if (dia !== this.#diaGlobal) {
      this.#diaGlobal = dia;
      this.#cuentaGlobal = 0;
    }
    const { limiteGlobalDia } = this.limites;
    if (limiteGlobalDia > 0 && this.#cuentaGlobal >= limiteGlobalDia) {
      return { motivo: 'global', reintentarEn: segundosHastaMedianoche(ahora) };
    }
    this.#cuentaGlobal++;
    return null;
  }

  /** IP registradas (para pruebas y diagnóstico). */
  get ipsRegistradas(): number {
    return this.#porIp.size;
  }

  /** Quita las IP sin actividad en el último minuto y de días anteriores. */
  #purgar(ahora: number): void {
    const dia = diaColombia(ahora);
    for (const [ip, registro] of this.#porIp) {
      const activaMinuto = registro.minuto.some((marca) => ahora - marca < MINUTO_MS);
      if (!activaMinuto && (registro.dia !== dia || registro.cuentaDia === 0)) {
        this.#porIp.delete(ip);
      }
    }
    // Un Map recorre en orden de inserción: se olvidan las IP más antiguas.
    for (const ip of this.#porIp.keys()) {
      if (this.#porIp.size <= MAX_IPS) break;
      this.#porIp.delete(ip);
    }
  }
}
