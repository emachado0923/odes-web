import { Controller, Get, Header } from '@nestjs/common';

export interface EstadoSalud {
  estado: 'ok';
  servicio: string;
  tiempoActivoSegundos: number;
  marcaTiempo: string;
}

/** GET /api/salud: chequeo de vida para despliegues, balanceadores y monitoreo. */
@Controller('salud')
export class SaludController {
  @Get()
  @Header('Cache-Control', 'no-store')
  obtenerEstado(): EstadoSalud {
    return {
      estado: 'ok',
      servicio: 'sapiencia-web',
      tiempoActivoSegundos: Math.round(process.uptime()),
      marcaTiempo: new Date().toISOString(),
    };
  }
}
