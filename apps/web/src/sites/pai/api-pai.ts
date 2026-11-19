/**
 * Contrato HTTP de la rama /pai (Plan de Acción Institucional de Sapiencia,
 * formato F-ES-DE-003).
 *
 * COPIA IDÉNTICA en:
 *   apps/server/src/pai/api-pai.ts
 *   apps/web/src/sites/pai/api-pai.ts
 * Los dos paquetes son independientes: si cambias uno, copia el archivo
 * completo al otro (la prueba src/pai/api-pai.spec.ts del servidor lo
 * comprueba). Cambios solo compatibles hacia atrás.
 *
 * ── Modelo ─────────────────────────────────────────────────────────────────
 * Vigencia (año) → dependencias → procesos/proyectos (fichas) → acciones →
 * indicadores, con metas por bimestre (Bimestre 1 = enero–febrero … 6 =
 * noviembre–diciembre). Cada (indicador, bimestre) tiene a lo sumo un reporte:
 * avance, logros, observaciones, riesgo materializado, fuentes de
 * verificación y evidencias (archivos).
 *
 * Roles:
 *   - responsable: ve y reporta SOLO los indicadores asignados (directamente o
 *     por su proceso) y SOLO en el bimestre abierto (o con una autorización
 *     vigente del administrador para otro bimestre).
 *   - administrador (Planeación): ve todo, en solo lectura sobre los reportes;
 *     gestiona usuarios, asignaciones, el bimestre abierto y las
 *     autorizaciones.
 * Todas las reglas se aplican en el servidor; la interfaz solo refleja las
 * banderas `editable` / `motivo` que calcula el servidor (nunca las recalcula).
 *
 * ── Sesión ─────────────────────────────────────────────────────────────────
 * Cookie `pai_sesion` (HttpOnly, SameSite=Strict, Secure en producción,
 * Path=/api/pai). CSRF: toda petición que cambia algo (POST/PUT/PATCH/DELETE)
 * envía la cabecera `X-CSRF-Token` con el `csrf` de SesionPai; además se
 * rechazan peticiones de otro sitio (Sec-Fetch-Site / Origin). Sin sesión:
 * 401. CSRF inválido u otro sitio: 403 `prohibido`.
 * Contraseña temporal (`debeCambiarContrasena`): la sesión solo puede usar
 * GET /sesion, DELETE /sesion y PUT /sesion/contrasena; cualquier otra ruta
 * responde 403 `cambio_contrasena_requerido`.
 * Inicio de sesión: 5 fallos por usuario o 20 por IP en 15 minutos bloquean
 * (429 + Retry-After). Restablecer la contraseña (PATCH /admin/usuarios/:id
 * con contrasenaTemporal, o la CLI) levanta el bloqueo de ese usuario.
 *
 * POST   /api/pai/sesion                 <- CredencialesPai -> SesionPai (pone la cookie)
 * GET    /api/pai/sesion                 -> SesionPai | 401
 * DELETE /api/pai/sesion                 -> 204 (borra la sesión y la cookie)
 * PUT    /api/pai/sesion/contrasena      <- CambioContrasenaPai -> SesionPai
 *        (exige la contraseña actual; quita debeCambiarContrasena y cierra las
 *        demás sesiones del usuario; una contraseña actual incorrecta da 400
 *        `solicitud_invalida` con `campos.actual` y cuenta para un límite
 *        propio del cambio: 5 fallos en 15 minutos, o 20 de la IP, dan 429.
 *        El bloqueo del inicio de sesión no impide cambiarla desde la sesión)
 *
 * ── Consulta (ambos roles) ─────────────────────────────────────────────────
 * Por defecto se usa la vigencia más reciente; `?vigencia=2026` elige otra
 * (404 si no existe).
 *
 * GET    /api/pai/vigencia               -> VigenciaPai
 * GET    /api/pai/tablero                -> TableroPai (lista liviana: sin textos largos)
 * GET    /api/pai/indicadores/:ref       -> FichaIndicadorPai
 *        (`:ref` = id numérico o código, p. ej. SAF-TH-02; un código se busca
 *        en `?vigencia=` o, sin ella, en la vigencia más reciente que lo
 *        tenga; con un id y `?vigencia=`, el indicador debe ser de esa
 *        vigencia; 404 si no existe o si el responsable no lo tiene asignado)
 *
 * ── Reportes (responsable) ─────────────────────────────────────────────────
 * PUT    /api/pai/indicadores/:id/bimestres/:b   <- DatosReportePai -> RespuestaReportePai
 *        (upsert; los campos ausentes no cambian, null borra; 403 si no es
 *        editable, también para el administrador; 409 `conflicto` si
 *        `actualizadoEn` no coincide con el del servidor)
 *
 * ── Evidencias ─────────────────────────────────────────────────────────────
 * POST   /api/pai/indicadores/:id/bimestres/:b/evidencias/subidas -> RespuestaSubidaPai
 * POST   /api/pai/indicadores/:id/bimestres/:b/evidencias/subidas/partes
 *        <- InicioSubidaPorPartesPai -> 201 SubidaPorPartesPai
 * PUT    /api/pai/subidas/partes/:uuid/:n  application/octet-stream -> 204
 *        (solo el usuario que empezó la subida)
 * POST   /api/pai/indicadores/:id/bimestres/:b/evidencias
 *        multipart (campo "archivo") o JSON EvidenciaSubidaDirecta -> 201 EvidenciaPai
 * GET    /api/pai/evidencias/:id         -> el archivo (attachment, nombre original,
 *        Cache-Control: private, no-store) o 302 a una URL firmada de 60 s
 *        (bucket privado de Supabase). Administrador, o responsable asignado.
 * DELETE /api/pai/evidencias/:id         -> 204 (solo si puede editar ese reporte)
 * Subir y borrar exigen poder editar (indicador, bimestre). Tipos: TIPOS_EVIDENCIA.
 * Máximo LIMITES_PAI.maxBytesEvidencia por archivo y
 * LIMITES_PAI.maxEvidenciasPorReporte por reporte (409 `conflicto` si se supera).
 *
 * ── Administración (solo administrador; responsable: 403) ──────────────────
 * GET    /api/pai/admin/usuarios                    -> ListaUsuariosPai
 * POST   /api/pai/admin/usuarios                    <- DatosUsuarioNuevoPai -> 201 UsuarioPai
 * PATCH  /api/pai/admin/usuarios/:id                <- CambiosUsuarioPai -> UsuarioPai
 * PUT    /api/pai/admin/usuarios/:id/asignaciones   <- AsignacionesPai -> UsuarioPai
 *        Las asignaciones son por vigencia: GET /admin/usuarios y PUT
 *        …/asignaciones aceptan `?vigencia=` (por defecto la más reciente) y
 *        no tocan las de otras vigencias. Todos los ids deben ser de esa
 *        vigencia (400 con `campos`); solo los responsables tienen
 *        asignaciones (409).
 * PUT    /api/pai/admin/vigencia                    <- DatosVigenciaPai -> VigenciaPai
 * GET    /api/pai/admin/autorizaciones              -> ListaAutorizacionesPai
 * POST   /api/pai/admin/autorizaciones              <- DatosAutorizacionPai -> 201 AutorizacionPai
 *        (409 si el responsable no tiene asignado ese proceso o indicador)
 * DELETE /api/pai/admin/autorizaciones/:id          -> AutorizacionPai (revocada)
 * GET    /api/pai/admin/registro?pagina=&usuario=&indicador=&accion= -> PaginaRegistroPai
 * GET    /api/pai/admin/exportar.csv?<FiltrosTableroPai>&bimestre=  -> text/csv
 *        (UTF-8 con BOM, separador `;`, para Excel es-CO; una fila por
 *        indicador con proceso, acción, metas, avances, % y los textos del
 *        bimestre elegido; por defecto el bimestre abierto o, sin bimestre
 *        abierto, el último que tenga algún reporte)
 *
 * Errores: JSON ErrorPai con status 400 / 401 / 403 / 404 / 409 / 413 / 415 /
 * 429 / 503 (mensajes propios del PAI). 429 y 503 traen Retry-After. Todas
 * las respuestas JSON llevan Cache-Control: no-store.
 *
 * Números: avances y metas como en Excel. Los indicadores de tipo
 * 'porcentaje' casi siempre van en escala 0-100 (100 = 100 %), pero alguno
 * va en escala 0-1 (1 = 100 %, p. ej. GEP-EDI-01, metas de 0,1666…): lo
 * dice `escala` ('0-100' | '0-1') en IndicadorTableroPai y en
 * FichaIndicadorPai, y el avance se escribe en esa misma escala. Los
 * `porcentaje*` de las respuestas son fracciones (1 = 100 %) en todos los
 * casos, ya con el tope de 100 % aplicado donde corresponde. Fechas: texto
 * ISO 8601 (UTC).
 * Listas "por bimestre": siempre 6 elementos, índice 0 = Bimestre 1.
 */

