/**
 * Fechas del CRM. La oficina trabaja en hora de Bogotá (UTC−5, sin horario de
 * verano): «vencida» y «hoy» se calculan allí, no en la hora del servidor
 * (Cloud Run corre en UTC).
 */

const FORMATO_DIA_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoy en Bogotá como 'AAAA-MM-DD'. */
export function hoyBogota(ahora: Date = new Date()): string {
  return FORMATO_DIA_BOGOTA.format(ahora);
}

/** El instante de hace `dias` días (para «terminadas en los últimos N días»). */
export function haceDias(dias: number, ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
}

/** Un DATE de la base ('AAAA-MM-DD', o Date de mysql2/pg a medianoche) como 'AAAA-MM-DD'. */
export function aFechaTexto(valor: string | Date | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  // mysql2 (timezone 'Z') entrega un DATE a medianoche UTC; pg, a medianoche
  // de la zona del proceso. Si no es medianoche UTC, se leen las partes locales.
  const utc = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0;
  const a = utc ? valor.getUTCFullYear() : valor.getFullYear();
  const m = (utc ? valor.getUTCMonth() : valor.getMonth()) + 1;
  const d = utc ? valor.getUTCDate() : valor.getDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** DATETIME/timestamptz de la base como ISO 8601, o null. */
export function aIso(valor: string | Date | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}
