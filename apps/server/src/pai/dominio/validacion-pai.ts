import { z } from 'zod';
import {
  ACCIONES_REGISTRO_PAI,
  type AccionRegistroPai,
  type DatosAutorizacionPai,
  type DatosReportePai,
  esCodigoIndicador,
  ESTADOS_REPORTE_FILTRO,
  type EstadoReporteFiltro,
  type FiltrosTableroPai,
  LIMITES_PAI,
  type NumeroBimestre,
  PARAMETRO_BIMESTRE_EXPORTACION,
  PARAMETRO_VIGENCIA,
  type RiesgoMaterializado,
  TIPOS_PROCESO,
  type TipoProceso,
} from '../api-pai.js';
import {
  enteroDeConsulta,
  largo,
  validarCuerpo,
  vigenciaDeConsulta,
} from '../compartido/validacion-comun.js';
import { solicitudInvalida } from '../errores-pai.js';
import {
  textoLinea,
  textoMultilinea,
} from '../../repositorio/dominio/normalizacion.js';

/**
 * Validación zod de lo que llega a la API del dominio, con mensajes en
 * español por campo (validarCuerpo y camposDeErrorZod de
 * compartido/validacion-comun.ts; textos con textoMultilinea/textoLinea de
 * repositorio/dominio/normalizacion.ts). Pruebas en validacion-pai.spec.ts.
 */

/** Año máximo de las fechas (abierto_hasta, vigente_hasta). */
const ANIO_MAXIMO_FECHA = 2100;

/**
 * Una autorización vence a lo sumo un año (366 días) después de otorgarla:
 * sirve para corregir un bimestre, no para dar permiso indefinido.
 */
export const MAX_VIGENCIA_AUTORIZACION_MS = 366 * 86_400_000;

/** Fecha ISO 8601 con zona (Z o ±hh:mm), como la que envía toISOString(). */
const PATRON_FECHA_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Fecha de un texto ISO con zona; null si no lo es. */
export function fechaIso(texto: string): Date | null {
  if (!PATRON_FECHA_ISO.test(texto)) return null;
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return null;
  if (fecha.getUTCFullYear() > ANIO_MAXIMO_FECHA) return null;
  return fecha;
}

/** Cifras decimales de un número finito (1.25 -> 2; 1e-7 -> 7; 3 -> 0). */
export function decimales(valor: number): number {
  const texto = String(valor).toLowerCase();
  const [mantisa, exponente = '0'] = texto.split('e');
  const fraccion = mantisa.split('.')[1] ?? '';
  return Math.max(0, fraccion.length - Number(exponente));
}

// ── Reporte (PUT /indicadores/:id/bimestres/:b) ────────────────────────────

/** DatosReportePai normalizado: undefined = no cambia. */
export type ReporteValidoPai = Omit<DatosReportePai, 'actualizadoEn'> & {
  /** undefined = no se comprueba la concurrencia. */
  actualizadoEn: Date | null | undefined;
};

/** Campos del reporte que se guardan (todos menos actualizadoEn). */
export const CAMPOS_REPORTE = [
  'avance',
  'logros',
  'observaciones',
  'riesgoMaterializado',
  'numeralRiesgo',
  'descripcionRiesgo',
  'fuentesVerificacion',
] as const;

export type CampoReporte = (typeof CAMPOS_REPORTE)[number];

const MENSAJE_AVANCE = `El avance debe ser un número mayor o igual a 0, con máximo ${LIMITES_PAI.maxDecimalesAvance} decimales.`;

const esquemaAvance = z
  .union([z.number(), z.null()], { error: MENSAJE_AVANCE })
  .optional()
  .refine(
    (valor) =>
      valor === undefined ||
      valor === null ||
      (Number.isFinite(valor) && valor >= 0),
    MENSAJE_AVANCE,
  )
  .refine(
    (valor) =>
      valor === undefined || valor === null || valor <= LIMITES_PAI.maxAvance,
    `El avance no puede ser mayor que ${LIMITES_PAI.maxAvance.toLocaleString('es-CO')}.`,
  )
  .refine(
    (valor) =>
      valor === undefined ||
      valor === null ||
      decimales(valor) <= LIMITES_PAI.maxDecimalesAvance,
    `El avance puede tener máximo ${LIMITES_PAI.maxDecimalesAvance} decimales.`,
  )
  // -0 -> 0
  .transform((valor) => (valor === 0 ? 0 : valor));

/** Texto opcional del reporte: undefined no cambia, null o vacío borra. */
function textoReporte(nombre: string, maximo: number, multilinea = true) {
  return z
    .union([z.string(), z.null()], { error: `${nombre} debe ser texto.` })
    .optional()
    .transform((valor) => {
      if (valor === undefined || valor === null) return valor;
      const limpio = multilinea ? textoMultilinea(valor) : textoLinea(valor);
      return limpio || null;
    })
    .refine(
      (valor) =>
        valor === undefined || valor === null || largo(valor) <= maximo,
      `${nombre}: máximo ${maximo.toLocaleString('es-CO')} caracteres.`,
    );
}

