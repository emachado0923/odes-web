import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaginaRegistro from './PaginaRegistro'
import { ApiSimuladaPai } from './pruebas/apiSimulada'
import { entradaRegistroPrueba } from './pruebas/datos'
import { boton, enlace, renderizarPagina } from './pruebas/renderizar'

let api: ApiSimuladaPai

beforeEach(() => {
  api = new ApiSimuladaPai()
  api.iniciarComo('administrador')
  api.registro = [
    entradaRegistroPrueba(5),
    entradaRegistroPrueba(4, {
      usuarioId: 1,
      usuario: 'planeacion',
      accion: 'abrir_bimestre',
      indicadorId: null,
      codigoIndicador: null,
      detalle: { bimestre: 4, abiertoHasta: null },
    }),
    entradaRegistroPrueba(3, { accion: 'subir_evidencia', detalle: { nombre: 'acta.pdf', bytes: 1200 } }),
    entradaRegistroPrueba(2, { accion: 'iniciar_sesion', indicadorId: null, codigoIndicador: null, bimestre: null, detalle: null }),
    entradaRegistroPrueba(1, { codigoIndicador: 'DTF-GF-01', indicadorId: 1004 }),
  ]
  api.instalar()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderizar(ruta = '/pai/admin/registro') {
  return renderizarPagina(<PaginaRegistro />, { ruta })
}

async function tabla() {
  return screen.findByRole('table', { name: /Registro de cambios, página/ })
}

describe('registro (/pai/admin/registro)', () => {
  it('muestra fecha, usuario, acción, indicador (enlace a la ficha), bimestre y el detalle de los cambios', async () => {
    renderizar()
    const t = await tabla()
    const filas = within(t).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(5)
    expect(filas[0]).toHaveTextContent('Guardó un reporte')
    expect(enlace('SAF-TH-01', filas[0])).toHaveAttribute('href', '/pai/indicadores/SAF-TH-01')
    fireEvent.click(within(filas[0]).getByText('Ver detalle'))
    expect(filas[0]).toHaveTextContent('Avance: — → 3')
    expect(filas[0]).toHaveTextContent('Principales avances: — → Se hicieron 3 capacitaciones')
    expect(filas[1]).toHaveTextContent('Abrió un bimestre')
    expect(filas[2]).toHaveTextContent('Nombre: acta.pdf')
    expect(filas[2]).toHaveTextContent('Bytes: 1 KB')
    expect(within(filas[3]).queryByText('Ver detalle')).not.toBeInTheDocument()
    expect(screen.getByText('1–5 de 5')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Páginas del registro' })).not.toBeInTheDocument()
  })

  it('los filtros van a la URL y a la consulta; cambiar uno vuelve a la página 1', async () => {
    const { router } = renderizar('/pai/admin/registro?pagina=2')
    await waitFor(() => expect(api.peticiones.some((p) => p.ruta === '/admin/registro?pagina=2')).toBe(true))
    await screen.findByLabelText('Usuario')
    await waitFor(() =>
      expect(within(screen.getByLabelText('Usuario')).getAllByRole('option').map((o) => o.textContent)).toContain(
        'Responsable SAF (responsable.saf)',
      ),
    )

    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'guardar_reporte' } })
    await waitFor(() => expect(router.state.location.search).toBe('?accion=guardar_reporte'))
    await waitFor(() => expect(api.ultima('GET', '/admin/registro')?.ruta).toBe('/admin/registro?pagina=1&accion=guardar_reporte'))
    expect(within(await tabla()).getAllByRole('row')).toHaveLength(3)

    fireEvent.change(screen.getByLabelText('Indicador'), { target: { value: 'DTF-GF-01' } })
    fireEvent.click(boton('Buscar'))
    await waitFor(() => expect(router.state.location.search).toBe('?indicador=DTF-GF-01&accion=guardar_reporte'))
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2))

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: '2' } })
    await waitFor(() => expect(router.state.location.search).toBe('?usuario=2&indicador=DTF-GF-01&accion=guardar_reporte'))
    expect(screen.getByLabelText('Indicador')).toHaveValue('DTF-GF-01')

    fireEvent.click(enlace('Quitar los filtros'))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByLabelText('Indicador')).toHaveValue('')
    expect(screen.getByLabelText('Acción')).toHaveValue('')
  })

  it('paginación con Anterior / Siguiente en la URL', async () => {
    api.registroPorPagina = 2
    const { router } = renderizar()
    await tabla()
    const paginas = screen.getByRole('navigation', { name: 'Páginas del registro' })
    expect(within(paginas).getByText('Página 1 de 3')).toHaveAttribute('aria-current', 'page')
    expect(within(paginas).queryByRole('link', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.getByText('1–2 de 5')).toBeInTheDocument()

    fireEvent.click(enlace('Siguiente', paginas))
    await waitFor(() => expect(router.state.location.search).toBe('?pagina=2'))
    expect(await screen.findByText('3–4 de 5')).toBeInTheDocument()
    expect(api.ultima('GET', '/admin/registro')?.ruta).toBe('/admin/registro?pagina=2')
    expect(enlace('Anterior', screen.getByRole('navigation', { name: 'Páginas del registro' }))).toHaveAttribute(
      'href',
      '/pai/admin/registro',
    )
    fireEvent.click(enlace('Siguiente'))
    expect(await screen.findByText('5–5 de 5')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Páginas del registro' })).queryByRole('link', { name: 'Siguiente' })).not.toBeInTheDocument()
  })

  it('cambiar un filtro no vuelve a montar el formulario: el foco se queda en el control', async () => {
    const { router } = renderizar()
    await tabla()
    const accion = screen.getByLabelText('Acción')
    accion.focus()
    fireEvent.change(accion, { target: { value: 'iniciar_sesion' } })
    await waitFor(() => expect(router.state.location.search).toBe('?accion=iniciar_sesion'))
    await tabla()
    expect(screen.getByLabelText('Acción')).toBe(accion)
    expect(accion).toHaveFocus()
  })

  it('el indicador se revisa como en el servidor (id o código completo) antes de buscar', async () => {
    const { router } = renderizar()
    await tabla()
    const campo = screen.getByLabelText('Indicador')
    expect(campo).toHaveAttribute('maxlength', '30')
    fireEvent.change(campo, { target: { value: 'SAF-TH' } })
    fireEvent.click(boton('Buscar'))
    expect(await screen.findByText('Escriba el código completo del indicador (p. ej., SAF-TH-02) o su id.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveFocus()
    expect(router.state.location.search).toBe('')
    expect(api.peticiones.some((p) => p.ruta.includes('indicador='))).toBe(false)
    // Un select aplicado mientras tanto no lleva el indicador inválido.
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'guardar_reporte' } })
    await waitFor(() => expect(router.state.location.search).toBe('?accion=guardar_reporte'))
    fireEvent.change(campo, { target: { value: 'saf-th-01' } })
    expect(screen.queryByText(/Escriba el código completo/)).not.toBeInTheDocument()
    fireEvent.click(boton('Buscar'))
    await waitFor(() => expect(router.state.location.search).toBe('?indicador=saf-th-01&accion=guardar_reporte'))
  })

  it('sin resultados lo dice', async () => {
    renderizar('/pai/admin/registro?accion=cargar_fichas')
    expect(await screen.findByText('No hay entradas con estos filtros.')).toBeInTheDocument()
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
    expect(screen.getByLabelText('Acción')).toHaveValue('cargar_fichas')
  })
})
