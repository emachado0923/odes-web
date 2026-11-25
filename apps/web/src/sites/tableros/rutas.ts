/** Ruta de la rama de tableros y de cada tablero. */
export const RUTA_TABLEROS = '/tableros'
export const RUTA_MATRICULA = '/tableros/matricula-2025'
/** Matrícula en educación superior en Medellín de 2000 a 2025 (datos estáticos del ETL). */
export const RUTA_MATRICULA_HISTORICA = '/tableros/matricula-historica'
/** Beneficiarios de los fondos de Sapiencia (2026): el tablero agregado. Privado (sesión de tableros). */
export const RUTA_FONDOS = '/tableros/fondos-2026'
/** La ventanilla de consulta por documento de los mismos fondos; misma sesión que el tablero. */
export const RUTA_FONDOS_VENTANILLA = '/tableros/fondos-2026/ventanilla'
/** Batería de indicadores (se abre desde la puerta del edificio de SIVU). */
export const RUTA_BATERIA = '/tableros/bateria-indicadores'

/** Datos del tablero de matrícula, desde la base (apps/server/src/sivu/tableros). */
export const URL_DATOS_MATRICULA = '/api/sivu/tableros/matricula-2025'
/**
 * Datos de la matrícula 2000-2025: el JSON que genera
 * apps/web/datos-tableros/matricula-historica/etl_matricula_historica.py,
 * servido tal cual desde apps/web/public (no pasa por la base).
 */
export const URL_DATOS_MATRICULA_HISTORICA = '/tableros/matricula-historica/datos/matricula.json'
/** Datos del tablero de los fondos, desde la base (apps/server/src/sivu/tableros/datos-fondos.ts). */
export const URL_DATOS_FONDOS = '/api/sivu/tableros/fondos-2026'

/**
 * Datos de la batería de indicadores: archivos que genera su ETL
 * (definiciones.js, vistas.js, geo.js y v/<vista>.js), servidos tal cual desde
 * apps/web/public/tableros/bateria-indicadores/datos/. Ver bateria/LEEME.md.
 */
export const URL_DATOS_BATERIA = '/tableros/bateria-indicadores/datos'

/** id del <main>: destino del enlace "Saltar al contenido". */
export const ID_CONTENIDO = 'contenido'

/** Logos en blanco de la cabecera y el pie, los mismos de /odes (apps/web/public/odes/img). */
export const LOGO_CABECERA = { src: '/odes/img/logo-observatorio-blanco.png', ancho: 1319, alto: 390 }
export const LOGO_PIE = { src: '/odes/img/logo-sapiencia-alcaldia-blanco.png', ancho: 720, alto: 255 }
