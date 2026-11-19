import { Controller, Get } from '@nestjs/common';
import { OdesService, type InformacionOdes } from './odes.service.js';

/** Rutas bajo /api/odes. */
@Controller('odes')
export class OdesController {
  constructor(private readonly odesService: OdesService) {}

  @Get()
  obtenerInformacion(): InformacionOdes {
    return this.odesService.obtenerInformacion();
  }
}
