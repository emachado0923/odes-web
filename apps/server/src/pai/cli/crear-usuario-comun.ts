import { parseArgs } from 'node:util';
import type { RowDataPacket } from 'mysql2/promise';
import {
  LIMITES_PAI,
  PATRON_USUARIO_PAI,
  ROLES_PAI,
  type RolPai,
} from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import { largo } from '../compartido/validacion-comun.js';
import {
  IP_RESTABLECIMIENTO,
  reiniciarIntentosUsuario,
} from '../sesion/servicio-sesiones-pai.js';
import { PATRON_CORREO } from '../usuarios/validacion-usuarios.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { ErrorCli } from '../../repositorio/cli/comun.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';

/**
 * Partes puras y de base de la CLI pai:crear-usuario (crear-usuario.ts solo
 * las orquesta: así se prueban sin ejecutar la CLI).
 */

export const VARIABLE_CONTRASENA = 'PAI_USUARIO_CONTRASENA';

export const AYUDA_CREAR_USUARIO = `Uso: npm run pai:crear-usuario -- --usuario <usuario> --nombre "Nombre" --rol administrador|responsable
            [--correo <correo>] [--cargo "Cargo"] [--temporal] [--solo-sql]
       npm run pai:crear-usuario -- --usuario <usuario> [--temporal] [--solo-sql]   (cambia la contraseña)
       npm run pai:crear-usuario -- --usuario <usuario> --desactivar [--solo-sql]

  --usuario     3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo
  --nombre      nombre para mostrar (obligatorio al crear)
  --rol         administrador (Planeación: ve todo, gestiona usuarios y el bimestre)
                o responsable (reporta sus indicadores asignados); obligatorio al crear
  --correo      correo (opcional)
  --cargo       cargo (opcional)
  --temporal    la contraseña es temporal: el usuario debe cambiarla al entrar
  --desactivar  impide que el usuario inicie sesión y cierra sus sesiones
  --solo-sql    no se conecta: imprime el SQL de Postgres (con el hash scrypt, nunca
                la contraseña) para pegarlo en el editor SQL de Supabase
  --ayuda       muestra esta ayuda

Si el usuario existe, se le cambia la contraseña (y el nombre, rol, correo o cargo
que se indiquen), se reactiva, se cierran sus sesiones y se levanta su bloqueo por
intentos fallidos. Pasar a administrador
borra sus asignaciones (el administrador ve todos los indicadores).
La contraseña (mínimo 12 caracteres) se pide dos veces sin mostrarla; para
automatizar, use la variable de entorno ${VARIABLE_CONTRASENA}. Nunca se acepta
en los argumentos. Usa la conexión de la aplicación (apps/server/.env) y
necesita el esquema versión 5 (npm run repositorio:migrar).`;

export interface OpcionesCrearUsuario {
  usuario: string;
  /** undefined: no se indicó (al actualizar, no cambia). */
  nombre?: string;
  rol?: RolPai;
  correo?: string | null;
  cargo?: string | null;
  temporal: boolean;
  desactivar: boolean;
  soloSql: boolean;
}

