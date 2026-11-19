import { Controller, Get, NotFoundException, Param, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { validarPeticionAdmin } from '../../repositorio/guardia-admin.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { COOKIE_SESION_TABLEROS, ServicioSesionesTableros } from '../acceso/acceso-tableros.js';
import { ServicioTableros } from './tableros.service.js';

/**
 * GET /api/sivu/tableros/:id: los datos de un tablero de SIVU, desde la base
 * (la página es /tableros/:id). Hoy: "matricula-2025" (público) y
 * "fondos-2026" (privado: pide la sesión de tableros, ver ../acceso). Los
 * tableros se registran en tableros.service.ts.
 *
 * no-cache + ETag: el navegador guarda la respuesta (unos cientos de KB) y la
 * revalida; si no cambió recibe un 304 sin cuerpo. Sin base: 503, como el
 * repositorio (los errores pasan por el mismo filtro y salen en JSON).
 */
@Controller('sivu/tableros')
@UseFilters(FiltroErroresRepositorio)
export class TablerosController {
  constructor(
    private readonly tableros: ServicioTableros,
    private readonly sesiones: ServicioSesionesTableros,
  ) {}

  @Get(':id')
  async obtener(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.tableros.existe(id)) throw new NotFoundException('No existe ese tablero.');
    const privado = this.tableros.esPrivado(id);
    // Un tablero privado exige la sesión de tableros (401 sin ella).
    if (privado) await validarPeticionAdmin(req, this.sesiones, COOKIE_SESION_TABLEROS);
    const { cuerpo, etag } = await this.tableros.respuesta(id);
    if (privado) {
      res.setHeader('Cache-Control', 'private, no-cache');
      res.setHeader('Vary', 'Cookie');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(cuerpo.length));
    res.end(cuerpo);
  }
}