// ── Rutas, cabeceras y límites ─────────────────────────────────────────────

export const RUTA_API_PAI = '/api/pai';
/** Misma cabecera que el repositorio (api-repositorio.ts). */
export const CABECERA_CSRF = 'X-CSRF-Token';
export const COOKIE_SESION_PAI = 'pai_sesion';
/** La cookie solo viaja a la API del PAI. */
export const RUTA_COOKIE_PAI = RUTA_API_PAI;
/** Parámetro de consulta para elegir la vigencia (año). */
export const PARAMETRO_VIGENCIA = 'vigencia';
/** Zona horaria de las fechas límite y de los bimestres. */
export const ZONA_HORARIA_PAI = 'America/Bogota';

/** Rutas relativas a RUTA_API_PAI. */
export const RUTAS_API_PAI = {
  sesion: '/sesion',
  contrasena: '/sesion/contrasena',
  vigencia: '/vigencia',
  tablero: '/tablero',
  indicador: (ref: number | string): string =>
    `/indicadores/${encodeURIComponent(String(ref))}`,
  reporte: (indicadorId: number, bimestre: number): string =>
    `/indicadores/${indicadorId}/bimestres/${bimestre}`,
  subidasEvidencia: (indicadorId: number, bimestre: number): string =>
    `/indicadores/${indicadorId}/bimestres/${bimestre}/evidencias/subidas`,
  subidasPorPartesEvidencia: (indicadorId: number, bimestre: number): string =>
    `/indicadores/${indicadorId}/bimestres/${bimestre}/evidencias/subidas/partes`,
  /** `ruta` es la de SubidaPorPartesPai (partes/<uuid>). */
  parteSubida: (ruta: string, n: number): string => `/subidas/${ruta}/${n}`,
  evidencias: (indicadorId: number, bimestre: number): string =>
    `/indicadores/${indicadorId}/bimestres/${bimestre}/evidencias`,
  evidencia: (id: number): string => `/evidencias/${id}`,
  adminUsuarios: '/admin/usuarios',
  adminUsuario: (id: number): string => `/admin/usuarios/${id}`,
  adminAsignaciones: (id: number): string =>
    `/admin/usuarios/${id}/asignaciones`,
  adminVigencia: '/admin/vigencia',
  adminAutorizaciones: '/admin/autorizaciones',
  adminAutorizacion: (id: number): string => `/admin/autorizaciones/${id}`,
  adminRegistro: '/admin/registro',
  adminExportar: '/admin/exportar.csv',
} as const;