/** Interpreta los argumentos; null si se pidió la ayuda. Lanza ErrorCli (código 2) si no sirven. */
export function interpretarArgumentosCrearUsuario(
  argumentos: readonly string[],
): OpcionesCrearUsuario | null {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argumentos],
      options: {
        usuario: { type: 'string' },
        nombre: { type: 'string' },
        rol: { type: 'string' },
        correo: { type: 'string' },
        cargo: { type: 'string' },
        temporal: { type: 'boolean', default: false },
        desactivar: { type: 'boolean', default: false },
        'solo-sql': { type: 'boolean', default: false },
        ayuda: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new ErrorCli(
      `${error instanceof Error ? error.message : String(error)}\n\n${AYUDA_CREAR_USUARIO}`,
      2,
    );
  }
  if (values.ayuda) return null;

  const usuario = values.usuario?.trim().toLowerCase();
  if (!usuario || !PATRON_USUARIO_PAI.test(usuario)) {
    throw new ErrorCli(
      `Indique un --usuario válido.\n\n${AYUDA_CREAR_USUARIO}`,
      2,
    );
  }
  const opciones: OpcionesCrearUsuario = {
    usuario,
    temporal: values.temporal,
    desactivar: values.desactivar,
    soloSql: values['solo-sql'],
  };
  if (values.nombre !== undefined) {
    const nombre = textoLinea(values.nombre);
    if (!nombre || largo(nombre) > LIMITES_PAI.maxNombreUsuario) {
      throw new ErrorCli(
        `--nombre debe tener entre 1 y ${LIMITES_PAI.maxNombreUsuario} caracteres.`,
        2,
      );
    }
    opciones.nombre = nombre;
  }
  if (values.rol !== undefined) {
    const rol = values.rol.trim().toLowerCase();
    if (!(ROLES_PAI as readonly string[]).includes(rol)) {
      throw new ErrorCli('--rol debe ser administrador o responsable.', 2);
    }
    opciones.rol = rol as RolPai;
  }
  if (values.correo !== undefined) {
    const correo = textoLinea(values.correo) || null;
    if (
      correo !== null &&
      (largo(correo) > LIMITES_PAI.maxCorreo || !PATRON_CORREO.test(correo))
    ) {
      throw new ErrorCli('--correo no es un correo válido.', 2);
    }
    opciones.correo = correo;
  }
  if (values.cargo !== undefined) {
    const cargo = textoLinea(values.cargo) || null;
    if (cargo !== null && largo(cargo) > LIMITES_PAI.maxCargo) {
      throw new ErrorCli(
        `--cargo: máximo ${LIMITES_PAI.maxCargo} caracteres.`,
        2,
      );
    }
    opciones.cargo = cargo;
  }
  if (opciones.desactivar) {
    const otras = [
      opciones.nombre !== undefined && '--nombre',
      opciones.rol !== undefined && '--rol',
      opciones.correo !== undefined && '--correo',
      opciones.cargo !== undefined && '--cargo',
      opciones.temporal && '--temporal',
    ].filter(Boolean);
    if (otras.length > 0) {
      throw new ErrorCli(
        `--desactivar no se combina con ${otras.join(', ')}.`,
        2,
      );
    }
  }
  return opciones;
}

/** Texto SQL entre comillas simples (las del texto, dobladas). */
export function literalSql(texto: string | null): string {
  return texto === null ? 'NULL' : `'${texto.replaceAll("'", "''")}'`;
}

function idDeUsuarioSql(usuario: string): string {
  return `(SELECT id FROM pai_usuarios WHERE usuario = ${literalSql(usuario)})`;
}

/**
 * Fila del registro (sin usuario que actúa: es la CLI). Con `siExiste`, solo
 * si ese usuario existe.
 */
function registroSql(
  accionSql: string,
  detalle: Record<string, unknown>,
  siExiste?: string,
): string {
  const insercion = `INSERT INTO pai_registro (fecha, accion, detalle) SELECT now(), ${accionSql}, ${literalSql(JSON.stringify(detalle))}`;
  return siExiste === undefined
    ? `${insercion};`
    : `${insercion} WHERE EXISTS (SELECT 1 FROM pai_usuarios WHERE usuario = ${literalSql(siExiste)});`;
}

/**
 * SQL (Postgres, para el editor SQL de Supabase) que crea el usuario o, si
 * existe, le cambia la contraseña, lo reactiva, cierra sus sesiones y
 * levanta su bloqueo por intentos fallidos. Con
 * nombre y rol hace INSERT … ON CONFLICT; sin ellos, solo UPDATE de un
 * usuario existente. Lleva el hash, nunca la contraseña.
 */
