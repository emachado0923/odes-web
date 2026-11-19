import { describe, expect, it } from 'vitest';
import { ErrorPaiHttp } from '../errores-pai.js';
import {
  diferenciaAsignaciones,
  MENSAJE_AUTODESACTIVAR,
  MENSAJE_AUTOQUITAR_ROL,
  MENSAJE_AUTORRESTABLECER,
  planificarCambiosUsuario,
  quitaUnAdministradorActivo,
  type UsuarioActualPai,
} from './reglas-usuarios.js';
import { aUsuarioPai, type FilaUsuarioPai } from './servicio-usuarios-pai.js';
import {
  MAX_ASIGNACIONES,
  MENSAJE_USUARIO_INVALIDO,
  validarAsignacionesPai,
  validarCambiosUsuarioPai,
  validarUsuarioNuevoPai,
} from './validacion-usuarios.js';

/**
 * Unitarias de la administración de usuarios del PAI: validación, plan de
 * un PATCH (autoprotección del administrador, cierre de sesiones) y
 * reemplazo de asignaciones. Con base real: test/pai-sesion.e2e-spec.ts.
 */

const CLAVE = 'temporal-de-12-o-mas';

function errorDe(funcion: () => unknown): ErrorPaiHttp {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorPaiHttp) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorPaiHttp');
}

describe('validarUsuarioNuevoPai', () => {
  const valido = {
    usuario: '  Ana.Perez ',
    nombre: '  Ana   Pérez\t',
    correo: ' ana.perez@sapiencia.gov.co ',
    cargo: 'Profesional universitaria',
    rol: 'responsable',
    contrasenaTemporal: CLAVE,
  };

  it('normaliza usuario (minúsculas), nombre y correo', () => {
    expect(validarUsuarioNuevoPai(valido)).toEqual({
      usuario: 'ana.perez',
      nombre: 'Ana Pérez',
      correo: 'ana.perez@sapiencia.gov.co',
      cargo: 'Profesional universitaria',
      rol: 'responsable',
      contrasenaTemporal: CLAVE,
    });
  });

  it('correo y cargo son opcionales (ausentes, null o vacíos quedan null)', () => {
    const { correo: _c, cargo: _g, ...sinOpcionales } = valido;
    expect(validarUsuarioNuevoPai(sinOpcionales)).toMatchObject({
      correo: null,
      cargo: null,
    });
    expect(
      validarUsuarioNuevoPai({ ...valido, correo: '  ', cargo: null }),
    ).toMatchObject({ correo: null, cargo: null });
  });

  it.each([
    [{ usuario: 'ab' }, 'usuario', MENSAJE_USUARIO_INVALIDO],
    [{ usuario: 'josé' }, 'usuario', MENSAJE_USUARIO_INVALIDO],
    [{ usuario: '-ana' }, 'usuario', MENSAJE_USUARIO_INVALIDO],
    [{ usuario: 'a'.repeat(65) }, 'usuario', MENSAJE_USUARIO_INVALIDO],
    [{ nombre: '   ' }, 'nombre', 'Escriba el nombre.'],
    [
      { nombre: 'n'.repeat(121) },
      'nombre',
      'El nombre: máximo 120 caracteres.',
    ],
    [{ correo: 'no-es-correo' }, 'correo', /correo válido/],
    [{ correo: 'a@b' }, 'correo', /correo válido/],
    [{ correo: `${'a'.repeat(250)}@b.co` }, 'correo', /máximo 254/],
    [{ cargo: 'c'.repeat(161) }, 'cargo', /máximo 160/],
    [{ rol: 'jefe' }, 'rol', 'Elija el rol: responsable o administrador.'],
    [{ contrasenaTemporal: 'corta' }, 'contrasenaTemporal', /al menos 12/],
    [
      { contrasenaTemporal: undefined },
      'contrasenaTemporal',
      /contraseña temporal/,
    ],
  ])('rechaza %j', (cambio, campo, mensaje) => {
    const error = errorDe(() =>
      validarUsuarioNuevoPai({ ...valido, ...cambio }),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.codigo).toBe('solicitud_invalida');
    expect(Object.keys(error.campos ?? {})).toEqual([campo]);
    expect(error.campos?.[campo]).toMatch(mensaje);
  });

  it('un cuerpo que no es objeto: 400', () => {
    for (const cuerpo of [null, 'texto', [valido]]) {
      expect(errorDe(() => validarUsuarioNuevoPai(cuerpo)).getStatus()).toBe(
        400,
      );
    }
  });
});