export const LIMITES_PAI = {
  /** Tamaño máximo de una evidencia (bytes). */
  maxBytesEvidencia: 25 * 1024 * 1024,
  /** Evidencias por reporte (indicador, bimestre). */
  maxEvidenciasPorReporte: 10,
  /** Logros, observaciones, descripción del riesgo y fuentes (caracteres). */
  maxTexto: 10_000,
  /** Numeral del riesgo materializado (caracteres). */
  maxNumeralRiesgo: 200,
  /** Decimales del avance que escribe el responsable. */
  maxDecimalesAvance: 6,
  /** Avance máximo que se acepta. */
  maxAvance: 1_000_000_000_000,
  maxNombreUsuario: 120,
  maxCorreo: 254,
  maxCargo: 160,
  maxMotivoAutorizacion: 500,
  /** Nombre original de una evidencia (caracteres). */
  maxNombreArchivo: 255,
  /** Contraseñas: las mismas reglas del repositorio. */
  minContrasena: 12,
  maxContrasena: 1024,
  /** Entradas por página del registro (auditoría). */
  registroPorPagina: 50,
} as const;

/** Usuario: minúsculas, números, punto, guion y guion bajo (como el repositorio). */
export const PATRON_USUARIO_PAI = /^[a-z0-9][a-z0-9._-]{2,63}$/;

/** Código de indicador: <código del proceso>-<consecutivo>, p. ej. SAF-TH-02, OPE-PPEP-16. */
export const PATRON_CODIGO_INDICADOR =
  /^[A-Z][A-Z0-9]{1,9}(?:-[A-Z0-9]{1,9})*-\d{2,3}$/;

export function esCodigoIndicador(texto: string): boolean {
  return PATRON_CODIGO_INDICADOR.test(texto.toUpperCase());
}

/** Tipos MIME aceptados como evidencia (se comprueban por firma, no por nombre). */
export const TIPOS_EVIDENCIA = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number];

/** Extensiones aceptadas (para validar en el navegador y para <input accept>). */
export const EXTENSIONES_EVIDENCIA = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

/** Valor del atributo accept de <input type="file">. */
export const ACEPTAR_EVIDENCIAS = [
  ...EXTENSIONES_EVIDENCIA,
  ...TIPOS_EVIDENCIA,
].join(',');

// ── Bimestres ──────────────────────────────────────────────────────────────

export type NumeroBimestre = 1 | 2 | 3 | 4 | 5 | 6;

export const NUMEROS_BIMESTRE: readonly NumeroBimestre[] = [1, 2, 3, 4, 5, 6];

export interface BimestreInfo {
  numero: NumeroBimestre;
  /** "Bimestre 1" */
  nombre: string;
  /** "enero–febrero" */
  meses: string;
}

export const BIMESTRES_PAI: readonly BimestreInfo[] = [
  { numero: 1, nombre: 'Bimestre 1', meses: 'enero–febrero' },
  { numero: 2, nombre: 'Bimestre 2', meses: 'marzo–abril' },
  { numero: 3, nombre: 'Bimestre 3', meses: 'mayo–junio' },
  { numero: 4, nombre: 'Bimestre 4', meses: 'julio–agosto' },
  { numero: 5, nombre: 'Bimestre 5', meses: 'septiembre–octubre' },
  { numero: 6, nombre: 'Bimestre 6', meses: 'noviembre–diciembre' },
];

export function esNumeroBimestre(valor: unknown): valor is NumeroBimestre {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= 1 &&
    valor <= 6
  );
}

/** Bimestre de un mes (1 = enero … 12 = diciembre). */
export function bimestreDeMes(mes: number): NumeroBimestre {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError(`Mes inválido: ${mes}`);
  }
  return Math.ceil(mes / 2) as NumeroBimestre;
}

export function infoBimestre(numero: NumeroBimestre): BimestreInfo {
  return BIMESTRES_PAI[numero - 1];
}

// ── Enumeraciones ──────────────────────────────────────────────────────────

export type RolPai = 'responsable' | 'administrador';
export const ROLES_PAI: readonly RolPai[] = ['responsable', 'administrador'];

export type TipoProceso = 'proceso' | 'proyecto';
export const TIPOS_PROCESO: readonly TipoProceso[] = ['proceso', 'proyecto'];

export type TipoMeta = 'numero' | 'porcentaje' | 'a_demanda';
export const TIPOS_META: readonly TipoMeta[] = [
  'numero',
  'porcentaje',
  'a_demanda',
];

