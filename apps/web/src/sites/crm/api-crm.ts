/**
 * Contrato HTTP de la rama /crm: tareas de la Oficina de Planeación de
 * Sapiencia (el líder asigna, cada persona mueve las suyas y al terminar le
 * llega un correo al líder).
 *
 * COPIA IDÉNTICA en:
 *   apps/server/src/crm/api-crm.ts
 *   apps/web/src/sites/crm/api-crm.ts
 * Los dos paquetes son independientes: si cambias uno, copia el archivo
 * completo al otro (la prueba src/crm/api-crm.spec.ts del servidor lo
 * comprueba). Solo tipos, constantes y funciones puras: nada de Node ni del
 * navegador.
 *
 * ── Modelo ─────────────────────────────────────────────────────────────────
 * Personas del equipo (crm_personas); una de ellas es el líder (esLider).
 * Tareas (crm_tareas): las crea el líder y tienen un responsable. Estados:
 * pendiente → en_proceso → terminada. Archivos de una tarea
 * (crm_tarea_archivos): `adjunto` (los sube el líder) y `entregable` (los
 * sube el responsable antes de terminar). Si la tarea `requiereEntregable`,
 * no se puede terminar sin al menos un entregable. Correos (crm_correos):
 * avisos que salen por SMTP; se guardan primero y se envían dentro de la
 * misma petición (Cloud Run no da CPU después de responder).
 *
 * ── Acceso ─────────────────────────────────────────────────────────────────
 * Equipo: SIN cuenta, por decisión de la oficina. La pantalla de inicio lista
 * a las personas y se entra con un clic en su tarjeta. Las rutas del equipo
 * llevan :personaId y el servidor comprueba que la tarea sea de esa persona
 * (si no, 404). Nunca exponen correos.
 * Líder: solo contraseña (no hay usuario). Cookie `crm_sesion` (HttpOnly,
 * SameSite=Strict, Secure en producción, Path=/api/crm). CSRF: toda
 * petición del líder que cambia algo envía la cabecera `X-CSRF-Token` con el
 * `csrf` de SesionLiderCrm. 5 fallos en 15 minutos (o 20 de la IP) bloquean:
 * 429 + Retry-After.
 * Toda petición que cambia algo (equipo o líder) rechaza las de otro sitio
 * (Sec-Fetch-Site / Origin): 403 `prohibido`. Las del equipo tienen además un
 * tope por IP (429 `demasiados_intentos`).
 *
 * Errores: JSON ErrorCrm `{ codigo, mensaje, campos? }` (el mismo formato de
 * /api/repositorio). Un entregable faltante es 400 `solicitud_invalida` con
 * `campos.entregable`.
 *
 * ── Equipo (sin sesión) ────────────────────────────────────────────────────
 * GET    /api/crm/personas                              -> PersonaCrm[] (activas, en orden)
 * GET    /api/crm/personas/:personaId/foto              -> imagen | 404
 * GET    /api/crm/personas/:personaId/tareas?terminadas=recientes|todas
 *                                                       -> TableroPersonaCrm
 *        (por defecto, de las terminadas solo las de los últimos
 *        LIMITES_CRM.diasTerminadasRecientes días)
 * POST   /api/crm/personas/:personaId/tareas <- NuevaTareaPropiaCrm -> TareaDetalleCrm (201)
 *        (solo si esa persona tiene `puedeCrearTareas`; si no, 403 `prohibido`.
 *        El responsable es ella misma; no pide entregable y no manda correo)
 * GET    /api/crm/personas/:personaId/tareas/:tareaId   -> TareaDetalleCrm
 * POST   /api/crm/personas/:personaId/tareas/:tareaId/estado
 *        <- CambioEstadoCrm -> TareaDetalleCrm
 *        (pendiente ⇄ en_proceso; una terminada da 409 `conflicto`)
 * POST   /api/crm/personas/:personaId/tareas/:tareaId/entregables
 *        <- multipart, campo `archivo` -> ArchivoCrm (201)
 *        (solo si la tarea no está terminada; máximo LIMITES_CRM.maxEntregables)
 * DELETE /api/crm/personas/:personaId/tareas/:tareaId/entregables/:archivoId -> 204
 *        (solo si la tarea no está terminada)
 * POST   /api/crm/personas/:personaId/tareas/:tareaId/terminar
 *        <- TerminarTareaCrm -> ResultadoTerminarCrm
 *        (pasa a terminada y avisa al líder por correo con los entregables)
 * GET    /api/crm/personas/:personaId/tareas/:tareaId/archivos/:archivoId
 *        -> el archivo (descarga, Content-Disposition: attachment)
 *
 * ── Líder (sesión + CSRF) ──────────────────────────────────────────────────
 * POST   /api/crm/lider/sesion        <- CredencialesLiderCrm -> SesionLiderCrm (pone la cookie)
 * GET    /api/crm/lider/sesion        -> SesionLiderCrm | 401
 * DELETE /api/crm/lider/sesion        -> 204 (borra la sesión y la cookie)
 * GET    /api/crm/lider/resumen       -> ResumenLiderCrm
 * GET    /api/crm/lider/tareas?responsable=<id>&estado=<EstadoTarea>&q=<texto>&terminadas=recientes|todas
 *                                     -> TareaCrm[]
 * POST   /api/crm/lider/tareas        <- NuevaTareaCrm -> TareaDetalleCrm (201; todavía sin aviso)
 * GET    /api/crm/lider/tareas/:id    -> TareaDetalleCrm (con `correos`)
 * PATCH  /api/crm/lider/tareas/:id    <- EdicionTareaCrm -> TareaDetalleCrm
 * DELETE /api/crm/lider/tareas/:id    -> 204 (la oculta: queda en la base con eliminada_en)
 * POST   /api/crm/lider/tareas/:id/adjuntos <- multipart, campo `archivo` -> ArchivoCrm (201)
 *        (máximo LIMITES_CRM.maxAdjuntos)
 * DELETE /api/crm/lider/tareas/:id/adjuntos/:archivoId -> 204
 * GET    /api/crm/lider/tareas/:id/archivos/:archivoId -> el archivo (descarga)
 * POST   /api/crm/lider/tareas/:id/avisar  -> EstadoAvisoCrm
 *        (correo de asignación al responsable, con los adjuntos; se llama
 *        después de subirlos. Repetirlo manda otro correo)
 * POST   /api/crm/lider/tareas/:id/devolver <- DevolverTareaCrm -> ResultadoDevolverCrm
 *        (terminada → en_proceso, con observación; avisa al responsable)
 * GET    /api/crm/lider/correos?estado=<EstadoCorreo>  -> CorreoCrm[] (los 200 más recientes)
 * POST   /api/crm/lider/correos/:id/reintentar         -> CorreoCrm
 * GET    /api/crm/lider/personas      -> PersonaAdminCrm[] (todas, también las inactivas)
 * POST   /api/crm/lider/personas      <- NuevaPersonaCrm -> PersonaAdminCrm (201)
 * PATCH  /api/crm/lider/personas/:id  <- EdicionPersonaCrm -> PersonaAdminCrm
 * PUT    /api/crm/lider/personas/:id/foto <- multipart, campo `archivo` (PNG, JPEG o WEBP) -> PersonaAdminCrm
 * DELETE /api/crm/lider/personas/:id/foto -> PersonaAdminCrm
 *
 * ── Cuenta de correo (líder) ───────────────────────────────────────────────
 * Si el servidor tiene las variables CRM_CORREO_*, mandan ellas y aquí solo
 * se ven. Si no, el líder guarda la cuenta (con su contraseña de aplicación)
 * en la base; la contraseña se guarda cifrada y nunca se devuelve.
 * GET    /api/crm/lider/correo/cuenta  -> CuentaCorreoCrm
 * PUT    /api/crm/lider/correo/cuenta  <- GuardarCuentaCorreoCrm -> CuentaCorreoCrm
 *        (clave vacía u omitida: se conserva la guardada)
 * DELETE /api/crm/lider/correo/cuenta  -> CuentaCorreoCrm (borra la guardada)
 * POST   /api/crm/lider/correo/prueba  <- PruebaCorreoCrm -> ResultadoPruebaCorreoCrm
 *        (envía un correo de prueba con la cuenta efectiva; 429 tras 10 por hora)
 */

