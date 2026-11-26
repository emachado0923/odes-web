/**
 * Fichas de la ventanilla de consulta de los fondos armadas EN VIVO desde la base de Sapiencia
 * (`analitica_fondos`, servidor bdconvocatoriasfondos), con la misma forma que las que escribe
 * datos/tableros/fondos-2026/etl_consulta.py desde el Power BI: la web no nota la diferencia.
 *
 *   p: clave del programa · c: convocatoria · n: nombre · e: estado
 *   s: [[título, [[etiqueta, valor], …]], …] · t: [[título, [columnas…], [[fila…], …]]]
 *
 * De dónde sale cada programa (mapa del 19-nov-2026):
 * - Pregrado (EPM, PP, PUAP RO, PUAP PP, CDJ): informacion_transaccional (una fila por periodo) +
 *   tb_estado_periodo (nombre del estado) + informacion_personal + informacion_programas_academicos
 *   (por docconvfondo) + prorroga_periodo_de_gracia y renuncia_o_terminacion (cierre). Es lo que el
 *   Power BI llama BASE 0 PREGRADO y su Tabla_Resumen_Pregrado (la última fila de cada beneficio).
 * - Mejores Bachilleres: mejores_bachilleres · Mejores Deportistas: mejores_deportistas.
 * - Formación Avanzada y Extendiendo Fronteras: posgrado_beneficio_periodo (id_fondo 3 = FA; 4 y 11 =
 *   EFE recursos ordinarios / PP; 14 = CDJ de posgrado).
 * - Enlaza Mundos: posgrado_em_beneficio_periodo · Eventos: vista_eventos_beneficiarios.
 *
 * Las columnas se buscan por nombre con una clave tolerante (sin tildes, espacios, signos ni vocales):
 * mejores_deportistas tiene nombres con tildes mal guardadas («PER?ODO RENOVADO») y mejores_bachilleres
 * escribe con guion bajo lo que el Power BI escribe con espacios. Lo que falta, se omite.
 */

/** Una fila tal como la devuelve mysql2 (con dateStrings: las fechas llegan como texto). */
export type Fila = Record<string, unknown>;

/** Consulta parametrizada de solo lectura contra analitica_fondos. */
export type Consultar = (sql: string, valores: unknown[]) => Promise<Fila[]>;

export type Seccion = [string, [string, string][]];
export type Tabla = [string, string[], string[][]];

export interface FichaFondos {
  p: string;
  c: string;
  n: string;
  e: string;
  s: Seccion[];
  t: Tabla[];
}

// ── Valores ──────────────────────────────────────────────────────────────────────────────

const VACIOS = /^(?:|nan|none|nat|null)$/i;
const vacio = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && VACIOS.test(v.trim()));

