import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type {
  FichaIndicadorPai,
  RespuestaReportePai,
  TableroPai,
  VigenciaPai,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  bimestreDeRuta,
  idDeRuta,
  vigenciaDeConsulta,
} from '../compartido/validacion-comun.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { GuardiaPai, SesionPai } from '../sesion/guardia-pai.js';
import { ServicioIndicadoresPai } from '../servicios/servicio-indicadores.js';
import { ServicioReportesPai } from '../servicios/servicio-reportes.js';
import { ServicioTableroPai } from '../servicios/servicio-tablero.js';
import { ServicioVigenciaPai } from '../servicios/servicio-vigencia.js';

/**
 * Consulta y reportes (ambos roles; escribir solo el responsable):
 *   GET /api/pai/vigencia[?vigencia=]                 -> VigenciaPai
 *   GET /api/pai/tablero[?vigencia=]                  -> TableroPai
 *   GET /api/pai/indicadores/:ref[?vigencia=]         -> FichaIndicadorPai
 *   PUT /api/pai/indicadores/:id/bimestres/:b         <- DatosReportePai -> RespuestaReportePai
 */
@Controller('pai/vigencia')
@UseGuards(GuardiaPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiVigenciaController {
  constructor(
    @Inject(ServicioVigenciaPai)
    private readonly vigencias: ServicioVigenciaPai,
  ) {}

  @Get()
  obtener(@Query('vigencia') vigencia: unknown): Promise<VigenciaPai> {
    return this.vigencias.obtener(vigenciaDeConsulta(vigencia));
  }
}

@Controller('pai/tablero')
@UseGuards(GuardiaPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiTableroController {
  constructor(
    @Inject(ServicioTableroPai) private readonly tablero: ServicioTableroPai,
  ) {}

  @Get()
  obtener(
    @SesionPai() sesion: SesionValidaPai,
    @Query('vigencia') vigencia: unknown,
  ): Promise<TableroPai> {
    return this.tablero.obtener(sesion, vigenciaDeConsulta(vigencia));
  }
}

@Controller('pai/indicadores')
@UseGuards(GuardiaPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiIndicadoresController {
  constructor(
    @Inject(ServicioIndicadoresPai)
    private readonly indicadores: ServicioIndicadoresPai,
    @Inject(ServicioReportesPai) private readonly reportes: ServicioReportesPai,
  ) {}

  @Get(':ref')
  ficha(
    @SesionPai() sesion: SesionValidaPai,
    @Param('ref') ref: string,
    @Query('vigencia') vigencia: unknown,
  ): Promise<FichaIndicadorPai> {
    return this.indicadores.ficha(sesion, ref, vigenciaDeConsulta(vigencia));
  }

  @Put(':id/bimestres/:b')
  guardarReporte(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Param('b') b: string,
    @Body() cuerpo: unknown,
  ): Promise<RespuestaReportePai> {
    return this.reportes.guardar(
      sesion,
      idDeRuta(id, 'El indicador'),
      bimestreDeRuta(b),
      cuerpo,
    );
  }
}