// ── Constantes ──────────────────────────────────────────────────────────────

export const ESTADOS_TAREA = ['pendiente', 'en_proceso', 'terminada'] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ETIQUETAS_ESTADO: Readonly<Record<EstadoTarea, string>> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
};

export const CABECERA_CSRF = 'X-CSRF-Token';

export const LIMITES_CRM = {
  titulo: 160,
  descripcion: 5000,
  nota: 2000,
  observacion: 2000,
  nombrePersona: 120,
  correo: 254,
  busqueda: 100,
  /** Un archivo de una tarea (adjunto o entregable). Cloud Run acepta hasta 32 MiB por petición. */
  maxBytesArchivo: 25 * 1024 * 1024,
  maxBytesFoto: 2 * 1024 * 1024,
  maxAdjuntos: 10,
  maxEntregables: 5,
  /** Lo que se adjunta a un correo; lo que pase de aquí va como enlace al CRM. */
  maxBytesAdjuntosCorreo: 18 * 1024 * 1024,
  diasTerminadasRecientes: 30,
} as const;

/** Archivos de tareas: PDF, Word, Excel, PowerPoint e imágenes (se validan por firma en el servidor). */
export const EXTENSIONES_ARCHIVO_CRM = ['.pdf', '.docx', '.xlsx', '.pptx', '.png', '.jpg', '.jpeg', '.webp'] as const;
export const EXTENSIONES_FOTO_CRM = ['.png', '.jpg', '.jpeg', '.webp'] as const;
/** Para el atributo `accept` de los <input type="file">. */
export const ACEPTAR_ARCHIVOS_CRM = EXTENSIONES_ARCHIVO_CRM.join(',');
export const ACEPTAR_FOTOS_CRM = EXTENSIONES_FOTO_CRM.join(',');