const esquemaRiesgo = z
  .union([z.string(), z.null()], {
    error: 'El riesgo materializado debe ser SI o NO.',
  })
  .optional()
  .transform((valor) => {
    if (valor === undefined || valor === null) return valor;
    const limpio = textoLinea(valor)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase();
    return limpio === '' ? null : limpio;
  })
  .refine(
    (valor) =>
      valor === undefined || valor === null || valor === 'SI' || valor === 'NO',
    'El riesgo materializado debe ser SI o NO.',
  )
  .transform((valor) => valor as RiesgoMaterializado | null | undefined);

/** actualizadoEn del cuerpo: undefined (no se comprueba), null o una fecha ISO; si no, 400. */
function actualizadoEnDe(crudo: unknown): Date | null | undefined {
  if (crudo === undefined || crudo === null) return crudo;
  const fecha = typeof crudo === 'string' ? fechaIso(crudo) : null;
  if (!fecha) {
    throw solicitudInvalida('Revise los datos del reporte.', {
      actualizadoEn:
        'actualizadoEn debe ser la fecha ISO que envió el servidor o null.',
    });
  }
  return fecha;
}

const esquemaReporte = z.object({
  avance: esquemaAvance,
  logros: textoReporte(
    'Los principales avances (logros)',
    LIMITES_PAI.maxTexto,
  ),
  observaciones: textoReporte(
    'Las observaciones y dificultades',
    LIMITES_PAI.maxTexto,
  ),
  riesgoMaterializado: esquemaRiesgo,
  numeralRiesgo: textoReporte(
    'El numeral del riesgo',
    LIMITES_PAI.maxNumeralRiesgo,
    false,
  ),
  descripcionRiesgo: textoReporte(
    'La descripción del riesgo y sus controles',
    LIMITES_PAI.maxTexto,
  ),
  fuentesVerificacion: textoReporte(
    'Las fuentes de verificación',
    LIMITES_PAI.maxTexto,
  ),
  actualizadoEn: z.unknown().optional(),
});

export function validarReporte(cuerpo: unknown): ReporteValidoPai {
  const datos = validarCuerpo(
    esquemaReporte,
    cuerpo,
    'Revise los datos del reporte.',
  );
  const resultado: ReporteValidoPai = {
    actualizadoEn: actualizadoEnDe(
      (cuerpo as { actualizadoEn?: unknown }).actualizadoEn,
    ),
  };
  for (const campo of CAMPOS_REPORTE) {
    if (datos[campo] !== undefined) {
      (resultado as Record<string, unknown>)[campo] = datos[campo];
    }
  }
  return resultado;
}

/**
 * Regla del riesgo sobre el reporte final (lo guardado más lo enviado): con
 * riesgo materializado 'SI' son obligatorios el numeral y la descripción.
 * Devuelve los errores por campo (vacío si cumple).
 */
export function erroresRiesgo(final: {
  riesgoMaterializado: RiesgoMaterializado | null;
  numeralRiesgo: string | null;
  descripcionRiesgo: string | null;
}): Record<string, string> {
  const campos: Record<string, string> = {};
  if (final.riesgoMaterializado !== 'SI') return campos;
  if (!final.numeralRiesgo) {
    campos.numeralRiesgo =
      'Indique el numeral del riesgo materializado (es obligatorio si el riesgo se materializó).';
  }
  if (!final.descripcionRiesgo) {
    campos.descripcionRiesgo =
      'Describa el riesgo materializado y sus controles (es obligatorio si el riesgo se materializó).';
  }
  return campos;
}

// ── Vigencia (PUT /admin/vigencia) ─────────────────────────────────────────

export interface VigenciaValidaPai {
  bimestreAbierto: NumeroBimestre | null;
  abiertoHasta: Date | null;
}

const MENSAJE_BIMESTRE = 'El bimestre debe ser un número de 1 a 6.';

function esquemaBimestre(obligatorio: boolean) {
  const base = z.union([z.number(), z.null()], { error: MENSAJE_BIMESTRE });
  return (obligatorio ? base : base.optional())
    .transform((valor) => valor ?? null)
    .refine(
      (valor) => valor === null || [1, 2, 3, 4, 5, 6].includes(valor),
      MENSAJE_BIMESTRE,
    )
    .transform((valor) => valor as NumeroBimestre | null);
}

