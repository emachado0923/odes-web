import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LIMITES_PAI,
  type EvidenciaPai,
  type FichaIndicadorPai,
  type NumeroBimestre,
  type RespuestaReportePai,
  type RolPai,
} from '../api-pai'
import { CSRF_PRUEBA } from '../pruebas/datosPrueba'
import { ProveedorSesionPrueba } from '../pruebas/ProveedorSesionPrueba'
import { falla, ok, simularApiPai, type ManejadorPai, type PeticionPai } from '../tablero/apiPruebaPai'
import { FECHA_PRUEBA, fichaPrueba, reportePrueba, respuestaReportePrueba, tableroPrueba } from '../tablero/datosPruebaTablero'
import ModalEvidencias from './ModalEvidencias'
import ModalObservaciones from './ModalObservaciones'

afterEach(() => {
  vi.unstubAllGlobals()
})

const RUTA_FICHA = '/api/pai/indicadores/1'

function indicadorDe(rol: RolPai) {
  return tableroPrueba({ rol }).indicadores[0]
}

/** API con la ficha (en cada GET, la siguiente de la lista; la última se repite) y un manejador extra. */
function api(fichas: FichaIndicadorPai[], extra: ManejadorPai = () => undefined): PeticionPai[] {
  let n = 0
  return simularApiPai((p) => {
    if (p.metodo === 'GET' && p.ruta === RUTA_FICHA) return ok(fichas[Math.min(n++, fichas.length - 1)])
    return extra(p)
  })
}

function montarObservaciones(rol: RolPai = 'responsable') {
  const llamadas = {
    onCerrar: vi.fn<() => void>(),
    onGuardado: vi.fn<(respuesta: RespuestaReportePai) => void>(),
    onConflicto: vi.fn<() => void>(),
  }
  render(
    <ProveedorSesionPrueba rol={rol}>
      <ModalObservaciones indicador={indicadorDe(rol)} bimestreInicial={rol === 'responsable' ? 4 : 1} {...llamadas} />
    </ProveedorSesionPrueba>,
  )
  return llamadas
}

function montarEvidencias(rol: RolPai = 'responsable', bimestreInicial: 1 | 4 = 4) {
  const llamadas = {
    onCerrar: vi.fn<() => void>(),
    onCambio: vi.fn<(indicadorId: number, bimestre: NumeroBimestre, cantidad: number) => void>(),
    onConflicto: vi.fn<() => void>(),
  }
  render(
    <ProveedorSesionPrueba rol={rol}>
      <ModalEvidencias indicador={indicadorDe(rol)} bimestreInicial={bimestreInicial} {...llamadas} />
    </ProveedorSesionPrueba>,
  )
  return llamadas
}

const puts = (peticiones: PeticionPai[]) => peticiones.filter((p) => p.metodo === 'PUT')

