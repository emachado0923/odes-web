import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

/**
 * Cerrojo de la indexación: un archivo `<índice>.lock` creado de forma
 * atómica (O_EXCL) con el PID, la máquina y la hora de inicio. Asegura que
 * solo corra una indexación a la vez sobre el mismo índice, venga de la
 * administración (proceso hijo del servidor) o de `npm run odes:indexar`.
 *
 * Un cerrojo se considera abandonado (y se reemplaza) si su proceso ya no
 * existe en esta máquina o si tiene más de MAXIMA_EDAD_MS.
 */

export interface DatosCerrojo {
  pid: number;
  host: string;
  /** ISO de inicio. */
  inicio: string;
  descripcion: string;
}

/** Tras este tiempo un cerrojo se considera abandonado aunque su PID exista. */
export const MAXIMA_EDAD_MS = 12 * 3_600_000;

export function rutaCerrojo(rutaIndice: string): string {
  return `${rutaIndice}.lock`;
}

/** Contenido del cerrojo, o null si no existe o no se puede interpretar. */
export function leerCerrojo(ruta: string): DatosCerrojo | null {
  let texto: string;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch {
    return null;
  }
  try {
    const datos = JSON.parse(texto) as Partial<DatosCerrojo>;
    if (
      typeof datos.pid !== 'number' ||
      typeof datos.host !== 'string' ||
      typeof datos.inicio !== 'string'
    ) {
      return null;
    }
    return {
      pid: datos.pid,
      host: datos.host,
      inicio: datos.inicio,
      descripcion: typeof datos.descripcion === 'string' ? datos.descripcion : '',
    };
  } catch {
    return null;
  }
}

/** ¿Existe el proceso? (EPERM = existe, pero es de otro usuario). */
export function procesoVivo(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** ¿El cerrojo sigue en uso? (proceso vivo en esta máquina y no demasiado viejo). */
export function cerrojoVigente(
  datos: DatosCerrojo,
  ahora: number = Date.now(),
  vivo: (pid: number) => boolean = procesoVivo,
): boolean {
  const inicio = Date.parse(datos.inicio);
  if (!Number.isFinite(inicio) || ahora - inicio > MAXIMA_EDAD_MS) return false;
  // En otra máquina (carpeta compartida) no se puede comprobar el PID.
  if (datos.host !== hostname()) return true;
  return vivo(datos.pid);
}

/** Cerrojo vigente de otro proceso, o null si está libre (o abandonado). */
export function cerrojoOcupado(rutaIndice: string): DatosCerrojo | null {
  const datos = leerCerrojo(rutaCerrojo(rutaIndice));
  if (!datos || datos.pid === process.pid) return null;
  return cerrojoVigente(datos) ? datos : null;
}

export interface Cerrojo {
  readonly ruta: string;
  /** Lo borra si sigue siendo de este proceso. Nunca lanza. */
  liberar(): void;
}

export type ResultadoCerrojo =
  | { tomado: true; cerrojo: Cerrojo }
  | { tomado: false; ocupado: DatosCerrojo };

function recienCreado(ruta: string): boolean {
  try {
    return Date.now() - statSync(ruta).mtimeMs < 10_000;
  } catch {
    return false;
  }
}

function crear(ruta: string, datos: DatosCerrojo): boolean {
  let descriptor: number;
  try {
    descriptor = openSync(ruta, 'wx', 0o644);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeSync(descriptor, JSON.stringify(datos));
  } finally {
    closeSync(descriptor);
  }
  return true;
}

/**
 * Toma el cerrojo del índice. Si está ocupado por otro proceso vigente,
 * devuelve sus datos; si está abandonado, lo reemplaza. Crea la carpeta del
 * índice si no existe (ODES_INDICE puede apuntar a una carpeta nueva).
 */
export function tomarCerrojo(
  rutaIndice: string,
  descripcion: string,
): ResultadoCerrojo {
  const ruta = rutaCerrojo(rutaIndice);
  mkdirSync(dirname(ruta), { recursive: true });
  const datos: DatosCerrojo = {
    pid: process.pid,
    host: hostname(),
    inicio: new Date().toISOString(),
    descripcion,
  };
  for (let intento = 0; intento < 3; intento++) {
    if (crear(ruta, datos)) {
      return {
        tomado: true,
        cerrojo: {
          ruta,
          liberar: () => {
            const actual = leerCerrojo(ruta);
            if (actual && actual.pid === datos.pid && actual.inicio === datos.inicio) {
              rmSync(ruta, { force: true });
            }
          },
        },
      };
    }
    const existente = leerCerrojo(ruta);
    if (existente && cerrojoVigente(existente)) {
      return { tomado: false, ocupado: existente };
    }
    // Ilegible y recién creado: otro proceso lo está escribiendo.
    if (!existente && recienCreado(ruta)) {
      return { tomado: false, ocupado: { ...datos, pid: -1, descripcion: 'otro proceso' } };
    }
    // Abandonado (o ilegible y viejo): se borra y se vuelve a intentar.
    rmSync(ruta, { force: true });
  }
  const existente = leerCerrojo(ruta);
  return {
    tomado: false,
    ocupado: existente ?? { ...datos, pid: -1, descripcion: 'desconocido' },
  };
}
