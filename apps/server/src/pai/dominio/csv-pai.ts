/**
 * CSV para Excel en español de Colombia (GET /admin/exportar.csv): UTF-8 con
 * BOM (Excel reconoce las tildes), separador `;`, coma decimal y saltos de
 * línea CRLF entre filas. Contra la inyección de fórmulas:
 * - toda celda de texto va entre comillas dobles: así no se parte aunque el
 *   archivo se abra con otro separador (coma, tabulador, espacio…), y un
 *   "=" en medio del texto nunca queda al principio de otra celda;
 * - los textos que empiezan por = + - @ (o tabulador / retorno) llevan un
 *   apóstrofo delante para que Excel no los ejecute como fórmula.
 */

export const SEPARADOR_CSV = ';';
export const BOM_UTF8 = '\uFEFF';
const SALTO_CSV = '\r\n';

/** Caracteres con los que Excel empieza una fórmula. */
const INICIO_FORMULA = /^[=+\-@\t\r]/;

/**
 * Celda de texto (null = vacía): protegida contra fórmulas y siempre entre
 * comillas (ver el encabezado del módulo).
 */
export function celdaTexto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const seguro = INICIO_FORMULA.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Celda numérica con coma decimal y sin separador de miles (como la escribe
 * Excel es-CO), hasta `decimales` cifras sin ceros sobrantes; null = vacía.
 */
export function celdaNumero(
  valor: number | null | undefined,
  decimales = 10,
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return '';
  }
  let texto = valor.toFixed(decimales);
  if (texto.includes('.')) texto = texto.replace(/\.?0+$/, '');
  if (texto === '-0') texto = '0';
  return texto.replace('.', ',');
}

/** Porcentaje (fracción, 1 = 100 %) como número en escala 0-100 con 2 decimales. */
export function celdaPorcentaje(fraccion: number | null | undefined): string {
  if (fraccion === null || fraccion === undefined) return '';
  return celdaNumero(fraccion * 100, 2);
}

/** Archivo CSV completo: BOM, encabezados y filas (celdas ya formateadas). */
export function generarCsv(
  encabezados: readonly string[],
  filas: readonly (readonly string[])[],
): Buffer {
  const lineas = [
    encabezados.map((encabezado) => celdaTexto(encabezado)).join(SEPARADOR_CSV),
    ...filas.map((fila) => fila.join(SEPARADOR_CSV)),
  ];
  return Buffer.from(BOM_UTF8 + lineas.join(SALTO_CSV) + SALTO_CSV, 'utf8');
}