/** Texto para mostrar, como texto() del ETL: sin espacios de más, fechas sin hora y enteros sin «.0». */
export function texto(v: unknown): string {
  if (vacio(v)) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'bigint') return v.toString();
  const t = String(v).replaceAll(/\s+/g, ' ').trim();
  const fecha = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00(?:\.0+)?$/.exec(t);
  if (fecha) return fecha[1];
  return /^-?\d+\.0+$/.test(t) ? t.replace(/\.0+$/, '') : t;
}

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Número de un valor de la base: 3800000, «3800000.00», «$ 3.800.000» → 3800000; otra cosa → null. */
export function numero(v: unknown): number | null {
  if (vacio(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  const s = String(v).replaceAll(/[$\s]/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replaceAll('.', '').replace(',', '.'));
  return null;
}

/** Pesos para mostrar, como pesos() del ETL: «$ 3.800.000». Si no es un número, el texto tal cual. */
export function pesos(v: unknown): string {
  const n = numero(v);
  if (n === null) return texto(v);
  return `$ ${FORMATO_PESOS.format(Math.round(n))}`;
}

/** Documento como lo normaliza la búsqueda (mayúsculas, sin espacios, puntos ni guiones). */
export function claveDocumento(v: unknown): string {
  const t = texto(v);
  return (/^\d+\.0$/.test(t) ? t.slice(0, -2) : t).replaceAll(/[\s.-]/g, '').toUpperCase();
}

const sinTildes = (t: string): string => t.normalize('NFD').replaceAll(/[̀-ͯ]/g, '');
const claveTexto = (t: string): string => sinTildes(t).toUpperCase().replaceAll(/\s+/g, ' ').trim();

// ── Columnas ─────────────────────────────────────────────────────────────────────────────

/** Clave tolerante de un nombre de columna: sin tildes, signos, espacios ni vocales. */
export const claveColumna = (nombre: string): string =>
  sinTildes(nombre)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, '')
    .replaceAll(/[AEIOU]/g, '');

/** Lee una columna por su nombre (o el primero de varios con valor) con la clave tolerante. */
export type Leer = (fila: Fila | undefined, columna: string | readonly string[]) => unknown;

export function lectorDe(filas: readonly Fila[]): Leer {
  const mapa = new Map<string, string>();
  for (const fila of filas.slice(0, 1)) {
    for (const nombre of Object.keys(fila)) {
      const k = claveColumna(nombre);
      if (!mapa.has(k)) mapa.set(k, nombre);
    }
  }
  return (fila, columna) => {
    if (!fila) return undefined;
    for (const c of typeof columna === 'string' ? [columna] : columna) {
      const real = mapa.get(claveColumna(c));
      if (real !== undefined && !vacio(fila[real])) return fila[real];
    }
    return undefined;
  };
}

/** Periodo con guion: mejores_deportistas escribe la mayoría como «2020 2». */
export const periodo = (v: unknown): string => texto(v).replace(/^(\d{4})\s*[-_ ]\s*(\d)$/, '$1-$2');

/** Campo de una sección o columna de un historial: [etiqueta, columna(s), tipo]; '$' = pesos, 'p' = periodo. */
type Campo = readonly [string, string | readonly string[], 't' | '$' | 'p'];

const valor = (leer: Leer, fila: Fila | undefined, columna: Campo[1], tipo: Campo[2]): string => {
  const v = leer(fila, columna);
  if (tipo === '$') return pesos(v);
  return tipo === 'p' ? periodo(v) : texto(v);
};

function seccion(titulo: string, fila: Fila | undefined, leer: Leer, campos: readonly Campo[]): Seccion | null {
  const pares = campos.map(([etiqueta, columna, tipo]): [string, string] => [etiqueta, valor(leer, fila, columna, tipo)]);
  const llenos = pares.filter(([, v]) => v !== '');
  return llenos.length > 0 ? [titulo, llenos] : null;
}

/** Sección con valores ya calculados (los que no son una columna). */
function seccionDe(titulo: string, pares: readonly [string, string][]): Seccion | null {
  const llenos = pares.filter(([, v]) => v !== '');
  return llenos.length > 0 ? [titulo, [...llenos]] : null;
}

function historial(titulo: string, filas: readonly Fila[], leer: Leer, campos: readonly Campo[]): Tabla | null {
  const datos = filas.map((f) => campos.map(([, columna, tipo]) => valor(leer, f, columna, tipo))).filter((d) => d.some(Boolean));
  return datos.length > 0 ? [titulo, campos.map(([etiqueta]) => etiqueta), datos] : null;
}

/** Agrupa conservando el orden de aparición. */
function agrupar(filas: readonly Fila[], clave: (f: Fila) => string): Fila[][] {
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = clave(f);
    const lista = grupos.get(k);
    if (lista) lista.push(f);
    else grupos.set(k, [f]);
  }
  return [...grupos.values()];
}

/** Ordena por periodo como el ETL (texto, estable): «2019-2» < «2020-1» < «2020-3». */
const porPeriodo = (filas: readonly Fila[], leer: Leer, columna: string): Fila[] =>
  filas.toSorted((a, b) => periodo(leer(a, columna)).localeCompare(periodo(leer(b, columna))));

const PERIODO_COMPLETO = /^\d{4}-\d$/;

/**
 * Quita los periodos anteriores a la convocatoria del beneficio: no pueden ser suyos. En analitica_fondos hay
 * (revisado el 25-nov-2026) un beneficio de Extendiendo Fronteras con el historial de una beca anterior de la
 * misma persona copiado bajo su clave, y la ventanilla lo mostraba dos veces. Si quitarlos dejara el beneficio
 * sin periodos, se conservan todos.
 */
