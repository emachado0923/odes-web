/**
 * Rutas de la rama /pai (Plan de Acción Institucional) y de su API.
 * Las subrutas las define PaiSitio.tsx con <Routes> descendientes.
 */
import { PARAMETROS_FILTRO_PAI, RUTA_API_PAI, type FiltrosTableroPai } from './api-pai'

export { RUTA_API_PAI }

/** Tablero (ambos roles). */
export const RUTA_PAI = '/pai'
/** Cambiar la contraseña propia. */
export const RUTA_CUENTA = '/pai/cuenta'
/** Seguimiento (solo administrador): resumen por dependencia y proceso. */
export const RUTA_ADMIN = '/pai/admin'
export const RUTA_ADMIN_USUARIOS = '/pai/admin/usuarios'
export const RUTA_ADMIN_BIMESTRE = '/pai/admin/bimestre'
export const RUTA_ADMIN_AUTORIZACIONES = '/pai/admin/autorizaciones'
export const RUTA_ADMIN_REGISTRO = '/pai/admin/registro'

/** Subrutas relativas a /pai (las de <Routes> en PaiSitio.tsx). */
export const SUBRUTAS_PAI = {
  tablero: '',
  ficha: 'indicadores/:codigo',
  cuenta: 'cuenta',
  admin: 'admin',
  adminUsuarios: 'admin/usuarios',
  adminBimestre: 'admin/bimestre',
  adminAutorizaciones: 'admin/autorizaciones',
  adminRegistro: 'admin/registro',
} as const

/** Ficha completa de un indicador: /pai/indicadores/SAF-TH-02. */
export function rutaFicha(codigo: string): string {
  return `${RUTA_PAI}/indicadores/${encodeURIComponent(codigo)}`
}

/** Parámetros de la URL para unos filtros (los vacíos no se incluyen), en el orden de PARAMETROS_FILTRO_PAI. */
export function parametrosFiltros(filtros: FiltrosTableroPai): URLSearchParams {
  const parametros = new URLSearchParams()
  for (const nombre of PARAMETROS_FILTRO_PAI) {
    const valor = filtros[nombre]
    if (valor === null || valor === undefined || valor === '') continue
    parametros.set(nombre, String(valor))
  }
  return parametros
}

/** Tablero con filtros en la URL: /pai?dependencia=3&estado=pendiente. */
export function rutaTablero(filtros: FiltrosTableroPai = {}): string {
  const consulta = parametrosFiltros(filtros).toString()
  return consulta ? `${RUTA_PAI}?${consulta}` : RUTA_PAI
}

/** id del <main>: destino del enlace "Saltar al contenido". */
export const ID_CONTENIDO = 'contenido'

/** Logos en blanco de la cabecera y el pie, los mismos de /odes y /tableros (apps/web/public/odes/img). */
export const LOGO_CABECERA = { src: '/odes/img/logo-observatorio-blanco.png', ancho: 1319, alto: 390 }
export const LOGO_PIE = { src: '/odes/img/logo-sapiencia-alcaldia-blanco.png', ancho: 720, alto: 255 }

/** Nombre de la aplicación (cabecera y títulos). */
export const NOMBRE_PAI = 'Plan de Acción Institucional'