// ── Personas ────────────────────────────────────────────────────────────────

export interface ConteoTareasCrm {
  pendientes: number;
  enProceso: number;
  /** Terminadas en los últimos LIMITES_CRM.diasTerminadasRecientes días. */
  terminadasRecientes: number;
  /** No terminadas con fecha límite anterior a hoy (hora de Bogotá). */
  vencidas: number;
}

/** Lo público de una persona: sin correo. */
export interface PersonaCrm {
  id: number;
  nombre: string;
  /** Dos letras, en mayúscula (inicialesDe). */
  iniciales: string;
  esLider: boolean;
  /** El líder le permitió crearse tareas a sí misma desde su tablero. */
  puedeCrearTareas: boolean;
  /** URL de la foto (/api/crm/personas/:id/foto?v=…) o null: se muestran las iniciales. */
  foto: string | null;
  conteo: ConteoTareasCrm;
}

/** Lo que ve el líder en la pantalla Equipo. */
export interface PersonaAdminCrm extends PersonaCrm {
  correo: string;
  activo: boolean;
  orden: number;
}

export interface NuevaPersonaCrm {
  nombre: string;
  correo: string;
  esLider?: boolean;
}

export interface EdicionPersonaCrm {
  nombre?: string;
  correo?: string;
  activo?: boolean;
  orden?: number;
  puedeCrearTareas?: boolean;
}

/** Responsable resumido, para tarjetas y listas. */
export interface ResponsableCrm {
  id: number;
  nombre: string;
  iniciales: string;
  foto: string | null;
}

// ── Tareas ──────────────────────────────────────────────────────────────────

export type TipoArchivoCrm = 'adjunto' | 'entregable';

export interface ArchivoCrm {
  /** Id de crm_tarea_archivos (no el del almacén). */
  id: number;
  tipo: TipoArchivoCrm;
  nombre: string;
  mime: string;
  bytes: number;
  /** ISO 8601. */
  subidoEn: string;
  /** Ruta de descarga para quien la pide (equipo o líder). */
  url: string;
}

export interface TareaCrm {
  id: number;
  titulo: string;
  estado: EstadoTarea;
  responsable: ResponsableCrm;
  /** 'AAAA-MM-DD' o null. */
  fechaLimite: string | null;
  /** fechaLimite anterior a hoy (Bogotá) y no terminada. */
  vencida: boolean;
  requiereEntregable: boolean;
  adjuntos: number;
  entregables: number;
  /** ISO 8601. */
  creadaEn: string;
  actualizadaEn: string;
  terminadaEn: string | null;
}

