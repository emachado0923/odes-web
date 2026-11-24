import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import type { TareaCrm } from '../api-crm.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import {
  AVISO_SIN_LIDER,
  enlaceEquipo,
  enlaceLider,
  escogerAdjuntos,
  MENSAJE_CORREO_NO_SALIO,
  MENSAJE_CORREO_SIN_CONFIGURAR,
  mensajeAviso,
  mensajeAvisoTerminada,
  origenConfigurado,
  origenSitio,
  primerNombre,
} from './avisos-tareas.js';
import {
  aArchivo,
  aDetalle,
  aEvento,
  aTarea,
  esVencida,
  type FilaTareaDetalleCrm,
  ordenarTablero,
  sumarConteos,
  urlArchivosEquipo,
  urlArchivosLider,
  urlFotoPersona,
} from './mapeo-tareas.js';
import {
  cambiosDeEdicion,
  cortar,
  describirEdicion,
  escaparLike,
  estadoCorreoDeConsulta,
  exigirJson,
  filtroTareasLider,
  idDeRuta,
  ipDeEquipo,
  largo,
  patronBusqueda,
  revisarTopeIp,
  segundosParaReintentar,
  terminadasDeConsulta,
  TOPE_CAMBIOS_POR_HORA,
  TOPE_SUBIDAS_POR_HORA,
  transicionEquipo,
  validarCambioEstado,
  validarDevolver,
  validarEdicionTarea,
  validarNuevaTarea,
  validarNuevaTareaPropia,
  validarTerminar,
} from './validacion-tareas.js';

/** Ejecuta `accion` y devuelve el ErrorRepositorioHttp que lanza (falla si no lanza uno). */
function errorDe(accion: () => unknown): ErrorRepositorioHttp {
  let capturado: unknown = null;
  try {
    accion();
  } catch (error) {
    capturado = error;
  }
  if (!(capturado instanceof ErrorRepositorioHttp)) {
    throw new Error(`Se esperaba un ErrorRepositorioHttp y llegó: ${String(capturado)}`);
  }
  return capturado;
}

/** Petición mínima con la IP del cliente. */
function peticionDesde(ip: string): Pick<Request, 'ip' | 'socket'> {
  return { ip, socket: {} } as unknown as Pick<Request, 'ip' | 'socket'>;
}

const NUEVA = { titulo: 'Informe mensual', responsableId: 7 };

