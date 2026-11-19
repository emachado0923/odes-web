import { Module } from '@nestjs/common';
import { RepositorioProductosModule } from '../repositorio/repositorio-productos.module.js';
import { ServicioSesionesTableros } from './acceso/acceso-tableros.js';
import { SesionTablerosController } from './acceso/sesion-tableros.controller.js';
import { SivuController } from './sivu.controller.js';
import { SivuService } from './sivu.service.js';
import { ConsultaFondosController } from './tableros/consulta-fondos.controller.js';
import { FuenteFondosSapiencia } from './tableros/fondos-sapiencia/fuente-sapiencia.js';
import { TablerosController } from './tableros/tableros.controller.js';
import { ServicioTableros } from './tableros/tableros.service.js';

/**
 * Rama /sivu (SIVU: Sistema de Visualización de Datos) y sus tableros:
 *
 *   /api/sivu                   información de la rama
 *   /api/sivu/sesion            sesión de los tableros privados (../acceso)
 *   /api/sivu/tableros/fondos-2026/consulta  ventanilla de los fondos (POST, privada)
 *   /api/sivu/tableros/:id      datos de un tablero, desde la base del
 *                               repositorio (el catálogo sivu_tableros y
 *                               las tablas del tablero, sivu_tablero_<id>_*)
 *
 * Toma la conexión (BaseDatosRepositorio) del módulo del repositorio.
 */
@Module({
  imports: [RepositorioProductosModule],
  controllers: [SivuController, ConsultaFondosController, TablerosController, SesionTablerosController],
  providers: [SivuService, ServicioTableros, ServicioSesionesTableros, FuenteFondosSapiencia],
})
export class SivuModule {}
