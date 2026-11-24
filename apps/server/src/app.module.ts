import { Module } from '@nestjs/common';
import { CrmModule } from './crm/crm.module.js';
import { OdesModule } from './odes/odes.module.js';
import { PaiModule } from './pai/pai.module.js';
import { RepositorioProductosModule } from './repositorio/repositorio-productos.module.js';
import { SaludModule } from './salud/salud.module.js';
import { SivuModule } from './sivu/sivu.module.js';

/**
 * Módulo raíz: solo la API (prefijo global "api"). El front-end compilado se
 * sirve aparte, en configurarAplicacion() (ver src/frontend/frontend.ts).
 */
@Module({
  imports: [
    SaludModule,
    SivuModule,
    OdesModule,
    RepositorioProductosModule,
    PaiModule,
    CrmModule,
  ],
})
export class AppModule {}