describe('validarNuevaTarea', () => {
  it('normaliza el título y completa los valores por defecto', () => {
    expect(validarNuevaTarea({ ...NUEVA, titulo: '  Informe\t  mensual \n' })).toEqual({
      titulo: 'Informe mensual',
      descripcion: '',
      responsableId: 7,
      fechaLimite: null,
      requiereEntregable: false,
    });
  });

  it('acepta todos los campos y el responsable como texto de cifras', () => {
    expect(
      validarNuevaTarea({
        titulo: 'Plan de acción',
        descripcion: 'Línea 1\r\nLínea 2  ',
        responsableId: '12',
        fechaLimite: '2026-12-15',
        requiereEntregable: true,
      }),
    ).toEqual({
      titulo: 'Plan de acción',
      descripcion: 'Línea 1\nLínea 2',
      responsableId: 12,
      fechaLimite: '2026-12-15',
      requiereEntregable: true,
    });
  });

  it('toma una fecha vacía o null como sin fecha', () => {
    expect(validarNuevaTarea({ ...NUEVA, fechaLimite: '' }).fechaLimite).toBeNull();
    expect(validarNuevaTarea({ ...NUEVA, fechaLimite: null }).fechaLimite).toBeNull();
    expect(validarNuevaTarea({ ...NUEVA, descripcion: null }).descripcion).toBe('');
  });

  it('cuenta el largo del título en caracteres, no en unidades UTF-16', () => {
    const titulo = '🙂'.repeat(160);
    expect(validarNuevaTarea({ ...NUEVA, titulo }).titulo).toBe(titulo);
    expect(errorDe(() => validarNuevaTarea({ ...NUEVA, titulo: 'a'.repeat(161) })).campos).toHaveProperty('titulo');
  });

  it('rechaza un título vacío o que no es texto, con el campo', () => {
    for (const titulo of ['   ', '', 5, null, undefined]) {
      const error = errorDe(() => validarNuevaTarea({ ...NUEVA, titulo }));
      expect(error.getStatus()).toBe(400);
      expect(error.codigo).toBe('solicitud_invalida');
      expect(error.campos?.['titulo']).toBe('Escriba el título de la tarea.');
    }
  });

  it('rechaza un responsable que no es un id válido', () => {
    for (const responsableId of [0, -1, 1.5, 'abc', '', 2_147_483_648, null, undefined, true]) {
      expect(errorDe(() => validarNuevaTarea({ ...NUEVA, responsableId })).campos).toHaveProperty('responsableId');
    }
  });

  it('rechaza fechas que no son del calendario o fuera de 2000-2100', () => {
    for (const fechaLimite of ['2026-02-30', '30/12/2026', '1999-12-31', '2101-01-01', 20261215]) {
      expect(errorDe(() => validarNuevaTarea({ ...NUEVA, fechaLimite })).campos).toHaveProperty('fechaLimite');
    }
  });

  it('rechaza una descripción demasiado larga y un requiereEntregable que no es booleano', () => {
    const error = errorDe(() =>
      validarNuevaTarea({ ...NUEVA, descripcion: 'x'.repeat(5001), requiereEntregable: 'si' }),
    );
    expect(Object.keys(error.campos ?? {}).toSorted()).toEqual(['descripcion', 'requiereEntregable']);
  });

  it('exige un objeto JSON', () => {
    for (const cuerpo of [null, [], 'texto', 3]) {
      const error = errorDe(() => validarNuevaTarea(cuerpo));
      expect(error.getStatus()).toBe(400);
      expect(error.cuerpo.mensaje).toBe('Envíe los datos como un objeto JSON.');
    }
  });
});

describe('validarNuevaTareaPropia', () => {
  it('normaliza como la del líder y no toma responsable ni entregable del cuerpo', () => {
    expect(
      validarNuevaTareaPropia({
        titulo: '  Revisar\t  indicadores ',
        descripcion: 'Línea 1\r\nLínea 2  ',
        fechaLimite: '2026-12-15',
        responsableId: 99,
        requiereEntregable: true,
      }),
    ).toEqual({ titulo: 'Revisar indicadores', descripcion: 'Línea 1\nLínea 2', fechaLimite: '2026-12-15' });
    expect(validarNuevaTareaPropia({ titulo: 'Solo título' })).toEqual({ titulo: 'Solo título', descripcion: '', fechaLimite: null });
    expect(validarNuevaTareaPropia({ titulo: 'x', fechaLimite: '' }).fechaLimite).toBeNull();
    expect(validarNuevaTareaPropia({ titulo: 'x', fechaLimite: null }).fechaLimite).toBeNull();
  });

  it('título 1–160, descripción hasta 5000 y fecha del calendario, con el campo', () => {
    expect(validarNuevaTareaPropia({ titulo: 'a'.repeat(160) }).titulo).toHaveLength(160);
    expect(errorDe(() => validarNuevaTareaPropia({ titulo: 'a'.repeat(161) })).campos).toHaveProperty('titulo');
    expect(errorDe(() => validarNuevaTareaPropia({ titulo: '  ' })).campos?.['titulo']).toBe('Escriba el título de la tarea.');
    const error = errorDe(() => validarNuevaTareaPropia({ titulo: 'x', descripcion: 'x'.repeat(5001), fechaLimite: '2026-02-30' }));
    expect(error.getStatus()).toBe(400);
    expect(Object.keys(error.campos ?? {}).toSorted()).toEqual(['descripcion', 'fechaLimite']);
    expect(errorDe(() => validarNuevaTareaPropia([])).cuerpo.mensaje).toBe('Envíe los datos como un objeto JSON.');
  });
});