export type TipoEventoCrm =
  | 'creada'
  | 'editada'
  | 'reasignada'
  | 'estado'
  | 'adjunto'
  | 'entregable'
  | 'archivo_quitado'
  | 'terminada'
  | 'devuelta'
  | 'aviso';

export interface EventoTareaCrm {
  id: number;
  tipo: TipoEventoCrm;
  actor: 'lider' | 'responsable';
  /** Nombre de quien lo hizo (el responsable o el líder), si se sabe. */
  personaNombre: string | null;
  deEstado: EstadoTarea | null;
  aEstado: EstadoTarea | null;
  /** Texto corto: nombre del archivo, observación de la devolución, a quién se reasignó… */
  detalle: string | null;
  creadoEn: string;
}

export interface TareaDetalleCrm extends TareaCrm {
  descripcion: string;
  /** Lo que escribió el responsable al terminar. */
  notaCierre: string | null;
  archivos: ArchivoCrm[];
  /** Del más reciente al más antiguo. */
  eventos: EventoTareaCrm[];
  /** Se envió (o se intentó enviar) el aviso de asignación. */
  avisada: boolean;
  /** Solo en las rutas del líder. */
  correos?: CorreoCrm[];
}

export interface TableroPersonaCrm {
  persona: PersonaCrm;
  tareas: TareaCrm[];
}

export interface CambioEstadoCrm {
  estado: 'pendiente' | 'en_proceso';
}

export interface TerminarTareaCrm {
  nota?: string;
}

export interface ResultadoTerminarCrm {
  tarea: TareaDetalleCrm;
  aviso: EstadoAvisoCrm;
}

export interface NuevaTareaCrm {
  titulo: string;
  descripcion?: string;
  responsableId: number;
  /** 'AAAA-MM-DD' o null. */
  fechaLimite?: string | null;
  requiereEntregable?: boolean;
}

/** Tarea que una persona con `puedeCrearTareas` se crea a sí misma. */
export interface NuevaTareaPropiaCrm {
  titulo: string;
  descripcion?: string;
  /** 'AAAA-MM-DD' o null. */
  fechaLimite?: string | null;
}

export interface EdicionTareaCrm {
  titulo?: string;
  descripcion?: string;
  responsableId?: number;
  fechaLimite?: string | null;
  requiereEntregable?: boolean;
}

export interface DevolverTareaCrm {
  observacion: string;
}

export interface ResultadoDevolverCrm {
  tarea: TareaDetalleCrm;
  aviso: EstadoAvisoCrm;
}

// ── Correos ─────────────────────────────────────────────────────────────────

export const ESTADOS_CORREO = ['pendiente', 'enviado', 'error', 'sin_configurar'] as const;
export type EstadoCorreo = (typeof ESTADOS_CORREO)[number];

export const ETIQUETAS_ESTADO_CORREO: Readonly<Record<EstadoCorreo, string>> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  error: 'Falló',
  sin_configurar: 'Correo sin configurar',
};

export type TipoCorreoCrm = 'tarea_asignada' | 'tarea_terminada' | 'tarea_devuelta';

export const ETIQUETAS_TIPO_CORREO: Readonly<Record<TipoCorreoCrm, string>> = {
  tarea_asignada: 'Tarea asignada',
  tarea_terminada: 'Tarea terminada',
  tarea_devuelta: 'Tarea devuelta',
};

/** Resultado de un aviso: si salió, si quedó pendiente y por qué. */
export interface EstadoAvisoCrm {
  correoId: number | null;
  estado: EstadoCorreo;
  /** Texto para mostrarle a la persona (p. ej. «Se le avisó a José por correo.»). */
  mensaje: string;
}

export interface CorreoCrm {
  id: number;
  tareaId: number | null;
  tareaTitulo: string | null;
  tipo: TipoCorreoCrm;
  para: string;
  asunto: string;
  estado: EstadoCorreo;
  intentos: number;
  error: string | null;
  /** Cuántos archivos van adjuntos. */
  adjuntos: number;
  creadoEn: string;
  enviadoEn: string | null;
}

// ── Cuenta de correo ────────────────────────────────────────────────────────

