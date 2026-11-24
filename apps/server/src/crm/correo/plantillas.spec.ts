import { describe, expect, it } from 'vitest';
import {
  correoTareaAsignada,
  correoTareaDevuelta,
  correoTareaTerminada,
  type DatosCorreoTarea,
  escaparHtml,
  fechaLarga,
  MAX_ASUNTO,
  PIE_CORREO_CRM,
} from './plantillas.js';

const BASE: DatosCorreoTarea = {
  titulo: 'Informe de gestión 2026',
  descripcion: 'Primera línea\r\nSegunda línea',
  responsable: { nombre: 'José David Ramírez Abraham' },
  lider: { nombre: 'Luciana Vélez Arenas' },
  fechaLimite: '2026-11-30',
  archivos: [
    { nombre: 'plan.pdf', bytes: 839_680, adjunto: true },
    { nombre: 'base de datos.xlsx', bytes: 22_439_526, adjunto: false },
  ],
  enlace: 'https://planeacion.sapiencia.gov.co/crm/tareas/7',
};

describe('fechas en español', () => {
  it.each([
    ['2026-11-30', 'lunes 30 de noviembre de 2026'],
    ['2026-12-01', 'martes 1 de diciembre de 2026'],
    ['2027-01-03', 'domingo 3 de enero de 2027'],
    ['2028-02-29', 'martes 29 de febrero de 2028'],
  ])('%s -> %s', (fecha, texto) => {
    expect(fechaLarga(fecha)).toBe(texto);
  });

  it('una fecha que no existe no se traduce', () => {
    expect(fechaLarga('2026-02-30')).toBeNull();
    expect(fechaLarga('30/11/2026')).toBeNull();
  });
});

describe('asuntos', () => {
  it('uno por aviso, en una línea', () => {
    expect(correoTareaAsignada(BASE).asunto).toBe('Nueva tarea: Informe de gestión 2026');
    expect(correoTareaTerminada(BASE).asunto).toBe(
      'Tarea terminada: Informe de gestión 2026 (José David Ramírez Abraham)',
    );
    expect(correoTareaDevuelta(BASE).asunto).toBe('Tarea devuelta: Informe de gestión 2026');
  });

  it('sin saltos de línea y de a lo sumo 200 caracteres, conservando al responsable', () => {
    const largo = { ...BASE, titulo: `Informe\r\nmensual ${'muy largo '.repeat(40)}` };
    for (const correo of [correoTareaAsignada(largo), correoTareaTerminada(largo), correoTareaDevuelta(largo)]) {
      expect(correo.asunto).not.toMatch(/[\r\n]/);
      expect(Array.from(correo.asunto).length).toBeLessThanOrEqual(MAX_ASUNTO);
      expect(correo.asunto).toMatch(/^[^:]+: Informe mensual muy largo/);
    }
    const terminada = correoTareaTerminada(largo).asunto;
    expect(terminada).toMatch(/… \(José David Ramírez Abraham\)$/);
  });
});