function desdeLaConvocatoria(filas: readonly Fila[], leer: Leer, columnaPeriodo: string, columnaConvocatoria: string): Fila[] {
  const propias = filas.filter((f) => {
    const p = periodo(leer(f, columnaPeriodo));
    const c = periodo(leer(f, columnaConvocatoria));
    return !(PERIODO_COMPLETO.test(p) && PERIODO_COMPLETO.test(c) && p < c);
  });
  return propias.length > 0 ? propias : [...filas];
}

function ficha(p: string, c: unknown, n: unknown, e: unknown, s: (Seccion | null)[], t: (Tabla | null)[]): FichaFondos {
  return { p, c: texto(c), n: texto(n), e: texto(e), s: s.filter((x): x is Seccion => x !== null), t: t.filter((x): x is Tabla => x !== null) };
}

// ── Programas ────────────────────────────────────────────────────────────────────────────

/** Clave del programa de pregrado según fondo_sapiencia (la misma de clave_fondo() del ETL). */
export function claveFondo(v: unknown): string {
  const t = claveTexto(texto(v));
  if (t.includes('PUAP') || t.includes('UNICO')) return t.split(' ').includes('PP') || t.includes('PRESUPUESTO') ? 'PUAP PP' : 'PUAP RO';
  if (t.includes('EPM')) return 'EPM';
  if (t.includes('PRESUPUESTO') || t === 'PP') return 'PP';
  if (t.includes('CDJ') || t.includes('JUVENTUD')) return 'CDJ';
  return t.slice(0, 16) || 'PREGRADO';
}

/** Programa de posgrado según id_fondo de posgrado_beneficio_periodo. */
function programaPosgrado(idFondo: unknown, fuente: unknown): string | null {
  const id = numero(idFondo);
  if (id === 3) return 'FA';
  if (id === 4 || id === 11) return 'EFE';
  if (id === 14) return 'CDJ';
  const t = claveTexto(texto(fuente));
  if (t.includes('FORMACION AVANZADA')) return 'FA';
  if (t.includes('EXTENDIENDO')) return 'EFE';
  return null;
}

const HISTORIAL = 'Historial por periodo';

/** La primera fila de cada docconvfondo (las consultas vienen ordenadas: la primera es la vigente). */
function primeraPor(lista: readonly Fila[]): Map<string, Fila> {
  const mapa = new Map<string, Fila>();
  for (const f of lista) {
    const k = texto(f.docconvfondo);
    if (!mapa.has(k)) mapa.set(k, f);
  }
  return mapa;
}

