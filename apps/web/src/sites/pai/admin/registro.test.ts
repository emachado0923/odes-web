import { describe, expect, it } from 'vitest'
import { ACCIONES_REGISTRO_PAI } from '../api-pai'
import {
  NOMBRES_ACCION,
  consultaRegistro,
  etiquetaCampo,
  leerFiltrosRegistro,
  lineasDetalle,
  parametrosRegistro,
  problemaIndicadorRegistro,
  textoValor,
  totalPaginas,
  valorDetalle,
  valorMostrado,
} from './registro'

describe('filtros del registro en la URL', () => {
  it('lee los filtros e ignora los valores inválidos', () => {
    expect(leerFiltrosRegistro(new URLSearchParams('pagina=3&usuario=7&indicador=SAF-TH-02&accion=guardar_reporte'))).toEqual({
      pagina: 3,
      usuario: 7,
      indicador: 'SAF-TH-02',
      accion: 'guardar_reporte',
    })
    expect(leerFiltrosRegistro(new URLSearchParams('pagina=-1&usuario=abc&accion=borrar_todo'))).toEqual({
      pagina: 1,
      usuario: null,
      indicador: '',
      accion: null,
    })
    expect(leerFiltrosRegistro(new URLSearchParams('pagina=0')).pagina).toBe(1)
  })

  it('descarta lo que el servidor rechazaría: página > 100.000 e indicador que no es id ni código', () => {
    expect(leerFiltrosRegistro(new URLSearchParams('pagina=100000')).pagina).toBe(100_000)
    expect(leerFiltrosRegistro(new URLSearchParams('pagina=100001')).pagina).toBe(1)
    expect(leerFiltrosRegistro(new URLSearchParams('indicador=SAF-TH')).indicador).toBe('')
    expect(leerFiltrosRegistro(new URLSearchParams('indicador=1001')).indicador).toBe('1001')
    expect(leerFiltrosRegistro(new URLSearchParams('indicador=saf-th-02')).indicador).toBe('saf-th-02')
  })

  it('problemaIndicadorRegistro: vacío, id o código completo (hasta 30 caracteres)', () => {
    expect(problemaIndicadorRegistro('')).toBeNull()
    expect(problemaIndicadorRegistro(' SAF-TH-02 ')).toBeNull()
    expect(problemaIndicadorRegistro('OPE-PPEP-16')).toBeNull()
    expect(problemaIndicadorRegistro('123')).toBeNull()
    expect(problemaIndicadorRegistro('SAF-TH')).toMatch(/código completo/)
    expect(problemaIndicadorRegistro('A'.repeat(31))).toMatch(/código completo/)
  })

  it('escribe solo lo que no está vacío (sin la página 1) y vuelve igual', () => {
    const filtros = { pagina: 2, usuario: 7, indicador: ' SAF-TH-02 ', accion: 'asignar' as const }
    const parametros = parametrosRegistro(filtros)
    expect(parametros.toString()).toBe('usuario=7&indicador=SAF-TH-02&accion=asignar&pagina=2')
    expect(leerFiltrosRegistro(parametros)).toEqual({ ...filtros, indicador: 'SAF-TH-02' })
    expect(parametrosRegistro({ pagina: 1, usuario: null, indicador: '', accion: null }).toString()).toBe('')
  })

  it('consultaRegistro para el cliente', () => {
    expect(consultaRegistro({ pagina: 1, usuario: null, indicador: '  ', accion: null })).toEqual({
      pagina: 1,
      usuario: null,
      indicador: null,
      accion: null,
    })
  })
})

