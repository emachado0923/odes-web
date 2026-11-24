import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CuentaCorreoCrm, ResultadoPruebaCorreoCrm } from '../api-crm'
import { ErrorCrmHttp, type ApiLider } from '../datos/clienteCrm'
import ProveedorAvisos from '../ui/ProveedorAvisos'
import CuentaCorreo from './CuentaCorreo'
import { ContextoLiderCrm, type ContextoLider } from './contexto'

function cuenta(cambios: Partial<CuentaCorreoCrm> = {}): CuentaCorreoCrm {
  return {
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
    ...cambios,
  }
}

const SIN_CUENTA = cuenta({
  origen: 'ninguna',
  modo: 'desactivado',
  usuario: null,
  host: null,
  puerto: null,
  seguro: null,
  nombre: '',
  tieneClave: false,
  actualizadoEn: null,
})

const PRUEBA_ENVIADA: ResultadoPruebaCorreoCrm = {
  enviado: true,
  para: 'martha@sapiencia.gov.co',
  mensaje: 'Se envió un correo de prueba a martha@sapiencia.gov.co.',
}

/** Monta la sección con una api falsa (solo lo que usa la prueba). */
function montar(api: Partial<ApiLider>) {
  const contexto: ContextoLider = {
    sesion: { nombre: 'Martha', csrf: 'token-1', expira: '2026-11-25T00:00:00Z' },
    api: api as ApiLider,
    vencida: vi.fn<() => void>(),
    salir: vi.fn<() => Promise<void>>(async () => {}),
    avisarCambioCorreos: vi.fn<() => void>(),
  }
  render(
    <MemoryRouter initialEntries={['/crm/lider/correos']}>
      <ProveedorAvisos>
        <ContextoLiderCrm value={contexto}>
          <CuentaCorreo />
        </ContextoLiderCrm>
      </ProveedorAvisos>
    </MemoryRouter>,
  )
  return contexto
}

function dialogo(nombre: string): HTMLElement {
  return screen.getByRole('dialog', { name: nombre })
}