describe('validarEdicionTarea', () => {
  it('devuelve solo los campos enviados', () => {
    expect(validarEdicionTarea({ titulo: ' Nuevo ' })).toEqual({ titulo: 'Nuevo' });
    expect(validarEdicionTarea({ fechaLimite: null })).toEqual({ fechaLimite: null });
    expect(validarEdicionTarea({ descripcion: null, requiereEntregable: false })).toEqual({
      descripcion: '',
      requiereEntregable: false,
    });
    expect(validarEdicionTarea({ responsableId: 3, otro: 'x' })).toEqual({ responsableId: 3 });
  });

  it('exige al menos un campo', () => {
    for (const cuerpo of [{}, { otro: 1 }, { titulo: undefined }]) {
      const error = errorDe(() => validarEdicionTarea(cuerpo));
      expect(error.getStatus()).toBe(400);
      expect(error.campos).toBeUndefined();
    }
  });

  it('aplica las mismas reglas que al crear', () => {
    expect(errorDe(() => validarEdicionTarea({ titulo: '  ' })).campos).toHaveProperty('titulo');
    expect(errorDe(() => validarEdicionTarea({ responsableId: 0 })).campos).toHaveProperty('responsableId');
    expect(errorDe(() => validarEdicionTarea({ fechaLimite: '2026-13-01' })).campos).toHaveProperty('fechaLimite');
  });
});

describe('validarCambioEstado, validarTerminar y validarDevolver', () => {
  it('el equipo solo pide pendiente o en_proceso', () => {
    expect(validarCambioEstado({ estado: 'en_proceso' })).toEqual({ estado: 'en_proceso' });
    expect(validarCambioEstado({ estado: 'pendiente' })).toEqual({ estado: 'pendiente' });
    for (const estado of ['terminada', 'otro', undefined, 1]) {
      expect(errorDe(() => validarCambioEstado({ estado })).campos).toHaveProperty('estado');
    }
  });

  it('la nota de cierre es opcional; vacía es null', () => {
    expect(validarTerminar({})).toEqual({ nota: null });
    expect(validarTerminar({ nota: null })).toEqual({ nota: null });
    expect(validarTerminar({ nota: '  \n ' })).toEqual({ nota: null });
    expect(validarTerminar({ nota: ' Listo.\r\nVer anexo. ' })).toEqual({ nota: 'Listo.\nVer anexo.' });
    expect(errorDe(() => validarTerminar({ nota: 'x'.repeat(2001) })).campos).toHaveProperty('nota');
    expect(errorDe(() => validarTerminar({ nota: 5 })).campos).toHaveProperty('nota');
  });

  it('la observación de una devolución es obligatoria', () => {
    expect(validarDevolver({ observacion: ' Falta la firma. ' })).toEqual({ observacion: 'Falta la firma.' });
    for (const observacion of ['', '   ', undefined, 'x'.repeat(2001)]) {
      expect(errorDe(() => validarDevolver({ observacion })).campos).toHaveProperty('observacion');
    }
  });
});

