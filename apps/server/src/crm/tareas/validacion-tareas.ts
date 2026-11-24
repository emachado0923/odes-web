import type { Request } from 'express';
import { z } from 'zod';
import {
  ESTADOS_CORREO,
  ESTADOS_TAREA,
  type EstadoCorreo,
  type EstadoTarea,
  esFechaValida,
  LIMITES_CRM,
} from '../api-crm.js';
import { textoLinea, textoMultilinea } from '../../repositorio/dominio/normalizacion.js';
import {
  demasiadosIntentos,
  noEncontrado,
  prohibido,
  solicitudInvalida,
} from '../../repositorio/errores-repositorio.js';
import { esMismoSitio, ipCliente } from '../../repositorio/http/peticion.js';
import { claveLimiteIp } from '../../seguridad/clave-ip.js';

/**
 * Lo que llega a las rutas de tareas del CRM (cuerpos JSON con zod,
 * parámetros de ruta y de consulta) y las reglas puras de las tareas
 * (transiciones del equipo, qué cambia una edición, tope por IP). Todo error
 * sale como ErrorRepositorioHttp, que el filtro responde con el formato
 * ErrorCrm { codigo, mensaje, campos? }. Pruebas en tareas.spec.ts.
 */

// ── Mensajes ────────────────────────────────────────────────────────────────

export const NO_EXISTE_TAREA = 'La tarea no existe.';
export const NO_EXISTE_ARCHIVO = 'El archivo no existe.';
export const NO_EXISTE_PERSONA = 'La persona no existe.';
export const NO_EXISTE_CORREO = 'El correo no existe.';
export const OTRO_SITIO = 'Solicitud de otro sitio rechazada.';
export const TAREA_TERMINADA_EQUIPO =
  'La tarea ya está terminada. Si hay que cambiar algo, pídale al líder que la devuelva.';
export const FALTA_ENTREGABLE = 'Adjunte el documento que pidió el líder antes de terminar.';

/** Mayor id de una ruta (INT con signo). */
export const ID_MAXIMO = 2_147_483_647;

/** crm_tarea_eventos.detalle es VARCHAR(1000). */
export const LARGO_DETALLE_EVENTO = 1000;

const FECHA_MINIMA = '2000-01-01';
const FECHA_MAXIMA = '2100-12-31';

function formatear(numero: number): string {
  return numero.toLocaleString('es-CO');
}

// ── Textos ──────────────────────────────────────────────────────────────────

/** Largo en caracteres (puntos de código, como cuenta VARCHAR), no en unidades UTF-16. */
export function largo(texto: string): number {
  return [...texto].length;
}

/** Los primeros `maximo` caracteres (puntos de código) de `texto`. */
export function cortar(texto: string, maximo: number): string {
  const caracteres = [...texto];
  return caracteres.length <= maximo ? texto : caracteres.slice(0, maximo).join('');
}

/** Escapa %, _ y \ para un LIKE (el escape por defecto es \ en MySQL y en Postgres). */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Patrón «contiene» en minúsculas, para `LOWER(columna) LIKE ?`. */
export function patronBusqueda(texto: string): string {
  return `%${escaparLike(texto.toLowerCase())}%`;
}

// ── Petición ────────────────────────────────────────────────────────────────

/** 403 si la petición viene de otra página (Sec-Fetch-Site / Origin). */
export function exigirMismoSitio(req: Pick<Request, 'get'>): void {
  if (!esMismoSitio(req)) throw prohibido(OTRO_SITIO);
}

/** 400 si el cuerpo no es JSON (un formulario de otro sitio no puede enviar application/json). */
export function exigirJson(req: { is(tipo: string): string | false | null }): void {
  if (!req.is('application/json')) {
    throw solicitudInvalida('Envíe los datos como JSON (Content-Type: application/json).');
  }
}

/** Clave de la IP con la que se cuentan los cambios del equipo (una IPv6, por su /64) y que queda en el evento. */
export function ipDeEquipo(req: Pick<Request, 'ip' | 'socket'>): string {
  return claveLimiteIp(ipCliente(req)).slice(0, 45);
}

/** id de un parámetro de ruta (entero positivo de INT); si no, 404 con `mensaje`. */
export function idDeRuta(valor: unknown, mensaje: string): number {
  const texto = typeof valor === 'string' ? valor : '';
  if (!/^[1-9]\d{0,9}$/.test(texto)) throw noEncontrado(mensaje);
  const id = Number(texto);
  if (id > ID_MAXIMO) throw noEncontrado(mensaje);
  return id;
}