export function sqlCrearUsuarioPai(
  opciones: OpcionesCrearUsuario,
  hash: string,
): string {
  const { usuario, nombre, rol, correo, cargo, temporal } = opciones;
  const debeCambiar = temporal ? 1 : 0;
  const detalle = {
    usuario,
    origen: 'pai:crear-usuario --solo-sql',
    ...(nombre !== undefined ? { nombre } : {}),
    ...(rol !== undefined ? { rol } : {}),
    ...(correo !== undefined ? { correo } : {}),
    ...(cargo !== undefined ? { cargo } : {}),
    contrasenaTemporal: temporal,
    sesionesCerradas: true,
  };
  const lineas = [
    '-- Usuario del PAI (generado por pai:crear-usuario --solo-sql). Lleva el hash scrypt, nunca la contraseña.',
    'BEGIN;',
  ];
  if (nombre !== undefined && rol !== undefined) {
    const actualizar = [
      'hash_contrasena = EXCLUDED.hash_contrasena',
      'debe_cambiar_contrasena = EXCLUDED.debe_cambiar_contrasena',
      'activo = 1',
      'nombre = EXCLUDED.nombre',
      'rol = EXCLUDED.rol',
      ...(correo !== undefined ? ['correo = EXCLUDED.correo'] : []),
      ...(cargo !== undefined ? ['cargo = EXCLUDED.cargo'] : []),
    ];
    lineas.push(
      registroSql(
        `CASE WHEN EXISTS (SELECT 1 FROM pai_usuarios WHERE usuario = ${literalSql(usuario)}) THEN 'editar_usuario' ELSE 'crear_usuario' END`,
        detalle,
      ),
      'INSERT INTO pai_usuarios (usuario, nombre, correo, cargo, rol, hash_contrasena, debe_cambiar_contrasena, activo)',
      `VALUES (${[
        literalSql(usuario),
        literalSql(nombre),
        literalSql(correo ?? null),
        literalSql(cargo ?? null),
        literalSql(rol),
        literalSql(hash),
        debeCambiar,
        1,
      ].join(', ')})`,
      `ON CONFLICT (usuario) DO UPDATE SET ${actualizar.join(', ')};`,
    );
  } else {
    const columnas = [
      `hash_contrasena = ${literalSql(hash)}`,
      `debe_cambiar_contrasena = ${debeCambiar}`,
      'activo = 1',
      ...(nombre !== undefined ? [`nombre = ${literalSql(nombre)}`] : []),
      ...(rol !== undefined ? [`rol = ${literalSql(rol)}`] : []),
      ...(correo !== undefined ? [`correo = ${literalSql(correo)}`] : []),
      ...(cargo !== undefined ? [`cargo = ${literalSql(cargo)}`] : []),
    ];
    lineas.push(
      '-- Sin --nombre y --rol solo se actualiza un usuario EXISTENTE (si no existe, no cambia nada).',
      registroSql(`'editar_usuario'`, detalle, usuario),
      `UPDATE pai_usuarios SET ${columnas.join(', ')} WHERE usuario = ${literalSql(usuario)};`,
    );
  }
  lineas.push(
    `DELETE FROM pai_sesiones WHERE usuario_id = ${idDeUsuarioSql(usuario)};`,
    // Levanta el bloqueo por intentos fallidos (reiniciarIntentosUsuario).
    `INSERT INTO pai_intentos_acceso (usuario, ip, exito, creado_en) VALUES (${literalSql(usuario)}, ${literalSql(IP_RESTABLECIMIENTO)}, 1, now());`,
  );
  if (rol === 'administrador') {
    lineas.push(
      `DELETE FROM pai_asignaciones WHERE usuario_id = ${idDeUsuarioSql(usuario)};`,
    );
  }
  lineas.push('COMMIT;');
  return lineas.join('\n');
}

/** SQL (Postgres) que desactiva el usuario y cierra sus sesiones. */
export function sqlDesactivarUsuarioPai(usuario: string): string {
  return [
    '-- Desactiva un usuario del PAI (generado por pai:crear-usuario --desactivar --solo-sql).',
    'BEGIN;',
    registroSql(
      `'editar_usuario'`,
      {
        usuario,
        origen: 'pai:crear-usuario --solo-sql',
        activo: false,
        sesionesCerradas: true,
      },
      usuario,
    ),
    `UPDATE pai_usuarios SET activo = 0 WHERE usuario = ${literalSql(usuario)};`,
    `DELETE FROM pai_sesiones WHERE usuario_id = ${idDeUsuarioSql(usuario)};`,
    'COMMIT;',
  ].join('\n');
}

interface FilaUsuarioCli extends RowDataPacket {
  id: number;
  rol: RolPai;
}

/** Usuario existente (id y rol), o null. */
export async function buscarUsuarioCli(
  bd: Pick<BaseDatosRepositorio, 'filas'>,
  usuario: string,
): Promise<{ id: number; rol: RolPai } | null> {
  const [fila] = await bd.filas<FilaUsuarioCli>(
    'SELECT id, rol FROM pai_usuarios WHERE usuario = ?',
    [usuario],
  );
  return fila ? { id: Number(fila.id), rol: fila.rol } : null;
}

/**
 * Lanza ErrorCli (código 2) si para crear el usuario faltan --nombre o
 * --rol. Se llama antes de pedir la contraseña.
 */
export function exigirDatosDeCreacion(opciones: OpcionesCrearUsuario): void {
  if (opciones.nombre === undefined || opciones.rol === undefined) {
    throw new ErrorCli(
      `El usuario ${opciones.usuario} no existe: para crearlo indique --nombre y --rol.`,
      2,
    );
  }
}

export interface ResultadoGuardarUsuarioCli {
  id: number;
  creado: boolean;
}