function esquemaFechaFutura(nombre: string, ahora: Date, obligatoria: boolean) {
  const mensaje = `${nombre} debe ser una fecha y hora válidas (ISO 8601 con zona horaria).`;
  const base = z.union([z.string(), z.null()], { error: mensaje });
  return (obligatoria ? base : base.optional()).transform((valor, contexto) => {
    if (valor === undefined || valor === null || valor === '') {
      if (obligatoria) {
        contexto.addIssue({
          code: 'custom',
          message: `${nombre} es obligatoria.`,
        });
        return z.NEVER;
      }
      return null;
    }
    const fecha = fechaIso(valor);
    if (!fecha) {
      contexto.addIssue({ code: 'custom', message: mensaje });
      return z.NEVER;
    }
    if (fecha.getTime() <= ahora.getTime()) {
      contexto.addIssue({
        code: 'custom',
        message: `${nombre} debe ser futura.`,
      });
      return z.NEVER;
    }
    return fecha;
  });
}

export function validarDatosVigencia(
  cuerpo: unknown,
  ahora: Date,
): VigenciaValidaPai {
  const esquema = z
    .object({
      bimestreAbierto: esquemaBimestre(true),
      abiertoHasta: esquemaFechaFutura('La fecha límite', ahora, false),
    })
    .superRefine((datos, contexto) => {
      if (datos.bimestreAbierto === null && datos.abiertoHasta !== null) {
        contexto.addIssue({
          code: 'custom',
          path: ['abiertoHasta'],
          message: 'Para cerrar el bimestre no se indica fecha límite.',
        });
      }
    });
  const datos = validarCuerpo(
    esquema,
    cuerpo,
    'Revise el bimestre y la fecha límite.',
  );
  return {
    bimestreAbierto: datos.bimestreAbierto,
    abiertoHasta: datos.abiertoHasta ?? null,
  };
}

// ── Autorizaciones (POST /admin/autorizaciones) ────────────────────────────

export interface AutorizacionValidaPai extends Omit<
  DatosAutorizacionPai,
  'vigenteHasta' | 'procesoId' | 'indicadorId'
> {
  procesoId: number | null;
  indicadorId: number | null;
  vigenteHasta: Date;
}

function esquemaId(nombre: string, obligatorio: boolean) {
  const mensaje = `${nombre} debe ser un número entero positivo.`;
  const base = z.union([z.number(), z.null()], { error: mensaje });
  return (obligatorio ? base : base.optional())
    .transform((valor) => valor ?? null)
    .refine(
      (valor) =>
        valor === null ||
        (Number.isInteger(valor) && valor > 0 && valor <= 2_147_483_647),
      mensaje,
    )
    .refine(
      (valor) => !obligatorio || valor !== null,
      `${nombre} es obligatorio.`,
    );
}

export function validarAutorizacion(
  cuerpo: unknown,
  ahora: Date,
): AutorizacionValidaPai {
  const esquema = z
    .object({
      usuarioId: esquemaId('El usuario', true),
      bimestre: esquemaBimestre(true).refine(
        (valor) => valor !== null,
        'Elija el bimestre que autoriza.',
      ),
      procesoId: esquemaId('El proceso', false),
      indicadorId: esquemaId('El indicador', false),
      vigenteHasta: esquemaFechaFutura(
        'La fecha de vencimiento',
        ahora,
        true,
      ).refine(
        (valor) =>
          valor === null ||
          valor === undefined ||
          valor.getTime() <= ahora.getTime() + MAX_VIGENCIA_AUTORIZACION_MS,
        'La fecha de vencimiento puede ser, como mucho, un año después de hoy.',
      ),
      motivo: z
        .string({ error: 'Escriba el motivo de la autorización.' })
        .transform(textoMultilinea)
        .refine(
          (valor) => valor.length > 0,
          'Escriba el motivo de la autorización.',
        )
        .refine(
          (valor) => largo(valor) <= LIMITES_PAI.maxMotivoAutorizacion,
          `El motivo: máximo ${LIMITES_PAI.maxMotivoAutorizacion} caracteres.`,
        ),
    })
    .superRefine((datos, contexto) => {
      const cuantos =
        Number(datos.procesoId !== null) + Number(datos.indicadorId !== null);
      if (cuantos !== 1) {
        contexto.addIssue({
          code: 'custom',
          path: [datos.procesoId === null ? 'procesoId' : 'indicadorId'],
          message: 'Elija un proceso o un indicador (solo uno de los dos).',
        });
      }
    });
  const datos = validarCuerpo(
    esquema,
    cuerpo,
    'Revise los datos de la autorización.',
  );
  return {
    usuarioId: datos.usuarioId as number,
    bimestre: datos.bimestre as NumeroBimestre,
    procesoId: datos.procesoId,
    indicadorId: datos.indicadorId,
    // Obligatoria: el esquema ya rechazó null.
    vigenteHasta: datos.vigenteHasta as Date,
    motivo: datos.motivo,
  };
}