async function pregrado(consultar: Consultar, documento: string, enMB: boolean, enMD: boolean): Promise<FichaFondos[]> {
  const filas = await consultar(
    `SELECT t.*, e.estado_periodo AS estado_nombre
       FROM informacion_transaccional t
       LEFT JOIN tb_estado_periodo e ON e.id_estado = t.estado
      WHERE t.DOCUMENTO = ?
      ORDER BY t.id`,
    [documento],
  );
  if (filas.length === 0) return [];
  const leerT = lectorDe(filas);
  const grupos = agrupar(filas, (f) => texto(leerT(f, 'docconvfondo')));
  const claves = grupos.map((g) => texto(leerT(g[0], 'docconvfondo'))).filter(Boolean);

  const [personales, academicas, prorrogas, renuncias] = await Promise.all([
    consultar('SELECT * FROM informacion_personal WHERE docconvfondo IN (?)', [claves]),
    consultar('SELECT * FROM informacion_programas_academicos WHERE docconvfondo IN (?)', [claves]),
    // La prórroga vigente es la del registro más reciente (BD_Prorrogas_PeriodoDeGracia del Power BI).
    consultar('SELECT docconvfondo, fecha_fin_prorroga FROM prorroga_periodo_de_gracia WHERE docconvfondo IN (?) ORDER BY fecha_registro DESC, id DESC', [claves]),
    consultar(
      'SELECT docconvfondo, motivo_renuncia_o_terminacion FROM renuncia_o_terminacion WHERE docconvfondo IN (?) ORDER BY fecha_creacion DESC, id DESC',
      [claves],
    ),
  ]);
  const personal = primeraPor(personales);
  const academica = primeraPor(academicas);
  const prorroga = primeraPor(prorrogas);
  const renuncia = primeraPor(renuncias);
  const leerP = lectorDe(personales);
  const leerA = lectorDe(academicas);

  return grupos.map((grupo) => {
    const periodos = porPeriodo(grupo, leerT, 'periodo_renovado');
    const u = periodos.at(-1);
    const dcf = texto(leerT(u, 'docconvfondo'));
    const pe = personal.get(dcf);
    const ac = academica.get(dcf);
    const total = periodos.reduce((suma, f) => suma + (numero(leerT(f, 'monto_matricula')) ?? 0) + (numero(leerT(f, 'monto_sostenimiento')) ?? 0), 0);
    // Motivo_Finalizacion_compilado del Power BI: el de la base o, si no hay, el de la renuncia.
    const motivoFinal = texto(leerT(u, 'motivo_finalizacion')) || texto(renuncia.get(dcf)?.motivo_renuncia_o_terminacion) || 'NO APLICA';
    const filasHistorial = periodos.map((f): Fila => {
      const matricula = numero(leerT(f, 'monto_matricula'));
      const sostenimiento = numero(leerT(f, 'monto_sostenimiento'));
      const semestres = numero(leerT(f, 'semestres_financiar'));
      const giros = numero(leerT(f, 'giros_realizados'));
      return {
        periodo: leerT(f, 'periodo_renovado'),
        estado: leerT(f, ['estado_nombre', 'estado']),
        motivo: leerT(f, 'motivo_estado'),
        modalidad: leerT(f, 'modalidad'),
        giros: giros,
        pendientes: semestres !== null && giros !== null ? semestres - giros : null,
        semestres: semestres,
        matricula,
        sostenimiento,
        total: matricula === null && sostenimiento === null ? null : (matricula ?? 0) + (sostenimiento ?? 0),
      };
    });
    const leerH = lectorDe(filasHistorial);
    return ficha(
      claveFondo(leerT(u, 'fondo_sapiencia')),
      leerT(u, 'convocatoria'),
      leerP(pe, 'nombre_completo'),
      leerT(u, 'estado_general'),
      [
        seccionDe('Beneficio', [
          ['Fondo', texto(leerT(u, 'fondo_sapiencia'))],
          ['Convocatoria', texto(leerT(u, 'convocatoria'))],
          ['Estado general', texto(leerT(u, 'estado_general'))],
          ['Resolución reglamentaria', texto(leerT(u, 'resolucion_reglamentaria'))],
          ['Operador financiero', texto(leerT(u, 'operador_financiero'))],
          ['ID solicitud', texto(leerT(u, 'id_solicitud'))],
          ['Contrato', texto(leerT(u, 'nro_contrato'))],
          ['Contrato fiduciario', texto(leerT(u, 'numero_contrato_fiduciario'))],
          ['También en Mejores Bachilleres', enMB ? 'SI' : 'NO'],
          ['También en Mejores Deportistas', enMD ? 'SI' : 'NO'],
        ]),
        seccionDe('Cierre y PACC', [
          ['Total desembolsado', pesos(total)],
          ['Motivo de finalización', motivoFinal],
          ['Fecha máxima del periodo de gracia', texto(prorroga.get(dcf)?.fecha_fin_prorroga)],
          ['PACC', texto(leerT(u, 'pacc'))],
          ['Fecha PACC', texto(leerT(u, 'pacc_fecha'))],
        ]),
        seccion('Datos personales', pe, leerP, [
          ['Nombre', 'nombre_completo', 't'],
          ['Tipo de documento', 'tipo_documento', 't'],
          ['Documento', 'documento', 't'],
          ['ID usuario TI', 'id_usuario', 't'],
          ['Celular', 'celular', 't'],
          ['Celular alternativo', 'celular_alternativo', 't'],
          ['Teléfono', 'telefono', 't'],
          ['Correo', 'correo', 't'],
          ['Correo alternativo', 'correo_alternativo', 't'],
          ['Municipio de residencia', 'municipio_residencia_actual', 't'],
          ['Comuna de residencia', 'comuna_residencia_actual', 't'],
        ]),
        seccion('Información académica', ac, leerA, [
          ['IES de legalización', 'ies_legalizacion', 't'],
          ['Programa de legalización', 'programa_legalizacion', 't'],
          ['IES actual', 'ies_actual', 't'],
          ['Programa actual', 'programa_actual', 't'],
          ['Semestres del programa', 'numero_semestres_programa', 't'],
          ['Créditos del programa', 'numero_total_creditos_programa', 't'],
        ]),
      ],
      [
        historial(HISTORIAL, filasHistorial, leerH, [
          ['Periodo', 'periodo', 'p'],
          ['Estado', 'estado', 't'],
          ['Motivo', 'motivo', 't'],
          ['Modalidad', 'modalidad', 't'],
          ['Giros realizados', 'giros', 't'],
          ['Giros pendientes', 'pendientes', 't'],
          ['Semestres a financiar', 'semestres', 't'],
          ['Matrícula', 'matricula', '$'],
          ['Sostenimiento', 'sostenimiento', '$'],
          ['Monto total', 'total', '$'],
        ]),
      ],
    );
  });
}