describe('parámetros de ruta y de consulta', () => {
  it('idDeRuta acepta enteros positivos de INT y si no responde 404', () => {
    expect(idDeRuta('12', 'No.')).toBe(12);
    expect(idDeRuta('2147483647', 'No.')).toBe(2_147_483_647);
    for (const valor of ['0', '012', '-1', '1.5', '2147483648', '99999999999', 'abc', '', undefined, 7]) {
      const error = errorDe(() => idDeRuta(valor, 'La tarea no existe.'));
      expect(error.getStatus()).toBe(404);
      expect(error.cuerpo).toEqual({ codigo: 'no_encontrado', mensaje: 'La tarea no existe.' });
    }
  });

  it('terminadas: recientes por defecto, todas, y 400 con el campo', () => {
    expect(terminadasDeConsulta(undefined)).toBe('recientes');
    expect(terminadasDeConsulta('')).toBe('recientes');
    expect(terminadasDeConsulta('todas')).toBe('todas');
    for (const valor of ['algunas', ['todas'], 1]) {
      expect(errorDe(() => terminadasDeConsulta(valor)).campos).toHaveProperty('terminadas');
    }
  });

  it('filtros de la lista del líder', () => {
    expect(filtroTareasLider({})).toEqual({ responsableId: null, estado: null, q: null, terminadas: 'recientes' });
    expect(filtroTareasLider(undefined)).toEqual({ responsableId: null, estado: null, q: null, terminadas: 'recientes' });
    expect(
      filtroTareasLider({ responsable: '4', estado: 'terminada', q: '  plan   de acción ', terminadas: 'todas' }),
    ).toEqual({ responsableId: 4, estado: 'terminada', q: 'plan de acción', terminadas: 'todas' });
    expect(filtroTareasLider({ responsable: '', estado: '', q: '   ', terminadas: '' })).toEqual({
      responsableId: null,
      estado: null,
      q: null,
      terminadas: 'recientes',
    });
  });

  it('un filtro inválido da 400 con todos los campos malos', () => {
    const error = errorDe(() =>
      filtroTareasLider({ responsable: 'x', estado: 'cerrada', q: 'a'.repeat(101), terminadas: 'nunca' }),
    );
    expect(error.getStatus()).toBe(400);
    expect(Object.keys(error.campos ?? {}).toSorted()).toEqual(['estado', 'q', 'responsable', 'terminadas']);
    expect(errorDe(() => filtroTareasLider({ q: ['a', 'b'] })).campos).toHaveProperty('q');
    expect(errorDe(() => filtroTareasLider({ responsable: '0' })).campos).toHaveProperty('responsable');
  });

  it('estado de la bandeja de correos', () => {
    expect(estadoCorreoDeConsulta(undefined)).toBeUndefined();
    expect(estadoCorreoDeConsulta('')).toBeUndefined();
    expect(estadoCorreoDeConsulta('error')).toBe('error');
    expect(estadoCorreoDeConsulta('sin_configurar')).toBe('sin_configurar');
    expect(errorDe(() => estadoCorreoDeConsulta('fallido')).campos).toHaveProperty('estado');
  });

  it('exigirJson rechaza lo que no es application/json (o no trae cuerpo)', () => {
    expect(() => exigirJson({ is: () => 'application/json' })).not.toThrow();
    expect(errorDe(() => exigirJson({ is: () => false })).getStatus()).toBe(400);
    expect(errorDe(() => exigirJson({ is: () => null })).getStatus()).toBe(400);
  });

  it('la IP del tope: IPv4 tal cual, IPv6 por su /64, IPv4 mapeada como IPv4', () => {
    expect(ipDeEquipo(peticionDesde('190.7.1.2'))).toBe('190.7.1.2');
    expect(ipDeEquipo(peticionDesde('::ffff:10.0.0.9'))).toBe('10.0.0.9');
    expect(ipDeEquipo(peticionDesde('2800:e2:1a80:12f0:abcd:1:2:3'))).toBe('2800:e2:1a80:12f0::/64');
    expect(ipDeEquipo(peticionDesde('2800:e2:1a80:12f0:abcd:1:2:3')).length).toBeLessThanOrEqual(45);
  });
});

describe('textos y LIKE', () => {
  it('largo y cortar cuentan caracteres completos', () => {
    expect(largo('añ🙂')).toBe(3);
    expect(cortar('añ🙂b', 3)).toBe('añ🙂');
    expect(cortar('corto', 10)).toBe('corto');
  });

  it('escapa %, _ y \\ para LIKE', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(patronBusqueda('Plan 100%')).toBe('%plan 100\\%%');
  });
});

