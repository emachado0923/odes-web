import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Route, Routes } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RolPai, TableroPai } from '../api-pai'
import PaginaFichaIndicador from '../ficha/PaginaFichaIndicador'
import { CSRF_PRUEBA, vigenciaPrueba } from '../pruebas/datosPrueba'
import { ProveedorSesionPrueba } from '../pruebas/ProveedorSesionPrueba'
import { falla, ok, simularApiPai, type ManejadorPai, type PeticionPai } from './apiPruebaPai'
import { FECHA_PRUEBA, fichaPrueba, reportePrueba, respuestaReportePrueba, tableroPrueba } from './datosPruebaTablero'
import PaginaTablero from './PaginaTablero'

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(ruta: string, rol: RolPai = 'responsable') {
  const router = createMemoryRouter(
    [
      {
        path: '/pai/*',
        element: (
          <ProveedorSesionPrueba rol={rol}>
            <Routes>
              <Route index element={<PaginaTablero />} />
              <Route path="indicadores/:codigo" element={<PaginaFichaIndicador />} />
            </Routes>
          </ProveedorSesionPrueba>
        ),
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
  return router
}

/** API con el tablero (en cada GET, el siguiente de la lista; el último se repite) y un manejador extra. */
function api(tableros: TableroPai[], extra: ManejadorPai = () => undefined): PeticionPai[] {
  let n = 0
  return simularApiPai((p) => {
    if (p.metodo === 'GET' && p.ruta === '/api/pai/tablero') return ok(tableros[Math.min(n++, tableros.length - 1)])
    return extra(p)
  })
}

const puts = (peticiones: PeticionPai[]) => peticiones.filter((p) => p.metodo === 'PUT')
const gets = (peticiones: PeticionPai[], ruta: string) => peticiones.filter((p) => p.metodo === 'GET' && p.ruta === ruta)

async function esperarLista() {
  await screen.findByRole('link', { name: 'Porcentaje de ejecución del plan de bienestar' })
}

describe('tablero del responsable', () => {
  it('solo las casillas editables (bandera del servidor) son campos; las demás son lectura', async () => {
    api([tableroPrueba()])
    montar('/pai')
    await esperarLista()
    const campos = screen.getAllByRole('textbox')
    expect(campos).toHaveLength(2)
    expect(screen.getByLabelText('Avance de SAF-TH-01 en el bimestre 4 (julio–agosto)')).toBe(campos[0])
    expect(screen.getByLabelText('Avance de OPE-PPEP-16 en el bimestre 4 (julio–agosto)')).toBe(campos[1])
    // Las demás casillas se describen completas para lectores de pantalla.
    expect(screen.getByText('Bimestre 1, enero–febrero: meta 2, avance 2, 100 %, completo.', { selector: '.pai-solo-lector' })).toBeInTheDocument()
    expect(screen.getByText(/Bimestre 4 \(julio–agosto\) abierto\./)).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('4 indicadores')
    // Agrupado por proceso -> acción.
    const procesos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(procesos).toEqual(['Filtros', 'SAF-TH Gestión del Talento Humano', 'SAF-AC Atención a la Ciudadanía', 'OPE-PPEP Permanencia en la educación superior'])
    // El responsable no ve el resumen de Planeación.
    expect(screen.queryByText('Avance anual')).not.toBeInTheDocument()
  })

  it('al salir de la casilla guarda el avance con el CSRF y el token de concurrencia, y actualiza la fila', async () => {
    const tablero = tableroPrueba()
    const indicador = tablero.indicadores[0]
    const peticiones = api([tablero], (p) => {
      if (p.metodo === 'PUT' && p.ruta === '/api/pai/indicadores/1/bimestres/4') {
        return ok(
          respuestaReportePrueba(
            indicador,
            reportePrueba(4, {
              avance: 1.5,
              porcentaje: 0.75,
              estado: 'reportado',
              origen: 'aplicativo',
              actualizadoEn: '2026-08-20T15:00:00.000Z',
              editable: true,
              motivo: 'abierto',
            }),
          ),
        )
      }
      return undefined
    })
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '1,5' } })
    fireEvent.blur(campo)
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
    const [put] = puts(peticiones)
    expect(put.cabeceras['x-csrf-token']).toBe(CSRF_PRUEBA)
    expect(put.cuerpo).toEqual({ avance: 1.5, actualizadoEn: null })
    expect(campo).toHaveValue('1,5')
    expect(campo).toHaveAccessibleDescription(/Meta 2 Porcentaje: 75 % Guardado/)
    // Volver a salir sin cambios no envía nada.
    fireEvent.blur(campo)
    expect(puts(peticiones)).toHaveLength(1)
  })

  it('Enter guarda; Escape deshace lo escrito sin enviar', async () => {
    const tablero = tableroPrueba()
    const peticiones = api([tablero], (p) =>
      p.metodo === 'PUT'
        ? ok(respuestaReportePrueba(tablero.indicadores[3], reportePrueba(4, { avance: 100, porcentaje: 1, estado: 'reportado', actualizadoEn: FECHA_PRUEBA, editable: true, motivo: 'abierto' })))
        : undefined,
    )
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de OPE-PPEP-16/)
    fireEvent.change(campo, { target: { value: '7' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(campo).toHaveValue('')
    expect(puts(peticiones)).toHaveLength(0)
    fireEvent.change(campo, { target: { value: '100' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await screen.findByText('Guardado')
    expect(puts(peticiones).map((p) => [p.ruta, p.cuerpo])).toEqual([
      ['/api/pai/indicadores/4/bimestres/4', { avance: 100, actualizadoEn: null }],
    ])
  })

  it('un valor inválido o ambiguo no se envía y se explica en la casilla', async () => {
    const peticiones = api([tableroPrueba()])
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '1.250' } })
    fireEvent.blur(campo)
    expect(await screen.findByText('«1.250» es ambiguo: escriba 1250 o 1,25.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(campo, { target: { value: '-2' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText('El avance no puede ser negativo.')).toBeInTheDocument()
    expect(puts(peticiones)).toHaveLength(0)
  })

  it('409: otra persona guardó antes; recarga el tablero, muestra el valor actual y lo explica', async () => {
    const tablero = tableroPrueba()
    const despues = tableroPrueba()
    despues.indicadores[0] = {
      ...despues.indicadores[0],
      avances: [2, 1, 0, 1, null, null],
      porcentajes: [1, 0.5, 0, 0.5, null, null],
      estados: ['reportado', 'reportado', 'reportado', 'reportado', 'futuro', 'futuro'],
      actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, '2026-08-20T16:00:00.000Z', null, null],
    }
    const peticiones = api([tablero, despues], (p) =>
      p.metodo === 'PUT' ? falla(409, 'conflicto', 'El reporte cambió mientras lo editaba.') : undefined,
    )
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '2' } })
    fireEvent.blur(campo)
    expect(
      await screen.findByText('Otra persona cambió este avance. Se cargó el valor actual; el suyo (2) no se guardó.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(campo).toHaveValue('1'))
    expect(gets(peticiones, '/api/pai/tablero')).toHaveLength(2)
    // El siguiente guardado usa el token nuevo.
    fireEvent.change(campo, { target: { value: '2' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(puts(peticiones)).toHaveLength(2))
    expect(puts(peticiones)[1].cuerpo).toEqual({ avance: 2, actualizadoEn: '2026-08-20T16:00:00.000Z' })
  })

  it('403 (el bimestre se cerró): explica y recarga el tablero, donde la casilla ya no es editable', async () => {
    const cerrado = tableroPrueba({ vigencia: vigenciaPrueba({ bimestreAbierto: null }) })
    cerrado.indicadores = cerrado.indicadores.map((i) => ({ ...i, editables: i.editables.map(() => false) }))
    api([tableroPrueba(), cerrado], (p) =>
      p.metodo === 'PUT' ? falla(403, 'prohibido', 'El bimestre 4 no está abierto.') : undefined,
    )
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '2' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(screen.queryAllByRole('textbox')).toHaveLength(0))
    expect(screen.getByText(/No hay bimestre abierto para reportar/)).toBeInTheDocument()
  })

  it('el responsable sin indicadores asignados ve un aviso claro', async () => {
    api([tableroPrueba({ indicadores: [] })])
    montar('/pai')
    expect(await screen.findByText('Todavía no tiene indicadores asignados.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Filtros' })).not.toBeInTheDocument()
  })

  it('si el tablero no carga, muestra el error y permite reintentar', async () => {
    let fallar = true
    simularApiPai((p) => {
      if (p.ruta !== '/api/pai/tablero') return undefined
      return fallar ? falla(500, 'interno', 'Error del servidor.') : ok(tableroPrueba())
    })
    montar('/pai')
    expect(await screen.findByText('No se pudo cargar el tablero.')).toBeInTheDocument()
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await esperarLista()
  })
})

describe('tablero del administrador', () => {
  it('todo en solo lectura, con el resumen de cada proceso', async () => {
    api([tableroPrueba({ rol: 'administrador' })])
    montar('/pai', 'administrador')
    await esperarLista()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByText(/Planeación ve todos los indicadores en solo lectura/)).toBeInTheDocument()
    const saf = screen.getByRole('region', { name: 'SAF-TH Gestión del Talento Humano' })
    expect(within(saf).getByText('Avance anual').nextSibling).toHaveTextContent('62,5 %')
    expect(within(saf).getByText('Logro del bimestre 4').nextSibling).toHaveTextContent('100 %')
    expect(within(saf).getByText('Reportados en el bimestre 4').nextSibling).toHaveTextContent('1 de 2')
    expect(within(saf).getByRole('progressbar', { name: 'Avance anual del proceso' })).toHaveAttribute('aria-valuenow', '63')
  })

  it('"Exportar CSV" lleva los filtros del tablero (solo el administrador lo ve)', async () => {
    api([tableroPrueba({ rol: 'administrador' })])
    montar('/pai?dependencia=2&estado=pendiente', 'administrador')
    await screen.findByRole('link', { name: /Mesa Distrital/ })
    const enlace = screen.getByRole('link', { name: 'Exportar CSV con estos filtros' })
    expect(enlace.getAttribute('href')).toMatch(/^\/api\/pai\/admin\/exportar\.csv\?dependencia=2&estado=pendiente&vigencia=\d{4}$/)
  })

  it('el responsable no ve "Exportar CSV"', async () => {
    api([tableroPrueba()])
    montar('/pai')
    await esperarLista()
    expect(screen.queryByRole('link', { name: /Exportar CSV/ })).not.toBeInTheDocument()
  })
})

describe('filtros en la URL', () => {
  it('lee los filtros de la URL, descarta los que no concuerdan y reescribe la URL', async () => {
    api([tableroPrueba()])
    const router = montar('/pai?dependencia=2&proceso=10&estado=pendiente&otro=x')
    await screen.findByRole('link', { name: /Mesa Distrital/ })
    expect(screen.queryByRole('link', { name: 'Porcentaje de ejecución del plan de bienestar' })).not.toBeInTheDocument()
    expect(screen.getByText('1 de 4 indicadores')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?otro=x&dependencia=2&estado=pendiente'))
    expect(screen.getByLabelText('Dependencia')).toHaveValue('2')
    expect(screen.getByLabelText('Proceso o proyecto')).toHaveValue('')
    expect(screen.getByLabelText('Estado en el bimestre 4')).toHaveValue('pendiente')
  })

  it('los selects dependen entre sí, el conteo cambia y "Limpiar filtros" vuelve a todos', async () => {
    api([tableroPrueba()])
    const router = montar('/pai')
    await esperarLista()
    const dependencia = screen.getByLabelText('Dependencia')
    const proceso = screen.getByLabelText('Proceso o proyecto')
    expect(within(proceso).getAllByRole('option')).toHaveLength(4)
    fireEvent.change(proceso, { target: { value: '20' } })
    expect(screen.getByText('1 de 4 indicadores')).toBeInTheDocument()
    // Cambiar a SAF quita el proceso de OPE y deja solo los procesos de SAF.
    fireEvent.change(dependencia, { target: { value: '1' } })
    expect(proceso).toHaveValue('')
    expect(within(proceso).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos',
      'SAF-TH · Gestión del Talento Humano',
      'SAF-AC · Atención a la Ciudadanía',
    ])
    expect(screen.getByText('3 de 4 indicadores')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?dependencia=1'))
    // Elegir un proceso acota los riesgos (en "Más filtros").
    fireEvent.change(proceso, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }))
    const riesgo = screen.getByLabelText('Riesgo')
    expect(within(riesgo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos',
      '1. Recibir dádivas por realizar trámites (RC)',
      '2. Pérdida de información de las hojas de vida',
    ])
    fireEvent.change(riesgo, { target: { value: '101' } })
    expect(screen.getByRole('link', { name: 'Capacitaciones realizadas' })).toBeInTheDocument()
    expect(screen.getByText('1 de 4 indicadores')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?dependencia=1&proceso=10&riesgo=101'))
    fireEvent.change(screen.getByLabelText('Estado en el bimestre 4'), { target: { value: 'pendiente' } })
    expect(screen.getByText('Ningún indicador cumple los filtros.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0])
    expect(screen.getByText('4 indicadores')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('búsqueda por texto sin tildes ni mayúsculas, reflejada en la URL', async () => {
    api([tableroPrueba()])
    const router = montar('/pai')
    await esperarLista()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar indicador' }), { target: { value: 'INDICE' } })
    expect(screen.getByRole('link', { name: 'Índice de satisfacción ciudadana' })).toBeInTheDocument()
    expect(screen.getByText('1 de 4 indicadores')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?q=INDICE'))
  })

  it('sin bimestre abierto, el filtro de estado está deshabilitado y la URL lo descarta', async () => {
    api([tableroPrueba({ vigencia: vigenciaPrueba({ bimestreAbierto: null }) })])
    const router = montar('/pai?estado=pendiente')
    await esperarLista()
    expect(screen.getByLabelText('Estado del reporte')).toBeDisabled()
    expect(screen.getByText('No hay bimestre abierto.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('el enlace del nombre abre la ficha y "Tablero" vuelve con los mismos filtros', async () => {
    simularApiPai((p) => {
      if (p.ruta === '/api/pai/tablero') return ok(tableroPrueba())
      if (p.ruta === '/api/pai/indicadores/SAF-TH-01') return ok(fichaPrueba())
      return undefined
    })
    const router = montar('/pai?dependencia=1')
    await esperarLista()
    fireEvent.click(screen.getByRole('link', { name: 'Porcentaje de ejecución del plan de bienestar' }))
    await screen.findByRole('heading', { level: 1, name: /SAF-TH-01/ })
    expect(router.state.location.pathname).toBe('/pai/indicadores/SAF-TH-01')
    expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/pai?dependencia=1')
  })
})

describe('modales desde el tablero', () => {
  it('Observaciones: al guardar se reemplaza la fila (insignia) sin volver a pedir el tablero', async () => {
    const tablero = tableroPrueba()
    const peticiones = api([tablero], (p) => {
      if (p.metodo === 'GET' && p.ruta === '/api/pai/indicadores/1') return ok(fichaPrueba())
      if (p.metodo === 'PUT') {
        return ok(
          respuestaReportePrueba(
            tablero.indicadores[0],
            reportePrueba(4, { logros: 'Jornada de julio.', estado: 'reportado', origen: 'aplicativo', actualizadoEn: '2026-08-20T15:00:00.000Z', editable: true, motivo: 'abierto' }),
          ),
        )
      }
      return undefined
    })
    montar('/pai')
    await esperarLista()
    const abrir = screen.getByRole('button', { name: 'Observaciones de SAF-TH-01 (2 bimestres con textos)' })
    abrir.focus()
    fireEvent.click(abrir)
    const dialogo = await screen.findByRole('dialog', { name: 'Observaciones · SAF-TH-01' })
    fireEvent.change(await within(dialogo).findByLabelText('Principales avances (logros)'), { target: { value: 'Jornada de julio.' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    await within(dialogo).findByText('Se guardaron las observaciones del bimestre 4.')
    expect(screen.getByRole('button', { name: 'Observaciones de SAF-TH-01 (3 bimestres con textos)' })).toBeInTheDocument()
    fireEvent.click(within(dialogo).getAllByRole('button', { name: 'Cerrar' })[1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gets(peticiones, '/api/pai/tablero')).toHaveLength(1)
    // El foco vuelve al botón que abrió el modal.
    expect(screen.getByRole('button', { name: /Observaciones de SAF-TH-01/ })).toHaveFocus()
  })

  it('Evidencias: la primera de un bimestre sin reporte actualiza el conteo y vuelve a pedir el tablero (token nuevo)', async () => {
    // Después de subir, el servidor ya tiene el reporte del bimestre 4 (creado por la evidencia).
    const despues = tableroPrueba()
    despues.indicadores[0] = {
      ...despues.indicadores[0],
      evidencias: [1, 0, 0, 1, 0, 0],
      actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, '2026-08-20T15:00:00.000Z', null, null],
    }
    const peticiones = api([tableroPrueba(), despues], (p) => {
      if (p.metodo === 'GET' && p.ruta === '/api/pai/indicadores/1') return ok(fichaPrueba())
      if (p.ruta.endsWith('/evidencias/subidas')) return ok({ directa: false })
      if (p.metodo === 'POST' && p.ruta.endsWith('/evidencias')) {
        return ok({ id: 90, nombre: 'acta.pdf', tipo: 'application/pdf', bytes: 10, subidoEn: FECHA_PRUEBA, subidoPor: null, urlDescarga: '/api/pai/evidencias/90' }, 201)
      }
      return undefined
    })
    montar('/pai')
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: 'Evidencias de SAF-TH-01 (1 archivo)' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Evidencias · SAF-TH-01' })
    fireEvent.change(await within(dialogo).findByLabelText('Subir evidencias'), {
      target: { files: [new File(['%PDF'], 'acta.pdf', { type: 'application/pdf' })] },
    })
    await within(dialogo).findByRole('link', { name: 'acta.pdf' })
    expect(screen.getByRole('button', { name: 'Evidencias de SAF-TH-01 (2 archivos)' })).toBeInTheDocument()
    await waitFor(() => expect(gets(peticiones, '/api/pai/tablero')).toHaveLength(2))
    // El próximo guardado del avance usará el token del reporte recién creado.
    fireEvent.click(within(dialogo).getAllByRole('button', { name: 'Cerrar' })[1])
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '1' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(peticiones.filter((p) => p.metodo === 'PUT')).toHaveLength(1))
    expect(peticiones.find((p) => p.metodo === 'PUT')?.cuerpo).toEqual({ avance: 1, actualizadoEn: '2026-08-20T15:00:00.000Z' })
  })

  it('administrador: los modales se abren en solo lectura', async () => {
    api([tableroPrueba({ rol: 'administrador' })], (p) =>
      p.metodo === 'GET' && p.ruta === '/api/pai/indicadores/1' ? ok(fichaPrueba('administrador')) : undefined,
    )
    montar('/pai', 'administrador')
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /Observaciones de SAF-TH-01/ }))
    const dialogo = await screen.findByRole('dialog')
    // Sin bimestre editable, abre en el bimestre abierto (4).
    expect(within(dialogo).getByRole('tab', { name: 'Bimestre 4' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(dialogo).findByText(/Planeación ve los reportes en solo lectura/)).toBeInTheDocument()
    expect(within(dialogo).queryAllByRole('textbox')).toHaveLength(0)
  })
})

/** Retiene las peticiones que cumplen `predicado` hasta que la prueba las suelte (en orden). */
function retener(predicado: (ruta: string, init: RequestInit) => boolean) {
  const pendientes: (() => void)[] = []
  const original = globalThis.fetch
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init: RequestInit = {}) => {
    if (predicado(String(url), init)) await new Promise<void>((resolver) => pendientes.push(resolver))
    return original(url, init)
  })
  return {
    pendientes,
    soltar: async () => {
      await waitFor(() => expect(pendientes.length).toBeGreaterThan(0))
      pendientes.shift()?.()
    },
  }
}

const esGetTablero = (ruta: string, init: RequestInit) => (init.method ?? 'GET') === 'GET' && ruta === '/api/pai/tablero'

describe('bimestres que aún no se reportan (estado futuro)', () => {
  it('se pintan neutros: clase futuro, "—" y "aún no se reporta" para lectores de pantalla, nunca "sin avance"', async () => {
    api([tableroPrueba({ rol: 'administrador' })])
    montar('/pai', 'administrador')
    await esperarLista()
    const descripcion = screen.getAllByText('Bimestre 5, septiembre–octubre: meta 2, aún no se reporta.', { selector: '.pai-solo-lector' })
    expect(descripcion.length).toBeGreaterThan(0)
    const casilla = descripcion[0].closest('.pai-casilla') as HTMLElement
    expect(casilla).toHaveClass('pai-casilla-futuro')
    expect(casilla).not.toHaveClass('pai-casilla-cero')
    expect(within(screen.getByRole('list', { name: 'Colores del avance:' })).getByText(/aún no se reporta/)).toBeInTheDocument()
    // El bimestre abierto pendiente sí es "sin avance".
    expect(screen.getAllByText(/Bimestre 4, julio–agosto: meta 2, avance sin reportar, sin avance\./).length).toBeGreaterThan(0)
  })
})

describe('casilla: conflictos y recargas', () => {
  it('el aviso del 409 (con el valor descartado) no desaparece al salir otra vez de la casilla', async () => {
    const despues = tableroPrueba()
    despues.indicadores[0] = {
      ...despues.indicadores[0],
      avances: [2, 1, 0, 1, null, null],
      actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, '2026-08-20T16:00:00.000Z', null, null],
    }
    api([tableroPrueba(), despues], (p) => (p.metodo === 'PUT' ? falla(409, 'conflicto', 'Cambió.') : undefined))
    montar('/pai')
    await esperarLista()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '3' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const aviso = 'Otra persona cambió este avance. Se cargó el valor actual; el suyo (3) no se guardó.'
    expect(await screen.findByText(aviso)).toBeInTheDocument()
    await waitFor(() => expect(campo).toHaveValue('1'))
    fireEvent.blur(campo)
    expect(screen.getByText(aviso)).toBeInTheDocument()
    // Se quita al volver a escribir (o con Escape).
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(screen.queryByText(aviso)).not.toBeInTheDocument()
  })

  it('una recarga pedida antes de un guardado no lo pisa: se descarta y se pide otra', async () => {
    const T7 = '2026-08-20T17:00:00.000Z'
    const inicial = tableroPrueba()
    const vieja = tableroPrueba()
    const nueva = tableroPrueba()
    nueva.indicadores[3] = { ...nueva.indicadores[3], avances: [100, 100, 50, 7, null, null], actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, T7, null, null] }
    let getsTablero = 0
    const peticiones = simularApiPai((p) => {
      if (p.metodo === 'GET' && p.ruta === '/api/pai/tablero') return ok([inicial, vieja, nueva][Math.min(getsTablero++, 2)])
      if (p.metodo === 'PUT' && p.ruta === '/api/pai/indicadores/1/bimestres/4') return falla(409, 'conflicto', 'Cambió.')
      if (p.metodo === 'PUT' && p.ruta === '/api/pai/indicadores/4/bimestres/4') {
        const cuerpo = p.cuerpo as { avance: number }
        return ok(
          respuestaReportePrueba(
            inicial.indicadores[3],
            reportePrueba(4, { meta: 100, avance: cuerpo.avance, porcentaje: 0.07, estado: 'reportado', actualizadoEn: T7, editable: true, motivo: 'abierto' }),
          ),
        )
      }
      return undefined
    })
    let numeroGet = 0
    const retenidas = retener((ruta, init) => esGetTablero(ruta, init) && ++numeroGet === 2)
    montar('/pai')
    await esperarLista()
    // 409 en SAF-TH-01: pide una recarga (retenida).
    const saf = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(saf, { target: { value: '3' } })
    fireEvent.keyDown(saf, { key: 'Enter' })
    await screen.findByText(/el suyo \(3\) no se guardó/)
    // Mientras tanto se guarda OPE-PPEP-16.
    const ope = screen.getByLabelText(/Avance de OPE-PPEP-16/)
    fireEvent.change(ope, { target: { value: '7' } })
    fireEvent.keyDown(ope, { key: 'Enter' })
    await screen.findByText('Guardado')
    // Llega la recarga vieja (sin el 7): no se aplica; se pide otra, que sí lo trae.
    await retenidas.soltar()
    await waitFor(() => expect(gets(peticiones, '/api/pai/tablero')).toHaveLength(3))
    expect(ope).toHaveValue('7')
    fireEvent.change(ope, { target: { value: '8' } })
    fireEvent.blur(ope)
    await waitFor(() => expect(puts(peticiones)).toHaveLength(3))
    expect(puts(peticiones)[2].cuerpo).toEqual({ avance: 8, actualizadoEn: T7 })
  })

  it('lo escrito conserva el token con que se empezó: si la recarga trae otro valor, el guardado da 409 en vez de pisarlo', async () => {
    const otro = tableroPrueba()
    otro.indicadores[0] = {
      ...otro.indicadores[0],
      avances: [2, 1, 0, 1, null, null],
      actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, '2026-08-20T16:00:00.000Z', null, null],
    }
    const peticiones = api([tableroPrueba(), otro], (p) => {
      if (p.metodo === 'PUT' && p.ruta.startsWith('/api/pai/indicadores/4/')) return falla(409, 'conflicto', 'Cambió.')
      if (p.metodo === 'PUT') return falla(409, 'conflicto', 'Cambió.')
      return undefined
    })
    montar('/pai')
    await esperarLista()
    const saf = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(saf, { target: { value: '5' } })
    // Un 409 en otra casilla recarga el tablero, que trae el 1 de otra persona en SAF-TH-01.
    const ope = screen.getByLabelText(/Avance de OPE-PPEP-16/)
    fireEvent.change(ope, { target: { value: '9' } })
    fireEvent.keyDown(ope, { key: 'Enter' })
    await waitFor(() => expect(gets(peticiones, '/api/pai/tablero')).toHaveLength(2))
    expect(saf).toHaveValue('5')
    fireEvent.blur(saf)
    await waitFor(() => expect(puts(peticiones)).toHaveLength(2))
    expect(puts(peticiones)[1]).toMatchObject({ ruta: '/api/pai/indicadores/1/bimestres/4', cuerpo: { avance: 5, actualizadoEn: null } })
  })

  it('tras la primera evidencia, un guardado inmediato espera el token nuevo del reporte (sin 409 falso)', async () => {
    const T = '2026-08-20T15:00:00.000Z'
    const despues = tableroPrueba()
    despues.indicadores[0] = { ...despues.indicadores[0], evidencias: [1, 0, 0, 1, 0, 0], actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, T, null, null] }
    const tablero = tableroPrueba()
    const peticiones = api([tablero, despues], (p) => {
      if (p.metodo === 'GET' && p.ruta === '/api/pai/indicadores/1') return ok(fichaPrueba())
      if (p.ruta.endsWith('/evidencias/subidas')) return ok({ directa: false })
      if (p.metodo === 'POST' && p.ruta.endsWith('/evidencias')) {
        return ok({ id: 90, nombre: 'acta.pdf', tipo: 'application/pdf', bytes: 10, subidoEn: FECHA_PRUEBA, subidoPor: null, urlDescarga: '/api/pai/evidencias/90' }, 201)
      }
      if (p.metodo === 'PUT') {
        return ok(respuestaReportePrueba(tablero.indicadores[0], reportePrueba(4, { avance: 1, porcentaje: 0.5, estado: 'reportado', actualizadoEn: '2026-08-20T15:30:00.000Z', editable: true, motivo: 'abierto' })))
      }
      return undefined
    })
    let numeroGet = 0
    const retenidas = retener((ruta, init) => esGetTablero(ruta, init) && ++numeroGet === 2)
    montar('/pai')
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: 'Evidencias de SAF-TH-01 (1 archivo)' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Evidencias · SAF-TH-01' })
    fireEvent.change(await within(dialogo).findByLabelText('Subir evidencias'), {
      target: { files: [new File(['%PDF'], 'acta.pdf', { type: 'application/pdf' })] },
    })
    await within(dialogo).findByRole('link', { name: 'acta.pdf' })
    fireEvent.click(within(dialogo).getAllByRole('button', { name: 'Cerrar' })[1])
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '1' } })
    fireEvent.blur(campo)
    expect(await screen.findByText('Guardando…')).toBeInTheDocument()
    expect(puts(peticiones)).toHaveLength(0)
    await retenidas.soltar()
    await screen.findByText('Guardado')
    expect(puts(peticiones)[0].cuerpo).toEqual({ avance: 1, actualizadoEn: T })
  })
})

describe('filtro de estado y filas guardadas', () => {
  it('con ?estado=pendiente, la fila guardada se queda a la vista (con "Guardado" y el foco) hasta cambiar los filtros', async () => {
    const tablero = tableroPrueba()
    api([tablero], (p) =>
      p.metodo === 'PUT'
        ? ok(respuestaReportePrueba(tablero.indicadores[0], reportePrueba(4, { avance: 1, porcentaje: 0.5, estado: 'reportado', actualizadoEn: '2026-08-20T15:00:00.000Z', editable: true, motivo: 'abierto' })))
        : undefined,
    )
    montar('/pai?estado=pendiente')
    await esperarLista()
    expect(screen.getByText('2 de 4 indicadores')).toBeInTheDocument()
    const campo = screen.getByLabelText(/Avance de SAF-TH-01/)
    campo.focus()
    fireEvent.change(campo, { target: { value: '1' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
    expect(campo).toBeInTheDocument()
    expect(campo).toHaveFocus()
    expect(screen.getByText('1 de 4 indicadores')).toBeInTheDocument()
    expect(screen.getByText(/1 indicador guardado ya no cumple los filtros: sigue a la vista/)).toBeInTheDocument()
    // Al cambiar los filtros deja de estar fijada.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar indicador' }), { target: { value: 'mesa' } })
    expect(screen.queryByLabelText(/Avance de SAF-TH-01/)).not.toBeInTheDocument()
  })
})

describe('otros textos del tablero', () => {
  it('la fecha límite del aviso es la misma de la barra ("14 de diciembre"), sin la hora UTC', async () => {
    api([tableroPrueba({ vigencia: vigenciaPrueba({ bimestreAbierto: 4, abiertoHasta: '2026-12-15T04:59:59.999Z' }) })])
    montar('/pai')
    await esperarLista()
    expect(screen.getByText('Bimestre 4 (julio–agosto) abierto hasta el 14 de diciembre.')).toBeInTheDocument()
  })

  it('administrador: reportados con el mismo texto del seguimiento y aviso de que las cifras son de todo el proceso', async () => {
    api([tableroPrueba({ rol: 'administrador' })])
    montar('/pai?q=bienestar', 'administrador')
    await esperarLista()
    const saf = screen.getByRole('region', { name: 'SAF-TH Gestión del Talento Humano' })
    expect(within(saf).getByText('Reportados en el bimestre 4').nextSibling).toHaveTextContent('1 de 2 reportados · 1 pendiente')
    expect(within(saf).getByText('Cifras de todo el proceso (2 indicadores):')).toBeInTheDocument()
  })

  it('en una vigencia que no es la más reciente, la ficha se enlaza por id (el código lleva a la más reciente)', async () => {
    api([tableroPrueba({ vigencia: vigenciaPrueba({ anio: 2026, vigencias: [2027, 2026] }) })])
    montar('/pai')
    await esperarLista()
    expect(screen.getByRole('link', { name: 'Porcentaje de ejecución del plan de bienestar' })).toHaveAttribute('href', '/pai/indicadores/1')
  })

  it('Atrás o un enlace dentro de /pai no vuelven a escribir los filtros viejos en la URL', async () => {
    api([tableroPrueba()])
    const router = montar('/pai?estado=pendiente')
    await screen.findByRole('link', { name: /Mesa Distrital/ })
    const navegaciones: string[] = []
    const dejar = router.subscribe((estado) => navegaciones.push(`${estado.historyAction} ${estado.location.search}`))
    await act(async () => router.navigate('/pai'))
    await waitFor(() => expect(screen.getByText('4 indicadores')).toBeInTheDocument())
    await act(async () => router.navigate(-1))
    await waitFor(() => expect(screen.getByText('2 de 4 indicadores')).toBeInTheDocument())
    dejar()
    expect(navegaciones.filter((n) => n.startsWith('REPLACE'))).toEqual([])
    expect(router.state.location.search).toBe('?estado=pendiente')
  })
})