// ── Cuerpos JSON ────────────────────────────────────────────────────────────

/**
 * Errores por campo de zod: { "campo": "primer mensaje" }. Un error del
 * objeto completo queda en la clave "".
 */
export function camposDeErrorZod(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const ruta = problema.path.map(String).join('.');
    if (!(ruta in campos)) campos[ruta] = problema.message;
  }
  return campos;
}

/** Valida `cuerpo` con `esquema`; si no es un objeto JSON o no cumple, 400 con los errores por campo. */
export function validarCuerpo<T extends z.ZodType>(esquema: T, cuerpo: unknown, mensaje: string): z.output<T> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe los datos como un objeto JSON.');
  }
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) throw solicitudInvalida(mensaje, camposDeErrorZod(resultado.error));
  return resultado.data;
}

const MENSAJE_TITULO = 'Escriba el título de la tarea.';
const MENSAJE_RESPONSABLE = 'Elija la persona responsable de la tarea.';
const MENSAJE_FECHA = 'Escriba una fecha límite válida (AAAA-MM-DD) o déjela vacía.';
const MENSAJE_ENTREGABLE = 'Indique si la tarea requiere un entregable (sí o no).';
const MENSAJE_OBSERVACION = 'Escriba qué debe corregir o completar el responsable.';
const MENSAJE_DATOS_TAREA = 'Revise los datos de la tarea.';

/** Una línea, sin control ni espacios repetidos; 1 a LIMITES_CRM.titulo caracteres. */
const esquemaTitulo = z
  .string({ error: MENSAJE_TITULO })
  .transform((texto) => textoLinea(texto))
  .refine((texto) => texto.length > 0, MENSAJE_TITULO)
  .refine(
    (texto) => largo(texto) <= LIMITES_CRM.titulo,
    `El título puede tener máximo ${formatear(LIMITES_CRM.titulo)} caracteres.`,
  );

/** Varias líneas; null o vacía = ''. */
const esquemaDescripcion = z
  .union([z.string(), z.null()], { error: 'La descripción debe ser texto.' })
  .transform((texto) => (texto === null ? '' : textoMultilinea(texto)))
  .refine(
    (texto) => largo(texto) <= LIMITES_CRM.descripcion,
    `La descripción puede tener máximo ${formatear(LIMITES_CRM.descripcion)} caracteres.`,
  );

/** Número (o texto con solo cifras, como el value de un <select>) de una persona. */
const esquemaResponsable = z
  .union([z.number(), z.string()], { error: MENSAJE_RESPONSABLE })
  .transform((valor) => {
    if (typeof valor === 'number') return valor;
    const texto = valor.trim();
    return /^\d{1,10}$/.test(texto) ? Number(texto) : Number.NaN;
  })
  .refine((id) => Number.isSafeInteger(id) && id >= 1 && id <= ID_MAXIMO, MENSAJE_RESPONSABLE);

/** 'AAAA-MM-DD' del calendario (2000 a 2100), o null; '' cuenta como null (un <input type="date"> vacío). */
const esquemaFecha = z
  .union([z.string(), z.null()], { error: MENSAJE_FECHA })
  .transform((valor) => {
    if (valor === null) return null;
    const texto = valor.trim();
    return texto === '' ? null : texto;
  })
  .refine((valor) => valor === null || esFechaValida(valor), MENSAJE_FECHA)
  .refine(
    (valor) => valor === null || (valor >= FECHA_MINIMA && valor <= FECHA_MAXIMA),
    'La fecha límite debe estar entre los años 2000 y 2100.',
  );

const esquemaRequiereEntregable = z.boolean({ error: MENSAJE_ENTREGABLE });

const esquemaNuevaTarea = z.object({
  titulo: esquemaTitulo,
  descripcion: esquemaDescripcion.optional(),
  responsableId: esquemaResponsable,
  fechaLimite: esquemaFecha.optional(),
  requiereEntregable: esquemaRequiereEntregable.optional(),
});

/** NuevaTareaCrm normalizada. */
export interface NuevaTareaValida {
  titulo: string;
  descripcion: string;
  responsableId: number;
  fechaLimite: string | null;
  requiereEntregable: boolean;
}

