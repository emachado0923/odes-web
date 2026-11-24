import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CuentaCorreoCrm, ResultadoPruebaCorreoCrm } from '../api-crm.js';
import { ServicioPersonasCrm } from '../personas/servicio-personas-crm.js';
import { GuardiaLiderCrm, SesionLider } from '../sesion/guardia-lider.js';
import { demasiadosIntentos, solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import {
  MENSAJE_PARA_FALTA,
  resultadoPrueba,
  ServicioCuentaCorreoCrm,
  TOPE_PRUEBAS_POR_HORA,
  TopeEnMemoria,
  validarPruebaCorreo,
} from './cuenta-correo.js';
import { ServicioCorreoCrm } from './servicio-correo-crm.js';
import { describirErrorCorreo } from './transporte.js';

/** Quién hizo el cambio, para actualizado_por y el log: el nombre de la sesión del líder. */
function nombreSesion(sesion: SesionValida): string {
  return sesion.nombre?.trim() || sesion.usuario;
}

/**
 * Cuenta de correo del CRM, en la pantalla de correos del líder (GuardiaLiderCrm):
 *
 *   GET    /api/crm/lider/correo/cuenta  -> CuentaCorreoCrm (nunca la clave)
 *   PUT    /api/crm/lider/correo/cuenta  <- GuardarCuentaCorreoCrm (JSON) -> CuentaCorreoCrm
 *   DELETE /api/crm/lider/correo/cuenta  -> CuentaCorreoCrm
 *   POST   /api/crm/lider/correo/prueba  <- PruebaCorreoCrm (JSON) -> ResultadoPruebaCorreoCrm
 *
 * Si mandan las variables CRM_CORREO_*, PUT y DELETE responden 409. La prueba
 * sale ya, con la cuenta efectiva, y no se guarda en crm_correos; máximo
 * TOPE_PRUEBAS_POR_HORA por hora en cada instancia (429).
 */
@Controller('crm/lider/correo')
@UseGuards(GuardiaLiderCrm)
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class CuentaCorreoLiderCrmController {
  private readonly registro = new Logger('CRM');
  private readonly tope = new TopeEnMemoria(TOPE_PRUEBAS_POR_HORA, 60 * 60 * 1000);

  constructor(
    @Inject(ServicioCuentaCorreoCrm) private readonly cuentas: ServicioCuentaCorreoCrm,
    @Inject(ServicioCorreoCrm) private readonly correo: ServicioCorreoCrm,
    @Inject(ServicioPersonasCrm) private readonly personas: ServicioPersonasCrm,
  ) {}

  @Get('cuenta')
  obtener(): Promise<CuentaCorreoCrm> {
    return this.cuentas.obtener();
  }

  @Put('cuenta')
  guardar(@Req() req: Request, @Body() cuerpo: unknown, @SesionLider() sesion: SesionValida): Promise<CuentaCorreoCrm> {
    if (!req.is('application/json')) throw solicitudInvalida('Envíe los datos de la cuenta como JSON.');
    return this.cuentas.guardar(cuerpo, nombreSesion(sesion));
  }

  @Delete('cuenta')
  borrar(@SesionLider() sesion: SesionValida): Promise<CuentaCorreoCrm> {
    return this.cuentas.borrar(nombreSesion(sesion));
  }

  @Post('prueba')
  @HttpCode(200)
  async probar(
    @Req() req: Request,
    @Body() cuerpo: unknown,
    @SesionLider() sesion: SesionValida,
  ): Promise<ResultadoPruebaCorreoCrm> {
    // Sin cuerpo vale (la prueba va al líder); con cuerpo, debe ser JSON.
    if (req.is('application/json') === false) throw solicitudInvalida('Envíe { para } como JSON.');
    const pedido = validarPruebaCorreo(cuerpo).para;
    const para = pedido ?? (await this.personas.lider())?.correo ?? null;
    if (!para) throw solicitudInvalida(MENSAJE_PARA_FALTA, { para: MENSAJE_PARA_FALTA });

    const espera = this.tope.tomar();
    if (espera > 0) {
      throw demasiadosIntentos(
        espera,
        `Ya se enviaron ${TOPE_PRUEBAS_POR_HORA} correos de prueba en la última hora: espere un rato y vuelva a intentarlo.`,
      );
    }
    let resultado: Awaited<ReturnType<ServicioCorreoCrm['enviarPrueba']>>;
    try {
      resultado = await this.correo.enviarPrueba(para);
    } catch (error) {
      this.tope.devolver();
      throw error;
    }
    // Sin cuenta no salió nada: no gasta cupo.
    if (resultado.estado === 'sin_configurar') this.tope.devolver();
    const detalle =
      resultado.estado === 'error' ? `no salió [${describirErrorCorreo(resultado.error, resultado.smtp).codigo}]` : resultado.estado;
    this.registro.log(`Correo de prueba del CRM pedido por ${nombreSesion(sesion)}: ${detalle}.`);
    return resultadoPrueba(resultado, para);
  }
}