function mejoresBachilleres(filas: readonly Fila[]): FichaFondos[] {
  const leer = lectorDe(filas);
  return agrupar(filas, (f) => texto(leer(f, 'CONVOCATORIA'))).map((grupo) => {
    const g = porPeriodo(grupo, leer, 'periodo_renovado');
    const u = g.at(-1);
    return ficha(
      'MB',
      leer(u, 'CONVOCATORIA'),
      leer(u, 'Nombre'),
      leer(u, 'ESTADO GENERAL'),
      [
        seccion('Beneficio', u, leer, [
          ['Convocatoria', 'CONVOCATORIA', 't'],
          ['Estado general', 'ESTADO GENERAL', 't'],
          ['Motivo del estado', 'MOTIVO ESTADO', 't'],
          ['Habilitado para renovar', 'Habilitado para renovar', 't'],
          ['Resolución de selección', 'Resolucion_seleccionado', 't'],
        ]),
        seccion('Datos personales', u, leer, [
          ['Nombre', 'Nombre', 't'],
          ['Tipo de documento', 'Tipo_de_documento', 't'],
          ['Documento', 'DOCUMENTO DE IDENTIDAD', 't'],
          ['ID usuario TI', 'ID USUARIO TI', 't'],
          ['Celular', 'Celular', 't'],
          ['Teléfono fijo', 'Telefono_fijo', 't'],
          ['Correo', 'Correo', 't'],
          ['Correo alterno', 'Correo_alterno', 't'],
          ['Municipio de residencia', 'Municipio_de_residencia', 't'],
          ['Comuna de residencia', 'Comuna_de_residencia', 't'],
        ]),
        seccion('Información académica', u, leer, [
          ['IES actual', 'IES_estudia_actualmente', 't'],
          ['Programa actual', 'Programa_estudia_actualmente', 't'],
          ['Cambió de programa o universidad', 'Cambio_Programa_Universidad', 't'],
          ['Programa anterior', 'Programa_estudiaba_anteiormente', 't'],
          ['Periodo de inicio en la nueva IES', 'Periodo_inicio_nueva_IES_Programa', 't'],
          ['Semestres del pregrado', 'Semestres_totales_pregrado', 't'],
          ['Créditos del pregrado', 'Creditos_totales_pregrado', 't'],
        ]),
      ],
      [
        historial(HISTORIAL, g, leer, [
          ['Periodo', 'periodo_renovado', 'p'],
          ['Estado', 'ESTADO PERIODO RENOVADO', 't'],
          ['Modalidad', 'modalidad_estudio', 't'],
          ['Promedio acumulado', 'Promedio_acumulado_carrera', 't'],
          ['Giros realizados', 'giros_realizados', 't'],
          ['Giros pendientes', 'giros_pendientes', 't'],
          ['Giros proyectados', 'giros_proyectados', 't'],
          ['Desembolsado en el periodo', 'MONTO DESEMBOLSADO', '$'],
          ['Total desembolsado', 'monto_total_desembolsado', '$'],
        ]),
      ],
    );
  });
}

