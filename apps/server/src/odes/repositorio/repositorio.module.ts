import { Logger, Module } from '@nestjs/common';
import {
  plantillaUrlDesdeEntorno,
  rutaIndiceDesdeEntorno,
} from './configuracion-repositorio.js';
import { RepositorioSqlite } from './repositorio-sqlite.js';
import { RepositorioOdes } from './repositorio.tipos.js';
import { crearConstructorUrl } from './url-documento.js';

/**
 * Índice del repositorio del Observatorio (SQLite FTS5, solo lectura).
 * Exporta el proveedor del token `RepositorioOdes`.
 *
 * Configuración (process.env, ya con apps/server/.env cargado por main.ts):
 * ODES_INDICE y ODES_URL_DOCUMENTO; ver configuracion-repositorio.ts. Si el
 * índice no existe el servidor arranca igual (el repositorio queda "no
 * disponible" con un aviso). Una ODES_URL_DOCUMENTO inválida sí impide
 * arrancar, con un mensaje claro, igual que el resto de la configuración.
 */
@Module({
  providers: [
    {
      provide: RepositorioOdes,
      useFactory: (): RepositorioOdes =>
        new RepositorioSqlite({
          rutaIndice: rutaIndiceDesdeEntorno(),
          construirUrl: crearConstructorUrl(plantillaUrlDesdeEntorno()),
          registro: new Logger('RepositorioOdes'),
        }),
    },
  ],
  exports: [RepositorioOdes],
})
export class RepositorioModule {}