describe('reglas de las tareas', () => {
  it('transiciones que puede pedir el responsable', () => {
    expect(transicionEquipo('pendiente', 'en_proceso')).toBe('cambia');
    expect(transicionEquipo('en_proceso', 'pendiente')).toBe('cambia');
    expect(transicionEquipo('pendiente', 'pendiente')).toBe('igual');
    expect(transicionEquipo('en_proceso', 'en_proceso')).toBe('igual');
    expect(transicionEquipo('terminada', 'pendiente')).toBe('terminada');
    expect(transicionEquipo('terminada', 'en_proceso')).toBe('terminada');
  });

  const ACTUAL = {
    titulo: 'Informe',
    descripcion: 'Texto',
    responsableId: 3,
    fechaLimite: '2026-12-01',
    requiereEntregable: false,
  };

  it('una edición solo cuenta lo que cambia de verdad', () => {
    expect(cambiosDeEdicion(ACTUAL, { titulo: 'Informe', responsableId: 3, fechaLimite: '2026-12-01' })).toEqual({
      campos: {},
      editados: [],
      nuevoResponsableId: null,
    });
    expect(
      cambiosDeEdicion(ACTUAL, { requiereEntregable: true, fechaLimite: null, titulo: 'Informe final', responsableId: 9 }),
    ).toEqual({
      campos: { titulo: 'Informe final', fechaLimite: null, requiereEntregable: true },
      editados: ['titulo', 'fechaLimite', 'requiereEntregable'],
      nuevoResponsableId: 9,
    });
    expect(cambiosDeEdicion(ACTUAL, { descripcion: '' })).toEqual({
      campos: { descripcion: '' },
      editados: ['descripcion'],
      nuevoResponsableId: null,
    });
  });

  it('describe la edición en español', () => {
    expect(describirEdicion(['titulo'])).toBe('Cambió el título.');
    expect(describirEdicion(['titulo', 'fechaLimite'])).toBe('Cambió el título y la fecha límite.');
    expect(describirEdicion(['titulo', 'descripcion', 'requiereEntregable'])).toBe(
      'Cambió el título, la descripción y si requiere entregable.',
    );
  });

  it('tope por IP: cambios y, en las subidas, entregables', () => {
    const ahora = new Date('2026-11-24T15:00:00.000Z');
    const haceMedia = new Date('2026-11-24T14:30:00.000Z');
    const libre = { cambios: TOPE_CAMBIOS_POR_HORA - 1, primerCambio: haceMedia, subidas: 0, primeraSubida: null };
    expect(() => revisarTopeIp(libre, true, ahora)).not.toThrow();

    const lleno = errorDe(() => revisarTopeIp({ ...libre, cambios: TOPE_CAMBIOS_POR_HORA }, false, ahora));
    expect(lleno.getStatus()).toBe(429);
    expect(lleno.codigo).toBe('demasiados_intentos');
    expect(lleno.reintentarEn).toBe(1800);

    const subidas = { ...libre, cambios: 50, subidas: TOPE_SUBIDAS_POR_HORA, primeraSubida: haceMedia };
    expect(() => revisarTopeIp(subidas, false, ahora)).not.toThrow();
    expect(errorDe(() => revisarTopeIp(subidas, true, ahora)).getStatus()).toBe(429);
  });

  it('Retry-After: lo que le falta al evento más viejo para salir de la ventana', () => {
    const ahora = new Date('2026-11-24T15:00:00.000Z');
    expect(segundosParaReintentar(new Date('2026-11-24T14:00:00.500Z'), ahora)).toBe(1);
    expect(segundosParaReintentar(new Date('2026-11-24T14:59:00.000Z'), ahora)).toBe(3540);
    expect(segundosParaReintentar(new Date('2026-11-24T16:00:00.000Z'), ahora)).toBe(3600);
    expect(segundosParaReintentar(null, ahora)).toBe(60);
  });
});

const FILA: FilaTareaDetalleCrm = {
  id: '15',
  titulo: 'Informe de gestión',
  estado: 'en_proceso',
  responsable_id: 4,
  // mysql2 (timezone 'Z') entrega un DATE a medianoche UTC.
  fecha_limite: new Date('2026-11-20T00:00:00.000Z'),
  requiere_entregable: 1,
  creado_en: new Date('2026-11-01T13:00:00.000Z'),
  actualizado_en: '2026-11-02T13:00:00.000Z',
  terminada_en: null,
  responsable_nombre: 'Jose David Ramírez Abraham',
  responsable_foto_archivo_id: 33,
  responsable_foto_version: 2,
  adjuntos: '2',
  entregables: 0,
  descripcion: null,
  nota_cierre: null,
  avisada_en: new Date('2026-11-01T13:05:00.000Z'),
};