describe('validarCambiosUsuarioPai', () => {
  it('solo devuelve lo que vino (null borra correo y cargo)', () => {
    expect(validarCambiosUsuarioPai({})).toEqual({});
    expect(
      validarCambiosUsuarioPai({ correo: null, cargo: '', activo: false }),
    ).toEqual({ correo: null, cargo: null, activo: false });
    expect(
      validarCambiosUsuarioPai({
        nombre: ' Nuevo  nombre ',
        rol: 'administrador',
        contrasenaTemporal: CLAVE,
      }),
    ).toEqual({
      nombre: 'Nuevo nombre',
      rol: 'administrador',
      contrasenaTemporal: CLAVE,
    });
  });

  it.each([
    [{ nombre: null }, 'nombre'],
    [{ nombre: '' }, 'nombre'],
    [{ activo: 'no' }, 'activo'],
    [{ rol: 'otro' }, 'rol'],
    [{ contrasenaTemporal: 'corta' }, 'contrasenaTemporal'],
    [{ correo: 'mal' }, 'correo'],
  ])('rechaza %j', (cuerpo, campo) => {
    expect(
      Object.keys(errorDe(() => validarCambiosUsuarioPai(cuerpo)).campos ?? {}),
    ).toEqual([campo]);
  });
});

describe('validarAsignacionesPai', () => {
  it('quita repetidos y ordena', () => {
    expect(
      validarAsignacionesPai({ procesos: [3, 1, 3], indicadores: [] }),
    ).toEqual({
      procesos: [1, 3],
      indicadores: [],
    });
  });

  it.each([
    [{ procesos: [] }, 'indicadores'],
    [{ procesos: [1.5], indicadores: [] }, 'procesos.0'],
    [{ procesos: [0], indicadores: [] }, 'procesos.0'],
    [{ procesos: ['1'], indicadores: [] }, 'procesos.0'],
    [{ procesos: [], indicadores: 5 }, 'indicadores'],
    [{ procesos: [], indicadores: [2 ** 31] }, 'indicadores.0'],
  ])('rechaza %j', (cuerpo, campo) => {
    expect(
      Object.keys(errorDe(() => validarAsignacionesPai(cuerpo)).campos ?? {}),
    ).toEqual([campo]);
  });

  it(`acepta hasta ${MAX_ASIGNACIONES} ids por lista`, () => {
    const muchos = Array.from(
      { length: MAX_ASIGNACIONES + 1 },
      (_, i) => i + 1,
    );
    expect(
      errorDe(() =>
        validarAsignacionesPai({ procesos: [], indicadores: muchos }),
      ).campos,
    ).toHaveProperty('indicadores');
    expect(
      validarAsignacionesPai({ procesos: [], indicadores: muchos.slice(1) })
        .indicadores,
    ).toHaveLength(MAX_ASIGNACIONES);
  });
});

describe('quitaUnAdministradorActivo', () => {
  const admin = { rol: 'administrador' as const, activo: true };
  it('desactivar o pasar a responsable a un administrador activo', () => {
    expect(quitaUnAdministradorActivo(admin, { columnas: { activo: 0 } })).toBe(true);
    expect(
      quitaUnAdministradorActivo(admin, { columnas: { rol: 'responsable' } }),
    ).toBe(true);
    expect(quitaUnAdministradorActivo(admin, { columnas: { nombre: 'X' } })).toBe(
      false,
    );
    expect(
      quitaUnAdministradorActivo(
        { rol: 'administrador', activo: false },
        { columnas: { rol: 'responsable' } },
      ),
    ).toBe(false);
    expect(
      quitaUnAdministradorActivo(
        { rol: 'responsable', activo: true },
        { columnas: { activo: 0 } },
      ),
    ).toBe(false);
  });
});