/** De dónde sale la cuenta: las variables CRM_CORREO_* del servidor (mandan y no se editan aquí), la guardada en la base, o ninguna. */
export type OrigenCuentaCorreoCrm = 'variables' | 'base' | 'ninguna';

export interface CuentaCorreoCrm {
  origen: OrigenCuentaCorreoCrm;
  /** Modo efectivo del envío: 'smtp' envía de verdad; 'archivo' y 'memoria' son de desarrollo y pruebas. */
  modo: 'smtp' | 'archivo' | 'memoria' | 'desactivado';
  /** La cuenta (también el remitente), o null. */
  usuario: string | null;
  host: string | null;
  puerto: number | null;
  /** TLS desde el inicio (465); false = STARTTLS (587). */
  seguro: boolean | null;
  /** Nombre visible del remitente. */
  nombre: string;
  /** Hay contraseña guardada (nunca se devuelve). */
  tieneClave: boolean;
  /** Se puede cambiar desde el CRM (false si mandan las variables del servidor). */
  editable: boolean;
  /** ISO 8601 de la última vez que se guardó en la base, o null. */
  actualizadoEn: string | null;
}

export interface GuardarCuentaCorreoCrm {
  usuario: string;
  /** Contraseña de aplicación (se le quitan los espacios). Vacía u omitida: se conserva la guardada. */
  clave?: string;
  /** Servidor SMTP. Por defecto según el dominio (Gmail o Microsoft); para Google Workspace, smtp.gmail.com. */
  host?: string;
  puerto?: number;
  seguro?: boolean;
  nombre?: string;
}

export interface PruebaCorreoCrm {
  /** A quién mandar la prueba; por defecto, al líder. */
  para?: string;
}

export interface ResultadoPruebaCorreoCrm {
  enviado: boolean;
  para: string;
  /** «Se envió un correo de prueba a …» o el error del servidor de correo, en palabras claras. */
  mensaje: string;
}

/** Servidor SMTP sugerido para las cuentas de Google Workspace (como @sapiencia.gov.co). */
export const HOST_SMTP_GOOGLE = 'smtp.gmail.com';

// ── Líder ───────────────────────────────────────────────────────────────────

export interface CredencialesLiderCrm {
  contrasena: string;
}

export interface SesionLiderCrm {
  nombre: string;
  csrf: string;
  /** ISO 8601. */
  expira: string;
}

export interface ResumenLiderCrm {
  personas: PersonaCrm[];
  totales: ConteoTareasCrm;
  correo: {
    /** Hay cuenta de correo configurada en el servidor. */
    configurado: boolean;
    pendientes: number;
    errores: number;
  };
}

// ── Errores ─────────────────────────────────────────────────────────────────

export type CodigoErrorCrm =
  | 'solicitud_invalida'
  | 'no_autenticado'
  | 'prohibido'
  | 'no_encontrado'
  | 'conflicto'
  | 'demasiado_grande'
  | 'tipo_no_permitido'
  | 'demasiados_intentos'
  | 'no_disponible'
  | 'interno';

export interface ErrorCrm {
  codigo: CodigoErrorCrm;
  mensaje: string;
  campos?: Record<string, string>;
}

// ── Funciones puras ─────────────────────────────────────────────────────────

/** Primera letra (un carácter completo, aunque tenga tilde) de una palabra. */
function primera(palabra: string): string {
  return Array.from(palabra)[0] ?? '';
}

/**
 * Dos iniciales en mayúscula: la del primer nombre y la del primer apellido.
 * Con 4 palabras o más se toma la tercera como primer apellido («Jose David
 * Ramírez Abraham» → «JR»); con 2 o 3, la segunda («Luciana Vélez Arenas» →
 * «LV»); con una sola palabra, sus dos primeras letras.
 */
export function inicialesDe(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) {
    return Array.from(palabras[0]).slice(0, 2).join('').toLocaleUpperCase('es-CO');
  }
  const apellido = palabras.length >= 4 ? palabras[2] : palabras[1];
  return (primera(palabras[0]) + primera(apellido)).toLocaleUpperCase('es-CO');
}

/** Tamaño legible en español: «820 KB», «3,4 MB». */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

/** ¿Es una fecha 'AAAA-MM-DD' válida del calendario? */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}