/**
 * Regla de un total (ver las notas 11, 15 y 16 de datos/pai/2026/pai-2026.json):
 *   suma: Σ de los 6 bimestres; suma_dividida: Σ / divisor;
 *   si_suma_mayor_99_entonces_100: 100 si Σ > 99, si no 0;
 *   constante: el valor guardado (meta_total), sin recalcular.
 */
export type ReglaTotal =
  'suma' | 'suma_dividida' | 'si_suma_mayor_99_entonces_100' | 'constante';
export const REGLAS_TOTAL: readonly ReglaTotal[] = [
  'suma',
  'suma_dividida',
  'si_suma_mayor_99_entonces_100',
  'constante',
];

/**
 * Escala de las metas y los avances de un indicador de tipo 'porcentaje':
 *   '0-100': 50 = 50 % (lo normal);
 *   '0-1':   0,5 = 50 % (como venía en su Excel, p. ej. GEP-EDI-01).
 */
export type EscalaPorcentajePai = '0-100' | '0-1';

export type OrigenReporte = 'importado' | 'aplicativo';

export type RiesgoMaterializado = 'SI' | 'NO';

/**
 * Estado de un (indicador, bimestre), en este orden de prioridad:
 *   reportado: tiene avance (aunque sea 0) o algún texto (logros,
 *              observaciones, riesgo, numeral, descripción o fuentes);
 *   futuro:    nada reportado y el bimestre todavía no se debe reportar: es
 *              posterior al bimestre de referencia o aún no empieza. El
 *              bimestre de referencia es el abierto (aunque haya pasado su
 *              fecha límite) o, sin bimestre abierto, el último cuyo periodo
 *              ya terminó (hora de Colombia). El bimestre abierto nunca es
 *              futuro. Ejemplo: el 11 de octubre, con el Bimestre 4 abierto,
 *              los bimestres 5 y 6 sin reportes son futuros. No es un
 *              incumplimiento: no cuenta como pendiente ni entra en los
 *              logros ni en el avance anual (ResumenAvancePai);
 *   pendiente: nada reportado y meta > 0 (ya se debía reportar);
 *   sin_meta:  nada reportado y meta = 0.
 */
export type EstadoBimestre = 'reportado' | 'pendiente' | 'sin_meta' | 'futuro';
export const ESTADOS_BIMESTRE: readonly EstadoBimestre[] = [
  'reportado',
  'pendiente',
  'sin_meta',
  'futuro',
];

/** Estados por los que se filtra (en el bimestre abierto). */
export type EstadoReporteFiltro = 'reportado' | 'pendiente' | 'sin_meta';
export const ESTADOS_REPORTE_FILTRO: readonly EstadoReporteFiltro[] = [
  'reportado',
  'pendiente',
  'sin_meta',
];

/**
 * Por qué una casilla (indicador, bimestre) es o no editable para el usuario:
 *   abierto:     editable: es el bimestre abierto, dentro de la fecha límite,
 *                y el indicador está asignado al responsable;
 *   autorizado:  editable por una autorización vigente (no revocada ni
 *                vencida) del administrador para ese bimestre;
 *   cerrado:     no editable: el responsable tiene el indicador asignado,
 *                pero el bimestre no está abierto (o venció su fecha límite)
 *                y no hay autorización;
 *   sin_permiso: no editable: administrador (solo lectura), indicador no
 *                asignado o cuenta inactiva.
 */
export type MotivoEdicion =
  'abierto' | 'autorizado' | 'cerrado' | 'sin_permiso';
export const MOTIVOS_EDICION: readonly MotivoEdicion[] = [
  'abierto',
  'autorizado',
  'cerrado',
  'sin_permiso',
];

export type EstadoAutorizacion = 'vigente' | 'vencida' | 'revocada';

/** Acciones del registro (auditoría, tabla pai_registro). */
export type AccionRegistroPai =
  | 'iniciar_sesion'
  | 'cambiar_contrasena'
  | 'guardar_reporte'
  | 'subir_evidencia'
  | 'borrar_evidencia'
  | 'crear_usuario'
  | 'editar_usuario'
  | 'asignar'
  | 'abrir_bimestre'
  | 'cerrar_bimestre'
  | 'otorgar_autorizacion'
  | 'revocar_autorizacion'
  | 'cargar_fichas';
export const ACCIONES_REGISTRO_PAI: readonly AccionRegistroPai[] = [
  'iniciar_sesion',
  'cambiar_contrasena',
  'guardar_reporte',
  'subir_evidencia',
  'borrar_evidencia',
  'crear_usuario',
  'editar_usuario',
  'asignar',
  'abrir_bimestre',
  'cerrar_bimestre',
  'otorgar_autorizacion',
  'revocar_autorizacion',
  'cargar_fichas',
];

// ── Sesión ─────────────────────────────────────────────────────────────────

export interface CredencialesPai {
  usuario: string;
  contrasena: string;
}

export interface SesionPai {
  /** id del usuario (pai_usuarios.id). */
  id: number;
  usuario: string;
  nombre: string;
  rol: RolPai;
  /** Token para la cabecera X-CSRF-Token. */
  csrf: string;
  /** ISO de vencimiento de la sesión. */
  expira: string;
  /** Contraseña temporal: hay que cambiarla antes de usar el aplicativo. */
  debeCambiarContrasena: boolean;
}

