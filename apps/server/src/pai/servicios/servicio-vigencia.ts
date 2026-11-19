import { Inject, Injectable } from '@nestjs/common';
import type { VigenciaPai } from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { bimestreAbiertoAhora } from '../dominio/reglas-edicion.js';
import { validarDatosVigencia } from '../dominio/validacion-pai.js';
import { prohibido } from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import {
  aniosVigencias,
  aVigenciaPai,
  type ConsultorPai,
  consultorDe,
  type FilaVigenciaPai,
  leerVigencia,
} from './lectura-pai.js';

/**
 * Vigencia (pai_vigencias): la más reciente salvo `?vigencia=` (404 si no
 * existe). abiertoAhora se calcula en cada petición con la hora actual (no
 * hay temporizadores: Vercel congela la función). PUT /admin/vigencia abre
 * (1-6, fecha límite opcional y futura) o cierra el bimestre y registra
 * 'abrir_bimestre' / 'cerrar_bimestre' con registrarEnPai, en la misma
 * transacción.
 */
@Injectable()
export class ServicioVigenciaPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {}

  /** Fila y VigenciaPai de `anio` (null = la más reciente). */
  async leer(
    anio: number | null,
    ahora = new Date(),
    consultar: ConsultorPai = consultorDe(this.bd),
  ): Promise<{ fila: FilaVigenciaPai; vigencia: VigenciaPai }> {
    const fila = await leerVigencia(consultar, anio);
    const anios = await aniosVigencias(consultar);
    return {
      fila,
      vigencia: aVigenciaPai(
        fila,
        anios,
        ahora,
        bimestreAbiertoAhora(fila.bimestreAbierto, fila.abiertoHasta, ahora),
      ),
    };
  }

  /** VigenciaPai de `anio` (null = la más reciente). */
  async obtener(anio: number | null): Promise<VigenciaPai> {
    return (await this.leer(anio)).vigencia;
  }

  async actualizar(
    sesion: SesionValidaPai,
    cuerpo: unknown,
    anio: number | null,
  ): Promise<VigenciaPai> {
    if (sesion.rol !== 'administrador') {
      throw prohibido('Solo el administrador abre o cierra el bimestre.');
    }
    const ahora = new Date();
    const datos = validarDatosVigencia(cuerpo, ahora);
    const anioActualizado = await this.bd.transaccion(async (conexion) => {
      const consultar = consultorDe(this.bd, conexion);
      const antes = await leerVigencia(consultar, anio, { bloquear: true });
      await conexion.query(
        'UPDATE pai_vigencias SET bimestre_abierto = ?, abierto_hasta = ?, actualizado_por = ? WHERE id = ?',
        [datos.bimestreAbierto, datos.abiertoHasta, sesion.usuarioId, antes.id],
      );
      await registrarEnPai(conexion, {
        accion:
          datos.bimestreAbierto === null ? 'cerrar_bimestre' : 'abrir_bimestre',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        bimestre: datos.bimestreAbierto ?? antes.bimestreAbierto,
        fecha: ahora,
        detalle: {
          vigencia: antes.anio,
          antes: {
            bimestreAbierto: antes.bimestreAbierto,
            abiertoHasta: antes.abiertoHasta?.toISOString() ?? null,
          },
          despues: {
            bimestreAbierto: datos.bimestreAbierto,
            abiertoHasta: datos.abiertoHasta?.toISOString() ?? null,
          },
        },
      });
      return antes.anio;
    });
    return this.obtener(anioActualizado);
  }
}