describe('cuerpo', () => {
  it('asignada: saludo, qué pasó, título, fecha, descripción, archivos, enlace y pie (texto plano)', () => {
    const { texto } = correoTareaAsignada(BASE);
    expect(texto).toBe(
      [
        'Hola, José:',
        '',
        'Luciana Vélez Arenas le asignó una tarea nueva.',
        '',
        'Tarea: Informe de gestión 2026',
        'Fecha límite: lunes 30 de noviembre de 2026',
        '',
        'Descripción:',
        'Primera línea',
        'Segunda línea',
        '',
        'Archivos de la tarea:',
        '- plan.pdf (820 KB): va adjunto.',
        '- base de datos.xlsx (21,4 MB): descárguelo en el CRM.',
        '',
        'Ver la tarea en el CRM:',
        'https://planeacion.sapiencia.gov.co/crm/tareas/7',
        '',
        '-- ',
        PIE_CORREO_CRM,
        '',
      ].join('\n'),
    );
  });

  it('asignada (HTML): tabla de 600 px, colores de la marca, saltos como <br> y botón con el enlace', () => {
    const { html } = correoTareaAsignada(BASE);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('max-width:600px');
    expect(html).toContain('background-color:#0E5074');
    expect(html).toContain('background-color:#921C8D');
    expect(html).toContain('color:#17313F');
    expect(html).toContain('Hola, José:');
    expect(html).toContain('Primera línea<br>Segunda línea');
    expect(html).toContain('lunes 30 de noviembre de 2026');
    expect(html).toContain('820 KB · va adjunto');
    expect(html).toContain('21,4 MB · descárguelo en el CRM');
    expect(html).toContain('href="https://planeacion.sapiencia.gov.co/crm/tareas/7"');
    expect(html).toContain('>Ver la tarea en el CRM</a>');
    expect(html).toContain(PIE_CORREO_CRM);
    expect(html).not.toMatch(/<style|<script|<link/i);
  });

  it('terminada: al líder, con la nota de cierre y los entregables', () => {
    const correo = correoTareaTerminada({ ...BASE, nota: 'Listo.\nQuedó en la carpeta compartida.' });
    expect(correo.texto).toMatch(/^Hola, Luciana:\n\nJosé David Ramírez Abraham terminó una tarea\.\n/);
    expect(correo.texto).toContain('Nota de José David Ramírez Abraham:\nListo.\nQuedó en la carpeta compartida.');
    expect(correo.texto).toContain('Entregables:\n- plan.pdf (820 KB): va adjunto.');
    expect(correo.html).toContain('Listo.<br>Quedó en la carpeta compartida.');
    expect(correo.html).toContain('border-left:4px solid #921C8D');
  });

  it('devuelta: al responsable, con la observación del líder', () => {
    const correo = correoTareaDevuelta({ ...BASE, observacion: 'Falta la sección de metas.', archivos: [] });
    expect(correo.texto).toMatch(/^Hola, José:\n\nLuciana Vélez Arenas le devolvió una tarea/);
    expect(correo.texto).toContain('Observación de Luciana Vélez Arenas:\nFalta la sección de metas.');
    expect(correo.texto).not.toContain('Archivos de la tarea');
    expect(correo.html).toContain('Falta la sección de metas.');
  });

  it('sin fecha límite, descripción, nota ni archivos, esas partes no salen', () => {
    const correo = correoTareaTerminada({ ...BASE, fechaLimite: null, descripcion: '  ', nota: null, archivos: [] });
    expect(correo.texto).not.toMatch(/Fecha límite|Descripción|Nota de|Entregables/);
    expect(correo.html).not.toMatch(/Fecha límite|Descripción|Nota de|Entregables/);
  });

  it('un nombre en mayúsculas saluda con el primer nombre bien escrito', () => {
    const correo = correoTareaAsignada({ ...BASE, responsable: { nombre: 'ÁNGELA MARÍA GÓMEZ' } });
    expect(correo.texto).toMatch(/^Hola, Ángela:/);
    expect(correoTareaAsignada({ ...BASE, responsable: { nombre: '' } }).texto).toMatch(/^Hola:/);
  });
});

describe('seguridad del HTML', () => {
  const MALICIOSO: DatosCorreoTarea = {
    ...BASE,
    titulo: '<script>alert("t")</script>',
    descripcion: 'Hola <img src=x onerror=alert(1)>\n<a href="javascript:alert(2)">clic</a>',
    responsable: { nombre: '<b>Pepe</b> "el malo"' },
    lider: { nombre: "O'Neil <i>líder</i>" },
    nota: '</td></tr></table><script>alert(3)</script>',
    observacion: '<iframe src="https://malo.test"></iframe>',
    archivos: [{ nombre: '"><svg onload=alert(4)>.pdf', bytes: 10, adjunto: true }],
  };

  it('escapa todo lo que escriben las personas', () => {
    for (const { html, asunto } of [
      correoTareaAsignada(MALICIOSO),
      correoTareaTerminada(MALICIOSO),
      correoTareaDevuelta(MALICIOSO),
    ]) {
      expect(html).not.toMatch(/<script|<img|<svg|<iframe|<b>|<i>|href="javascript:/i);
      expect(html).not.toContain('onerror=alert(1)>');
      expect(html).toContain('&lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt;');
      expect(asunto).toContain('<script>'); // el asunto es texto plano: lo codifica nodemailer
    }
    expect(correoTareaTerminada(MALICIOSO).html).toContain('&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;');
    expect(correoTareaAsignada(MALICIOSO).html).toContain('&quot;&gt;&lt;svg onload=alert(4)&gt;.pdf');
    expect(correoTareaAsignada(MALICIOSO).html).toContain('O&#39;Neil &lt;i&gt;líder&lt;/i&gt; le asignó');
  });

  it('solo pone el enlace si es http(s)', () => {
    for (const enlace of [null, '', 'javascript:alert(1)', 'data:text/html,<script>x</script>', 'no es una url', '//sin-esquema.test']) {
      const correo = correoTareaAsignada({ ...BASE, enlace });
      expect(correo.html).not.toContain('Ver la tarea en el CRM');
      expect(correo.html).not.toMatch(/href="(?!https?:)/);
      expect(correo.texto).not.toContain('Ver la tarea en el CRM');
    }
    const conComillas = correoTareaAsignada({ ...BASE, enlace: 'https://sitio.test/crm?a=1&b="x"' });
    expect(conComillas.html).toContain('href="https://sitio.test/crm?a=1&amp;b=%22x%22"');
  });

  it('escaparHtml cubre los cinco caracteres', () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