describe('planificarCambiosUsuario', () => {
  const responsable: UsuarioActualPai = {
    id: 7,
    usuario: 'resp',
    nombre: 'Responsable',
    correo: null,
    cargo: 'Líder',
    rol: 'responsable',
    activo: true,
    debeCambiarContrasena: false,
  };
  const ADMIN = 1;

  it('sin cambios reales no hay nada que escribir', () => {
    const plan = planificarCambiosUsuario(
      responsable,
      {
        nombre: 'Responsable',
        cargo: 'Líder',
        rol: 'responsable',
        activo: true,
      },
      ADMIN,
    );
    expect(plan.hayCambios).toBe(false);
    expect(plan.columnas).toEqual({});
  });

  it('nombre, correo y cargo: columnas con antes y después', () => {
    const plan = planificarCambiosUsuario(
      responsable,
      { nombre: 'Nuevo', correo: 'a@b.co', cargo: null },
      ADMIN,
    );
    expect(plan).toEqual({
      hayCambios: true,
      columnas: { nombre: 'Nuevo', correo: 'a@b.co', cargo: null },
      restablecerContrasena: false,
      cerrarSesiones: false,
      borrarAsignaciones: false,
      antes: { nombre: 'Responsable', correo: null, cargo: 'Líder' },
      despues: { nombre: 'Nuevo', correo: 'a@b.co', cargo: null },
    });
  });

  it('desactivar cierra las sesiones; reactivar no', () => {
    const desactivar = planificarCambiosUsuario(
      responsable,
      { activo: false },
      ADMIN,
    );
    expect(desactivar.columnas).toEqual({ activo: 0 });
    expect(desactivar.cerrarSesiones).toBe(true);
    const reactivar = planificarCambiosUsuario(
      { ...responsable, activo: false },
      { activo: true },
      ADMIN,
    );
    expect(reactivar.columnas).toEqual({ activo: 1 });
    expect(reactivar.cerrarSesiones).toBe(false);
  });

  it('contraseña temporal: marca debe_cambiar y cierra sesiones (sin la contraseña en el registro)', () => {
    const plan = planificarCambiosUsuario(
      responsable,
      { contrasenaTemporal: CLAVE },
      ADMIN,
    );
    expect(plan.restablecerContrasena).toBe(true);
    expect(plan.columnas).toEqual({ debe_cambiar_contrasena: 1 });
    expect(plan.cerrarSesiones).toBe(true);
    expect(JSON.stringify([plan.antes, plan.despues])).not.toContain(CLAVE);
    expect(plan.despues).toMatchObject({ contrasenaTemporal: 'restablecida' });
  });

  it('pasar a administrador borra las asignaciones; al revés no', () => {
    expect(
      planificarCambiosUsuario(responsable, { rol: 'administrador' }, ADMIN)
        .borrarAsignaciones,
    ).toBe(true);
    expect(
      planificarCambiosUsuario(
        { ...responsable, id: 8, rol: 'administrador' },
        { rol: 'responsable' },
        ADMIN,
      ).borrarAsignaciones,
    ).toBe(false);
  });

  it('el administrador no puede desactivarse, quitarse el rol ni darse una contraseña temporal', () => {
    const yo: UsuarioActualPai = {
      ...responsable,
      id: ADMIN,
      rol: 'administrador',
    };
    for (const [cambios, campo, mensaje] of [
      [{ activo: false }, 'activo', MENSAJE_AUTODESACTIVAR],
      [{ rol: 'responsable' }, 'rol', MENSAJE_AUTOQUITAR_ROL],
      [
        { contrasenaTemporal: CLAVE },
        'contrasenaTemporal',
        MENSAJE_AUTORRESTABLECER,
      ],
    ] as const) {
      const error = errorDe(() => planificarCambiosUsuario(yo, cambios, ADMIN));
      expect(error.getStatus()).toBe(409);
      expect(error.codigo).toBe('conflicto');
      expect(error.campos).toEqual({ [campo]: mensaje });
    }
    // Lo demás sí (y repetir su propio estado no es un cambio).
    expect(
      planificarCambiosUsuario(
        yo,
        { nombre: 'Yo', activo: true, rol: 'administrador' },
        ADMIN,
      ).columnas,
    ).toEqual({ nombre: 'Yo' });
  });
});