/** POST /lider/tareas */
export function validarNuevaTarea(cuerpo: unknown): NuevaTareaValida {
  const datos = validarCuerpo(esquemaNuevaTarea, cuerpo, MENSAJE_DATOS_TAREA);
  return {
    titulo: datos.titulo,
    descripcion: datos.descripcion ?? '',
    responsableId: datos.responsableId,
    fechaLimite: datos.fechaLimite ?? null,
    requiereEntregable: datos.requiereEntregable ?? false,
  };
}

const esquemaEdicionTarea = z.object({
  titulo: esquemaTitulo.optional(),
  descripcion: esquemaDescripcion.optional(),
  responsableId: esquemaResponsable.optional(),
  fechaLimite: esquemaFecha.optional(),
  requiereEntregable: esquemaRequiereEntregable.optional(),
});

/** EdicionTareaCrm normalizada: un campo ausente no cambia; fechaLimite null la quita. */
export interface EdicionTareaValida {
  titulo?: string;
  descripcion?: string;
  responsableId?: number;
  fechaLimite?: string | null;
  requiereEntregable?: boolean;
}

/** PATCH /lider/tareas/:id (al menos un campo). */
export function validarEdicionTarea(cuerpo: unknown): EdicionTareaValida {
  const datos = validarCuerpo(esquemaEdicionTarea, cuerpo, MENSAJE_DATOS_TAREA);
  const edicion: EdicionTareaValida = {};
  if (datos.titulo !== undefined) edicion.titulo = datos.titulo;
  if (datos.descripcion !== undefined) edicion.descripcion = datos.descripcion;
  if (datos.responsableId !== undefined) edicion.responsableId = datos.responsableId;
  if (datos.fechaLimite !== undefined) edicion.fechaLimite = datos.fechaLimite;
  if (datos.requiereEntregable !== undefined) edicion.requiereEntregable = datos.requiereEntregable;
  if (Object.keys(edicion).length === 0) {
    throw solicitudInvalida('Envíe al menos un dato de la tarea para cambiar.');
  }
  return edicion;
}

const esquemaCambioEstado = z.object({
  estado: z.enum(['pendiente', 'en_proceso'], {
    error: 'El estado debe ser «pendiente» o «en_proceso» (para terminar la tarea use «Terminar»).',
  }),
});

/** POST .../estado (CambioEstadoCrm). */
export function validarCambioEstado(cuerpo: unknown): { estado: 'pendiente' | 'en_proceso' } {
  return { estado: validarCuerpo(esquemaCambioEstado, cuerpo, 'Revise el estado de la tarea.').estado };
}

const esquemaTerminar = z.object({
  nota: z
    .union([z.string(), z.null()], { error: 'La nota debe ser texto.' })
    .transform((texto) => (texto === null ? null : textoMultilinea(texto) || null))
    .refine(
      (texto) => texto === null || largo(texto) <= LIMITES_CRM.nota,
      `La nota puede tener máximo ${formatear(LIMITES_CRM.nota)} caracteres.`,
    )
    .optional(),
});

/** POST .../terminar (TerminarTareaCrm): nota opcional; vacía = null. */
export function validarTerminar(cuerpo: unknown): { nota: string | null } {
  return { nota: validarCuerpo(esquemaTerminar, cuerpo, 'Revise la nota de cierre.').nota ?? null };
}

const esquemaDevolver = z.object({
  observacion: z
    .string({ error: MENSAJE_OBSERVACION })
    .transform((texto) => textoMultilinea(texto))
    .refine((texto) => texto.length > 0, MENSAJE_OBSERVACION)
    .refine(
      (texto) => largo(texto) <= LIMITES_CRM.observacion,
      `La observación puede tener máximo ${formatear(LIMITES_CRM.observacion)} caracteres.`,
    ),
});

/** POST /lider/tareas/:id/devolver (DevolverTareaCrm). */
export function validarDevolver(cuerpo: unknown): { observacion: string } {
  return { observacion: validarCuerpo(esquemaDevolver, cuerpo, 'Escriba la observación de la devolución.').observacion };
}

// ── Consultas ───────────────────────────────────────────────────────────────

export const FILTROS_TERMINADAS = ['recientes', 'todas'] as const;
/** recientes = las terminadas de los últimos LIMITES_CRM.diasTerminadasRecientes días. */
export type FiltroTerminadas = (typeof FILTROS_TERMINADAS)[number];

const MENSAJE_TERMINADAS = 'Use «recientes» o «todas».';

