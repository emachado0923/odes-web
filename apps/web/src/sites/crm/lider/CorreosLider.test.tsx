import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CorreoCrm, CuentaCorreoCrm } from '../api-crm'
import { ErrorCrmHttp, type ApiLider } from '../datos/clienteCrm'
import ProveedorAvisos from '../ui/ProveedorAvisos'
import CorreosLider from './CorreosLider'
import { ContextoLiderCrm, type ContextoLider } from './contexto'

function correo(id: number, cambios: Partial<CorreoCrm> = {}): CorreoCrm {
  return {
    id,
    tareaId: 40 + id,
    tareaTitulo: `Informe ${id}`,
    tipo: 'tarea_asignada',
    para: `persona${id}@sapiencia.gov.co`,
    asunto: `Nueva tarea: Informe ${id}`,
    estado: 'enviado',
    intentos: 1,
    error: null,
    adjuntos: 0,
    creadoEn: '2026-11-20T15:00:00Z',
    enviadoEn: '2026-11-20T15:00:02Z',
    ...cambios,
  }
}

/** La cuenta de envío de arriba (CuentaCorreo): aquí no se prueba, solo se pinta. */
const CUENTA: CuentaCorreoCrm = {
  origen: 'base',
  modo: 'smtp',
  usuario: 'odes-web@sapiencia.gov.co',
  host: 'smtp.gmail.com',
  puerto: 465,
  seguro: true,
  nombre: 'Planeación Sapiencia',
  tieneClave: true,
  editable: true,
  actualizadoEn: '2026-11-24T15:30:00Z',
}

/** Monta la bandeja con una api falsa (solo lo que usa la prueba). */
function montar(api: Partial<ApiLider>) {
  const contexto: ContextoLider = {
    sesion: { nombre: 'Martha', csrf: 'token-1', expira: '2026-11-25T00:00:00Z' },
    api: { correoCuenta: async () => CUENTA, ...api } as ApiLider,
    vencida: vi.fn<() => void>(),
    salir: vi.fn<() => Promise<void>>(async () => {}),
    avisarCambioCorreos: vi.fn<() => void>(),
  }
  render(
    <MemoryRouter initialEntries={['/crm/lider/correos']}>
      <ProveedorAvisos>
        <ContextoLiderCrm value={contexto}>
          <CorreosLider />
        </ContextoLiderCrm>
      </ProveedorAvisos>
    </MemoryRouter>,
  )
  return contexto
}

function filaDe(texto: string): HTMLTableRowElement {
  const fila = screen.getByText(texto).closest('tr')
  if (!fila) throw new Error(`«${texto}» no está en una fila`)
  return fila
}

describe('CorreosLider', () => {
  it('cada filtro pide api.correos con su estado y, sin resultados, dice cuál está vacío', async () => {
    const correos = vi.fn<ApiLider['correos']>(async (estado) =>
      estado === undefined ? [correo(1), correo(2, { estado: 'error', error: 'El servidor SMTP no respondió.', enviadoEn: null })] : [],
    )
    montar({ correos })

    expect(await screen.findByText('Nueva tarea: Informe 1')).toBeInTheDocument()
    expect(correos).toHaveBeenCalledWith(undefined, expect.anything())
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Informe 1' })).toHaveAttribute('href', '/crm/lider/tareas/41')
    expect(within(filaDe('Nueva tarea: Informe 2')).getByText('Falló')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fallaron' }))
    await waitFor(() => expect(correos).toHaveBeenLastCalledWith('error', expect.anything()))
    // El título del vacío (el anuncio para el lector de pantalla repite el mismo texto).
    expect(await screen.findByText('No hay correos que fallaron.', { selector: '.crm-vacio-titulo' })).toBeInTheDocument()
    expect(screen.getAllByRole('status').some((region) => region.textContent === 'No hay correos que fallaron.')).toBe(true)
    expect(screen.getByRole('button', { name: 'Fallaron' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Sin configurar' }))
    await waitFor(() => expect(correos).toHaveBeenLastCalledWith('sin_configurar', expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Pendientes' }))
    await waitFor(() => expect(correos).toHaveBeenLastCalledWith('pendiente', expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Enviados' }))
    await waitFor(() => expect(correos).toHaveBeenLastCalledWith('enviado', expect.anything()))
    expect(await screen.findByText('No hay correos enviados.', { selector: '.crm-vacio-titulo' })).toBeInTheDocument()
  })

  it('«Reintentar» reemplaza la fila con la respuesta, avisa y recarga la insignia del menú', async () => {
    const reintentarCorreo = vi.fn<ApiLider['reintentarCorreo']>(async (id) => correo(id, { estado: 'enviado', intentos: 2 }))
    const contexto = montar({
      correos: vi.fn<ApiLider['correos']>(async () => [
        correo(3, { estado: 'error', error: 'El servidor SMTP no respondió.', enviadoEn: null }),
        correo(4),
      ]),
      reintentarCorreo,
    })

    await screen.findByText('El servidor SMTP no respondió.')
    expect(within(filaDe('Nueva tarea: Informe 4')).queryByRole('button')).toBeNull() // el enviado no se reintenta
    fireEvent.click(within(filaDe('Nueva tarea: Informe 3')).getByRole('button', { name: /^Reintentar/ }))

    expect(await screen.findByText('Se envió el correo a persona3@sapiencia.gov.co.')).toBeInTheDocument()
    expect(reintentarCorreo).toHaveBeenCalledWith(3)
    const fila = filaDe('Nueva tarea: Informe 3')
    expect(within(fila).getByText('Enviado')).toBeInTheDocument()
    expect(within(fila).getByText('Intentos: 2')).toBeInTheDocument()
    expect(within(fila).queryByRole('button')).toBeNull()
    expect(screen.queryByText('El servidor SMTP no respondió.')).toBeNull()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalledTimes(1)
  })

  it('con correos sin configurar avisa arriba; si al reintentar sigue sin salir, avisa el error', async () => {
    const reintentarCorreo = vi.fn<ApiLider['reintentarCorreo']>(async (id) =>
      correo(id, { estado: 'sin_configurar', intentos: 2, enviadoEn: null }),
    )
    const contexto = montar({
      correos: vi.fn<ApiLider['correos']>(async () => [correo(5, { estado: 'sin_configurar', enviadoEn: null })]),
      reintentarCorreo,
    })

    expect(
      await screen.findByText(
        'Algunos avisos no salieron porque el correo no estaba configurado. La cuenta se configura aquí arriba, en «Cuenta de envío»; después use «Reintentar» para enviarlos.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Reintentar/ }))
    expect(
      await screen.findByText('No se envió el correo a persona5@sapiencia.gov.co: el correo todavía no está configurado en el servidor.'),
    ).toBeInTheDocument()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalledTimes(1)
  })

  it('si la sesión venció (401), llama vencida()', async () => {
    const contexto = montar({
      correos: vi.fn<ApiLider['correos']>(async () => {
        throw new ErrorCrmHttp('no_autenticado', 'La sesión no existe o venció.', { estado: 401 })
      }),
    })
    await waitFor(() => expect(contexto.vencida).toHaveBeenCalled())
  })
})
