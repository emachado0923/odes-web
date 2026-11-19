import type {
  FiltrosTableroPai,
  IndicadorTableroPai,
  TableroPai,
} from '../api-pai.js';
import { claveNormalizada } from '../../repositorio/dominio/normalizacion.js';

/**
 * Filtros del tablero en el servidor (GET /admin/exportar.csv), con la misma
 * semántica que documenta FiltrosTableroPai en api-pai.ts y que aplica la web
 * en /pai (valores vacíos o null = sin filtro):
 *   dependencia/proceso/riesgo: ids; programa/linea/dimension: texto exacto
 *   del proceso; tipo: proceso | proyecto; estado: el del bimestre abierto
 *   (sin bimestre abierto no aplica); q: el código o el nombre (cada uno por
 *   separado) contiene el texto, sin distinguir mayúsculas ni tildes.
 */

function vacio(valor: unknown): boolean {
  return valor === undefined || valor === null || valor === '';
}

export function filtrarIndicadoresTablero(
  tablero: Pick<
    TableroPai,
    'vigencia' | 'procesos' | 'acciones' | 'indicadores'
  >,
  filtros: FiltrosTableroPai,
): IndicadorTableroPai[] {
  const procesos = new Map(tablero.procesos.map((p) => [p.id, p]));
  const acciones = new Map(tablero.acciones.map((a) => [a.id, a]));
  const bimestre = tablero.vigencia.bimestreAbierto;
  const busqueda = vacio(filtros.q) ? '' : claveNormalizada(filtros.q ?? '');
  return tablero.indicadores.filter((indicador) => {
    const proceso = procesos.get(indicador.procesoId);
    if (!proceso) return false;
    if (
      !vacio(filtros.dependencia) &&
      proceso.dependenciaId !== filtros.dependencia
    ) {
      return false;
    }
    if (!vacio(filtros.proceso) && proceso.id !== filtros.proceso) return false;
    if (!vacio(filtros.programa) && proceso.programa !== filtros.programa) {
      return false;
    }
    if (
      !vacio(filtros.linea) &&
      proceso.lineaPlanDesarrollo !== filtros.linea
    ) {
      return false;
    }
    if (
      !vacio(filtros.dimension) &&
      proceso.dimensionPlanEstrategico !== filtros.dimension
    ) {
      return false;
    }
    if (!vacio(filtros.tipo) && proceso.tipo !== filtros.tipo) return false;
    if (!vacio(filtros.riesgo)) {
      const accion = acciones.get(indicador.accionId);
      if (!accion?.riesgoIds.includes(filtros.riesgo as number)) return false;
    }
    if (
      !vacio(filtros.estado) &&
      bimestre !== null &&
      indicador.estados[bimestre - 1] !== filtros.estado
    ) {
      return false;
    }
    // Como la web: el código o el nombre por separado (no el texto unido).
    if (
      busqueda &&
      !claveNormalizada(indicador.codigo).includes(busqueda) &&
      !claveNormalizada(indicador.nombre).includes(busqueda)
    ) {
      return false;
    }
    return true;
  });
}