describe('modal Observaciones', () => {
  it('bimestre editable: riesgo materializado con numeral y descripción solo cuando es "Sí"', async () => {
    api([fichaPrueba()])
    montarObservaciones()
    const dialogo = await screen.findByRole('dialog', { name: 'Observaciones · SAF-TH-01' })
    await within(dialogo).findByLabelText('Principales avances (logros)')
    expect(within(dialogo).getByRole('tab', { name: 'Bimestre 4, editable' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText('Numeral del riesgo materializado')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    expect(screen.getByLabelText('Numeral del riesgo materializado')).toHaveAccessibleDescription(
      'Numerales de los riesgos de esta acción: 1.',
    )
    expect(screen.getByLabelText('Descripción del riesgo y controles aplicados')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.queryByLabelText('Numeral del riesgo materializado')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Descripción del riesgo y controles aplicados')).not.toBeInTheDocument()
  })

  it('con "Sí" exige numeral y descripción antes de enviar; luego guarda con el CSRF', async () => {
    const indicador = indicadorDe('responsable')
    const guardado = reportePrueba(4, {
      logros: 'Se hizo la jornada de julio.',
      riesgoMaterializado: 'SI',
      numeralRiesgo: '1',
      descripcionRiesgo: 'Se aplicó el control de doble revisión.',
      estado: 'reportado',
      origen: 'aplicativo',
      actualizadoEn: '2026-08-20T15:00:00.000Z',
      actualizadoPor: 'Responsable SAF',
      editable: true,
      motivo: 'abierto',
    })
    const peticiones = api([fichaPrueba()], (p) => (p.metodo === 'PUT' ? ok(respuestaReportePrueba(indicador, guardado)) : undefined))
    const { onGuardado } = montarObservaciones()
    const logros = await screen.findByLabelText('Principales avances (logros)')
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    expect(guardar).toBeDisabled()
    fireEvent.change(logros, { target: { value: 'Se hizo la jornada de julio.' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    fireEvent.click(guardar)
    expect(await screen.findByText('Escriba el numeral del riesgo que se materializó.')).toBeInTheDocument()
    expect(screen.getByText('Describa el riesgo que se materializó y los controles aplicados.')).toBeInTheDocument()
    expect(screen.getByLabelText('Numeral del riesgo materializado')).toHaveAttribute('aria-invalid', 'true')
    expect(puts(peticiones)).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Numeral del riesgo materializado'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Descripción del riesgo y controles aplicados'), {
      target: { value: 'Se aplicó el control de doble revisión.' },
    })
    fireEvent.click(guardar)
    expect(await screen.findByText('Se guardaron las observaciones del bimestre 4.')).toBeInTheDocument()
    const [put] = puts(peticiones)
    expect(put.ruta).toBe('/api/pai/indicadores/1/bimestres/4')
    expect(put.cabeceras['x-csrf-token']).toBe(CSRF_PRUEBA)
    expect(put.cuerpo).toEqual({
      logros: 'Se hizo la jornada de julio.',
      observaciones: null,
      fuentesVerificacion: null,
      riesgoMaterializado: 'SI',
      numeralRiesgo: '1',
      descripcionRiesgo: 'Se aplicó el control de doble revisión.',
      actualizadoEn: null,
    })
    expect(onGuardado).toHaveBeenCalledTimes(1)
    expect(onGuardado.mock.calls[0][0].indicador.tieneTextos[3]).toBe(true)
    expect(screen.getByText(/Guardado por Responsable SAF/)).toBeInTheDocument()
    expect(guardar).toBeDisabled()
  })

  it('los errores por campo del servidor (400) aparecen junto a cada campo', async () => {
    api([fichaPrueba()], (p) =>
      p.metodo === 'PUT'
        ? falla(400, 'solicitud_invalida', 'Revise los campos marcados.', { fuentesVerificacion: 'Texto demasiado largo.' })
        : undefined,
    )
    montarObservaciones()
    fireEvent.change(await screen.findByLabelText('Fuentes de verificación'), { target: { value: 'Actas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Texto demasiado largo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fuentes de verificación')).toHaveAccessibleDescription('Texto demasiado largo.')
    expect(screen.getByRole('alert')).toHaveTextContent('Revise los campos marcados.')
  })

  it('409: conserva lo escrito, muestra lo que quedó guardado y el siguiente guardado usa el token nuevo', async () => {
    const otra = fichaPrueba()
    otra.bimestres[3] = { ...otra.bimestres[3], logros: 'Texto de otra persona.', origen: 'aplicativo', actualizadoEn: '2026-08-21T10:00:00.000Z' }
    let respuestas = 0
    const peticiones = api([fichaPrueba(), otra], (p) => {
      if (p.metodo !== 'PUT') return undefined
      respuestas++
      return respuestas === 1
        ? falla(409, 'conflicto', 'El reporte cambió.')
        : ok(respuestaReportePrueba(indicadorDe('responsable'), { ...otra.bimestres[3], logros: 'Mi texto.', actualizadoEn: '2026-08-21T10:05:00.000Z' }))
    })
    const { onConflicto } = montarObservaciones()
    const logros = await screen.findByLabelText('Principales avances (logros)')
    fireEvent.change(logros, { target: { value: 'Mi texto.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/Otra persona guardó este reporte mientras usted lo editaba/)).toBeInTheDocument()
    expect(logros).toHaveValue('Mi texto.')
    expect(screen.getByText('Ver lo que quedó guardado')).toBeInTheDocument()
    expect(screen.getByText('Texto de otra persona.')).toBeInTheDocument()
    expect(onConflicto).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Se guardaron las observaciones del bimestre 4.')
    expect(puts(peticiones).map((p) => (p.cuerpo as { actualizadoEn: string | null }).actualizadoEn)).toEqual([
      null,
      '2026-08-21T10:00:00.000Z',
    ])
  })

  it('avisa de los cambios sin guardar al cerrar (Escape) y al cambiar de bimestre', async () => {
    api([fichaPrueba()])
    const { onCerrar } = montarObservaciones()
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(await screen.findByLabelText('Observaciones y/o dificultades'), { target: { value: 'Pendiente' } })
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.getByRole('alert')).toHaveTextContent('Tiene cambios sin guardar en el bimestre 4. ¿Cerrar sin guardarlos?')
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(onCerrar).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Observaciones y/o dificultades')).toHaveValue('Pendiente')

    fireEvent.click(screen.getByRole('tab', { name: 'Bimestre 1' }))
    expect(screen.getByRole('alert')).toHaveTextContent('¿Descartarlos y cambiar de bimestre?')
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    // Bimestre 1: cerrado, en solo lectura.
    expect(screen.getByRole('tab', { name: 'Bimestre 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Se realizaron dos jornadas de bienestar.')).toBeInTheDocument()
    expect(within(dialogo).queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByText(/no está abierto para reportar/)).toBeInTheDocument()

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('las flechas mueven la pestaña elegida (patrón tabs)', async () => {
    api([fichaPrueba()])
    montarObservaciones()
    await screen.findByLabelText('Principales avances (logros)')
    const b4 = screen.getByRole('tab', { name: 'Bimestre 4, editable' })
    expect(b4).toHaveFocus()
    fireEvent.keyDown(b4, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Bimestre 5' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Bimestre 5' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Bimestre 5' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Bimestre 1' })).toHaveAttribute('aria-selected', 'true')
  })

  it('administrador: solo lectura, sin formulario ni botón Guardar', async () => {
    api([fichaPrueba('administrador')])
    montarObservaciones('administrador')
    const dialogo = await screen.findByRole('dialog')
    expect(await screen.findByText('Se realizaron dos jornadas de bienestar.')).toBeInTheDocument()
    expect(within(dialogo).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(dialogo).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(screen.getByText(/Planeación ve los reportes en solo lectura/)).toBeInTheDocument()
    expect(screen.getByText('Importado del Excel de seguimiento.')).toBeInTheDocument()
  })
})

function evidencia(id: number, nombre: string): EvidenciaPai {
  return {
    id,
    nombre,
    tipo: 'application/pdf',
    bytes: 2048,
    subidoEn: FECHA_PRUEBA,
    subidoPor: 'Responsable SAF',
    urlDescarga: `/api/pai/evidencias/${id}`,
  }
}

function conEvidenciasEnB4(lista: EvidenciaPai[]): FichaIndicadorPai {
  const ficha = fichaPrueba()
  ficha.bimestres[3] = { ...ficha.bimestres[3], evidencias: lista }
  return ficha
}

describe('modal Evidencias', () => {
  it('lista las evidencias con su enlace de descarga; sin borrar en un bimestre cerrado', async () => {
    api([fichaPrueba()])
    montarEvidencias('responsable', 1)
    const enlace = await screen.findByRole('link', { name: 'asistencia-enero.pdf' })
    expect(enlace).toHaveAttribute('href', '/api/pai/evidencias/51')
    expect(enlace).toHaveAttribute('download', 'asistencia-enero.pdf')
    expect(screen.getByText(/PDF · 117 KB/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrar/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Subir evidencias')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Bimestre 1, 1 evidencia' })).toHaveAttribute('aria-selected', 'true')
  })

  it('rechaza en el navegador un tipo no permitido o un archivo de más de 25 MB (sin subir nada)', async () => {
    const peticiones = api([fichaPrueba()])
    const { onCambio } = montarEvidencias()
    const campo = await screen.findByLabelText('Subir evidencias')
    const ejecutable = new File(['MZ'], 'programa.exe', { type: 'application/x-msdownload' })
    const grande = new File(['%PDF'], 'enorme.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: LIMITES_PAI.maxBytesEvidencia + 1 })
    fireEvent.change(campo, { target: { files: [ejecutable, grande] } })
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('2 archivos no se subieron:')
    expect(alerta).toHaveTextContent(/programa\.exe: El tipo de archivo no está permitido/)
    expect(alerta).toHaveTextContent(/enorme\.pdf: El archivo supera el tamaño máximo permitido \(25 MB\)/)
    expect(peticiones.filter((p) => p.metodo !== 'GET')).toHaveLength(0)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('sube por multipart con el CSRF y avisa el nuevo conteo', async () => {
    const peticiones = api([fichaPrueba()], (p) => {
      if (p.metodo === 'POST' && p.ruta === '/api/pai/indicadores/1/bimestres/4/evidencias/subidas') return ok({ directa: false })
      if (p.metodo === 'POST' && p.ruta === '/api/pai/indicadores/1/bimestres/4/evidencias') {
        return ok(evidencia(77, 'informe-julio.pdf'), 201)
      }
      return undefined
    })
    const { onCambio } = montarEvidencias()
    const campo = await screen.findByLabelText('Subir evidencias')
    fireEvent.change(campo, { target: { files: [new File(['%PDF-1.7'], 'informe-julio.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('link', { name: 'informe-julio.pdf' })).toHaveAttribute('href', '/api/pai/evidencias/77')
    expect(screen.getByText('Se subió 1 evidencia.')).toBeInTheDocument()
    expect(onCambio).toHaveBeenCalledWith(1, 4, 1)
    const subida = peticiones.find((p) => p.ruta === '/api/pai/indicadores/1/bimestres/4/evidencias')
    if (!subida) throw new Error('No se subió la evidencia')
    expect(subida.cabeceras['x-csrf-token']).toBe(CSRF_PRUEBA)
    expect(subida.cuerpo).toBeInstanceOf(FormData)
    expect(((subida.cuerpo as FormData).get('archivo') as File).name).toBe('informe-julio.pdf')
    expect(screen.getByRole('heading', { name: 'Evidencias del bimestre 4 (1 de 10)' })).toBeInTheDocument()
  })

  it('sube directo al bucket privado con la URL firmada y luego registra la evidencia', async () => {
    const url = 'https://almacen.supabase.co/storage/v1/object/upload/sign/pai-evidencias/subidas/abc?token=t'
    const peticiones = api([fichaPrueba()], (p) => {
      if (p.ruta.endsWith('/evidencias/subidas')) return ok({ directa: true, ruta: 'subidas/abc', url, maxBytes: LIMITES_PAI.maxBytesEvidencia })
      if (p.metodo === 'PUT' && p.ruta === url) return ok({ Key: 'x' })
      if (p.metodo === 'POST' && p.ruta.endsWith('/evidencias')) return ok(evidencia(78, 'foto.png'), 201)
      return undefined
    })
    montarEvidencias()
    const campo = await screen.findByLabelText('Subir evidencias')
    fireEvent.change(campo, { target: { files: [new File(['png'], 'foto.png', { type: 'image/png' })] } })
    await screen.findByRole('link', { name: 'foto.png' })
    const directa = peticiones.find((p) => p.ruta === url)
    expect(directa?.metodo).toBe('PUT')
    expect(directa?.cabeceras['x-csrf-token']).toBeUndefined()
    const registro = peticiones.find((p) => p.metodo === 'POST' && p.ruta === '/api/pai/indicadores/1/bimestres/4/evidencias')
    expect(registro?.cuerpo).toEqual({ subida: 'subidas/abc', nombre: 'foto.png', tipo: 'image/png' })
    expect(registro?.cabeceras['x-csrf-token']).toBe(CSRF_PRUEBA)
  })

  it('borra con confirmación y avisa el nuevo conteo', async () => {
    const peticiones = api([conEvidenciasEnB4([evidencia(80, 'acta.pdf'), evidencia(81, 'fotos.pdf')])], (p) =>
      p.metodo === 'DELETE' && p.ruta === '/api/pai/evidencias/80' ? { estado: 204 } : undefined,
    )
    const { onCambio } = montarEvidencias()
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar acta.pdf' }))
    expect(screen.getByRole('alert')).toHaveTextContent('¿Borrar «acta.pdf»? No se puede deshacer.')
    expect(screen.getByRole('button', { name: 'Sí, borrar' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(peticiones.filter((p) => p.metodo === 'DELETE')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar acta.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByText('Se borró «acta.pdf».')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'acta.pdf' })).not.toBeInTheDocument()
    expect(onCambio).toHaveBeenCalledWith(1, 4, 1)
    const [borrado] = peticiones.filter((p) => p.metodo === 'DELETE')
    expect(borrado.cabeceras['x-csrf-token']).toBe(CSRF_PRUEBA)
  })

  it('con el máximo de evidencias no deja subir más', async () => {
    const diez = Array.from({ length: LIMITES_PAI.maxEvidenciasPorReporte }, (_, i) => evidencia(100 + i, `e${i}.pdf`))
    api([conEvidenciasEnB4(diez)])
    montarEvidencias()
    expect(await screen.findByLabelText('Subir evidencias')).toBeDisabled()
    expect(screen.getByText('Ya hay 10 evidencias: borre alguna para subir otra.')).toBeInTheDocument()
  })

  it('403 al subir (el bimestre se cerró): lo explica y recarga', async () => {
    const cerrada = fichaPrueba()
    cerrada.bimestres[3] = { ...cerrada.bimestres[3], editable: false, motivo: 'cerrado' }
    api([fichaPrueba(), cerrada], (p) => {
      if (p.ruta.endsWith('/evidencias/subidas')) return falla(403, 'prohibido', 'El bimestre 4 no está abierto.')
      return undefined
    })
    const { onConflicto } = montarEvidencias()
    fireEvent.change(await screen.findByLabelText('Subir evidencias'), {
      target: { files: [new File(['%PDF'], 'acta.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('acta.pdf: El bimestre 4 no está abierto.'))
    expect(onConflicto).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByLabelText('Subir evidencias')).not.toBeInTheDocument())
  })

  it('429 al pedir la subida (cupo de subidas sin terminar): no intenta los demás archivos y lo explica', async () => {
    const mensaje = 'Tiene 5 subidas de evidencias sin terminar. Espere a que terminen antes de subir otra.'
    const peticiones = api([fichaPrueba()], (p) => {
      if (p.ruta.endsWith('/evidencias/subidas')) {
        return { ...falla(429, 'demasiados_intentos', mensaje), cabeceras: { 'Retry-After': '3600' } }
      }
      return undefined
    })
    const { onCambio } = montarEvidencias()
    fireEvent.change(await screen.findByLabelText('Subir evidencias'), {
      target: { files: ['uno.pdf', 'dos.pdf'].map((nombre) => new File(['%PDF'], nombre, { type: 'application/pdf' })) },
    })
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('2 archivos no se subieron:')
    expect(alerta).toHaveTextContent(`uno.pdf: ${mensaje}`)
    expect(alerta).toHaveTextContent('dos.pdf: No se subió: espere unos minutos y vuelva a intentarlo.')
    expect(peticiones.filter((p) => p.ruta.endsWith('/evidencias/subidas'))).toHaveLength(1)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('400 en el segundo paso (la subida directa venció): muestra el mensaje del servidor junto al archivo', async () => {
    const url = 'https://almacen.supabase.co/storage/v1/object/upload/sign/pai-evidencias/subidas/abc?token=t'
    api([fichaPrueba()], (p) => {
      if (p.ruta.endsWith('/evidencias/subidas')) return ok({ directa: true, ruta: 'subidas/abc', url, maxBytes: LIMITES_PAI.maxBytesEvidencia })
      if (p.metodo === 'PUT' && p.ruta === url) return ok({ Key: 'x' })
      if (p.metodo === 'POST' && p.ruta.endsWith('/evidencias')) {
        return falla(400, 'solicitud_invalida', 'La subida no es válida o ya venció: vuelva a subir el archivo.', {
          archivo: 'Vuelva a seleccionar el archivo.',
        })
      }
      return undefined
    })
    montarEvidencias()
    fireEvent.change(await screen.findByLabelText('Subir evidencias'), {
      target: { files: [new File(['png'], 'foto.png', { type: 'image/png' })] },
    })
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('foto.png: La subida no es válida o ya venció: vuelva a subir el archivo.')
    expect(screen.queryByRole('link', { name: 'foto.png' })).not.toBeInTheDocument()
  })

  it('administrador: descarga, sin subir ni borrar', async () => {
    api([fichaPrueba('administrador')])
    montarEvidencias('administrador', 1)
    expect(await screen.findByRole('link', { name: 'asistencia-enero.pdf' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Subir evidencias')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrar/ })).not.toBeInTheDocument()
  })
})

/** Retiene las peticiones que cumplen `predicado` hasta que la prueba las suelte. */
function retener(predicado: (ruta: string, init: RequestInit) => boolean) {
  const pendientes: (() => void)[] = []
  const original = globalThis.fetch
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init: RequestInit = {}) => {
    if (predicado(String(url), init)) await new Promise<void>((resolver) => pendientes.push(resolver))
    return original(url, init)
  })
  return {
    soltar: async () => {
      await waitFor(() => expect(pendientes.length).toBeGreaterThan(0))
      pendientes.shift()?.()
    },
  }
}

describe('modal Observaciones: foco y ficha al día', () => {
  it('al pulsar Guardar el foco pasa al estado del pie (Guardar se deshabilita) y no se pierde en <body>', async () => {
    const indicador = indicadorDe('responsable')
    api([fichaPrueba()], (p) =>
      p.metodo === 'PUT'
        ? ok(respuestaReportePrueba(indicador, reportePrueba(4, { logros: 'Texto.', estado: 'reportado', origen: 'aplicativo', actualizadoEn: '2026-08-20T15:00:00.000Z', editable: true, motivo: 'abierto' })))
        : undefined,
    )
    montarObservaciones()
    fireEvent.change(await screen.findByLabelText('Principales avances (logros)'), { target: { value: 'Texto.' } })
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    guardar.focus()
    fireEvent.click(guardar)
    const estado = await screen.findByText('Se guardaron las observaciones del bimestre 4.')
    expect(estado).toHaveFocus()
    expect(guardar).toBeDisabled()
  })

  it('un error al guardar lleva el foco al aviso', async () => {
    api([fichaPrueba()], (p) => (p.metodo === 'PUT' ? falla(500, 'interno', 'Falló el servidor.') : undefined))
    montarObservaciones()
    fireEvent.change(await screen.findByLabelText('Principales avances (logros)'), { target: { value: 'Texto.' } })
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    guardar.focus()
    fireEvent.click(guardar)
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('Falló el servidor. Sus cambios no se guardaron.')
    await waitFor(() => expect(aviso).toHaveFocus())
  })

  it('"Seguir editando" devuelve el foco a donde estaba', async () => {
    api([fichaPrueba()])
    montarObservaciones()
    const dialogo = await screen.findByRole('dialog')
    const observaciones = await screen.findByLabelText('Observaciones y/o dificultades')
    fireEvent.change(observaciones, { target: { value: 'Pendiente' } })
    observaciones.focus()
    fireEvent.keyDown(observaciones, { key: 'Escape' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))
    expect(observaciones).toHaveFocus()
    // "Descartar cambios" al cambiar de bimestre: el foco pasa a la pestaña elegida.
    fireEvent.click(screen.getByRole('tab', { name: 'Bimestre 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(screen.getByRole('tab', { name: 'Bimestre 2' })).toHaveFocus()
  })

  it('si la fila del tablero trae un token más nuevo (la casilla guardó después), vuelve a pedir la ficha sin perder lo escrito', async () => {
    const T = '2026-08-20T15:00:00.000Z'
    const conAvance = fichaPrueba()
    conAvance.bimestres[3] = { ...conAvance.bimestres[3], avance: 1, porcentaje: 0.5, estado: 'reportado', origen: 'aplicativo', actualizadoEn: T }
    const indicador = indicadorDe('responsable')
    const peticiones = api([fichaPrueba(), conAvance], (p) =>
      p.metodo === 'PUT' ? ok(respuestaReportePrueba(indicador, { ...conAvance.bimestres[3], logros: 'Mis logros.', actualizadoEn: '2026-08-20T15:05:00.000Z' })) : undefined,
    )
    const llamadas = { onCerrar: vi.fn<() => void>(), onGuardado: vi.fn<(r: RespuestaReportePai) => void>() }
    const { rerender } = render(
      <ProveedorSesionPrueba rol="responsable">
        <ModalObservaciones indicador={indicador} bimestreInicial={4} {...llamadas} />
      </ProveedorSesionPrueba>,
    )
    const logros = await screen.findByLabelText('Principales avances (logros)')
    fireEvent.change(logros, { target: { value: 'Mis logros.' } })
    // La casilla terminó de guardar el avance: la fila llega con el token nuevo.
    const fila = { ...indicador, avances: [2, 1, 0, 1, null, null], actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, T, null, null] }
    rerender(
      <ProveedorSesionPrueba rol="responsable">
        <ModalObservaciones indicador={fila} bimestreInicial={4} {...llamadas} />
      </ProveedorSesionPrueba>,
    )
    await waitFor(() => expect(peticiones.filter((p) => p.metodo === 'GET' && p.ruta === RUTA_FICHA)).toHaveLength(2))
    expect(logros).toHaveValue('Mis logros.')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Se guardaron las observaciones del bimestre 4.')
    expect((puts(peticiones)[0].cuerpo as { actualizadoEn: string | null }).actualizadoEn).toBe(T)
    expect(screen.queryByText(/Otra persona guardó/)).not.toBeInTheDocument()
  })
})

describe('modal Evidencias: cancelar y soltar archivos', () => {
  it('cancelar una subida de varios archivos lista los que faltaban y vuelve a pedir la ficha (el conteo real)', async () => {
    const yaGuardada = conEvidenciasEnB4([evidencia(90, 'uno.pdf')])
    const peticiones = api([fichaPrueba(), yaGuardada], (p) => (p.ruta.endsWith('/evidencias/subidas') ? ok({ directa: false }) : undefined))
    const retenidas = retener((ruta) => ruta.endsWith('/evidencias/subidas'))
    const { onCambio } = montarEvidencias()
    const campo = await screen.findByLabelText('Subir evidencias')
    fireEvent.change(campo, {
      target: {
        files: ['uno.pdf', 'dos.pdf', 'tres.pdf'].map((nombre) => new File(['%PDF'], nombre, { type: 'application/pdf' })),
      },
    })
    const cancelar = await screen.findByRole('button', { name: 'Cancelar subida' })
    cancelar.focus()
    fireEvent.click(cancelar)
    await retenidas.soltar()
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('3 archivos no se subieron:')
    expect(alerta).toHaveTextContent('uno.pdf: Se canceló la subida.')
    expect(alerta).toHaveTextContent('dos.pdf: No se subió: se canceló la subida.')
    expect(alerta).toHaveTextContent('tres.pdf: No se subió: se canceló la subida.')
    // El botón desapareció: el foco pasa al título de la lista.
    expect(screen.getByRole('heading', { name: /Evidencias del bimestre 4/ })).toHaveFocus()
    // El servidor alcanzó a guardar la primera: la lista y el conteo son los reales.
    expect(await screen.findByRole('link', { name: 'uno.pdf' })).toBeInTheDocument()
    expect(onCambio).toHaveBeenCalledWith(1, 4, 1)
    expect(peticiones.filter((p) => p.metodo === 'GET' && p.ruta === RUTA_FICHA)).toHaveLength(2)
  })

  it('soltar un archivo fuera del recuadro, dentro del modal, lo sube (el navegador no lo abre)', async () => {
    api([fichaPrueba()], (p) => {
      if (p.ruta.endsWith('/evidencias/subidas')) return ok({ directa: false })
      if (p.metodo === 'POST' && p.ruta.endsWith('/evidencias')) return ok(evidencia(79, 'suelto.pdf'), 201)
      return undefined
    })
    montarEvidencias()
    await screen.findByLabelText('Subir evidencias')
    const pestanas = screen.getByRole('tablist', { name: 'Bimestre' })
    const archivo = new File(['%PDF'], 'suelto.pdf', { type: 'application/pdf' })
    const arrastre = createEventDragOver(pestanas)
    expect(arrastre.defaultPrevented).toBe(true)
    fireEvent.drop(pestanas, { dataTransfer: { files: [archivo], types: ['Files'] } })
    expect(await screen.findByRole('link', { name: 'suelto.pdf' })).toBeInTheDocument()
  })
})

function createEventDragOver(elemento: HTMLElement): Event {
  const evento = createEvent.dragOver(elemento, { dataTransfer: { files: [], types: ['Files'] } })
  fireEvent(elemento, evento)
  return evento
}
