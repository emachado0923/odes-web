import type { BaseDatosRepositorio } from '../bd/base-datos.js';
import { type AlmacenArchivos, AlmacenArchivosBd } from './almacen-archivos.js';
import { AlmacenArchivosSupabase } from './almacen-supabase.js';

/**
 * El almacén de archivos que corresponde a la configuración: Supabase Storage
 * si hay REPOSITORIO_SUPABASE_*, o dentro de la base (trozos).
 */
export function crearAlmacenArchivos(bd: BaseDatosRepositorio): AlmacenArchivos {
  const supabase = bd.almacenamiento;
  return supabase ? new AlmacenArchivosSupabase(bd, supabase) : new AlmacenArchivosBd(bd);
}
