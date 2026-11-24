/**
 * Plantillas de los tres avisos del CRM: asunto, texto plano y HTML.
 *
 * - El HTML es de correo: tablas, estilos en línea y ancho máximo de 600 px
 *   (Gmail y Outlook ignoran las hojas de estilo y el diseño con flex/grid).
 * - Todo lo que escriben las personas (títulos, descripciones, notas,
 *   observaciones, nombres de archivo y de personas) se escapa en el HTML; el
 *   enlace solo se pone si es http(s).
 * - El texto plano dice lo mismo, para los lectores que no muestran HTML.
 */
import { esFechaValida, tamanoLegible } from '../api-crm.js';
import { textoLinea, textoMultilinea } from '../../repositorio/dominio/normalizacion.js';

export interface DatosCorreoTarea {
  titulo: string;
  descripcion: string;
  responsable: { nombre: string };
  lider: { nombre: string };
  /** 'AAAA-MM-DD' o null. */
  fechaLimite: string | null;
  /** Nota de cierre del responsable (tarea terminada). */
  nota?: string | null;
  /** Observación del líder (tarea devuelta). */
  observacion?: string | null;
  /** Archivos de la tarea que importan en este correo: `adjunto` = va adjunto; si no, se descarga en el CRM. */
  archivos: { nombre: string; bytes: number; adjunto: boolean }[];
  /** Enlace absoluto a la tarea en el CRM, o null (sin botón ni enlace). */
  enlace: string | null;
}

export interface CorreoCompuesto {
  asunto: string;
  texto: string;
  html: string;
}

/** Largo máximo del asunto (caracteres). */
export const MAX_ASUNTO = 200;

export const PIE_CORREO_CRM =
  'Correo automático del CRM de la Oficina de Planeación de Sapiencia. Puede responder este correo.';

const COLOR = {
  azul: '#0E5074',
  magenta: '#921C8D',
  texto: '#17313F',
  tenue: '#56697A',
  fondo: '#EEF2F5',
  caja: '#F6F8FA',
  borde: '#DCE3E9',
} as const;

const FUENTE = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** 'AAAA-MM-DD' → «lunes 30 de noviembre de 2026»; null si no es una fecha válida. */
export function fechaLarga(fecha: string): string | null {
  if (!esFechaValida(fecha)) return null;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[semana]} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

const ENTIDADES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para HTML (contenido y valores de atributos entre comillas). */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter] ?? caracter);
}

/** Marcas de dirección (bidi): permiten disfrazar lo que se ve, p. ej. una extensión. */
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Una línea: sin caracteres de control ni saltos, espacios simples. */
function linea(texto: string | null | undefined): string {
  return textoLinea((texto ?? '').replace(/[\t\r\n]+/g, ' ').replace(BIDI, ''));
}

/** Varias líneas: saltos \n, sin otros caracteres de control y a lo sumo una línea en blanco seguida. */
function parrafos(texto: string | null | undefined): string {
  return textoMultilinea((texto ?? '').replace(BIDI, '')).replace(/\n{3,}/g, '\n\n');
}

/** Recorta a `maximo` caracteres completos (no unidades UTF-16), terminando en «…». */
function recortar(texto: string, maximo: number): string {
  const caracteres = Array.from(texto);
  if (caracteres.length <= maximo) return texto;
  return `${caracteres.slice(0, Math.max(0, maximo - 1)).join('').trimEnd()}…`;
}

/** «Prefijo: título (sufijo)» en una línea y de a lo sumo MAX_ASUNTO caracteres (se recorta el título). */
function asunto(prefijo: string, titulo: string, sufijo = ''): string {
  const disponible = MAX_ASUNTO - Array.from(prefijo).length - Array.from(sufijo).length;
  const completo = prefijo + recortar(linea(titulo) || 'Tarea sin título', Math.max(disponible, 10)) + sufijo;
  return recortar(completo, MAX_ASUNTO);
}

/** Primer nombre para el saludo; si viene todo en mayúsculas («JOSÉ»), se escribe «José». */
function primerNombre(nombre: string): string {
  const palabra = linea(nombre).split(' ')[0] ?? '';
  const mayusculas = palabra.toLocaleUpperCase('es-CO');
  if (Array.from(palabra).length > 1 && palabra === mayusculas && palabra !== palabra.toLocaleLowerCase('es-CO')) {
    const [primera = '', ...resto] = Array.from(palabra.toLocaleLowerCase('es-CO'));
    return primera.toLocaleUpperCase('es-CO') + resto.join('');
  }
  return palabra;
}