function esFiltroTerminadas(valor: unknown): valor is FiltroTerminadas {
  return typeof valor === 'string' && (FILTROS_TERMINADAS as readonly string[]).includes(valor);
}

export function esEstadoTarea(valor: unknown): valor is EstadoTarea {
  return typeof valor === 'string' && (ESTADOS_TAREA as readonly string[]).includes(valor);
}

/** ?terminadas= (recientes por defecto); otro valor, 400. */
export function terminadasDeConsulta(valor: unknown): FiltroTerminadas {
  if (valor === undefined || valor === '') return 'recientes';
  if (esFiltroTerminadas(valor)) return valor;
  throw solicitudInvalida('El filtro de terminadas no es válido.', { terminadas: MENSAJE_TERMINADAS });
}

export interface FiltroTareasLider {
  responsableId: number | null;
  estado: EstadoTarea | null;
  /** Texto a buscar en título y descripción, o null. */
  q: string | null;
  terminadas: FiltroTerminadas;
}

/** ?responsable=&estado=&q=&terminadas= de GET /lider/tareas; un parámetro inválido da 400 con `campos`. */
export function filtroTareasLider(consulta: unknown): FiltroTareasLider {
  const c = (typeof consulta === 'object' && consulta !== null ? consulta : {}) as Record<string, unknown>;
  const campos: Record<string, string> = {};
  const filtro: FiltroTareasLider = { responsableId: null, estado: null, q: null, terminadas: 'recientes' };

  const responsable = c['responsable'];
  if (responsable !== undefined && responsable !== '') {
    if (typeof responsable === 'string' && /^[1-9]\d{0,9}$/.test(responsable) && Number(responsable) <= ID_MAXIMO) {
      filtro.responsableId = Number(responsable);
    } else {
      campos['responsable'] = 'El responsable debe ser el número de una persona.';
    }
  }

  const estado = c['estado'];
  if (estado !== undefined && estado !== '') {
    if (esEstadoTarea(estado)) filtro.estado = estado;
    else campos['estado'] = `El estado debe ser uno de: ${ESTADOS_TAREA.join(', ')}.`;
  }

  const q = c['q'];
  if (q !== undefined) {
    if (typeof q !== 'string') {
      campos['q'] = 'La búsqueda debe ser texto.';
    } else {
      const texto = textoLinea(q);
      if (largo(texto) > LIMITES_CRM.busqueda) {
        campos['q'] = `La búsqueda puede tener máximo ${formatear(LIMITES_CRM.busqueda)} caracteres.`;
      } else if (texto) {
        filtro.q = texto;
      }
    }
  }

  const terminadas = c['terminadas'];
  if (terminadas !== undefined && terminadas !== '') {
    if (esFiltroTerminadas(terminadas)) filtro.terminadas = terminadas;
    else campos['terminadas'] = MENSAJE_TERMINADAS;
  }

  if (Object.keys(campos).length > 0) throw solicitudInvalida('Revise los filtros de la lista de tareas.', campos);
  return filtro;
}