describe('detalle de una entrada', () => {
  it('con valores anteriores y nuevos muestra solo lo que cambió, y los demás datos aparte', () => {
    expect(
      lineasDetalle({
        anterior: { avance: 2, logros: 'igual', riesgo: null },
        nuevo: { avance: 3, logros: 'igual', riesgo: 'SI' },
        origen: 'aplicativo',
      }),
    ).toEqual([
      { campo: 'avance', antes: '2', valor: '3' },
      { campo: 'riesgo', antes: '—', valor: 'SI' },
      { campo: 'origen', valor: 'aplicativo' },
    ])
  })

  it('los valores van en es-CO y en palabras: decimales con coma, fechas en hora de Colombia, códigos traducidos', () => {
    expect(
      lineasDetalle(
        {
          motivo: 'abierto',
          origenAnterior: 'importado',
          nuevo: false,
          antes: { avance: 12.5, riesgoMaterializado: null },
          despues: { avance: 1234.75, riesgoMaterializado: 'SI' },
        },
        'guardar_reporte',
      ),
    ).toEqual([
      { campo: 'avance', antes: '12,5', valor: '1.234,75' },
      { campo: 'riesgoMaterializado', antes: '—', valor: 'Sí' },
      { campo: 'motivo', valor: 'bimestre abierto' },
      { campo: 'origenAnterior', valor: 'importado de la ficha (Excel)' },
      { campo: 'nuevo', valor: 'no' },
    ])
    // Abrir el bimestre: la fecha límite (fin del 14 de diciembre en Colombia) no se ve como el 15.
    const [linea, vigencia] = lineasDetalle(
      {
        vigencia: 2026,
        antes: { bimestreAbierto: 3, abiertoHasta: null },
        despues: { bimestreAbierto: 4, abiertoHasta: '2026-12-15T04:59:59.999Z' },
      },
      'abrir_bimestre',
    ).filter((l) => l.campo === 'abiertoHasta' || l.campo === 'vigencia')
    expect(linea.antes).toBe('—')
    expect(linea.valor).toMatch(/^14 (de )?dic\.? (de )?2026, 11:59/)
    expect(vigencia.valor).toBe('2026')
    // El motivo de una autorización es el texto del administrador; el de un ingreso fallido, un código.
    expect(valorDetalle('motivo', 'abierto', 'otorgar_autorizacion')).toBe('abierto')
    expect(valorDetalle('motivo', 'contrasena', 'iniciar_sesion')).toBe('contraseña incorrecta')
    expect(valorDetalle('resultado', 'bloqueado')).toBe('bloqueado por intentos fallidos')
    expect(valorDetalle('rol', 'administrador')).toBe('Administrador(a)')
    expect(valorDetalle('tipo', 'application/pdf')).toBe('PDF')
    expect(valorDetalle('procesos', ['SAF-TH', 'DTF-GF'])).toBe('SAF-TH, DTF-GF')
    expect(valorDetalle('agregados', { procesos: ['SAF-TH'], indicadores: [] })).toBe('procesos: SAF-TH')
    expect(valorDetalle('quitados', { procesos: [], indicadores: [] })).toBe('—')
  })

  it('sin anterior/nuevo, una línea por dato; null o vacío no tiene líneas', () => {
    expect(lineasDetalle({ nombre: 'acta.pdf', bytes: 1200 })).toEqual([
      { campo: 'nombre', valor: 'acta.pdf' },
      { campo: 'bytes', valor: '1 KB' },
    ])
    expect(lineasDetalle(null)).toEqual([])
    expect(lineasDetalle({})).toEqual([])
  })

  it('textoValor acorta los textos largos y convierte objetos a JSON', () => {
    expect(textoValor('a'.repeat(400))).toHaveLength(160)
    expect(textoValor('a'.repeat(400)).endsWith('…')).toBe(true)
    expect(textoValor({ procesos: [1, 2] })).toBe('{"procesos":[1,2]}')
    expect(textoValor('  dos\n  líneas ')).toBe('dos líneas')
    expect(textoValor(false)).toBe('false')
    expect(textoValor('')).toBe('—')
  })
})

describe('etiquetas del detalle', () => {
  it('nombres legibles de los campos conocidos y sí/no en vez de true/false', () => {
    expect(etiquetaCampo('riesgoMaterializado')).toBe('Riesgo materializado')
    expect(etiquetaCampo('origenAnterior')).toBe('Origen anterior')
    expect(etiquetaCampo('campoDesconocido')).toBe('campoDesconocido')
    expect(valorMostrado('true')).toBe('sí')
    expect(valorMostrado('false')).toBe('no')
    expect(valorMostrado('12,5')).toBe('12,5')
  })
})

describe('otros', () => {
  it('cada acción del contrato tiene nombre', () => {
    for (const accion of ACCIONES_REGISTRO_PAI) expect(NOMBRES_ACCION[accion]).toBeTruthy()
  })

  it('totalPaginas', () => {
    expect(totalPaginas(0, 50)).toBe(1)
    expect(totalPaginas(50, 50)).toBe(1)
    expect(totalPaginas(51, 50)).toBe(2)
  })
})