describe('diferenciaAsignaciones', () => {
  it('conserva lo que sigue, borra lo que sobra e inserta lo nuevo', () => {
    const diferencia = diferenciaAsignaciones(
      [
        { id: 10, procesoId: 1, indicadorId: null },
        { id: 11, procesoId: 2, indicadorId: null },
        { id: 12, procesoId: null, indicadorId: 50 },
        { id: 13, procesoId: null, indicadorId: 51 },
      ],
      { procesos: [2, 3], indicadores: [51, 52] },
    );
    expect(diferencia).toEqual({
      borrar: [10, 12],
      insertar: [
        { procesoId: 3, indicadorId: null },
        { procesoId: null, indicadorId: 52 },
      ],
      agregados: { procesos: [3], indicadores: [52] },
      quitados: { procesos: [1], indicadores: [50] },
    });
  });

  it('el mismo conjunto no cambia nada; el vacío lo borra todo', () => {
    const actuales = [
      { id: 1, procesoId: 4, indicadorId: null },
      { id: 2, procesoId: null, indicadorId: 9 },
    ];
    expect(
      diferenciaAsignaciones(actuales, { procesos: [4], indicadores: [9] }),
    ).toMatchObject({
      borrar: [],
      insertar: [],
    });
    expect(
      diferenciaAsignaciones(actuales, { procesos: [], indicadores: [] }),
    ).toEqual({
      borrar: [1, 2],
      insertar: [],
      agregados: { procesos: [], indicadores: [] },
      quitados: { procesos: [4], indicadores: [9] },
    });
  });

  it('filas repetidas o imposibles se limpian', () => {
    expect(
      diferenciaAsignaciones(
        [
          { id: 1, procesoId: 4, indicadorId: null },
          { id: 2, procesoId: 4, indicadorId: null },
          { id: 3, procesoId: null, indicadorId: null },
        ],
        { procesos: [4], indicadores: [] },
      ),
    ).toMatchObject({
      borrar: [2, 3],
      insertar: [],
      quitados: { procesos: [], indicadores: [] },
    });
  });
});

describe('aUsuarioPai', () => {
  it('convierte la fila al contrato (fechas ISO, banderas booleanas)', () => {
    const fila = {
      id: 5,
      usuario: 'ana',
      nombre: 'Ana',
      correo: null,
      cargo: 'Líder',
      rol: 'responsable',
      activo: 1,
      debe_cambiar_contrasena: 0,
      ultimo_acceso: null,
      creado_en: new Date('2026-10-01T12:00:00Z'),
      actualizado_en: new Date('2026-10-02T12:00:00.123Z'),
    } as unknown as FilaUsuarioPai;
    expect(aUsuarioPai(fila, { procesos: [1], indicadores: [2, 3] })).toEqual({
      id: 5,
      usuario: 'ana',
      nombre: 'Ana',
      correo: null,
      cargo: 'Líder',
      rol: 'responsable',
      activo: true,
      debeCambiarContrasena: false,
      ultimoAcceso: null,
      creadoEn: '2026-10-01T12:00:00.000Z',
      actualizadoEn: '2026-10-02T12:00:00.123Z',
      asignaciones: { procesos: [1], indicadores: [2, 3] },
    });
    expect(aUsuarioPai(fila).asignaciones).toEqual({
      procesos: [],
      indicadores: [],
    });
  });
});