/** ?estado= de GET /lider/correos: undefined si no vino; otro valor, 400. */
export function estadoCorreoDeConsulta(valor: unknown): EstadoCorreo | undefined {
  if (valor === undefined || valor === '') return undefined;
  if (typeof valor === 'string' && (ESTADOS_CORREO as readonly string[]).includes(valor)) {
    return valor as EstadoCorreo;
  }
  throw solicitudInvalida('El estado del correo no es válido.', {
    estado: `Use uno de: ${ESTADOS_CORREO.join(', ')}.`,
  });
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Qué pasa cuando el responsable pide `nuevo`: nada (igual), 409 (terminada) o el cambio. */
export type TransicionEquipo = 'igual' | 'cambia' | 'terminada';

export function transicionEquipo(actual: EstadoTarea, nuevo: 'pendiente' | 'en_proceso'): TransicionEquipo {
  if (actual === 'terminada') return 'terminada';
  return actual === nuevo ? 'igual' : 'cambia';
}

/** Campos de la tarea que puede editar el líder sin reasignarla. */
export type CampoEditableTarea = 'titulo' | 'descripcion' | 'fechaLimite' | 'requiereEntregable';

const ETIQUETAS_CAMPO: Readonly<Record<CampoEditableTarea, string>> = {
  titulo: 'el título',
  descripcion: 'la descripción',
  fechaLimite: 'la fecha límite',
  requiereEntregable: 'si requiere entregable',
};

/** Lo que tiene hoy la tarea (para comparar con una edición). */
export interface TareaEditable {
  titulo: string;
  descripcion: string;
  responsableId: number;
  fechaLimite: string | null;
  requiereEntregable: boolean;
}

export interface CambiosEdicion {
  /** Columnas que cambian de verdad (sin el responsable). */
  campos: Partial<Pick<TareaEditable, CampoEditableTarea>>;
  /** En el orden de ETIQUETAS_CAMPO (para el evento 'editada'). */
  editados: CampoEditableTarea[];
  /** Responsable nuevo, o null si no cambia. */
  nuevoResponsableId: number | null;
}

/** Compara la edición con la tarea: solo cuenta lo que cambia de verdad. */
export function cambiosDeEdicion(actual: TareaEditable, edicion: EdicionTareaValida): CambiosEdicion {
  const campos: CambiosEdicion['campos'] = {};
  const editados: CampoEditableTarea[] = [];
  if (edicion.titulo !== undefined && edicion.titulo !== actual.titulo) {
    campos.titulo = edicion.titulo;
    editados.push('titulo');
  }
  if (edicion.descripcion !== undefined && edicion.descripcion !== actual.descripcion) {
    campos.descripcion = edicion.descripcion;
    editados.push('descripcion');
  }
  if (edicion.fechaLimite !== undefined && edicion.fechaLimite !== actual.fechaLimite) {
    campos.fechaLimite = edicion.fechaLimite;
    editados.push('fechaLimite');
  }
  if (edicion.requiereEntregable !== undefined && edicion.requiereEntregable !== actual.requiereEntregable) {
    campos.requiereEntregable = edicion.requiereEntregable;
    editados.push('requiereEntregable');
  }
  const nuevoResponsableId =
    edicion.responsableId !== undefined && edicion.responsableId !== actual.responsableId ? edicion.responsableId : null;
  return { campos, editados, nuevoResponsableId };
}

/** «Cambió el título, la descripción y la fecha límite.» */
export function describirEdicion(editados: readonly CampoEditableTarea[]): string {
  const etiquetas = editados.map((campo) => ETIQUETAS_CAMPO[campo]);
  if (etiquetas.length === 0) return 'Sin cambios.';
  const lista =
    etiquetas.length === 1 ? etiquetas[0] : `${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}`;
  return `Cambió ${lista}.`;
}

// ── Tope por IP del equipo ──────────────────────────────────────────────────

/** Cambios (eventos del responsable) por IP en la última hora. */
export const TOPE_CAMBIOS_POR_HORA = 300;
/** Entregables subidos por IP en la última hora. */
export const TOPE_SUBIDAS_POR_HORA = 40;
export const VENTANA_TOPE_MS = 60 * 60 * 1000;

/** Eventos del responsable desde una IP en la ventana (crm_tarea_eventos). */
export interface ConteoTopeIp {
  cambios: number;
  primerCambio: Date | null;
  subidas: number;
  primeraSubida: Date | null;
}

/** Segundos hasta que el evento más viejo de la ventana deje de contar (1 a 3600). */
export function segundosParaReintentar(primero: Date | null, ahora: Date = new Date()): number {
  const maximo = VENTANA_TOPE_MS / 1000;
  if (!primero || Number.isNaN(primero.getTime())) return 60;
  const restante = Math.ceil((primero.getTime() + VENTANA_TOPE_MS - ahora.getTime()) / 1000);
  return Math.min(maximo, Math.max(1, restante));
}

/** 429 `demasiados_intentos` (con Retry-After) si la IP pasó del tope de cambios o, en una subida, del de subidas. */
export function revisarTopeIp(conteo: ConteoTopeIp, esSubida: boolean, ahora: Date = new Date()): void {
  if (conteo.cambios >= TOPE_CAMBIOS_POR_HORA) {
    throw demasiadosIntentos(
      segundosParaReintentar(conteo.primerCambio, ahora),
      'Se hicieron demasiados cambios desde esta conexión. Espere un rato e intente de nuevo.',
    );
  }
  if (esSubida && conteo.subidas >= TOPE_SUBIDAS_POR_HORA) {
    throw demasiadosIntentos(
      segundosParaReintentar(conteo.primeraSubida, ahora),
      'Se subieron demasiados documentos desde esta conexión. Espere un rato e intente de nuevo.',
    );
  }
}
