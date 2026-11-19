/**
 * Logos del tablero de matrícula: copias de img/ del tablero estático
 * (Octubre/tablero_educ_sup_2025). Pasan por Vite (nombre con hash, caché
 * larga en /assets/) y se sirven desde el propio servidor (CSP 'self').
 * - logo-observatorio.png: el de la cabecera y la bienvenida. Trae pintado el
 *   azul de la cabecera (#0E5074): si cambia uno, hay que cambiar el otro.
 * - logo-sapiencia-alcaldia.png: la pata del pie, con su fondo blanco.
 *
 * El resto de la rama usa los logos en blanco de /odes (ver ../rutas.ts).
 */
import logoObservatorio from './img/logo-observatorio.png'
import logoSapienciaAlcaldia from './img/logo-sapiencia-alcaldia.png'

export const LOGO_OBSERVATORIO = { src: logoObservatorio, ancho: 1200, alto: 354 }
export const LOGO_SAPIENCIA_ALCALDIA = { src: logoSapienciaAlcaldia, ancho: 900, alto: 458 }