export interface CambioContrasenaPai {
  actual: string;
  nueva: string;
}

// ── Vigencia ───────────────────────────────────────────────────────────────

export interface VigenciaPai {
  anio: number;
  /** Bimestre habilitado para reportar; null = cerrado. */
  bimestreAbierto: NumeroBimestre | null;
  /** Fecha límite (ISO) del bimestre abierto; null = sin fecha límite. */
  abiertoHasta: string | null;
  /** bimestreAbierto !== null y la fecha actual no supera abiertoHasta. */
  abiertoAhora: boolean;
  /** Los seis bimestres con su nombre y sus meses (BIMESTRES_PAI). */
  bimestres: BimestreInfo[];
  /** Años con datos, del más reciente al más antiguo. */
  vigencias: number[];
  /** Hora del servidor (ISO) al responder. */
  ahora: string;
  actualizadoEn: string | null;
  /** Nombre de quien abrió o cerró el bimestre por última vez. */
  actualizadoPor: string | null;
}

/** PUT /admin/vigencia */
export interface DatosVigenciaPai {
  /** 1-6 para abrir ese bimestre; null para cerrar. */
  bimestreAbierto: NumeroBimestre | null;
  /** ISO; debe ser futura. Debe ser null si bimestreAbierto es null. */
  abiertoHasta: string | null;
}

// ── Tablero (GET /tablero) ─────────────────────────────────────────────────

export interface DependenciaPai {
  id: number;
  /** SAF, DTF, GEP, OCI, OPE… */
  sigla: string;
  nombre: string;
}

/** Proceso o proyecto (ficha), para filtros y agrupación. */
export interface ProcesoTableroPai {
  id: number;
  /** Clave estable, p. ej. saf-talento-humano. */
  clave: string;
  /** Prefijo de los códigos de sus indicadores, p. ej. SAF-TH. */
  codigo: string;
  nombre: string;
  dependenciaId: number;
  tipo: TipoProceso;
  /** Programa del Plan de Desarrollo Distrital (solo algunos proyectos). */
  programa: string | null;
  /** Línea del Plan de Desarrollo, normalizada. */
  lineaPlanDesarrollo: string | null;
  dimensionPlanEstrategico: string | null;
  orden: number;
}

/** Riesgo del catálogo de un proceso. */
export interface RiesgoTableroPai {
  id: number;
  procesoId: number;
  numeral: number | null;
  /** Texto completo del riesgo, como en la ficha ("1. Recibir dádivas…"). */
  texto: string;
  /** Riesgo de corrupción ("(RC)"). */
  corrupcion: boolean;
}

export interface AccionTableroPai {
  id: number;
  procesoId: number;
  /** Posición dentro del proceso. */
  orden: number;
  descripcion: string;
  /** Riesgos que cubre la acción, en orden. */
  riesgoIds: number[];
}

/**
 * Indicador en la lista del tablero. Las listas por bimestre tienen 6
 * elementos (índice 0 = Bimestre 1).
 */
export interface IndicadorTableroPai {
  id: number;
  codigo: string;
  nombre: string;
  procesoId: number;
  accionId: number;
  /** Posición dentro de la acción. */
  orden: number;
  tipoMeta: TipoMeta;
  /**
   * Solo los de tipo 'porcentaje': escala de metas y avances (ver
   * EscalaPorcentajePai); null en los de número y a demanda. El servidor
   * siempre lo envía (opcional en el tipo solo por compatibilidad).
   */
  escala?: EscalaPorcentajePai | null;
  metas: number[];
  metaTotal: number;
  avances: (number | null)[];
  avanceTotal: number | null;
  /** avance / meta (fracción) con el tope aplicado; null si meta = 0 o sin avance. */
  porcentajes: (number | null)[];
  porcentajeTotal: number | null;
  estados: EstadoBimestre[];
  /** ¿El usuario de la sesión puede editar esa casilla? */
  editables: boolean[];
  motivos: MotivoEdicion[];
  /** ¿Hay algún texto (logros, observaciones, riesgo, fuentes)? */
  tieneTextos: boolean[];
  /** Número de evidencias. */
  evidencias: number[];
  /** actualizado_en del reporte (token de concurrencia); null si no hay reporte. */
  actualizadoEn: (string | null)[];
}

export interface ConteoEstadosPai {
  /** El bimestre abierto. */
  bimestre: NumeroBimestre;
  reportados: number;
  pendientes: number;
  sinMeta: number;
}

/**
 * Avance agregado. Un proceso promedia sus indicadores; una dependencia,
 * sus procesos; `general`, las dependencias.
 */
export interface ResumenAvancePai {
  /**
   * Logro por bimestre (fracción): promedio de los % del bimestre de los
   * indicadores con meta > 0 en ese bimestre cuyo estado no es 'futuro' (el
   * que no reportó cuenta como 0 %, como en el Excel, aunque nadie del grupo
   * haya reportado); null si no entra ninguno (sin metas, o un bimestre que
   * todavía no se debe reportar). Una dependencia y `general` promedian los
   * logros no nulos de sus grupos.
   */
  logros: (number | null)[];
  /**
   * Promedio de los % totales de los indicadores con meta total > 0 que ya
   * tienen % o algún bimestre con meta que no es 'futuro' (sin avance cuenta
   * como 0 %); null si no hay ninguno.
   */
  avanceAnual: number | null;
  /** Indicadores incluidos. */
  indicadores: number;
  /** Estados en el bimestre abierto; null si no hay bimestre abierto. */
  conteo: ConteoEstadosPai | null;
}