describe('CuentaCorreo', () => {
  it("sin cuenta ('ninguna') avisa que los correos no salen y ofrece «Configurar correo»", async () => {
    montar({ correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => SIN_CUENTA) })

    expect(await screen.findByText('Todavía no hay una cuenta de correo: los avisos quedan guardados y no salen.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cuenta de envío' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configurar correo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar prueba' })).toBeNull()
  })

  it('«Configurar correo» manda la clave sin espacios en los bordes (con los valores por defecto) y luego la prueba', async () => {
    const guardarCorreoCuenta = vi.fn<ApiLider['guardarCorreoCuenta']>(async () => cuenta())
    const probarCorreo = vi.fn<ApiLider['probarCorreo']>(async () => PRUEBA_ENVIADA)
    const contexto = montar({ correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => SIN_CUENTA), guardarCorreoCuenta, probarCorreo })

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar correo' }))
    const caja = dialogo('Configurar correo')
    expect(within(caja).getByLabelText(/^Servidor SMTP/)).toHaveValue('smtp.gmail.com')
    expect(within(caja).queryByText('Déjela vacía para conservar la guardada.')).toBeNull()
    expect(within(caja).getByRole('link', { name: /su cuenta de Google/ })).toHaveAttribute('href', 'https://myaccount.google.com/apppasswords')

    const clave = within(caja).getByLabelText(/^Contraseña de aplicación/)
    expect(clave).toHaveAttribute('type', 'password')
    expect(clave).toHaveAttribute('autocomplete', 'new-password')
    fireEvent.click(within(caja).getByRole('button', { name: 'Mostrar la contraseña' }))
    expect(clave).toHaveAttribute('type', 'text')

    fireEvent.change(within(caja).getByLabelText(/^Cuenta/), { target: { value: '  odes-web@sapiencia.gov.co ' } })
    fireEvent.change(clave, { target: { value: '  abcd efgh ijkl mnop  ' } })
    expect(within(caja).getByRole('checkbox', { name: 'Enviar un correo de prueba al guardar' })).toBeChecked()
    fireEvent.click(within(caja).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(probarCorreo).toHaveBeenCalledTimes(1))
    expect(probarCorreo).toHaveBeenCalledWith()
    expect(guardarCorreoCuenta).toHaveBeenCalledWith({
      usuario: 'odes-web@sapiencia.gov.co',
      clave: 'abcd efgh ijkl mnop',
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      nombre: 'Planeación Sapiencia',
    })
    expect(await within(caja).findByText('Se envió un correo de prueba a martha@sapiencia.gov.co.')).toBeInTheDocument()
    expect(within(caja).getByText('Ya puede reenviar los avisos pendientes con «Reintentar».')).toBeInTheDocument()
    expect(screen.getByText('Cuenta guardada.')).toBeInTheDocument()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalledTimes(1)
    // Detrás, la sección ya muestra la cuenta guardada.
    expect(screen.getByText(/^Los avisos salen desde/)).toHaveTextContent('Los avisos salen desde odes-web@sapiencia.gov.co (smtp.gmail.com:465).')
  })

  it('«Cambiar» con la clave vacía no la manda (se conserva la guardada) y después prueba', async () => {
    const guardarCorreoCuenta = vi.fn<ApiLider['guardarCorreoCuenta']>(async (datos) => cuenta({ nombre: datos.nombre ?? '' }))
    const probarCorreo = vi.fn<ApiLider['probarCorreo']>(async () => PRUEBA_ENVIADA)
    montar({ correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => cuenta()), guardarCorreoCuenta, probarCorreo })

    expect(await screen.findByText(/^Los avisos salen desde/)).toHaveTextContent(
      'Los avisos salen desde odes-web@sapiencia.gov.co (smtp.gmail.com:465).',
    )
    expect(screen.getByText(/^Guardada el/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar cuenta' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    const caja = dialogo('Configurar correo')
    expect(within(caja).getByLabelText(/^Cuenta/)).toHaveValue('odes-web@sapiencia.gov.co')
    expect(within(caja).getByLabelText(/^Contraseña de aplicación/)).toHaveValue('')
    expect(within(caja).getByText('Déjela vacía para conservar la guardada.')).toBeInTheDocument()
    fireEvent.change(within(caja).getByLabelText(/^Nombre visible/), { target: { value: '  Oficina   de Planeación ' } })
    fireEvent.click(within(caja).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(probarCorreo).toHaveBeenCalledTimes(1))
    const [datos] = guardarCorreoCuenta.mock.calls[0]
    expect(datos).toEqual({ usuario: 'odes-web@sapiencia.gov.co', host: 'smtp.gmail.com', puerto: 465, seguro: true, nombre: 'Oficina de Planeación' })
    expect(datos).not.toHaveProperty('clave')
    expect(await within(caja).findByText('Ya puede reenviar los avisos pendientes con «Reintentar».')).toBeInTheDocument()
  })

  it('sin la casilla de prueba, guarda y cierra; los errores 400 van junto a su campo y el 409 arriba', async () => {
    const guardarCorreoCuenta = vi
      .fn<ApiLider['guardarCorreoCuenta']>()
      .mockRejectedValueOnce(
        new ErrorCrmHttp('solicitud_invalida', 'Revise los datos.', { estado: 400, campos: { clave: 'La contraseña de aplicación tiene 16 letras.' } }),
      )
      .mockRejectedValueOnce(new ErrorCrmHttp('conflicto', 'Otra persona cambió la cuenta mientras tanto.', { estado: 409 }))
      .mockResolvedValueOnce(cuenta())
    const probarCorreo = vi.fn<ApiLider['probarCorreo']>(async () => PRUEBA_ENVIADA)
    const contexto = montar({ correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => cuenta()), guardarCorreoCuenta, probarCorreo })

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar' }))
    const caja = dialogo('Configurar correo')
    fireEvent.change(within(caja).getByLabelText(/^Contraseña de aplicación/), { target: { value: 'abcd' } })
    fireEvent.click(within(caja).getByRole('checkbox', { name: 'Enviar un correo de prueba al guardar' }))

    fireEvent.click(within(caja).getByRole('button', { name: 'Guardar' }))
    expect(await within(caja).findByText('La contraseña de aplicación tiene 16 letras.')).toBeInTheDocument()
    expect(within(caja).getByLabelText(/^Contraseña de aplicación/)).toHaveAttribute('aria-invalid', 'true')

    fireEvent.click(within(caja).getByRole('button', { name: 'Guardar' }))
    expect(await within(caja).findByRole('alert')).toHaveTextContent('Otra persona cambió la cuenta mientras tanto.')

    fireEvent.click(within(caja).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Cuenta guardada.')).toBeInTheDocument()
    expect(guardarCorreoCuenta).toHaveBeenCalledTimes(3)
    expect(probarCorreo).not.toHaveBeenCalled()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalledTimes(1)
  })

  it("con las variables del servidor ('variables') no deja editar: solo enviar una prueba; fuera de smtp lo dice", async () => {
    montar({
      correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () =>
        cuenta({ origen: 'variables', modo: 'archivo', puerto: 587, seguro: false, editable: false, actualizadoEn: null }),
      ),
    })

    expect(await screen.findByText(/^Configurado en el servidor/)).toHaveTextContent(
      'Configurado en el servidor: odes-web@sapiencia.gov.co (smtp.gmail.com:587).',
    )
    expect(screen.getByText('Modo archivo: no sale correo real.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeInTheDocument()
    for (const nombre of ['Configurar correo', 'Cambiar', 'Quitar cuenta']) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull()
    }
  })

  it('una prueba fallida muestra el mensaje del servidor; un 429, el suyo con la espera', async () => {
    const probarCorreo = vi
      .fn<ApiLider['probarCorreo']>()
      .mockResolvedValueOnce({
        enviado: false,
        para: 'jose@sapiencia.gov.co',
        mensaje: 'Google no aceptó la contraseña de aplicación. Revísela y guárdela de nuevo.',
      })
      .mockRejectedValueOnce(
        new ErrorCrmHttp('demasiados_intentos', 'Ya se enviaron 10 correos de prueba.', { estado: 429, reintentarEn: 1200 }),
      )
    montar({ correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => cuenta({ origen: 'variables', editable: false })), probarCorreo })

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar prueba' }))
    const caja = dialogo('Enviar un correo de prueba')
    fireEvent.change(within(caja).getByLabelText(/^Enviar a/), { target: { value: ' jose@sapiencia.gov.co ' } })
    fireEvent.click(within(caja).getByRole('button', { name: 'Enviar prueba' }))

    expect(
      await within(caja).findByText('Google no aceptó la contraseña de aplicación. Revísela y guárdela de nuevo.'),
    ).toBeInTheDocument()
    expect(probarCorreo).toHaveBeenCalledWith('jose@sapiencia.gov.co')
    expect(within(caja).queryByText('Ya puede reenviar los avisos pendientes con «Reintentar».')).toBeNull()

    fireEvent.change(within(caja).getByLabelText(/^Enviar a/), { target: { value: '' } })
    fireEvent.click(within(caja).getByRole('button', { name: 'Enviar prueba' }))
    expect(
      await within(caja).findByText('Ya se enviaron 10 correos de prueba. Puede intentar de nuevo en 20 minutos.'),
    ).toBeInTheDocument()
    expect(probarCorreo).toHaveBeenLastCalledWith()
  })

  it('si la sesión venció (401), llama vencida()', async () => {
    const contexto = montar({
      correoCuenta: vi.fn<ApiLider['correoCuenta']>(async () => {
        throw new ErrorCrmHttp('no_autenticado', 'La sesión no existe o venció.', { estado: 401 })
      }),
    })
    await waitFor(() => expect(contexto.vencida).toHaveBeenCalled())
  })
})
