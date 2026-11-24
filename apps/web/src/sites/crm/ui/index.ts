/**
 * Piezas de la interfaz del CRM (lenguaje visual en ../crm.css; se ven todas
 * juntas en /crm/muestrario con `npm run dev`).
 *
 * Reglas de uso:
 * - Una sola acción principal (magenta, crm-boton-primario) por vista; el
 *   resto, secundario o fantasma. crm-boton-peligro para borrar.
 * - Blanco = se pulsa: tarjetas y controles van en blanco sobre el fondo; lo
 *   que solo ordena (columnas, secciones) no lleva caja ni sombra.
 * - El color de estado siempre va con su texto (ChipEstado, MarcaEstado).
 * - Textos de usted, en voz activa: «Mover a En proceso», «Subir entregable».
 */
export { default as Avatar, type TamanoAvatar } from './Avatar'
export { default as Campo } from './Campo'
export { default as ChipEstado } from './ChipEstado'
export { default as Dialogo } from './Dialogo'
export { Cargando, ErrorCarga, Vacio } from './Estados'
export { default as Icono, type NombreIcono } from './Icono'
export { default as ListaArchivos } from './ListaArchivos'
export { default as MarcaEstado } from './MarcaEstado'
export { default as Migas } from './Migas'
export { default as PanelLateral } from './PanelLateral'
export { default as ProgresoSubida } from './ProgresoSubida'
export { default as ProveedorAvisos } from './ProveedorAvisos'
export { default as Tablero, type PropsTablero } from './Tablero'
export { default as TarjetaPersona } from './TarjetaPersona'
export { default as TarjetaTarea } from './TarjetaTarea'
export { default as ZonaArchivos } from './ZonaArchivos'

export { extensionDe, formatosLegibles, tipoArchivo, validarArchivo, type ReglasArchivo, type TipoArchivo } from './archivos'
export { useAvisar, type Avisar, type TipoAviso } from './avisos'
export { ariaCampo } from './campos'
export { COLORES_PERSONA, colorPersona, type ColorPersona } from './colores'
export {
  diaDe,
  diasEntre,
  fechaCorta,
  fechaHora,
  fechaLarga,
  hoyBogota,
  plural,
  saludo,
  textoFechaTarea,
  unirConY,
  type TextoFecha,
  type TonoFecha,
} from './formato'
export { TITULO_CRM, tituloDocumento, useTituloCrm } from './titulo'