export interface ResumenProcesoPai extends ResumenAvancePai {
  procesoId: number;
}

export interface ResumenDependenciaPai extends ResumenAvancePai {
  dependenciaId: number;
}

/** Se calcula sobre los indicadores visibles para el usuario (administrador: todos). */
export interface ResumenTableroPai {
  general: ResumenAvancePai;
  dependencias: ResumenDependenciaPai[];
  procesos: ResumenProcesoPai[];
}

/**
 * GET /tablero. Los catálogos se limitan a lo que tiene indicadores visibles
 * para el usuario (el responsable no ve procesos que no le asignaron).
 */
export interface TableroPai {
  vigencia: VigenciaPai;
  dependencias: DependenciaPai[];
  procesos: ProcesoTableroPai[];
  riesgos: RiesgoTableroPai[];
  acciones: AccionTableroPai[];
  /** En orden: dependencia, proceso, acción, indicador. */
  indicadores: IndicadorTableroPai[];
  resumen: ResumenTableroPai;
}

/**
 * Filtros del tablero: los mismos nombres en la URL de /pai y en
 * GET /admin/exportar.csv (valores vacíos = sin filtro). Semántica:
 *   dependencia: id de la dependencia del proceso
 *   proceso:     id del proceso
 *   programa:    texto exacto de proceso.programa
 *   riesgo:      id de un riesgo que cubra la acción del indicador
 *   linea:       texto exacto de proceso.lineaPlanDesarrollo
 *   dimension:   texto exacto de proceso.dimensionPlanEstrategico
 *   tipo:        proceso | proyecto
 *   estado:      estado del indicador en el bimestre abierto (sin bimestre
 *                abierto, el filtro no aplica)
 *   q:           texto en el código o el nombre del indicador, sin
 *                distinguir mayúsculas ni tildes
 */
export interface FiltrosTableroPai {
  dependencia?: number | null;
  proceso?: number | null;
  programa?: string | null;
  riesgo?: number | null;
  linea?: string | null;
  dimension?: string | null;
  tipo?: TipoProceso | null;
  estado?: EstadoReporteFiltro | null;
  q?: string | null;
}

/** Nombres de los parámetros de FiltrosTableroPai en la URL. */
export const PARAMETROS_FILTRO_PAI = [
  'dependencia',
  'proceso',
  'programa',
  'riesgo',
  'linea',
  'dimension',
  'tipo',
  'estado',
  'q',
] as const satisfies readonly (keyof FiltrosTableroPai)[];

/** Parámetro extra de la exportación: bimestre de los textos. */
export const PARAMETRO_BIMESTRE_EXPORTACION = 'bimestre';

/** Nombre del archivo de la exportación. */
export function nombreArchivoExportacion(
  anio: number,
  bimestre: NumeroBimestre,
): string {
  return `pai-${anio}-bimestre-${bimestre}.csv`;
}

// ── Ficha del indicador (GET /indicadores/:ref) ────────────────────────────

export interface ProcesoFichaPai extends ProcesoTableroPai {
  dependencia: DependenciaPai;
  /** Código BPIN del proyecto, si tiene. */
  codigoProyecto: string | null;
  objetivo: string | null;
}

export interface RiesgoFichaPai extends RiesgoTableroPai {
  descripcion: string | null;
  /** N.º de la celda combinada de riesgo en la hoja (PPEP tiene 2 bloques). */
  bloque: number | null;
}

/** Cómo se calculan los totales y el % (ver ReglaTotal). */
export interface CalculoIndicadorPai {
  reglaMetaTotal: ReglaTotal;
  divisorMetaTotal: number | null;
  reglaAvanceTotal: ReglaTotal;
  divisorAvanceTotal: number | null;
  /** true: % con tope de 100 %; false: sin tope; null: mixto (ver topePorBimestre). */
  tope100: boolean | null;
  /** Solo en los mixtos: tope por bimestre (6 valores) y en el total. */
  topePorBimestre: { bimestres: boolean[]; total: boolean } | null;
}

export interface EvidenciaPai {
  id: number;
  /** Nombre original del archivo. */
  nombre: string;
  /** Tipo MIME detectado por firma. */
  tipo: string;
  bytes: number;
  subidoEn: string;
  /** Nombre de quien la subió (null si la cuenta ya no existe). */
  subidoPor: string | null;
  /** GET /api/pai/evidencias/:id */
  urlDescarga: string;
}

export interface ReporteBimestrePai {
  bimestre: NumeroBimestre;
  meta: number;
  avance: number | null;
  porcentaje: number | null;
  estado: EstadoBimestre;
  logros: string | null;
  observaciones: string | null;
  riesgoMaterializado: RiesgoMaterializado | null;
  numeralRiesgo: string | null;
  descripcionRiesgo: string | null;
  fuentesVerificacion: string | null;
  evidencias: EvidenciaPai[];
  /** null = no hay reporte guardado. */
  origen: OrigenReporte | null;
  /** Token de concurrencia: se devuelve tal cual en DatosReportePai.actualizadoEn. */
  actualizadoEn: string | null;
  /** Nombre de quien lo guardó por última vez en el aplicativo. */
  actualizadoPor: string | null;
  editable: boolean;
  motivo: MotivoEdicion;
}