function mejoresDeportistas(filas: readonly Fila[]): FichaFondos[] {
  const leer = lectorDe(filas);
  return agrupar(filas, (f) => texto(leer(f, 'CONVOCATORIA'))).map((grupo) => {
    const g = porPeriodo(grupo, leer, 'PERIODO RENOVADO');
    const u = g.at(-1);
    return ficha(
      'MD',
      leer(u, 'CONVOCATORIA'),
      leer(u, 'NOMBRE COMPLETO BENEFICIARIO'),
      leer(u, 'ESTADO'),
      [
        seccion('Beneficio', u, leer, [
          ['Convocatoria', 'CONVOCATORIA', 't'],
          ['Estado', 'ESTADO', 't'],
          ['Motivo del estado', 'MOTIVO ESTADO', 't'],
          ['Habilitado para renovar', 'Habilitado para renovar', 't'],
          ['Resolución (acto administrativo)', 'N RESOLUCION (ACTO ADMINISTRATIVO)', 't'],
          ['Operador financiero', 'FIDUCIA (OPERADOR)', 't'],
          ['Contrato', 'CONTRATO', 't'],
        ]),
        seccion('Datos personales', u, leer, [
          ['Nombre', 'NOMBRE COMPLETO BENEFICIARIO', 't'],
          ['Tipo de documento', 'TIPO DOCUMENTO', 't'],
          ['Documento', 'DOCUMENTO BENEFICIARIO', 't'],
          ['ID usuario TI', 'ID USUARIO TI', 't'],
          ['Celular', 'CELULAR', 't'],
          ['Teléfono', 'TELEFONO', 't'],
          ['Correo', 'CORREO ELECTRONICO', 't'],
          ['Correo alterno', 'CORREO ELECTRONICO ALTERNO', 't'],
          ['Municipio de residencia', 'MUNICIPIO DE RESIDENCIA', 't'],
          ['Comuna de residencia', 'COMUNA O CORREGIMIENTO DONDE RESIDE', 't'],
          ['Tutor', 'NOMBRE TUTOR', 't'],
          ['Celular del tutor', 'CELULAR TUTOR', 't'],
          ['Teléfono del tutor', 'TELEFONO TUTOR', 't'],
          ['Correo del tutor', 'CORREO ELECTRONICO TUTOR', 't'],
        ]),
        seccion('Información académica y deportiva', u, leer, [
          ['Universidad', 'UNIVERSIDAD', 't'],
          ['Programa', 'PROGRAMA', 't'],
          ['Universidad anterior', 'UNIVERSIDAD ANTERIOR', 't'],
          ['Créditos totales (SNIES)', 'CREDITOS TOTALES SNIES', 't'],
          ['Créditos mínimos para renovar', 'CREDITOS MINIMOS PARA RENOVAR', 't'],
          ['Deporte', 'DEPORTE', 't'],
          ['Juegos', 'JUEGOS EN LOS QUE PARICIPO', 't'],
          ['Medalla', 'MEDALLA', 't'],
        ]),
      ],
      [
        historial(HISTORIAL, g, leer, [
          ['Periodo', 'PERIODO RENOVADO', 'p'],
          ['Estado', 'ESTADO PERIODO RENOVADO', 't'],
          ['Modalidad', 'MODALIDAD CREDITO', 't'],
          ['Giros realizados', 'N GIROS REALIZADOS', 't'],
          ['Giros pendientes', 'GIROS PENDIENTES', 't'],
          ['Semestres pactados', 'TOTAL DE SEMESTRES PACTADOS', 't'],
          ['Semestres del pregrado', 'No. SEMESTRES PREGRADO', 't'],
          ['Desembolsado en el periodo', 'MONTO DESEMBOLSADO', '$'],
          ['Total girado', 'TOTAL GIRADO ACTUAL', '$'],
        ]),
      ],
    );
  });
}

