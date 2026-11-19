import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import {
  aFilasFondos,
  armarFondos,
  type ConjuntoFondos,
  ErrorDatosFondos,
  type FilasFondos,
  type FilasLeidasFondos,
  ID_TABLERO_FONDOS,
  leerArchivosFondos,
  validarFondos,
} from './datos-fondos.js';

const CARPETA = join(RAIZ_SERVIDOR, 'datos', 'tableros', ID_TABLERO_FONDOS);

/** Lo que devolvería la base con las filas de aFilasFondos (los bigint de Postgres llegan como texto). */
function comoLeidas(filas: FilasFondos, titulo: string): FilasLeidasFondos {
  const [corte, periodoActual, fuente, generado, totalBeneficios, filasOrigen, excluidos] = filas.meta;
  return {
    titulo,
    meta: { corte, periodo_actual: periodoActual, fuente, generado, beneficios: totalBeneficios, filas_origen: filasOrigen, excluidos },
    programas: filas.programas.map(([indice, clave, nombre, corto, linea]) => ({ indice, clave, nombre, corto, linea })),
    categorias: filas.categorias.map(([dimension, indice, nombre]) => ({ dimension, indice, nombre })),
    estados: filas.estados.map(([programa, convocatoria, periodo, estado, beneficios]) => ({ programa, convocatoria, periodo, estado, beneficios })),
    giros: filas.giros.map(([programa, periodo, monto, matricula, sostenimiento, conGiro]) => ({
      programa,
      periodo,
      monto: String(monto),
      matricula: matricula === null ? null : String(matricula),
      sostenimiento: sostenimiento === null ? null : String(sostenimiento),
      con_giro: conGiro,
    })),
    cohortes: filas.cohortes.map(([programa, convocatoria, estado, beneficios]) => ({ programa, convocatoria, estado, beneficios })),
    activos: filas.activos.map(([tipo, programa, periodo, categoria, beneficios]) => ({ tipo, programa, periodo, categoria, beneficios })),
    destinos: filas.destinos.map(([convocatoria, pais, beneficios]) => ({ convocatoria, pais, beneficios })).toReversed(),
  };
}

describe('datos del tablero de los fondos', () => {
  it('los archivos de datos/tableros/fondos-2026 son válidos y van y vuelven de las tablas sin cambios', async () => {
    const { fondos, definiciones } = await leerArchivosFondos(join(CARPETA, 'fondos.json'), join(CARPETA, 'definiciones.json'));
    const filas = aFilasFondos(fondos, definiciones);
    expect(filas.tablero).toMatchObject({ id: 'fondos-2026', titulo: fondos.meta.titulo });
    expect(filas.activos.length).toBe(fondos.sexo.length + fondos.comunas.length + fondos.ies.length);
    expect(armarFondos(comoLeidas(filas, fondos.meta.titulo))).toEqual(fondos);
  });

  it('solo trae cifras agregadas: ningún campo con nombre de dato personal', async () => {
    const { fondos } = await leerArchivosFondos(join(CARPETA, 'fondos.json'), join(CARPETA, 'definiciones.json'));
    const texto = JSON.stringify(fondos).toLowerCase();
    for (const campo of ['documento', 'correo', 'celular', 'telefono', 'direccion', 'nombre_completo']) {
      expect(texto).not.toContain(campo);
    }
    // Sexo, comuna e institución nunca se cruzan con el estado: sus filas tienen 4 valores.
    for (const fila of [...fondos.sexo, ...fondos.comunas, ...fondos.ies]) expect(fila).toHaveLength(4);
  });

  it('rechaza un archivo con posiciones fuera de sus dimensiones o campos que faltan', async () => {
    const { fondos } = await leerArchivosFondos(join(CARPETA, 'fondos.json'), join(CARPETA, 'definiciones.json'));
    const dañado = structuredClone(fondos) as ConjuntoFondos;
    dañado.estados[0] = [fondos.dim.programa.length, 0, 0, 0, 1];
    expect(() => validarFondos(dañado)).toThrow(ErrorDatosFondos);
    const sinPeriodo = structuredClone(fondos) as ConjuntoFondos;
    sinPeriodo.meta.periodoActual = '1999-1';
    expect(() => validarFondos(sinPeriodo)).toThrow(/periodoActual/);
    const giroNegativo = structuredClone(fondos) as ConjuntoFondos;
    giroNegativo.giros[0]![2] = -5;
    expect(() => validarFondos(giroNegativo)).toThrow(/giros\[0\]\[2\]/);
    expect(() => validarFondos(null)).toThrow(ErrorDatosFondos);
  });
});