export interface FichaIndicadorPai {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  tipoMeta: TipoMeta;
  /** Como IndicadorTableroPai.escala. */
  escala?: EscalaPorcentajePai | null;
  vigencia: number;
  proceso: ProcesoFichaPai;
  accion: { id: number; orden: number; descripcion: string };
  /** Riesgos de la acción, en orden, con su descripción. */
  riesgos: RiesgoFichaPai[];
  productos: string | null;
  rolResponsable: string | null;
  responsable: string | null;
  corresponsables: string | null;
  metaTotal: number;
  avanceTotal: number | null;
  porcentajeTotal: number | null;
  calculo: CalculoIndicadorPai;
  /** Los 6 bimestres, en orden, con el reporte completo (o vacío). */
  bimestres: ReporteBimestrePai[];
}

// ── Guardar un reporte (PUT /indicadores/:id/bimestres/:b) ─────────────────

/**
 * Campos ausentes (undefined): no cambian. null: borra el valor.
 * - avance: número >= 0 con a lo sumo 6 decimales (LIMITES_PAI.maxAvance).
 * - textos: hasta LIMITES_PAI.maxTexto caracteres (numeralRiesgo:
 *   maxNumeralRiesgo); se normalizan (saltos \n, sin caracteres de control,
 *   sin espacios al final); un texto vacío queda null.
 * - riesgoMaterializado 'SI' exige numeralRiesgo y descripcionRiesgo (en el
 *   resultado final, contando lo que ya estaba guardado).
 * - actualizadoEn: el de la casilla tal como llegó del servidor (null si no
 *   había reporte). Si no coincide con el actual: 409 `conflicto`. Si se
 *   omite, no se comprueba. null también vale para un reporte sin avance ni
 *   textos (el que crea la primera evidencia del bimestre): no hay nada que
 *   se pueda perder.
 */
export interface DatosReportePai {
  avance?: number | null;
  logros?: string | null;
  observaciones?: string | null;
  riesgoMaterializado?: RiesgoMaterializado | null;
  numeralRiesgo?: string | null;
  descripcionRiesgo?: string | null;
  fuentesVerificacion?: string | null;
  actualizadoEn?: string | null;
}

/** El reporte guardado y la fila del tablero recalculada (totales y %). */
export interface RespuestaReportePai {
  reporte: ReporteBimestrePai;
  indicador: IndicadorTableroPai;
}

// ── Evidencias ─────────────────────────────────────────────────────────────

/**
 * POST .../evidencias/subidas: dónde subir la evidencia.
 * - `directa: true` (Supabase Storage, bucket privado): el navegador sube el
 *   archivo con PUT a `url` (URL firmada; cabeceras Content-Type y
 *   x-upsert: false; sin cookie ni CSRF) y luego envía
 *   EvidenciaSubidaDirecta en JSON a POST .../evidencias.
 * - `directa: false` (archivos en la base): si el archivo pesa hasta
 *   `tamanoParte`, multipart (campo "archivo") a POST .../evidencias. Si pesa
 *   más, por partes (en Vercel una petición no puede llevar más de 4,5 MB):
 *   POST .../evidencias/subidas/partes con InicioSubidaPorPartesPai ->
 *   SubidaPorPartesPai; PUT /api/pai/subidas/{ruta}/{n} con cada parte
 *   (application/octet-stream, exactamente `tamanoParte` bytes salvo la
 *   última, n desde 0) -> 204; y luego EvidenciaSubidaDirecta en JSON a
 *   POST .../evidencias. Cuenta en el mismo cupo y vence igual que la directa.
 *   (Un servidor anterior no manda `tamanoParte`: todo va en multipart.)
 */
export type RespuestaSubidaPai =
  | { directa: false; tamanoParte?: number; maxBytes?: number }
  | { directa: true; ruta: string; url: string; maxBytes: number };

/** Cuerpo de POST .../evidencias/subidas/partes. */
export interface InicioSubidaPorPartesPai {
  /** Tamaño total del archivo (bytes). */
  bytes: number;
}

/** Respuesta de POST .../evidencias/subidas/partes. */
export interface SubidaPorPartesPai {
  /** partes/<uuid>: va en la URL de cada parte y en el campo `subida` al terminar. */
  ruta: string;
  tamanoParte: number;
}

export interface EvidenciaSubidaDirecta {
  /** La `ruta` de RespuestaSubidaPai o de SubidaPorPartesPai. */
  subida: string;
  /** Nombre original del archivo. */
  nombre: string;
  /** Tipo MIME que declaró el navegador. */
  tipo: string;
}

// ── Administración: usuarios y asignaciones ────────────────────────────────

/** Asignar un proceso cubre todos sus indicadores. */
export interface AsignacionesPai {
  procesos: number[];
  indicadores: number[];
}

export interface UsuarioPai {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  cargo: string | null;
  rol: RolPai;
  activo: boolean;
  debeCambiarContrasena: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** Vacías para los administradores. */
  asignaciones: AsignacionesPai;
}

export interface ListaUsuariosPai {
  usuarios: UsuarioPai[];
}