function posgrado(filas: readonly Fila[]): FichaFondos[] {
  const leer = lectorDe(filas);
  return agrupar(filas, (f) => texto(leer(f, ['docconvfondo', 'docconv']))).flatMap((grupo) => {
    const g = porPeriodo(desdeLaConvocatoria(grupo, leer, 'periodo_renovado', 'convocatoria'), leer, 'periodo_renovado');
    const u = g.at(-1);
    const p = programaPosgrado(leer(u, 'id_fondo'), leer(u, 'fuente_de_financiacion'));
    if (!p) return [];
    const efe = p === 'EFE';
    // En casi todas las filas estado_general trae el código (0/1) e id_estado_general_actual el texto
    // («NO ACTIVO»): las columnas están intercambiadas. Vale la que tenga texto.
    const estadoGeneral = [leer(u, 'estado_general'), leer(u, 'id_estado_general_actual')].map(texto).find((v) => v !== '' && !/^\d+$/.test(v)) ?? '';
    return [
      ficha(
        p,
        leer(u, 'convocatoria'),
        leer(u, 'nombre_completo_beneficaria'),
        estadoGeneral,
        [
          seccion('Beneficio', { ...u, estado_general_texto: estadoGeneral }, lectorDe([{ ...u, estado_general_texto: estadoGeneral }]), [
            ['Convocatoria', 'convocatoria', 't'],
            ...(efe ? ([['Fuente de financiación', 'fuente_de_financiacion', 't']] as const) : []),
            ['Estado general', 'estado_general_texto', 't'],
            efe ? ['Motivo del estado', 'motivo_estado_periodo_renovado', 't'] : ['Estado del periodo', 'estado_periodo_renovado', 't'],
            ['Habilitado para renovar', 'habilitado_para_renovar', 't'],
            ['Operador financiero', 'operador_financiero', 't'],
            ['Contrato', 'numero_contrato', 't'],
            ['PACC', 'pacc', 't'],
          ]),
          seccion('Datos personales', u, leer, [
            ['Nombre', 'nombre_completo_beneficaria', 't'],
            ['Tipo de documento', 'tipo_documento', 't'],
            ['Documento', 'documento', 't'],
            ['ID usuario TI', 'id_usuario', 't'],
            ['Celular', 'celular', 't'],
            ['Celular 2', 'celular_2', 't'],
            ['Teléfono', 'telefono', 't'],
            ['Correo', 'correo_electronico', 't'],
            [efe ? 'Correo alterno' : 'Correo 2', 'correo_alterno', 't'],
            ['Municipio de residencia', 'municipio_residencia', 't'],
            ['Comuna de residencia', 'comuna', 't'],
          ]),
          seccion('Información académica', u, leer, [
            ['Universidad', 'universidad', 't'],
            ['Programa', 'programa', 't'],
            ['Modalidad de estudio', 'modalidad_estudio', 't'],
          ]),
        ],
        [
          historial(HISTORIAL, g, leer, [
            ['Periodo', 'periodo_renovado', 'p'],
            ['Estado', 'estado_periodo_renovado', 't'],
            ['Modalidad', 'modalidad', 't'],
            ['Semestres del posgrado', 'semestres_posgrado', 't'],
            [efe ? 'Semestres a financiar' : 'Giros pactados', 'semestres_a_financiar', 't'],
            ['Giros realizados', 'giros_realizados', 't'],
            ['Giros pendientes', 'giros_pendientes', 't'],
            [efe ? 'Pagado en el periodo' : 'Girado en el periodo', ['valor_girado_periodo_num', 'valor_girado_periodo'], '$'],
            [efe ? 'Valor de los giros realizados' : 'Total desembolsado', ['valor_giros_realizados_num', 'valor_giros_realizados'], '$'],
          ]),
        ],
      ),
    ];
  });
}

