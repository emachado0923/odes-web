/**
 * Mantenimiento de las evidencias del PAI:
 * 1. Libera las fichas del almacén del PAI (pai_almacen_archivos) que ya no
 *    usa ninguna evidencia, con sus trozos: quedan, por ejemplo, cuando
 *    `pai:cargar-fichas --forzar` borró reportes con evidencias. No toca el
 *    almacén ni el bucket del repositorio (eso es de repositorio:importar).
 * 2. Con Supabase Storage, revisa el bucket PRIVADO de las evidencias
 *    (PAI_SUPABASE_BUCKET): purga las subidas directas pendientes vencidas
 *    (pai_subidas), y borra los objetos de evidencias/ que ya no tienen fila
 *    en pai_evidencias (un borrado que no alcanzó a quitar el objeto, una
 *    subida que falló a mitad) con más de una hora y los de subidas/ sin
 *    fila en pai_subidas.
 *
 *   npm run pai:recolectar-evidencias
 *
 * Usa la conexión de la aplicación (apps/server/.env).
 */
import { cargarArchivoEnv } from '../../config/configuracion.js';
import { abrirBaseDatos, ejecutarCli } from '../../repositorio/cli/comun.js';
import { cargarConfiguracionPai } from '../configuracion-pai.js';
import { crearAlmacenEvidencias } from '../evidencias/almacen-evidencias.js';

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const configPai = cargarConfiguracionPai(process.env);
  const bd = await abrirBaseDatos();
  try {
    const almacen = crearAlmacenEvidencias(bd, configPai);
    const { archivos: fichas } = await almacen.recolectarFichasHuerfanas();
    console.log(
      fichas === 1
        ? '1 ficha de evidencia sin uso liberada.'
        : `${fichas} fichas de evidencias sin uso liberadas.`,
    );
    if (!almacen.directa) {
      console.log(
        'Sin Supabase Storage: las evidencias están en la base; no hay bucket privado que revisar.',
      );
      return 0;
    }
    const { objetos, subidas } = await almacen.recolectarHuerfanos();
    console.log(
      `Bucket ${configPai.bucketEvidencias}: ${objetos} objetos sin evidencia y ${subidas} subidas directas vencidas o sin terminar borrados.`,
    );
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
