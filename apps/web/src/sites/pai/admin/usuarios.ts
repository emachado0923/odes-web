/**
 * Lógica pura del formulario de usuarios (ModalUsuario.tsx), probada en
 * usuarios.test.tsx: estado inicial, validación antes de enviar y los
 * nombres de los campos que devuelve el servidor.
 */
import { LIMITES_PAI, PATRON_USUARIO_PAI, type RolPai, type UsuarioPai } from '../api-pai'
import { problemaContrasena } from '../sesion/textos'

export type CampoUsuario = 'usuario' | 'nombre' | 'correo' | 'cargo' | 'rol' | 'activo' | 'contrasena'

export interface FormularioUsuario {
  usuario: string
  nombre: string
  correo: string
  cargo: string
  rol: RolPai
  activo: boolean
  /** Editar: asignar una contraseña temporal nueva. */
  restablecer: boolean
  contrasena: string
}

/** El mismo patrón que el servidor (PATRON_CORREO de validacion-usuarios.ts): sin puntos vacíos en el dominio. */
export const PATRON_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

/** Orden de los campos en el formulario (el foco va al primero con error). */
export const ORDEN_CAMPOS: CampoUsuario[] = ['usuario', 'nombre', 'correo', 'cargo', 'rol', 'activo', 'contrasena']

export function formularioInicial(usuario: UsuarioPai | null): FormularioUsuario {
  return {
    usuario: usuario?.usuario ?? '',
    nombre: usuario?.nombre ?? '',
    correo: usuario?.correo ?? '',
    cargo: usuario?.cargo ?? '',
    rol: usuario?.rol ?? 'responsable',
    activo: usuario?.activo ?? true,
    restablecer: false,
    contrasena: '',
  }
}

export function mismoFormulario(a: FormularioUsuario, b: FormularioUsuario): boolean {
  return (Object.keys(a) as (keyof FormularioUsuario)[]).every((clave) => a[clave] === b[clave])
}

/** Errores del formulario antes de enviarlo (vacío si se puede enviar). */
export function erroresUsuario(datos: FormularioUsuario, nuevo: boolean): Partial<Record<CampoUsuario, string>> {
  const errores: Partial<Record<CampoUsuario, string>> = {}
  if (nuevo) {
    const usuario = datos.usuario.trim()
    if (!usuario) errores.usuario = 'Escriba el usuario.'
    else if (!PATRON_USUARIO_PAI.test(usuario)) {
      errores.usuario =
        'Use de 3 a 64 caracteres: minúsculas sin tildes, números, punto, guion o guion bajo, empezando por letra o número.'
    }
  }
  const nombre = datos.nombre.trim()
  if (!nombre) errores.nombre = 'Escriba el nombre.'
  else if (nombre.length > LIMITES_PAI.maxNombreUsuario) {
    errores.nombre = `El nombre puede tener hasta ${LIMITES_PAI.maxNombreUsuario} caracteres.`
  }
  const correo = datos.correo.trim()
  if (correo.length > LIMITES_PAI.maxCorreo) {
    errores.correo = `El correo puede tener hasta ${LIMITES_PAI.maxCorreo} caracteres.`
  } else if (correo && !PATRON_CORREO.test(correo)) {
    errores.correo = 'Escriba un correo válido (nombre@dominio.gov.co).'
  }
  if (datos.cargo.trim().length > LIMITES_PAI.maxCargo) {
    errores.cargo = `El cargo puede tener hasta ${LIMITES_PAI.maxCargo} caracteres.`
  }
  if (nuevo || datos.restablecer) {
    const problema = problemaContrasena(datos.contrasena)
    if (problema) errores.contrasena = datos.contrasena ? problema : 'Escriba o genere la contraseña temporal.'
  }
  return errores
}

/** Campo del formulario para un nombre de campo del cuerpo (errores del servidor). */
export function campoDelServidor(campo: string): CampoUsuario | null {
  if (campo === 'contrasenaTemporal') return 'contrasena'
  return (ORDEN_CAMPOS as string[]).includes(campo) ? (campo as CampoUsuario) : null
}