function enlazaMundos(filas: readonly Fila[]): FichaFondos[] {
  const leer = lectorDe(filas);
  return agrupar(filas, (f) => texto(leer(f, ['concatenado_documento_convocatoria', 'convocatoria']))).map((grupo) => {
    const g = porPeriodo(grupo, leer, 'periodo_renovado');
    const u = g.at(-1);
    return ficha(
      'EM',
      leer(u, 'convocatoria'),
      leer(u, 'nombre_completo_beneficiaria'),
      leer(u, ['estado', 'estado_general']),
      [
        seccion('Beneficio', u, leer, [
          ['Convocatoria', 'convocatoria', 't'],
          ['Modalidad', 'modalidad', 't'],
          ['Estado', ['estado', 'estado_general'], 't'],
          ['PACC', 'pacc', 't'],
          ['Operador financiero', 'operador_financiero', 't'],
        ]),
        seccion('Datos personales', u, leer, [
          ['Nombre', 'nombre_completo_beneficiaria', 't'],
          ['Tipo de documento', 'tipo_de_documento', 't'],
          ['Documento', 'documento_beneficiaria', 't'],
          ['ID usuario TI', 'id_ti', 't'],
          ['Celular', 'celular', 't'],
          ['Teléfono', 'telefono', 't'],
          ['Correo', 'correo_electronico', 't'],
          ['Municipio de residencia', 'municipio_de_residencia', 't'],
          ['Comuna de residencia', 'comuna_o_corregimiento_donde_reside', 't'],
        ]),
        seccion('Destino', u, leer, [
          ['Universidad de destino', 'universidad_destino_exterior', 't'],
          ['País', 'pais_destino', 't'],
          ['Programa en el exterior', 'programa_exterior', 't'],
          ['Fecha de inicio', ['fecha_de_inicio_fecha', 'fecha_de_inicio'], 't'],
          ['Fecha de terminación', ['fecha_de_terminacion_fecha', 'fecha_de_terminacion'], 't'],
          ['Fecha límite de entrega de documentos', ['fecha_limite_de_entrega_de_documentos_fecha', 'fecha_limite_de_entrega_de_documentos'], 't'],
          ['Total condonado', ['gran_total_valor_condonado_num', 'gran_total_valor_condonado'], '$'],
        ]),
      ],
      [
        historial(HISTORIAL, g, leer, [
          ['Periodo', 'periodo_renovado', 'p'],
          ['Estado', ['estado', 'estado_periodo_girado'], 't'],
          ['Giro Sapiencia', ['giro_sapiencia_num', 'giro_sapiencia'], '$'],
          ['Giro 1 ICETEX', ['giro_1_icetex_num', 'giro_1_icetex'], '$'],
          ['Giro 2 ICETEX', ['giro_2_icetex_num', 'giro_2_icetex'], '$'],
          ['Giros realizados', 'giros_realizados', 't'],
          ['Desembolsado en el periodo', ['monto_desembolsado_periodo_num', 'monto_desembolsado_periodo'], '$'],
        ]),
      ],
    );
  });
}

function eventos(filas: readonly Fila[]): FichaFondos[] {
  if (filas.length === 0) return [];
  const leer = lectorDe(filas);
  const g = filas.toSorted((a, b) => texto(leer(a, 'fecha_evento')).localeCompare(texto(leer(b, 'fecha_evento'))));
  return [
    ficha('EVENTOS', '', '', '', [], [
      historial('Historial de eventos', g, leer, [
        ['Fecha', 'fecha_evento', 't'],
        ['Periodo', 'periodo_evento', 'p'],
        ['Evento', 'tipo_evento', 't'],
        ['Detalle', 'detalle_evento', 't'],
        ['Convocatoria', 'convocatoria', 't'],
        ['Fondo', 'fondo_sapiencia', 't'],
        ['Radicado PQRS', 'radicado_pqrs', 't'],
      ]),
    ]),
  ];
}

/**
 * Todas las fichas de un documento (ya normalizado), en el orden del ETL: pregrado, Mejores
 * Bachilleres, Mejores Deportistas, posgrado (FA, EFE), Enlaza Mundos y eventos. Las bases guardan
 * el documento solo con dígitos: un documento con letras (pasaporte) no tiene fichas aquí.
 */
export async function fichasSapiencia(consultar: Consultar, documento: string): Promise<FichaFondos[]> {
  if (!/^\d{3,20}$/.test(documento)) return [];
  const [mb, md, pos, em, ev] = await Promise.all([
    consultar('SELECT * FROM mejores_bachilleres WHERE DOCUMENTO_DE_IDENTIDAD = ? ORDER BY ID_UNICO', [documento]),
    consultar('SELECT * FROM mejores_deportistas WHERE `DOCUMENTO BENEFICIARIO` = ? ORDER BY id', [documento]),
    consultar('SELECT * FROM posgrado_beneficio_periodo WHERE documento = ? ORDER BY id', [documento]),
    consultar('SELECT * FROM posgrado_em_beneficio_periodo WHERE documento_beneficiaria = ? ORDER BY id', [documento]),
    consultar(
      'SELECT fecha_evento, periodo_evento, tipo_evento, detalle_evento, convocatoria, fondo_sapiencia, radicado_pqrs FROM vista_eventos_beneficiarios WHERE documento = ?',
      [documento],
    ),
  ]);
  const pre = await pregrado(consultar, documento, mb.length > 0, md.length > 0);
  return [...pre, ...mejoresBachilleres(mb), ...mejoresDeportistas(md), ...posgrado(pos), ...enlazaMundos(em), ...eventos(ev)];
}
