/**
 * Datos de prueba de la sesión y la vigencia del PAI (ver
 * ProveedorSesionPrueba.tsx).
 */
import { BIMESTRES_PAI, type NumeroBimestre, type RolPai, type SesionPai, type VigenciaPai } from '../api-pai'

export const CSRF_PRUEBA = 'csrf-de-prueba'

export function sesionPrueba(rol: RolPai = 'responsable', cambios: Partial<SesionPai> = {}): SesionPai {
  return {
    id: rol === 'administrador' ? 1 : 2,
    usuario: rol === 'administrador' ? 'planeacion' : 'responsable.saf',
    nombre: rol === 'administrador' ? 'Planeación Estratégica' : 'Responsable SAF',
    rol,
    csrf: CSRF_PRUEBA,
    expira: '2026-10-11T23:00:00.000Z',
    debeCambiarContrasena: false,
    ...cambios,
  }
}

export function vigenciaPrueba(
  cambios: Partial<VigenciaPai> & { bimestreAbierto?: NumeroBimestre | null } = {},
): VigenciaPai {
  const bimestreAbierto = cambios.bimestreAbierto === undefined ? 4 : cambios.bimestreAbierto
  return {
    anio: 2026,
    bimestreAbierto,
    abiertoHasta: null,
    abiertoAhora: bimestreAbierto !== null,
    bimestres: [...BIMESTRES_PAI],
    vigencias: [2026],
    ahora: '2026-08-20T15:00:00.000Z',
    actualizadoEn: null,
    actualizadoPor: null,
    ...cambios,
  }
}
