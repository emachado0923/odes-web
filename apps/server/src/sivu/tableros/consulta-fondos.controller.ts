import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { inflateSync } from 'node:zlib';
import type { RowDataPacket } from 'mysql2/promise';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { ErrorRepositorioHttp, solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import { validarPeticionAdmin } from '../../repositorio/guardia-admin.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { ipCliente } from '../../repositorio/http/peticion.js';
import { claveLimiteIp } from '../../seguridad/clave-ip.js';
import { COOKIE_SESION_TABLEROS, ServicioSesionesTableros } from '../acceso/acceso-tableros.js';
import { FuenteFondosSapiencia } from './fondos-sapiencia/fuente-sapiencia.js';

/** Consultas por usuario y hora: una ventanilla se usa caso por caso; más que esto es un barrido. */
export const TOPE_CONSULTAS_POR_HORA = 300;

/** Fila con el diccionario de compresión de las fichas (etl_consulta.py); la búsqueda nunca la acepta. */
const DOCUMENTO_DICCIONARIO = '__DICCIONARIO__';

/**
 * Una ficha guardada: JSON tal cual o, como la escribe hoy etl_consulta.py, zlib con el diccionario
 * de las etiquetas en base64 (así la carga pesa ~65 MB en vez de ~170 MB).
 */
export function leerFicha(guardada: string, diccionario: Buffer | null): unknown {
  if (guardada.startsWith('{')) return JSON.parse(guardada);
  const opciones = diccionario ? { dictionary: diccionario } : {};
  return JSON.parse(inflateSync(Buffer.from(guardada, 'base64'), opciones).toString('utf8'));
}

/** Mismo criterio del ETL (etl_consulta.py, doc()): mayúsculas, sin espacios, puntos ni guiones. */
export function normalizarDocumento(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const documento = texto.replaceAll(/[\s.-]/g, '').toUpperCase();
  return /^[A-Z0-9]{3,40}$/.test(documento) ? documento : null;
}

/**
 * Ventanilla de consulta de los fondos (/tableros/fondos-2026):
 *   POST /api/sivu/tableros/fondos-2026/consulta  <- { documento } -> { documento, fichas }
 *
 * Datos personales: exige la sesión de los tableros, viene del mismo sitio con
 * X-CSRF-Token (es POST para que el documento no quede en la URL ni en los
 * logs), busca solo por documento exacto, deja cada consulta en
 * sivu_tablero_fondos_2026_consultas y corta en TOPE_CONSULTAS_POR_HORA.
 * Las fichas las carga etl_consulta.py (migración 009). Con FONDOS_CONSULTA_ORIGEN=sapiencia (pruebas
 * en local), salen en vivo de la base de Sapiencia (fondos-sapiencia/): mismo formato, misma bitácora.
 */
@Controller('sivu/tableros/fondos-2026/consulta')
@UseFilters(FiltroErroresRepositorio)
export class ConsultaFondosController {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioSesionesTableros) private readonly sesiones: ServicioSesionesTableros,
    @Inject(FuenteFondosSapiencia) private readonly sapiencia: FuenteFondosSapiencia,
  ) {}

  /** De dónde salen las fichas: «carga» (Power BI, con corte) o «sapiencia» (en vivo). La pantalla ajusta sus textos. */
  @Get()
  async origen(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await validarPeticionAdmin(req, this.sesiones, COOKIE_SESION_TABLEROS);
    res.setHeader('Cache-Control', 'no-store');
    return { origen: this.sapiencia.activa ? 'sapiencia' : 'carga' };
  }

  @Post()
  @HttpCode(200)
  async consultar(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() cuerpo: unknown) {
    const sesion = await validarPeticionAdmin(req, this.sesiones, COOKIE_SESION_TABLEROS);
    res.setHeader('Cache-Control', 'no-store');
    const documento = normalizarDocumento((cuerpo as { documento?: unknown } | null)?.documento);
    if (!documento) throw solicitudInvalida('Escriba un número de documento válido (solo letras y números).');

    const ahora = new Date();
    const haceUnaHora = new Date(ahora.getTime() - 3_600_000);
    const [{ n }] = await this.bd.filas<RowDataPacket>(
      'SELECT COUNT(*) AS n FROM sivu_tablero_fondos_2026_consultas WHERE usuario = ? AND creado_en > ?',
      [sesion.usuario, haceUnaHora],
    );
    if (Number(n) >= TOPE_CONSULTAS_POR_HORA) {
      throw new ErrorRepositorioHttp(429, 'demasiados_intentos', 'Llegó al tope de consultas por hora. Intente más tarde.');
    }

    const fichas = this.sapiencia.activa ? await this.sapiencia.fichas(documento) : await this.fichasCargadas(documento);
    await this.bd.ejecutar(
      'INSERT INTO sivu_tablero_fondos_2026_consultas (usuario, documento, resultados, ip, creado_en) VALUES (?, ?, ?, ?, ?)',
      [sesion.usuario, documento, fichas.length, claveLimiteIp(ipCliente(req)).slice(0, 45), ahora],
    );
    return { documento, origen: this.sapiencia.activa ? 'sapiencia' : 'carga', fichas };
  }

  /** Las fichas cargadas desde el Power BI (sivu_tablero_fondos_2026_fichas). */
  private async fichasCargadas(documento: string): Promise<unknown[]> {
    // El diccionario viaja con cada consulta (unos 2 KB): si se recargan las fichas, nunca queda uno viejo en memoria.
    const leidas = await this.bd.filas<RowDataPacket>(
      'SELECT documento, ficha FROM sivu_tablero_fondos_2026_fichas WHERE documento IN (?, ?) ORDER BY id',
      [documento, DOCUMENTO_DICCIONARIO],
    );
    const fila = leidas.find((f) => f.documento === DOCUMENTO_DICCIONARIO);
    const diccionario = fila ? Buffer.from(String(fila.ficha), 'base64') : null;
    return leidas.filter((f) => f.documento !== DOCUMENTO_DICCIONARIO).map((f) => leerFicha(String(f.ficha), diccionario));
  }
}