// ── Consultas (GET /admin/registro, GET /admin/exportar.csv) ───────────────

/** Página máxima del registro (evita OFFSET enormes). */
export const PAGINA_MAXIMA_REGISTRO = 100_000;

export interface ConsultaRegistroValidaPai {
  pagina: number;
  usuario: number | null;
  /** id o código (en mayúsculas). */
  indicador: number | string | null;
  accion: AccionRegistroPai | null;
}

/** Texto de un parámetro de consulta (vacío = null); una lista o un objeto es un 400. */
function textoDeConsulta(
  valor: unknown,
  nombre: string,
  maximo: number,
): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    throw solicitudInvalida(`El filtro ${nombre} no es válido.`, {
      [nombre]: 'Valor inválido.',
    });
  }
  const limpio = textoLinea(valor);
  if (!limpio) return null;
  if (largo(limpio) > maximo) {
    throw solicitudInvalida(`El filtro ${nombre} es demasiado largo.`, {
      [nombre]: `Máximo ${maximo} caracteres.`,
    });
  }
  return limpio;
}

/** Valor de una lista cerrada (vacío = null); si no está en la lista, 400. */
function opcionDeConsulta<T extends string>(
  valor: unknown,
  nombre: string,
  opciones: readonly T[],
): T | null {
  const texto = textoDeConsulta(valor, nombre, 40);
  if (texto === null) return null;
  if (!(opciones as readonly string[]).includes(texto)) {
    throw solicitudInvalida(`El filtro ${nombre} no es válido.`, {
      [nombre]: `Debe ser uno de: ${opciones.join(', ')}.`,
    });
  }
  return texto as T;
}

export function validarConsultaRegistro(
  consulta: Record<string, unknown>,
): ConsultaRegistroValidaPai {
  const pagina =
    enteroDeConsulta(consulta.pagina, 'pagina', {
      minimo: 1,
      maximo: PAGINA_MAXIMA_REGISTRO,
    }) ?? 1;
  const usuario = enteroDeConsulta(consulta.usuario, 'usuario');
  const textoIndicador = textoDeConsulta(consulta.indicador, 'indicador', 30);
  let indicador: number | string | null = null;
  if (textoIndicador !== null) {
    if (/^\d{1,10}$/.test(textoIndicador)) {
      indicador = enteroDeConsulta(textoIndicador, 'indicador');
    } else if (esCodigoIndicador(textoIndicador)) {
      indicador = textoIndicador.toUpperCase();
    } else {
      throw solicitudInvalida(
        'El filtro indicador debe ser un id o un código (p. ej. SAF-TH-02).',
        { indicador: 'Valor inválido.' },
      );
    }
  }
  const accion = opcionDeConsulta(
    consulta.accion,
    'accion',
    ACCIONES_REGISTRO_PAI,
  );
  return { pagina, usuario, indicador, accion };
}

export interface ConsultaExportacionValidaPai {
  filtros: FiltrosTableroPai;
  bimestre: NumeroBimestre | null;
  vigencia: number | null;
}

/** Largo máximo de los filtros de texto (programa, línea, dimensión). */
const MAX_FILTRO_TEXTO = 400;
/** Largo máximo de la búsqueda q. */
const MAX_BUSQUEDA = 200;

export function validarConsultaExportacion(
  consulta: Record<string, unknown>,
): ConsultaExportacionValidaPai {
  const filtros: FiltrosTableroPai = {
    dependencia: enteroDeConsulta(consulta.dependencia, 'dependencia'),
    proceso: enteroDeConsulta(consulta.proceso, 'proceso'),
    programa: textoDeConsulta(consulta.programa, 'programa', MAX_FILTRO_TEXTO),
    riesgo: enteroDeConsulta(consulta.riesgo, 'riesgo'),
    linea: textoDeConsulta(consulta.linea, 'linea', MAX_FILTRO_TEXTO),
    dimension: textoDeConsulta(
      consulta.dimension,
      'dimension',
      MAX_FILTRO_TEXTO,
    ),
    tipo: opcionDeConsulta<TipoProceso>(consulta.tipo, 'tipo', TIPOS_PROCESO),
    estado: opcionDeConsulta<EstadoReporteFiltro>(
      consulta.estado,
      'estado',
      ESTADOS_REPORTE_FILTRO,
    ),
    q: textoDeConsulta(consulta.q, 'q', MAX_BUSQUEDA),
  };
  const bimestre = enteroDeConsulta(
    consulta[PARAMETRO_BIMESTRE_EXPORTACION],
    PARAMETRO_BIMESTRE_EXPORTACION,
    { minimo: 1, maximo: 6 },
  ) as NumeroBimestre | null;
  return {
    filtros,
    bimestre,
    vigencia: vigenciaDeConsulta(consulta[PARAMETRO_VIGENCIA]),
  };
}