/** El enlace normalizado si es http(s); si no, null (no se pone botón). */
function enlaceSeguro(enlace: string | null): string | null {
  if (!enlace) return null;
  try {
    const url = new URL(enlace.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Lo que dice un aviso, ya limpio (sin escapar). */
interface Contenido {
  asunto: string;
  /** Primer nombre de quien recibe ('' = sin nombre). */
  destinatario: string;
  /** Qué pasó, en una frase. */
  frase: string;
  titulo: string;
  descripcion: string;
  fechaLimite: string | null;
  /** Nota de cierre u observación, con su rótulo. */
  nota: { rotulo: string; texto: string } | null;
  archivos: { rotulo: string; lista: { nombre: string; bytes: number; adjunto: boolean }[] };
  enlace: string | null;
}

function contenido(
  d: DatosCorreoTarea,
  opciones: {
    asunto: string;
    destinatario: string;
    frase: string;
    nota: { rotulo: string; texto: string | null | undefined } | null;
    rotuloArchivos: string;
  },
): Contenido {
  const nota = opciones.nota ? parrafos(opciones.nota.texto) : '';
  return {
    asunto: opciones.asunto,
    destinatario: primerNombre(opciones.destinatario),
    frase: opciones.frase,
    titulo: linea(d.titulo) || 'Tarea sin título',
    descripcion: parrafos(d.descripcion),
    fechaLimite: d.fechaLimite ? (fechaLarga(d.fechaLimite) ?? linea(d.fechaLimite)) : null,
    nota: opciones.nota && nota ? { rotulo: opciones.nota.rotulo, texto: nota } : null,
    archivos: {
      rotulo: opciones.rotuloArchivos,
      lista: d.archivos.map((a) => ({
        nombre: linea(a.nombre) || 'archivo',
        bytes: Math.max(0, Math.trunc(a.bytes) || 0),
        adjunto: a.adjunto,
      })),
    },
    enlace: enlaceSeguro(d.enlace),
  };
}

function estadoArchivo(adjunto: boolean): string {
  return adjunto ? 'va adjunto' : 'descárguelo en el CRM';
}

function saludo(destinatario: string): string {
  return destinatario ? `Hola, ${destinatario}:` : 'Hola:';
}

function textoPlano(c: Contenido): string {
  const partes: string[] = [saludo(c.destinatario), c.frase];
  partes.push(
    [`Tarea: ${c.titulo}`, ...(c.fechaLimite ? [`Fecha límite: ${c.fechaLimite}`] : [])].join('\n'),
  );
  if (c.descripcion) partes.push(`Descripción:\n${c.descripcion}`);
  if (c.nota) partes.push(`${c.nota.rotulo}:\n${c.nota.texto}`);
  if (c.archivos.lista.length > 0) {
    partes.push(
      [
        `${c.archivos.rotulo}:`,
        ...c.archivos.lista.map(
          (a) => `- ${a.nombre} (${tamanoLegible(a.bytes)}): ${estadoArchivo(a.adjunto)}.`,
        ),
      ].join('\n'),
    );
  }
  if (c.enlace) partes.push(`Ver la tarea en el CRM:\n${c.enlace}`);
  partes.push(`-- \n${PIE_CORREO_CRM}`);
  return `${partes.join('\n\n')}\n`;
}

/** Texto (ya limpio) a HTML escapado, con los saltos de línea como <br>. */
function conSaltos(texto: string): string {
  return escaparHtml(texto).replace(/\n/g, '<br>');
}

const P = `margin:0 0 16px;font-family:${FUENTE};font-size:15px;line-height:23px;color:${COLOR.texto};`;
const ROTULO = `margin:0 0 6px;font-family:${FUENTE};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:0.4px;text-transform:uppercase;color:${COLOR.tenue};`;

function html(c: Contenido): string {
  const bloques: string[] = [];
  bloques.push(`<p style="${P}">${escaparHtml(saludo(c.destinatario))}</p>`);
  bloques.push(`<p style="${P}">${escaparHtml(c.frase)}</p>`);
  bloques.push(
    `<h1 style="margin:0 0 8px;font-family:${FUENTE};font-size:21px;line-height:28px;font-weight:bold;color:${COLOR.azul};word-break:break-word;">${escaparHtml(c.titulo)}</h1>`,
  );
  if (c.fechaLimite) {
    bloques.push(
      `<p style="${P}">Fecha límite: <strong>${escaparHtml(c.fechaLimite)}</strong></p>`,
    );
  }
  if (c.descripcion) {
    bloques.push(
      `<p style="${ROTULO}">Descripción</p><p style="${P}word-break:break-word;">${conSaltos(c.descripcion)}</p>`,
    );
  }
  if (c.nota) {
    bloques.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">` +
        `<tr><td style="padding:12px 16px;background-color:${COLOR.caja};border-left:4px solid ${COLOR.magenta};">` +
        `<p style="${ROTULO}">${escaparHtml(c.nota.rotulo)}</p>` +
        `<p style="margin:0;font-family:${FUENTE};font-size:15px;line-height:23px;color:${COLOR.texto};word-break:break-word;">${conSaltos(c.nota.texto)}</p>` +
        `</td></tr></table>`,
    );
  }
  if (c.archivos.lista.length > 0) {
    const filas = c.archivos.lista
      .map(
        (a) =>
          `<tr><td style="padding:8px 0;border-top:1px solid ${COLOR.borde};font-family:${FUENTE};font-size:14px;line-height:20px;color:${COLOR.texto};word-break:break-word;">` +
          `<strong>${escaparHtml(a.nombre)}</strong>` +
          `<br><span style="color:${COLOR.tenue};">${escaparHtml(tamanoLegible(a.bytes))} · ${escaparHtml(estadoArchivo(a.adjunto))}</span>` +
          `</td></tr>`,
      )
      .join('');
    bloques.push(
      `<p style="${ROTULO}">${escaparHtml(c.archivos.rotulo)}</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">${filas}</table>`,
    );
  }
  if (c.enlace) {
    const href = escaparHtml(c.enlace);
    bloques.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;border-collapse:separate;">` +
        `<tr><td align="center" bgcolor="${COLOR.magenta}" style="border-radius:6px;background-color:${COLOR.magenta};">` +
        `<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-family:${FUENTE};font-size:15px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">Ver la tarea en el CRM</a>` +
        `</td></tr></table>` +
        `<p style="margin:0 0 8px;font-family:${FUENTE};font-size:12px;line-height:18px;color:${COLOR.tenue};word-break:break-all;">Si el botón no abre, copie este enlace en el navegador: <a href="${href}" target="_blank" rel="noopener" style="color:${COLOR.azul};">${href}</a></p>`,
    );
  }

  const resumen = escaparHtml(`${c.frase} ${c.titulo}`);
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${escaparHtml(c.asunto)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background-color:${COLOR.fondo};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.fondo};">${resumen}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.fondo};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border-collapse:separate;border:1px solid ${COLOR.borde};border-radius:8px;">`,
    `<tr><td style="padding:18px 28px;background-color:${COLOR.azul};border-radius:8px 8px 0 0;font-family:${FUENTE};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:0.6px;color:#FFFFFF;">CRM · Oficina de Planeación · Sapiencia</td></tr>`,
    `<tr><td style="height:4px;line-height:4px;font-size:4px;background-color:${COLOR.magenta};">&nbsp;</td></tr>`,
    `<tr><td style="padding:28px 28px 12px;">${bloques.join('')}</td></tr>`,
    `<tr><td style="padding:16px 28px 20px;border-top:1px solid ${COLOR.borde};font-family:${FUENTE};font-size:12px;line-height:18px;color:${COLOR.tenue};">${escaparHtml(PIE_CORREO_CRM)}</td></tr>`,
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

function componer(c: Contenido): CorreoCompuesto {
  return { asunto: c.asunto, texto: textoPlano(c), html: html(c) };
}

/** Al responsable: «Nueva tarea: <título>». */
export function correoTareaAsignada(d: DatosCorreoTarea): CorreoCompuesto {
  const lider = linea(d.lider.nombre);
  return componer(
    contenido(d, {
      asunto: asunto('Nueva tarea: ', d.titulo),
      destinatario: d.responsable.nombre,
      frase: lider ? `${lider} le asignó una tarea nueva.` : 'Le asignaron una tarea nueva.',
      nota: null,
      rotuloArchivos: 'Archivos de la tarea',
    }),
  );
}

/** Al líder: «Tarea terminada: <título> (<responsable>)». */
export function correoTareaTerminada(d: DatosCorreoTarea): CorreoCompuesto {
  const responsable = linea(d.responsable.nombre);
  return componer(
    contenido(d, {
      asunto: asunto('Tarea terminada: ', d.titulo, responsable ? ` (${recortar(responsable, 60)})` : ''),
      destinatario: d.lider.nombre,
      frase: responsable ? `${responsable} terminó una tarea.` : 'Se terminó una tarea.',
      nota: { rotulo: responsable ? `Nota de ${responsable}` : 'Nota de cierre', texto: d.nota },
      rotuloArchivos: 'Entregables',
    }),
  );
}

/** Al responsable: «Tarea devuelta: <título>». */
export function correoTareaDevuelta(d: DatosCorreoTarea): CorreoCompuesto {
  const lider = linea(d.lider.nombre);
  return componer(
    contenido(d, {
      asunto: asunto('Tarea devuelta: ', d.titulo),
      destinatario: d.responsable.nombre,
      frase: `${lider ? `${lider} le devolvió` : 'Le devolvieron'} una tarea que había terminado; quedó otra vez en proceso.`,
      nota: { rotulo: lider ? `Observación de ${lider}` : 'Observación', texto: d.observacion },
      rotuloArchivos: 'Archivos de la tarea',
    }),
  );
}