/** POST /admin/usuarios (409 `conflicto` si el usuario ya existe). */
export interface DatosUsuarioNuevoPai {
  /** PATRON_USUARIO_PAI */
  usuario: string;
  nombre: string;
  correo?: string | null;
  cargo?: string | null;
  rol: RolPai;
  /** Contraseña temporal: el usuario debe cambiarla al entrar. */
  contrasenaTemporal: string;
}

/**
 * PATCH /admin/usuarios/:id. Campos ausentes: no cambian.
 * - activo: false cierra sus sesiones.
 * - contrasenaTemporal: la reemplaza, marca debeCambiarContrasena y cierra
 *   sus sesiones.
 * Un administrador no puede desactivarse, quitarse el rol ni ponerse una
 * contraseña temporal a sí mismo (409 con `campos.activo`, `campos.rol` o
 * `campos.contrasenaTemporal`). Pasar a administrador borra las
 * asignaciones del usuario.
 */
export interface CambiosUsuarioPai {
  nombre?: string;
  correo?: string | null;
  cargo?: string | null;
  rol?: RolPai;
  activo?: boolean;
  contrasenaTemporal?: string;
}

// ── Administración: autorizaciones ─────────────────────────────────────────

export interface AutorizacionPai {
  id: number;
  usuarioId: number;
  /** Nombre de usuario (login). */
  usuario: string;
  nombreUsuario: string;
  bimestre: NumeroBimestre;
  /** Exactamente uno de procesoId / indicadorId. */
  procesoId: number | null;
  indicadorId: number | null;
  /** "SAF-TH · Gestión del Talento Humano" o "SAF-TH-02 · <nombre del indicador>". */
  alcance: string;
  vigenteHasta: string;
  motivo: string;
  otorgadaPor: string | null;
  otorgadaEn: string;
  revocadaEn: string | null;
  revocadaPor: string | null;
  estado: EstadoAutorizacion;
}

export interface ListaAutorizacionesPai {
  /**
   * Primero TODAS las vigentes; luego las demás (vencidas o revocadas, a lo
   * sumo las 1000 más recientes). Cada grupo, de la más reciente a la más
   * antigua.
   */
  autorizaciones: AutorizacionPai[];
}

/**
 * POST /admin/autorizaciones (solo para responsables activos; vigenteHasta
 * futura y a lo sumo un año después de hoy: 400 con `campos.vigenteHasta`).
 */
export interface DatosAutorizacionPai {
  usuarioId: number;
  bimestre: NumeroBimestre;
  /** Exactamente uno de procesoId / indicadorId. */
  procesoId?: number | null;
  indicadorId?: number | null;
  /** ISO */
  vigenteHasta: string;
  motivo: string;
}

// ── Administración: registro (auditoría) ───────────────────────────────────

/** GET /admin/registro: `usuario` = id; `indicador` = id o código; `pagina` desde 1. */
export interface ConsultaRegistroPai {
  pagina?: number;
  usuario?: number | null;
  indicador?: number | string | null;
  accion?: AccionRegistroPai | null;
}

export interface EntradaRegistroPai {
  id: number;
  fecha: string;
  usuarioId: number | null;
  /** Nombre de usuario (se conserva aunque la cuenta cambie). */
  usuario: string | null;
  accion: AccionRegistroPai;
  indicadorId: number | null;
  codigoIndicador: string | null;
  bimestre: NumeroBimestre | null;
  /** Valores anteriores y nuevos u otros datos de la acción. */
  detalle: Record<string, unknown> | null;
}

export interface PaginaRegistroPai {
  entradas: EntradaRegistroPai[];
  pagina: number;
  porPagina: number;
  total: number;
}

// ── Errores ────────────────────────────────────────────────────────────────

export type CodigoErrorPai =
  | 'solicitud_invalida'
  | 'no_autenticado'
  | 'prohibido'
  | 'cambio_contrasena_requerido'
  | 'no_encontrado'
  | 'conflicto'
  | 'demasiado_grande'
  | 'tipo_no_permitido'
  | 'demasiados_intentos'
  | 'no_disponible'
  | 'interno';

export interface ErrorPai {
  codigo: CodigoErrorPai;
  /** Mensaje en español apto para mostrar tal cual. */
  mensaje: string;
  /** Errores por campo (formularios), con los nombres de los campos del cuerpo. */
  campos?: Record<string, string>;
}

/** Mensaje por defecto de cada código (el servidor puede enviar uno más preciso). */
export const MENSAJES_ERROR_PAI: Readonly<Record<CodigoErrorPai, string>> = {
  solicitud_invalida: 'La solicitud no es válida.',
  no_autenticado: 'Inicie sesión para continuar.',
  prohibido: 'No tiene permiso para hacer esto.',
  cambio_contrasena_requerido:
    'Debe cambiar su contraseña temporal antes de continuar.',
  no_encontrado: 'No se encontró lo que busca.',
  conflicto: 'La operación no se puede hacer en el estado actual.',
  demasiado_grande: 'El archivo supera el tamaño máximo permitido (25 MB).',
  tipo_no_permitido:
    'El tipo de archivo no está permitido. Use PDF, imagen (PNG, JPEG o WebP), Word, Excel o PowerPoint.',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos.',
  no_disponible:
    'El Plan de Acción Institucional no está disponible en este momento. Intente de nuevo en unos minutos.',
  interno: 'Ocurrió un error inesperado. Intente de nuevo.',
};
