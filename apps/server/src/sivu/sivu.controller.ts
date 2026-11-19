import { Controller, Get } from '@nestjs/common';
import { SivuService, type InformacionSivu } from './sivu.service.js';

/** Rutas bajo /api/sivu. */
@Controller('sivu')
export class SivuController {
  constructor(private readonly sivuService: SivuService) {}

  @Get()
  obtenerInformacion(): InformacionSivu {
    return this.sivuService.obtenerInformacion();
  }
}