/** Una TareaCrm a partir de FILA, con otro id y algunos cambios. */
function tareaDePrueba(id: number, cambios: Partial<TareaCrm>): TareaCrm {
  return { ...aTarea(FILA, '2026-11-24'), id, terminadaEn: null, ...cambios };
}

describe('mapeo de filas', () => {
  it('una tarea con su responsable, fechas y conteos', () => {
    expect(aTarea(FILA, '2026-11-24')).toEqual({
      id: 15,
      titulo: 'Informe de gestión',
      estado: 'en_proceso',
      responsable: {
        id: 4,
        nombre: 'Jose David Ramírez Abraham',
        iniciales: 'JR',
        foto: '/api/crm/personas/4/foto?v=2',
      },
      fechaLimite: '2026-11-20',
      vencida: true,
      requiereEntregable: true,
      adjuntos: 2,
      entregables: 0,
      creadaEn: '2026-11-01T13:00:00.000Z',
      actualizadaEn: '2026-11-02T13:00:00.000Z',
      terminadaEn: null,
    });
  });

  it('vencida: fecha límite anterior a hoy y no terminada', () => {
    expect(esVencida('2026-11-23', 'pendiente', '2026-11-24')).toBe(true);
    expect(esVencida('2026-11-24', 'pendiente', '2026-11-24')).toBe(false);
    expect(esVencida('2026-11-23', 'terminada', '2026-11-24')).toBe(false);
    expect(esVencida(null, 'en_proceso', '2026-11-24')).toBe(false);
    expect(aTarea({ ...FILA, estado: 'terminada' }, '2026-11-24').vencida).toBe(false);
    expect(aTarea({ ...FILA, requiere_entregable: 0, estado: 'raro' }, '2026-11-24')).toMatchObject({
      requiereEntregable: false,
      estado: 'pendiente',
    });
  });

  it('foto del responsable: null sin archivo; si no, la URL con foto_version (como en personas)', () => {
    expect(urlFotoPersona(4, null, 3)).toBeNull();
    expect(urlFotoPersona(4, 33, '5')).toBe('/api/crm/personas/4/foto?v=5');
    expect(urlFotoPersona(4, 33, null)).toBe('/api/crm/personas/4/foto?v=0');
    expect(aTarea({ ...FILA, responsable_foto_archivo_id: null }, '2026-11-24').responsable.foto).toBeNull();
  });

  it('archivos con la URL de quien los pide', () => {
    expect(urlArchivosEquipo(4, 15)).toBe('/api/crm/personas/4/tareas/15/archivos');
    expect(urlArchivosLider(15)).toBe('/api/crm/lider/tareas/15/archivos');
    expect(
      aArchivo(
        { id: 8, tipo: 'entregable', nombre: 'acta.pdf', mime: 'application/pdf', bytes: '1024', creado_en: '2026-11-03T10:00:00Z' },
        urlArchivosEquipo(4, 15),
      ),
    ).toEqual({
      id: 8,
      tipo: 'entregable',
      nombre: 'acta.pdf',
      mime: 'application/pdf',
      bytes: 1024,
      subidoEn: '2026-11-03T10:00:00.000Z',
      url: '/api/crm/personas/4/tareas/15/archivos/8',
    });
  });

  it('eventos', () => {
    expect(
      aEvento({
        id: '90',
        tipo: 'estado',
        actor: 'responsable',
        persona_nombre: 'Luciana Vélez',
        de_estado: 'pendiente',
        a_estado: 'en_proceso',
        detalle: null,
        creado_en: new Date('2026-11-04T12:00:00.000Z'),
      }),
    ).toEqual({
      id: 90,
      tipo: 'estado',
      actor: 'responsable',
      personaNombre: 'Luciana Vélez',
      deEstado: 'pendiente',
      aEstado: 'en_proceso',
      detalle: null,
      creadoEn: '2026-11-04T12:00:00.000Z',
    });
    expect(
      aEvento({
        id: 91,
        tipo: 'aviso',
        actor: 'lider',
        persona_nombre: null,
        de_estado: null,
        a_estado: 'otro',
        detalle: 'Luciana Vélez',
        creado_en: '2026-11-04T12:00:00.000Z',
      }),
    ).toMatchObject({ actor: 'lider', personaNombre: null, deEstado: null, aEstado: null });
  });

  it('el detalle cuenta los archivos de la lista y no trae correos', () => {
    const adjunto = aArchivo(
      { id: 1, tipo: 'adjunto', nombre: 'guia.docx', mime: 'x', bytes: 5, creado_en: '2026-11-01T00:00:00Z' },
      urlArchivosLider(15),
    );
    const detalle = aDetalle(FILA, [adjunto], [], '2026-11-24');
    expect(detalle).toMatchObject({
      adjuntos: 1,
      entregables: 0,
      descripcion: '',
      notaCierre: null,
      avisada: true,
      archivos: [adjunto],
      eventos: [],
    });
    expect(detalle).not.toHaveProperty('correos');
    expect(aDetalle({ ...FILA, avisada_en: null, nota_cierre: 'Hecho' }, [], [], '2026-11-24')).toMatchObject({
      avisada: false,
      notaCierre: 'Hecho',
    });
  });

  it('orden del tablero: abiertas por fecha límite (sin fecha al final) y creación; luego terminadas recientes primero', () => {
    const tareas = [
      tareaDePrueba(1, { estado: 'terminada', terminadaEn: '2026-11-10T00:00:00.000Z' }),
      tareaDePrueba(2, { fechaLimite: null, creadaEn: '2026-11-01T00:00:00.000Z' }),
      tareaDePrueba(3, { fechaLimite: '2026-12-01' }),
      tareaDePrueba(4, { estado: 'terminada', terminadaEn: '2026-11-20T00:00:00.000Z' }),
      tareaDePrueba(5, { fechaLimite: '2026-11-25', estado: 'pendiente' }),
      tareaDePrueba(6, { fechaLimite: null, creadaEn: '2026-10-01T00:00:00.000Z' }),
      tareaDePrueba(7, { fechaLimite: '2026-12-01', creadaEn: '2026-10-01T00:00:00.000Z' }),
    ];
    expect(ordenarTablero(tareas).map((t) => t.id)).toEqual([5, 7, 3, 6, 2, 4, 1]);
    expect(tareas.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('suma los conteos de las personas', () => {
    expect(sumarConteos([])).toEqual({ pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 });
    expect(
      sumarConteos([
        { pendientes: 1, enProceso: 2, terminadasRecientes: 3, vencidas: 1 },
        { pendientes: 4, enProceso: 0, terminadasRecientes: 1, vencidas: 2 },
      ]),
    ).toEqual({ pendientes: 5, enProceso: 2, terminadasRecientes: 4, vencidas: 3 });
  });
});

describe('avisos por correo', () => {
  it('primer nombre de quien recibe', () => {
    expect(primerNombre('  José David Ramírez Abraham ')).toBe('José');
    expect(primerNombre('Luciana')).toBe('Luciana');
    expect(primerNombre('   ')).toBe('');
  });

  it('mensaje según el estado del envío', () => {
    expect(mensajeAviso('enviado', 'José David Ramírez Abraham')).toBe('Se le avisó a José por correo.');
    expect(mensajeAviso('enviado', '')).toBe('Se envió el aviso por correo.');
    expect(mensajeAviso('sin_configurar', 'José')).toBe(MENSAJE_CORREO_SIN_CONFIGURAR);
    expect(MENSAJE_CORREO_SIN_CONFIGURAR).toBe(
      'El correo todavía no está configurado: el aviso quedó guardado y saldrá cuando se configure.',
    );
    expect(mensajeAviso('error', 'José')).toBe(MENSAJE_CORREO_NO_SALIO);
    expect(mensajeAviso('pendiente', 'José')).toBe(
      'El correo no salió; quedó en la bandeja de correos del líder para reintentarlo.',
    );
  });

  it('al terminar se aclara que la tarea quedó terminada si el correo no salió', () => {
    expect(mensajeAvisoTerminada('enviado', 'José David')).toBe('Se le avisó a José por correo.');
    expect(mensajeAvisoTerminada('error', 'José David')).toBe(`La tarea quedó terminada. ${MENSAJE_CORREO_NO_SALIO}`);
    expect(mensajeAvisoTerminada('sin_configurar', 'José David')).toBe(
      `La tarea quedó terminada. ${MENSAJE_CORREO_SIN_CONFIGURAR}`,
    );
    expect(AVISO_SIN_LIDER).toEqual({
      correoId: null,
      estado: 'sin_configurar',
      mensaje: 'La tarea quedó terminada. No hay un líder activo para avisarle.',
    });
  });

  it('adjunta en el orden de subida mientras quepan; el resto va como enlace', () => {
    const mb = 1024 * 1024;
    const archivos = [
      { id: 3, nombre: 'c.xlsx', bytes: 2 * mb, creadoEn: '2026-11-03T00:00:00.000Z' },
      { id: 1, nombre: 'a.pdf', bytes: 10 * mb, creadoEn: '2026-11-01T00:00:00.000Z' },
      { id: 2, nombre: 'b.pptx', bytes: 9 * mb, creadoEn: '2026-11-02T00:00:00.000Z' },
      { id: 4, nombre: 'd.png', bytes: 6 * mb, creadoEn: '2026-11-04T00:00:00.000Z' },
    ];
    expect(escogerAdjuntos(archivos)).toEqual({
      adjuntos: [1, 3, 4],
      archivos: [
        { nombre: 'a.pdf', bytes: 10 * mb, adjunto: true },
        { nombre: 'b.pptx', bytes: 9 * mb, adjunto: false },
        { nombre: 'c.xlsx', bytes: 2 * mb, adjunto: true },
        { nombre: 'd.png', bytes: 6 * mb, adjunto: true },
      ],
    });
    expect(archivos.map((a) => a.id)).toEqual([3, 1, 2, 4]);
  });

  it('el límite de bytes es inclusivo y un empate de fecha se ordena por id', () => {
    const misma = '2026-11-01T00:00:00.000Z';
    expect(
      escogerAdjuntos(
        [
          { id: 2, nombre: 'b', bytes: 4, creadoEn: misma },
          { id: 1, nombre: 'a', bytes: 6, creadoEn: misma },
        ],
        10,
      ),
    ).toEqual({
      adjuntos: [1, 2],
      archivos: [
        { nombre: 'a', bytes: 6, adjunto: true },
        { nombre: 'b', bytes: 4, adjunto: true },
      ],
    });
    expect(escogerAdjuntos([{ id: 1, nombre: 'grande', bytes: 11, creadoEn: misma }], 10).adjuntos).toEqual([]);
    expect(escogerAdjuntos([])).toEqual({ adjuntos: [], archivos: [] });
  });

  it('enlaces: CRM_URL_SITIO (sin la barra final) o el origen de la petición', () => {
    const peticion = { protocol: 'https', get: (cabecera: string) => (cabecera === 'host' ? 'crm.local:8080' : undefined) };
    expect(origenSitio('https://sapiencia.example/', peticion)).toBe('https://sapiencia.example');
    expect(origenSitio(null, peticion)).toBe('https://crm.local:8080');
    expect(origenSitio('  ', peticion)).toBe('https://crm.local:8080');
    expect(origenSitio(null, { protocol: 'http', get: () => undefined })).toBe('http://localhost');
    expect(enlaceLider('https://s.example', 15)).toBe('https://s.example/crm/lider/tareas/15');
    expect(enlaceEquipo('https://s.example', 4, 15)).toBe('https://s.example/crm/equipo/4?tarea=15');
  });

  it('los correos que dispara el equipo (sin sesión) solo usan CRM_URL_SITIO, nunca el Host de la petición', () => {
    expect(origenConfigurado('https://sapiencia.example/crm/')).toBe('https://sapiencia.example/crm');
    expect(origenConfigurado(null)).toBeNull();
    expect(origenConfigurado('   ')).toBeNull();
  });
});