/**
 * Crea el usuario o, si existe, le cambia la contraseña (y lo indicado), lo
 * reactiva, cierra sus sesiones y levanta su bloqueo por intentos fallidos;
 * todo en una transacción con su fila en pai_registro (sin el hash).
 */
export async function guardarUsuarioCli(
  bd: Pick<BaseDatosRepositorio, 'transaccion'>,
  opciones: OpcionesCrearUsuario,
  hash: string,
): Promise<ResultadoGuardarUsuarioCli> {
  return bd.transaccion(async (conexion) => {
    const [filas] = await conexion.query<FilaUsuarioCli[]>(
      'SELECT id, rol FROM pai_usuarios WHERE usuario = ? FOR UPDATE',
      [opciones.usuario],
    );
    const existente = filas[0];
    const detalle: Record<string, unknown> = {
      usuario: opciones.usuario,
      origen: 'pai:crear-usuario',
      ...(opciones.nombre !== undefined ? { nombre: opciones.nombre } : {}),
      ...(opciones.rol !== undefined ? { rol: opciones.rol } : {}),
      ...(opciones.correo !== undefined ? { correo: opciones.correo } : {}),
      ...(opciones.cargo !== undefined ? { cargo: opciones.cargo } : {}),
      contrasenaTemporal: opciones.temporal,
    };
    let id: number;
    if (existente) {
      id = Number(existente.id);
      const columnas: [string, unknown][] = [
        ['hash_contrasena', hash],
        ['debe_cambiar_contrasena', opciones.temporal ? 1 : 0],
        ['activo', 1],
      ];
      if (opciones.nombre !== undefined)
        columnas.push(['nombre', opciones.nombre]);
      if (opciones.rol !== undefined) columnas.push(['rol', opciones.rol]);
      if (opciones.correo !== undefined)
        columnas.push(['correo', opciones.correo]);
      if (opciones.cargo !== undefined)
        columnas.push(['cargo', opciones.cargo]);
      await conexion.query(
        `UPDATE pai_usuarios SET ${columnas.map(([columna]) => `${columna} = ?`).join(', ')} WHERE id = ?`,
        [...columnas.map(([, valor]) => valor), id],
      );
      await conexion.query('DELETE FROM pai_sesiones WHERE usuario_id = ?', [
        id,
      ]);
      detalle.sesionesCerradas = true;
      // Con la contraseña nueva puede entrar ya, aunque estuviera bloqueado.
      await reiniciarIntentosUsuario(conexion, opciones.usuario);
      if (
        opciones.rol === 'administrador' &&
        existente.rol !== 'administrador'
      ) {
        await conexion.query(
          'DELETE FROM pai_asignaciones WHERE usuario_id = ?',
          [id],
        );
        detalle.asignacionesBorradas = true;
      }
    } else {
      exigirDatosDeCreacion(opciones);
      const [resultado] = await conexion.query<ResultadoEscritura>(
        `INSERT INTO pai_usuarios (usuario, nombre, correo, cargo, rol, hash_contrasena, debe_cambiar_contrasena, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          opciones.usuario,
          opciones.nombre,
          opciones.correo ?? null,
          opciones.cargo ?? null,
          opciones.rol,
          hash,
          opciones.temporal ? 1 : 0,
        ],
      );
      id = Number(resultado.insertId);
    }
    await registrarEnPai(conexion, {
      accion: existente ? 'editar_usuario' : 'crear_usuario',
      detalle: { id, ...detalle },
    });
    return { id, creado: !existente };
  });
}

/** Desactiva el usuario y cierra sus sesiones (ErrorCli si no existe). */
export async function desactivarUsuarioCli(
  bd: Pick<BaseDatosRepositorio, 'transaccion'>,
  usuario: string,
): Promise<number> {
  return bd.transaccion(async (conexion) => {
    const [filas] = await conexion.query<FilaUsuarioCli[]>(
      'SELECT id, rol FROM pai_usuarios WHERE usuario = ? FOR UPDATE',
      [usuario],
    );
    const existente = filas[0];
    if (!existente) throw new ErrorCli(`El usuario ${usuario} no existe.`);
    const id = Number(existente.id);
    await conexion.query('UPDATE pai_usuarios SET activo = 0 WHERE id = ?', [
      id,
    ]);
    await conexion.query('DELETE FROM pai_sesiones WHERE usuario_id = ?', [id]);
    await registrarEnPai(conexion, {
      accion: 'editar_usuario',
      detalle: {
        id,
        usuario,
        origen: 'pai:crear-usuario',
        activo: false,
        sesionesCerradas: true,
      },
    });
    return id;
  });
}
